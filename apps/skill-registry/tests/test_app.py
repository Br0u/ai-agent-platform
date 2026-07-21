from __future__ import annotations

import base64
from contextlib import asynccontextmanager
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import stat
import time
from uuid import uuid4
import zipfile

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from skill_registry.app import RegistryStartupError, create_app
from skill_registry.auth import ASSERTION_KEY_DERIVATION_DOMAIN
from skill_registry.config import RegistrySettings
from skill_registry.types import ScanPolicy


MANAGER_URL = (
    "postgresql+psycopg_async://ai_agent_skill_registry_manager:private-manager@db:5432/platform"
)
CONTROL_KEY = "skill-registry-control-key-0123456789abcdef"
INTEGRATION_MANAGER_URL = os.getenv("SKILL_REGISTRY_DATABASE_URL")


class FakePool:
    def __init__(self) -> None:
        self.opened = 0
        self.closed = 0
        self.connections = 0

    async def open(self, *, wait: bool) -> None:
        assert wait is True
        self.opened += 1

    async def close(self) -> None:
        self.closed += 1

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


def test_lifespan_reads_policy_once_builds_one_service_and_closes_pool(tmp_path: Path) -> None:
    manifest = tmp_path / "imports.json"
    manifest.write_text('{"allowedPythonModules":["third_party"]}')
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
                    "independentReviewerConfirmed": True,
                },
            },
        )
        assert reviewed.status_code == 200
        assert reviewed.json()["revision"]["state"] == "published"
