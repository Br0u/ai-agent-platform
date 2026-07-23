from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager
import hashlib
import hmac
import io
import json
import logging
import os
from pathlib import Path
import stat
import time
from typing import cast
from uuid import uuid4
import zipfile

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from skill_registry.app import (
    RegistryHttpBoundary,
    RegistryResponseAborted,
    RegistryStartupError,
    RegistryTransportError,
    create_app,
)
from skill_registry.auth import ASSERTION_KEY_DERIVATION_DOMAIN
from skill_registry.config import RegistrySettings
from skill_registry.types import ScanPolicy


MANAGER_URL = (
    "postgresql+psycopg_async://ai_agent_skill_registry_manager:private-manager@db:5432/platform"
)
CONTROL_KEY = "skill-registry-control-key-0123456789abcdef"
INTEGRATION_MANAGER_URL = os.getenv("SKILL_REGISTRY_DATABASE_URL")


class FakePool:
    def __init__(
        self,
        *,
        open_error: Exception | None = None,
        close_error: Exception | None = None,
    ) -> None:
        self.opened = 0
        self.closed = 0
        self.connections = 0
        self.open_error = open_error
        self.close_error = close_error

    async def open(self, *, wait: bool) -> None:
        assert wait is True
        self.opened += 1
        if self.open_error is not None:
            raise self.open_error

    async def close(self) -> None:
        self.closed += 1
        if self.close_error is not None:
            raise self.close_error

    @asynccontextmanager
    async def connection(self):  # type: ignore[no-untyped-def]
        self.connections += 1
        yield object()


class StubService:
    pass


def settings(path: Path) -> RegistrySettings:
    return RegistrySettings(
        database_url=SecretStr(MANAGER_URL),
        control_key=SecretStr(CONTROL_KEY),
        runtime_imports_file=path,
    )


def _assert_exception_tree_scrubbed(error: BaseException, *secrets: str) -> None:
    pending: list[BaseException] = [error]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        rendered = f"{current!s} {current!r} {current.args!r}"
        assert all(secret not in rendered for secret in secrets)
        if current.__cause__ is not None:
            pending.append(current.__cause__)
        if current.__context__ is not None:
            pending.append(current.__context__)


def _http_scope(path: str = "/boundary") -> Scope:
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "server": ("testserver", 80),
        "client": ("testclient", 50000),
        "scheme": "http",
        "method": "GET",
        "root_path": "",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "state": {},
    }


def test_http_boundary_reports_partial_response_as_stable_abort() -> None:
    sent: list[Message] = []

    async def partial_then_fail(_: Scope, __: Receive, send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 503,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": b'{"error":',
                "more_body": True,
            }
        )
        raise RuntimeError("private-partial-response")

    async def receive() -> Message:
        raise AssertionError("boundary must not read the request")

    async def send(message: Message) -> None:
        sent.append(message)

    boundary = RegistryHttpBoundary(cast(ASGIApp, partial_then_fail))
    with pytest.raises(RegistryResponseAborted) as caught:
        asyncio.run(boundary(_http_scope(), receive, send))

    assert [message["type"] for message in sent] == [
        "http.response.start",
        "http.response.body",
    ]
    assert sent[1]["more_body"] is True
    assert caught.value.args == ("Skill registry response aborted",)
    _assert_exception_tree_scrubbed(caught.value, "private-partial-response")
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


def test_http_boundary_sends_stable_error_when_response_never_started() -> None:
    sent: list[Message] = []

    async def fail_before_start(_: Scope, __: Receive, ___: Send) -> None:
        raise RuntimeError("private-before-start")

    async def receive() -> Message:
        raise AssertionError("boundary must not read the request")

    async def send(message: Message) -> None:
        sent.append(message)

    boundary = RegistryHttpBoundary(cast(ASGIApp, fail_before_start))
    asyncio.run(boundary(_http_scope(), receive, send))

    assert [message["type"] for message in sent] == [
        "http.response.start",
        "http.response.body",
    ]
    assert sent[0]["status"] == 503
    assert dict(sent[0]["headers"])[b"cache-control"] == b"no-store"
    assert sent[1]["body"] == b'{"error":"REGISTRY_UNAVAILABLE"}'
    assert sent[1].get("more_body", False) is False


def test_http_boundary_swallows_only_complete_stable_error_rethrow() -> None:
    sent: list[Message] = []

    async def complete_then_rethrow(_: Scope, __: Receive, send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 503,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": b'{"error":"REGISTRY_UNAVAILABLE"}',
            }
        )
        raise RuntimeError("private-after-complete")

    async def receive() -> Message:
        raise AssertionError("boundary must not read the request")

    async def send(message: Message) -> None:
        sent.append(message)

    boundary = RegistryHttpBoundary(cast(ASGIApp, complete_then_rethrow))
    asyncio.run(boundary(_http_scope(), receive, send))

    assert [message["type"] for message in sent] == [
        "http.response.start",
        "http.response.body",
    ]
    assert sent[0]["status"] == 503
    assert dict(sent[0]["headers"])[b"cache-control"] == b"no-store"
    assert sent[1]["body"] == b'{"error":"REGISTRY_UNAVAILABLE"}'


def test_http_boundary_reports_send_failure_as_stable_transport_error() -> None:
    attempted: list[Message] = []

    async def start_response(_: Scope, __: Receive, send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [],
            }
        )

    async def receive() -> Message:
        raise AssertionError("boundary must not read the request")

    async def fail_send(message: Message) -> None:
        attempted.append(message)
        raise RuntimeError("private-transport-detail")

    boundary = RegistryHttpBoundary(cast(ASGIApp, start_response))
    with pytest.raises(RegistryTransportError) as caught:
        asyncio.run(boundary(_http_scope(), receive, fail_send))

    assert [message["type"] for message in attempted] == ["http.response.start"]
    assert caught.value.args == ("Skill registry transport failed",)
    _assert_exception_tree_scrubbed(caught.value, "private-transport-detail")
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


def test_http_boundary_does_not_swallow_base_exceptions() -> None:
    async def receive() -> Message:
        raise AssertionError("boundary must not read the request")

    async def send(_: Message) -> None:
        raise AssertionError("boundary must not send a fallback for BaseException")

    for failure in (asyncio.CancelledError("cancelled"), SystemExit("stopped")):

        async def fail(_: Scope, __: Receive, ___: Send) -> None:
            raise failure

        boundary = RegistryHttpBoundary(cast(ASGIApp, fail))
        with pytest.raises(type(failure)) as caught:
            asyncio.run(boundary(_http_scope(), receive, send))

        assert caught.value is failure


def test_pool_factory_receives_secretstr_and_constructor_failure_is_scrubbed(
    tmp_path: Path,
) -> None:
    received: list[SecretStr] = []

    def fail_pool_factory(database_url: SecretStr) -> FakePool:
        received.append(database_url)
        raise RegistryStartupError(database_url)

    app = create_app(
        settings=settings(tmp_path / "imports.json"),
        pool_factory=fail_pool_factory,
        policy_loader=lambda _: ScanPolicy(frozenset()),
        service_factory=lambda *_: StubService(),  # type: ignore[arg-type]
    )

    with pytest.raises(RegistryStartupError) as caught:
        with TestClient(app):
            raise AssertionError("startup must not complete")

    assert len(received) == 1
    assert isinstance(received[0], SecretStr)
    assert MANAGER_URL not in str(received[0])
    assert MANAGER_URL not in repr(received[0])
    assert caught.value.args == ("Skill registry startup failed",)
    _assert_exception_tree_scrubbed(caught.value, MANAGER_URL, "private-manager")
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


def test_pool_open_failure_closes_pool_and_scrubs_exception_tree(tmp_path: Path) -> None:
    pool = FakePool(open_error=RuntimeError(MANAGER_URL))
    app = create_app(
        settings=settings(tmp_path / "imports.json"),
        pool_factory=lambda _: pool,
        policy_loader=lambda _: ScanPolicy(frozenset()),
        service_factory=lambda *_: StubService(),  # type: ignore[arg-type]
    )

    with pytest.raises(RegistryStartupError) as caught:
        with TestClient(app):
            raise AssertionError("startup must not complete")

    assert pool.opened == 1
    assert pool.closed == 1
    assert caught.value.args == ("Skill registry startup failed",)
    _assert_exception_tree_scrubbed(caught.value, MANAGER_URL, "private-manager")
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


def test_lifespan_reads_policy_once_builds_one_service_and_closes_pool(tmp_path: Path) -> None:
    manifest = tmp_path / "imports.json"
    manifest.write_text('{"version":1,"pythonModules":["third_party"]}')
    pool = FakePool()
    loads: list[Path] = []
    policies: list[ScanPolicy] = []
    services: list[StubService] = []

    def load_policy(path: Path) -> ScanPolicy:
        loads.append(path)
        return ScanPolicy(frozenset({"third_party"}))

    def build_service(candidate_pool: object, policy: ScanPolicy) -> StubService:
        assert candidate_pool is pool
        policies.append(policy)
        service = StubService()
        services.append(service)
        return service

    app = create_app(
        settings=settings(manifest),
        pool_factory=lambda _: pool,
        policy_loader=load_policy,
        service_factory=build_service,  # type: ignore[arg-type]
        readiness_probe=lambda _: _ready(True),
    )

    with TestClient(app) as client:
        first = client.get("/internal/health/live")
        second = client.get("/internal/health/live")
        assert first.status_code == second.status_code == 200
        assert first.headers["cache-control"] == "no-store"
        assert app.state.skill_registry_service is services[0]
        assert policies == [ScanPolicy(frozenset({"third_party"}))]
        assert pool.opened == 1
        assert pool.connections == 0

    assert loads == [manifest]
    assert len(services) == 1
    assert pool.closed == 1


def test_pool_close_failure_is_logged_after_state_cleanup_without_secret(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    pool = FakePool(close_error=RuntimeError(MANAGER_URL))
    app = create_app(
        settings=settings(tmp_path / "imports.json"),
        pool_factory=lambda _: pool,
        policy_loader=lambda _: ScanPolicy(frozenset()),
        service_factory=lambda *_: StubService(),  # type: ignore[arg-type]
    )

    with caplog.at_level(logging.ERROR, logger="skill_registry.app"):
        with TestClient(app):
            assert app.state.skill_registry_service is not None

    assert app.state.skill_registry_service is None
    assert pool.closed == 1
    records = [
        record
        for record in caplog.records
        if record.name == "skill_registry.app" and record.levelno == logging.ERROR
    ]
    assert [record.getMessage() for record in records] == ["Skill registry pool close failed"]
    assert all(record.exc_info is None for record in records)
    assert MANAGER_URL not in caplog.text
    assert "private-manager" not in caplog.text


async def _ready(value: bool) -> bool:
    return value


def test_health_ready_uses_probe_and_liveness_does_not(tmp_path: Path) -> None:
    pool = FakePool()
    probes: list[object] = []

    async def probe(candidate: object) -> bool:
        probes.append(candidate)
        return len(probes) == 1

    app = create_app(
        settings=settings(tmp_path / "imports.json"),
        pool_factory=lambda _: pool,
        policy_loader=lambda _: ScanPolicy(frozenset()),
        service_factory=lambda *_: StubService(),  # type: ignore[arg-type]
        readiness_probe=probe,
    )

    with TestClient(app) as client:
        assert client.get("/internal/health/live").json() == {
            "live": True,
            "ready": False,
        }
        assert probes == []
        ready = client.get("/internal/health/ready")
        unavailable = client.get("/internal/health/ready")

    assert ready.status_code == 200
    assert ready.json() == {"live": True, "ready": True}
    assert unavailable.status_code == 503
    assert unavailable.json() == {"live": True, "ready": False}
    assert probes == [pool, pool]


def test_startup_failure_closes_pool_and_scrubs_exception_chain(tmp_path: Path) -> None:
    pool = FakePool()

    def fail_service(*_: object) -> StubService:
        raise RuntimeError("private-manager-password")

    app = create_app(
        settings=settings(tmp_path / "imports.json"),
        pool_factory=lambda _: pool,
        policy_loader=lambda _: ScanPolicy(frozenset()),
        service_factory=fail_service,  # type: ignore[arg-type]
    )

    with pytest.raises(RegistryStartupError) as caught:
        with TestClient(app):
            raise AssertionError("startup must not complete")

    assert pool.opened == 1
    assert pool.closed == 1
    assert "private-manager-password" not in repr(caught.value.args)
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


def test_docs_and_openapi_are_not_exposed_and_errors_are_no_store(tmp_path: Path) -> None:
    app = create_app(
        settings=settings(tmp_path / "imports.json"),
        pool_factory=lambda _: FakePool(),
        policy_loader=lambda _: ScanPolicy(frozenset()),
        service_factory=lambda *_: StubService(),  # type: ignore[arg-type]
        readiness_probe=lambda _: _ready(True),
    )

    with TestClient(app) as client:
        for path in ("/docs", "/redoc", "/openapi.json", "/missing"):
            response = client.get(path)
            assert response.status_code == 404
            assert response.json() == {"error": "NOT_FOUND"}
            assert response.headers["cache-control"] == "no-store"


def test_unhandled_error_is_sanitized_when_test_client_reraises(tmp_path: Path) -> None:
    app = create_app(
        settings=settings(tmp_path / "imports.json"),
        pool_factory=lambda _: FakePool(),
        policy_loader=lambda _: ScanPolicy(frozenset()),
        service_factory=lambda *_: StubService(),  # type: ignore[arg-type]
    )

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("private-handler-detail")

    with TestClient(app, raise_server_exceptions=True) as client:
        response = client.get("/boom")

    assert response.status_code == 503
    assert response.json() == {"error": "REGISTRY_UNAVAILABLE"}
    assert response.headers["cache-control"] == "no-store"
    assert "private-handler-detail" not in response.text


def test_direct_asgi_error_is_stable_without_reading_request_body(tmp_path: Path) -> None:
    app = create_app(
        settings=settings(tmp_path / "imports.json"),
        pool_factory=lambda _: FakePool(),
        policy_loader=lambda _: ScanPolicy(frozenset()),
        service_factory=lambda *_: StubService(),  # type: ignore[arg-type]
    )

    @app.get("/boom-direct")
    async def boom_direct() -> None:
        raise RuntimeError("private-direct-detail")

    async def call_app() -> tuple[list[Message], int]:
        messages: list[Message] = []
        receive_calls = 0

        async def receive() -> Message:
            nonlocal receive_calls
            receive_calls += 1
            raise AssertionError("GET without a body must not call receive")

        async def send(message: Message) -> None:
            messages.append(message)

        scope: Scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "server": ("testserver", 80),
            "client": ("testclient", 50000),
            "scheme": "http",
            "method": "GET",
            "root_path": "",
            "path": "/boom-direct",
            "raw_path": b"/boom-direct",
            "query_string": b"",
            "headers": [],
            "state": {},
        }
        await app(scope, receive, send)
        return messages, receive_calls

    messages, receive_calls = asyncio.run(call_app())
    start = next(message for message in messages if message["type"] == "http.response.start")
    body = b"".join(
        message.get("body", b"") for message in messages if message["type"] == "http.response.body"
    )
    headers = dict(start["headers"])

    assert receive_calls == 0
    assert start["status"] == 503
    assert headers[b"cache-control"] == b"no-store"
    assert json.loads(body) == {"error": "REGISTRY_UNAVAILABLE"}
    assert b"private-direct-detail" not in body


def _signed_headers(
    *,
    action: str,
    permission: str,
    target: str,
    actor: str,
    assurance: str = "session",
    assured_at: int | None = None,
    content_type: str | None = None,
) -> dict[str, str]:
    now = int(time.time())
    payload = {
        "action": action,
        "actor": actor,
        "assurance": assurance,
        "assuredAt": assured_at,
        "expiresAt": now + 5,
        "issuedAt": now,
        "nonce": str(uuid4()),
        "permission": permission,
        "requestId": str(uuid4()),
        "target": target,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    key = hmac.new(CONTROL_KEY.encode(), ASSERTION_KEY_DERIVATION_DOMAIN, hashlib.sha256).digest()

    def encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode()

    assertion = f"{encode(raw)}.{encode(hmac.new(key, raw, hashlib.sha256).digest())}"
    headers = {
        "Authorization": f"Bearer {CONTROL_KEY}",
        "X-Skill-Registry-Assertion": assertion,
    }
    if content_type is not None:
        headers["Content-Type"] = content_type
    return headers


def _minimal_zip(slug: str) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        info = zipfile.ZipInfo(f"{slug}/SKILL.md", (2026, 7, 21, 12, 0, 0))
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | 0o600) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(
            info,
            f"---\nname: {slug}\ndescription: App integration.\nlicense: MIT\n---\n# Demo\n",
        )
    return output.getvalue()


@pytest.mark.skipif(
    INTEGRATION_MANAGER_URL is None,
    reason="missing required registry PostgreSQL DSN: SKILL_REGISTRY_DATABASE_URL",
)
def test_real_postgres_app_upload_detail_review_and_readiness(tmp_path: Path) -> None:
    assert INTEGRATION_MANAGER_URL is not None
    app = create_app(
        settings=RegistrySettings(
            database_url=SecretStr(INTEGRATION_MANAGER_URL),
            control_key=SecretStr(CONTROL_KEY),
            runtime_imports_file=tmp_path / "imports.json",
        ),
        policy_loader=lambda _: ScanPolicy(frozenset()),
    )
    creator, reviewer = str(uuid4()), str(uuid4())
    slug = f"app-pg-{uuid4().hex[:12]}"

    with TestClient(app) as client:
        assert client.get("/internal/health/ready").status_code == 200
        uploaded = client.post(
            "/internal/skills/uploads",
            headers=_signed_headers(
                action="upload",
                permission="admin:assistant:skills:upload",
                target="new",
                actor=creator,
                content_type="application/zip",
            ),
            content=_minimal_zip(slug),
        )
        assert uploaded.status_code == 201
        revision = uploaded.json()["revision"]
        skill_id, revision_id = revision["skillId"], revision["id"]
        target = f"{skill_id}/{revision_id}"

        detail = client.get(
            f"/internal/skills/{skill_id}/revisions/{revision_id}",
            headers=_signed_headers(
                action="detail",
                permission="admin:assistant:skills:review",
                target=target,
                actor=reviewer,
            ),
        )
        assert detail.status_code == 200
        assert detail.json()["revision"]["state"] == "pending_review"

        reviewed = client.post(
            f"/internal/skills/{skill_id}/revisions/{revision_id}/review",
            headers=_signed_headers(
                action="review",
                permission="admin:assistant:skills:review",
                target=target,
                actor=reviewer,
                assurance="password+mfa",
                assured_at=int(time.time()),
                content_type="application/json",
            ),
            json={
                "decision": "approve",
                "expectedState": "pending_review",
                "reason": None,
                "attestations": {
                    "contentReviewed": True,
                    "usageRightsConfirmed": True,
                    "executionRiskAccepted": True,
                    "reviewerAuthorizationConfirmed": True,
                },
            },
        )
        assert reviewed.status_code == 200
        assert reviewed.json()["revision"]["state"] == "published"
