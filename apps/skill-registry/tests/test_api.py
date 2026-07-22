from __future__ import annotations

import base64
from dataclasses import replace
from datetime import UTC, datetime
import hashlib
import hmac
import json
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from starlette.types import Message

from skill_core.types import (
    MAX_FILE_BYTES,
    SkillFileDiff,
    SkillFinding,
    SkillManifest,
    SkillPackageDiff,
)
from skill_registry.api import _registry_error, build_skill_registry_router
from skill_registry.auth import (
    ASSERTION_KEY_DERIVATION_DOMAIN,
    SkillRegistryAuthMiddleware,
    SkillRegistryAuthenticator,
)
from skill_registry.skill_set_api import build_skill_set_router
from skill_registry.types import (
    CreateSkillSetResult,
    PublishedRevisionOption,
    PublishedRevisionPage,
    PythonImportSummary,
    RegistryError,
    RevisionDetail,
    SkillSummary,
    StoredFile,
    StoredRevision,
    StoredSkillSet,
    SkillRuntimeStatus,
)


CONTROL_KEY = "skill-registry-control-key-0123456789abcdef"
ACTOR = UUID("00000000-0000-4000-8000-000000000001")
SKILL_ID = UUID("10000000-0000-4000-8000-000000000001")
REVISION_ID = UUID("20000000-0000-4000-8000-000000000001")
REQUEST_ID = UUID("30000000-0000-4000-8000-000000000001")
NOW = datetime(2026, 7, 21, tzinfo=UTC)
SET_ID = UUID("50000000-0000-4000-8000-000000000001")


PACKAGE_VALIDATION_CODES = (
    "ARCHIVE_FILE_TOO_LARGE",
    "ARCHIVE_GIT_LFS_POINTER",
    "ARCHIVE_GIT_METADATA",
    "ARCHIVE_PATH_CONFLICT",
    "ARCHIVE_SKILL_ROOT_REQUIRED",
    "ARCHIVE_UNSUPPORTED_FILE",
    "SKILL_BINARY_FILE",
    "SKILL_SCRIPT_SHEBANG_UNSUPPORTED",
)


def assertion_headers(
    action: str,
    permission: str,
    target: str,
    *,
    nonce: UUID,
    assurance: str = "session",
    assured_at: int | None = None,
) -> dict[str, str]:
    payload = {
        "action": action,
        "actor": str(ACTOR),
        "assurance": assurance,
        "assuredAt": assured_at,
        "expiresAt": 105,
        "issuedAt": 100,
        "nonce": str(nonce),
        "permission": permission,
        "requestId": str(REQUEST_ID),
        "target": target,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    key = hmac.new(CONTROL_KEY.encode(), ASSERTION_KEY_DERIVATION_DOMAIN, hashlib.sha256).digest()
    signature = hmac.new(key, raw, hashlib.sha256).digest()

    def encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode()

    return {
        "Authorization": f"Bearer {CONTROL_KEY}",
        "X-Skill-Registry-Assertion": f"{encode(raw)}.{encode(signature)}",
    }


def revision() -> StoredRevision:
    return StoredRevision(
        id=REVISION_ID,
        skill_id=SKILL_ID,
        skill_slug="demo-skill",
        revision_no=2,
        state="pending_review",
        source_type="upload",
        manifest=SkillManifest(
            name="demo-skill",
            description="Demo",
            instructions="# secret source is not list metadata",
            scripts=("scripts/run.py",),
            references=("references/guide.md",),
            license="MIT",
        ),
        findings=(SkillFinding("scripts/run.py", 1, "subprocess", "review", False),),
        created_by=ACTOR,
        created_at=NOW,
        reviewed_by=None,
        reviewed_at=None,
        artifact_sha256="a" * 64,
        compressed_size=100,
        extracted_size=200,
        file_count=3,
    )


class StubService:
    def __init__(self) -> None:
        self.uploaded: tuple[object, ...] | None = None
        self.reviewed: object | None = None
        self.list_bounds: tuple[int, int] | None = None
        self.fail_with: RegistryError | None = None
        self.file_content = "# Guide\n"

    async def list_skills(self, *, limit: int, offset: int) -> tuple[SkillSummary, ...]:
        self.list_bounds = (limit, offset)
        item = revision()
        return (
            SkillSummary(
                SKILL_ID,
                "demo-skill",
                item.revision_no,
                item.id,
                item.state,
                NOW,
                latest_source_type=item.source_type,
                latest_artifact_sha256=item.artifact_sha256,
                latest_created_by=item.created_by,
                latest_created_at=item.created_at,
                latest_reviewed_by=item.reviewed_by,
                latest_reviewed_at=item.reviewed_at,
            ),
        )

    async def upload_zip(self, **values: object) -> RevisionDetail:
        self.uploaded = tuple(values.values())
        return detail()

    async def get_revision_detail(self, skill_id: UUID, revision_id: UUID) -> RevisionDetail:
        if self.fail_with is not None:
            raise self.fail_with
        assert (skill_id, revision_id) == (SKILL_ID, REVISION_ID)
        return detail()

    async def get_file_text(self, skill_id: UUID, revision_id: UUID, path: str) -> str:
        assert (skill_id, revision_id, path) == (
            SKILL_ID,
            REVISION_ID,
            "references/guide.md",
        )
        return self.file_content

    async def review_revision(self, command: object) -> StoredRevision:
        self.reviewed = command
        return replace(revision(), state="published", reviewed_by=ACTOR, reviewed_at=NOW)


class SkillSetStubService:
    def __init__(self) -> None:
        self.created: object | None = None
        self.discarded: object | None = None
        self.cloned: object | None = None
        self.fail_with: RegistryError | None = None

    async def create_skill_set(self, command: object) -> CreateSkillSetResult:
        self.created = command
        self._raise_if_configured()
        return CreateSkillSetResult(candidate_set(), False)

    async def discard_skill_set(self, command: object) -> CreateSkillSetResult:
        self.discarded = command
        self._raise_if_configured()
        return CreateSkillSetResult(replace(candidate_set(), state="discarded"), False)

    async def clone_previous_skill_set(self, command: object) -> CreateSkillSetResult:
        self.cloned = command
        self._raise_if_configured()
        return CreateSkillSetResult(candidate_set(), False)

    async def get_runtime_status(self, agent_id: str) -> SkillRuntimeStatus:
        assert agent_id == "maduoduo"
        self._raise_if_configured()
        return SkillRuntimeStatus(None, None, 0, (candidate_set(),))

    async def list_available_revisions(self, *, limit: int, offset: int) -> PublishedRevisionPage:
        assert (limit, offset) == (100, 0)
        self._raise_if_configured()
        return PublishedRevisionPage(
            (
                PublishedRevisionOption(
                    SKILL_ID,
                    REVISION_ID,
                    "demo",
                    2,
                    "a" * 64,
                    123,
                ),
            ),
            limit,
            offset,
            1,
        )

    def _raise_if_configured(self) -> None:
        if self.fail_with is not None:
            raise self.fail_with


def candidate_set() -> StoredSkillSet:
    return StoredSkillSet(
        SET_ID,
        "maduoduo",
        "candidate",
        (REVISION_ID,),
        1,
        123,
        None,
        None,
    )


def detail() -> RevisionDetail:
    item = revision()
    files = (
        StoredFile("SKILL.md", "b" * 64, 10, "text/markdown"),
        StoredFile("references/guide.md", "c" * 64, 8, "text/markdown"),
        StoredFile("scripts/run.py", "d" * 64, 20, "text/x-python"),
    )
    return RevisionDetail(
        revision=item,
        files=files,
        scripts=(files[2],),
        references=(files[1],),
        python_imports=PythonImportSummary(("requests",), ("requests",)),
        previous_published_revision_id=UUID("20000000-0000-4000-8000-000000000000"),
        diff=SkillPackageDiff(
            (SkillFileDiff("SKILL.md", "modified", False, "@@ -1 +1 @@\n"),), False
        ),
    )


def app_for(service: StubService) -> FastAPI:
    app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
    app.include_router(build_skill_registry_router(lambda: service))
    app.add_middleware(
        SkillRegistryAuthMiddleware,
        authenticator=SkillRegistryAuthenticator(control_key=SecretStr(CONTROL_KEY)),
        clock=lambda: 100.0,
    )
    return app


def skill_set_app_for(service: SkillSetStubService) -> FastAPI:
    app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
    app.include_router(build_skill_set_router(lambda: service))
    app.add_middleware(
        SkillRegistryAuthMiddleware,
        authenticator=SkillRegistryAuthenticator(control_key=SecretStr(CONTROL_KEY)),
        clock=lambda: 100.0,
    )
    return app


def skill_set_mutation_headers(action: str, target: str) -> dict[str, str]:
    return {
        **assertion_headers(
            action,
            "admin:assistant:skills:configure",
            target,
            nonce=REQUEST_ID,
            assurance="password+mfa",
            assured_at=99,
        ),
        "Content-Type": "application/json",
    }


def test_list_is_bounded_metadata_only() -> None:
    service = StubService()
    headers = assertion_headers(
        "list",
        "admin:assistant:skills",
        "skills",
        nonce=UUID("40000000-0000-4000-8000-000000000001"),
    )
    response = TestClient(app_for(service)).get(
        "/internal/skills?limit=25&offset=10", headers=headers
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert service.list_bounds == (25, 10)
    assert response.json() == {
        "version": "1",
        "skills": [
            {
                "id": str(SKILL_ID),
                "name": "demo-skill",
                "createdAt": "2026-07-21T00:00:00.000Z",
                "revision": {
                    "id": str(REVISION_ID),
                    "number": 2,
                    "state": "pending_review",
                    "sourceType": "upload",
                    "artifactSha256Prefix": "aaaaaaaaaaaa",
                    "createdBy": str(ACTOR),
                    "createdAt": "2026-07-21T00:00:00.000Z",
                    "reviewedBy": None,
                    "reviewedAt": None,
                },
            }
        ],
        "page": {"limit": 25, "offset": 10, "returned": 1},
    }
    rendered = response.text
    for forbidden in ("path", "findings", "diff", "secret source"):
        assert forbidden not in rendered


def test_extreme_pagination_numbers_are_stable_validation_errors() -> None:
    headers = assertion_headers(
        "list",
        "admin:assistant:skills",
        "skills",
        nonce=UUID("40000000-0000-4000-8000-000000000010"),
    )
    for parameter in ("limit", "offset"):
        service = StubService()
        response = TestClient(app_for(service)).get(
            f"/internal/skills?{parameter}={'9' * 5000}", headers=headers
        )

        assert response.status_code == 400
        assert response.json() == {"error": "VALIDATION_ERROR"}
        assert response.headers["cache-control"] == "no-store"
        assert service.list_bounds is None


def test_package_validation_errors_remain_stable_client_errors() -> None:
    for code in PACKAGE_VALIDATION_CODES:
        response = _registry_error(RegistryError(code, "private validation detail"))

        assert response.status_code == 400
        assert json.loads(bytes(response.body)) == {"error": code}
        assert response.headers["cache-control"] == "no-store"
        assert b"private validation detail" not in response.body

    too_large = _registry_error(RegistryError("ARCHIVE_TOO_LARGE", "private validation detail"))
    assert too_large.status_code == 413
    assert json.loads(bytes(too_large.body)) == {"error": "ARCHIVE_TOO_LARGE"}
    assert b"private validation detail" not in too_large.body


def test_detail_contains_review_metadata_without_source_content() -> None:
    service = StubService()
    target = f"{SKILL_ID}/{REVISION_ID}"
    response = TestClient(app_for(service)).get(
        f"/internal/skills/{SKILL_ID}/revisions/{REVISION_ID}",
        headers=assertion_headers(
            "detail",
            "admin:assistant:skills:review",
            target,
            nonce=UUID("40000000-0000-4000-8000-000000000002"),
        ),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["revision"]["license"] == "MIT"
    assert payload["dependencies"] == {
        "pythonModules": ["requests"],
        "unavailablePythonModules": ["requests"],
    }
    assert payload["findings"][0]["code"] == "subprocess"
    assert payload["previousPublishedRevisionId"] is not None
    assert payload["diff"]["files"][0]["status"] == "modified"
    assert set(payload["reviewAttestations"]) == {
        "contentReviewed",
        "usageRightsConfirmed",
        "executionRiskAccepted",
        "independentReviewerConfirmed",
    }
    assert "secret source" not in response.text


def test_file_returns_only_service_verified_text() -> None:
    service = StubService()
    target = f"{SKILL_ID}/{REVISION_ID}/references/guide.md"
    response = TestClient(app_for(service)).get(
        f"/internal/skills/{SKILL_ID}/revisions/{REVISION_ID}/files/references/guide.md",
        headers=assertion_headers(
            "file",
            "admin:assistant:skills:review",
            target,
            nonce=UUID("40000000-0000-4000-8000-000000000003"),
        ),
    )

    assert response.status_code == 200
    assert response.json() == {
        "version": "1",
        "path": "references/guide.md",
        "content": "# Guide\n",
    }


def test_file_json_bound_allows_exact_maximum_escaped_text() -> None:
    for index, content in enumerate(('"' * MAX_FILE_BYTES, "\x01" * MAX_FILE_BYTES), start=30):
        service = StubService()
        service.file_content = content
        target = f"{SKILL_ID}/{REVISION_ID}/references/guide.md"
        response = TestClient(app_for(service)).get(
            f"/internal/skills/{SKILL_ID}/revisions/{REVISION_ID}/files/references/guide.md",
            headers=assertion_headers(
                "file",
                "admin:assistant:skills:review",
                target,
                nonce=UUID(f"40000000-0000-4000-8000-{index:012d}"),
            ),
        )

        assert response.status_code == 200
        assert response.json()["content"] == content


def test_file_rejects_text_larger_than_two_mib() -> None:
    service = StubService()
    service.file_content = "x" * (MAX_FILE_BYTES + 1)
    target = f"{SKILL_ID}/{REVISION_ID}/references/guide.md"
    response = TestClient(app_for(service)).get(
        f"/internal/skills/{SKILL_ID}/revisions/{REVISION_ID}/files/references/guide.md",
        headers=assertion_headers(
            "file",
            "admin:assistant:skills:review",
            target,
            nonce=UUID("40000000-0000-4000-8000-000000000032"),
        ),
    )

    assert response.status_code == 400
    assert response.json() == {"error": "SKILL_FILE_TOO_LARGE"}


def test_upload_and_review_forward_verified_assertion_context() -> None:
    service = StubService()
    client = TestClient(app_for(service))
    upload = client.post(
        "/internal/skills/uploads",
        headers={
            **assertion_headers(
                "upload",
                "admin:assistant:skills:upload",
                "new",
                nonce=UUID("40000000-0000-4000-8000-000000000004"),
            ),
            "Content-Type": "application/zip",
        },
        content=b"PK demo",
    )
    assert upload.status_code == 201
    assert service.uploaded is not None
    assert b"PK demo" in service.uploaded

    target = f"{SKILL_ID}/{REVISION_ID}"
    review = client.post(
        f"/internal/skills/{SKILL_ID}/revisions/{REVISION_ID}/review",
        headers={
            **assertion_headers(
                "review",
                "admin:assistant:skills:review",
                target,
                assurance="password+mfa",
                assured_at=99,
                nonce=UUID("40000000-0000-4000-8000-000000000005"),
            ),
            "Content-Type": "application/json",
        },
        content=json.dumps(
            {
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
            separators=(",", ":"),
        ),
    )
    assert review.status_code == 200
    assert service.reviewed is not None
    assert getattr(service.reviewed, "reviewer") == ACTOR
    assert getattr(service.reviewed, "skill_id") == SKILL_ID
    assert getattr(service.reviewed, "attestations").reviewer_authorization_confirmed is True


def test_upload_content_length_is_rejected_without_receiving_body() -> None:
    service = StubService()
    app = app_for(service)
    received = False
    sent: list[Message] = []
    raw_headers = [
        (name.lower().encode(), value.encode())
        for name, value in assertion_headers(
            "upload",
            "admin:assistant:skills:upload",
            "new",
            nonce=UUID("40000000-0000-4000-8000-000000000006"),
        ).items()
    ]
    raw_headers.extend([(b"content-type", b"application/zip"), (b"content-length", b"5242881")])

    async def receive() -> dict[str, object]:
        nonlocal received
        received = True
        raise AssertionError("oversized Content-Length must be rejected pre-body")

    async def send(message: Message) -> None:
        sent.append(message)

    import asyncio

    asyncio.run(
        app(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/internal/skills/uploads",
                "raw_path": b"/internal/skills/uploads",
                "query_string": b"",
                "headers": raw_headers,
                "client": ("127.0.0.1", 1),
                "server": ("test", 80),
                "root_path": "",
            },
            receive,
            send,
        )
    )
    assert received is False
    assert sent[0]["status"] == 413


def test_upload_extreme_content_length_is_stable_413_before_body() -> None:
    service = StubService()
    app = app_for(service)
    received = False
    sent: list[Message] = []
    raw_headers = [
        (name.lower().encode(), value.encode())
        for name, value in assertion_headers(
            "upload",
            "admin:assistant:skills:upload",
            "new",
            nonce=UUID("40000000-0000-4000-8000-000000000009"),
        ).items()
    ]
    raw_headers.extend([(b"content-type", b"application/zip"), (b"content-length", b"9" * 5000)])

    async def receive() -> Message:
        nonlocal received
        received = True
        raise AssertionError("extreme Content-Length must be rejected pre-body")

    async def send(message: Message) -> None:
        sent.append(message)

    import asyncio

    asyncio.run(
        app(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/internal/skills/uploads",
                "raw_path": b"/internal/skills/uploads",
                "query_string": b"",
                "headers": raw_headers,
                "client": ("127.0.0.1", 1),
                "server": ("test", 80),
                "root_path": "",
            },
            receive,
            send,
        )
    )
    assert received is False
    assert sent[0]["status"] == 413
    body = b"".join(
        message.get("body", b"") for message in sent if message["type"] == "http.response.body"
    )
    assert json.loads(body) == {"error": "ARCHIVE_TOO_LARGE"}


def test_upload_without_content_length_stops_at_actual_five_mib_limit() -> None:
    service = StubService()
    app = app_for(service)
    messages = iter(
        [
            {
                "type": "http.request",
                "body": b"x" * (5 * 1024 * 1024),
                "more_body": True,
            },
            {"type": "http.request", "body": b"x", "more_body": True},
        ]
    )
    reads = 0
    sent: list[Message] = []
    raw_headers = [
        (name.lower().encode(), value.encode())
        for name, value in assertion_headers(
            "upload",
            "admin:assistant:skills:upload",
            "new",
            nonce=UUID("40000000-0000-4000-8000-000000000008"),
        ).items()
    ]
    raw_headers.append((b"content-type", b"application/zip"))

    async def receive() -> Message:
        nonlocal reads
        reads += 1
        if reads > 2:
            raise AssertionError("reader continued after crossing upload limit")
        return next(messages)

    async def send(message: Message) -> None:
        sent.append(message)

    import asyncio

    asyncio.run(
        app(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/internal/skills/uploads",
                "raw_path": b"/internal/skills/uploads",
                "query_string": b"",
                "headers": raw_headers,
                "client": ("127.0.0.1", 1),
                "server": ("test", 80),
                "root_path": "",
            },
            receive,
            send,
        )
    )
    assert reads == 2
    assert sent[0]["status"] == 413
    assert service.uploaded is None


def test_errors_return_only_stable_code_and_no_secret_exception_chain() -> None:
    service = StubService()
    secret = "postgresql://private-secret"
    try:
        raise RuntimeError(secret)
    except RuntimeError:
        service.fail_with = RegistryError("REGISTRY_STORAGE_ERROR", secret)
    target = f"{SKILL_ID}/{REVISION_ID}"
    response = TestClient(app_for(service)).get(
        f"/internal/skills/{SKILL_ID}/revisions/{REVISION_ID}",
        headers=assertion_headers(
            "detail",
            "admin:assistant:skills:review",
            target,
            nonce=UUID("40000000-0000-4000-8000-000000000007"),
        ),
    )
    assert response.status_code == 503
    assert response.json() == {"error": "REGISTRY_STORAGE_ERROR"}
    assert secret not in response.text


def test_skill_set_create_forwards_bound_assertion_and_returns_exact_summary() -> None:
    service = SkillSetStubService()
    response = TestClient(skill_set_app_for(service)).post(
        "/internal/skill-sets",
        headers=skill_set_mutation_headers("skill_set_create", "maduoduo"),
        content=json.dumps(
            {
                "agentId": "maduoduo",
                "revisionIds": [str(REVISION_ID)],
                "requestId": str(REQUEST_ID),
            },
            separators=(",", ":"),
        ),
    )

    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "set": {
            "id": str(SET_ID),
            "state": "candidate",
            "revisionIds": [str(REVISION_ID)],
            "itemCount": 1,
            "totalExtractedSize": 123,
        },
        "replayed": False,
    }
    assert service.created is not None
    assert getattr(service.created, "actor") == ACTOR
    assert getattr(service.created, "request_id") == REQUEST_ID
    assert getattr(service.created, "assertion_nonce") == REQUEST_ID
    assert getattr(service.created, "agent_id") == "maduoduo"
    assert getattr(service.created, "revision_ids") == (REVISION_ID,)


def test_skill_set_status_and_available_revisions_have_exact_bounded_shapes() -> None:
    service = SkillSetStubService()
    client = TestClient(skill_set_app_for(service))
    status = client.get(
        "/internal/skill-sets/runtime-status",
        headers=assertion_headers(
            "skill_set_status",
            "admin:assistant:skills",
            "maduoduo",
            nonce=UUID("40000000-0000-4000-8000-000000000041"),
        ),
    )
    available = client.get(
        "/internal/skill-sets/available-revisions?limit=100&offset=0",
        headers=assertion_headers(
            "skill_set_available",
            "admin:assistant:skills",
            "published-revisions",
            nonce=UUID("40000000-0000-4000-8000-000000000042"),
        ),
    )

    assert status.status_code == 200
    assert status.headers["cache-control"] == "no-store"
    assert status.json() == {
        "active": None,
        "previous": None,
        "activationVersion": 0,
        "candidateCount": 1,
        "candidates": [
            {
                "id": str(SET_ID),
                "state": "candidate",
                "revisionIds": [str(REVISION_ID)],
                "itemCount": 1,
                "totalExtractedSize": 123,
                "failureCode": None,
            }
        ],
    }
    assert available.status_code == 200
    assert available.headers["cache-control"] == "no-store"
    assert available.json() == {
        "items": [
            {
                "skillId": str(SKILL_ID),
                "revisionId": str(REVISION_ID),
                "slug": "demo",
                "revisionNo": 2,
                "artifactSha256": "a" * 64,
                "extractedSize": 123,
            }
        ],
        "limit": 100,
        "offset": 0,
        "total": 1,
    }


def test_skill_set_discard_and_rollback_forward_cas_inputs() -> None:
    service = SkillSetStubService()
    client = TestClient(skill_set_app_for(service))
    discarded = client.post(
        f"/internal/skill-sets/{SET_ID}/discard",
        headers=skill_set_mutation_headers("skill_set_discard", f"maduoduo:{SET_ID}"),
        content=json.dumps({"requestId": str(REQUEST_ID)}, separators=(",", ":")),
    )
    rolled_back = client.post(
        "/internal/skill-sets/rollback-candidates",
        headers=skill_set_mutation_headers("skill_set_rollback", "maduoduo:previous"),
        content=json.dumps(
            {
                "agentId": "maduoduo",
                "expectedActivationVersion": 1,
                "expectedPreviousSetId": str(SET_ID),
                "requestId": str(REQUEST_ID),
            },
            separators=(",", ":"),
        ),
    )

    assert discarded.status_code == 200
    assert discarded.json()["set"]["state"] == "discarded"
    assert getattr(service.discarded, "set_id") == SET_ID
    assert getattr(service.discarded, "assertion_nonce") == REQUEST_ID
    assert rolled_back.status_code == 201
    assert rolled_back.json()["set"]["state"] == "candidate"
    assert getattr(service.cloned, "expected_activation_version") == 1
    assert getattr(service.cloned, "expected_previous_set_id") == SET_ID
    assert getattr(service.cloned, "request_id") == REQUEST_ID


def test_skill_set_json_is_strict_bounded_and_request_bound() -> None:
    valid = {
        "agentId": "maduoduo",
        "revisionIds": [str(REVISION_ID)],
        "requestId": str(REQUEST_ID),
    }
    cases = (
        {**valid, "unknown": True},
        {**valid, "revisionIds": ["not-a-uuid"]},
        {**valid, "revisionIds": [str(REVISION_ID)] * 17},
        {**valid, "requestId": "30000000-0000-4000-8000-000000000002"},
    )
    for body in cases:
        service = SkillSetStubService()
        response = TestClient(skill_set_app_for(service)).post(
            "/internal/skill-sets",
            headers=skill_set_mutation_headers("skill_set_create", "maduoduo"),
            content=json.dumps(body, separators=(",", ":")),
        )
        assert response.status_code == 400
        assert response.json() == {"error": "candidate_invalid"}
        assert response.headers["cache-control"] == "no-store"
        assert service.created is None

    duplicate = (
        '{"agentId":"maduoduo","revisionIds":["'
        + str(REVISION_ID)
        + '"],"requestId":"'
        + str(REQUEST_ID)
        + '","requestId":"'
        + str(REQUEST_ID)
        + '"}'
    )
    duplicate_response = TestClient(skill_set_app_for(SkillSetStubService())).post(
        "/internal/skill-sets",
        headers=skill_set_mutation_headers("skill_set_create", "maduoduo"),
        content=duplicate,
    )
    assert duplicate_response.status_code == 400
    assert duplicate_response.json() == {"error": "candidate_invalid"}

    oversized_response = TestClient(skill_set_app_for(SkillSetStubService())).post(
        "/internal/skill-sets",
        headers=skill_set_mutation_headers("skill_set_create", "maduoduo"),
        content=b"{" + b"x" * (8 * 1024),
    )
    assert oversized_response.status_code == 400
    assert oversized_response.json() == {"error": "candidate_invalid"}

    oversized_version = TestClient(skill_set_app_for(SkillSetStubService())).post(
        "/internal/skill-sets/rollback-candidates",
        headers=skill_set_mutation_headers("skill_set_rollback", "maduoduo:previous"),
        json={
            "agentId": "maduoduo",
            "expectedActivationVersion": 9_223_372_036_854_775_808,
            "expectedPreviousSetId": str(SET_ID),
            "requestId": str(REQUEST_ID),
        },
    )
    assert oversized_version.status_code == 400
    assert oversized_version.json() == {"error": "candidate_invalid"}


def test_skill_set_service_errors_are_stable_and_hide_details() -> None:
    cases = (
        ("CANDIDATE_INVALID", 400, "candidate_invalid"),
        ("SKILL_SET_NOT_FOUND", 404, "skill_set_not_found"),
        ("SKILL_SET_STATE_CONFLICT", 409, "skill_set_state_conflict"),
        ("IDEMPOTENCY_CONFLICT", 409, "idempotency_conflict"),
        ("REGISTRY_STORAGE_ERROR", 503, "registry_unavailable"),
        ("UNEXPECTED_PRIVATE_ERROR", 503, "registry_unavailable"),
    )
    for code, status_code, external_code in cases:
        service = SkillSetStubService()
        service.fail_with = RegistryError(code, "postgresql://private-secret")
        response = TestClient(skill_set_app_for(service)).get(
            "/internal/skill-sets/runtime-status",
            headers=assertion_headers(
                "skill_set_status",
                "admin:assistant:skills",
                "maduoduo",
                nonce=UUID("40000000-0000-4000-8000-000000000043"),
            ),
        )
        assert response.status_code == status_code
        assert response.json() == {"error": external_code}
        assert "private-secret" not in response.text
