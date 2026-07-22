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
from skill_registry.types import (
    PythonImportSummary,
    RegistryError,
    RevisionDetail,
    SkillSummary,
    StoredFile,
    StoredRevision,
)


CONTROL_KEY = "skill-registry-control-key-0123456789abcdef"
ACTOR = UUID("00000000-0000-4000-8000-000000000001")
SKILL_ID = UUID("10000000-0000-4000-8000-000000000001")
REVISION_ID = UUID("20000000-0000-4000-8000-000000000001")
REQUEST_ID = UUID("30000000-0000-4000-8000-000000000001")
NOW = datetime(2026, 7, 21, tzinfo=UTC)


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
        assert json.loads(response.body) == {"error": code}
        assert response.headers["cache-control"] == "no-store"
        assert b"private validation detail" not in response.body

    too_large = _registry_error(RegistryError("ARCHIVE_TOO_LARGE", "private validation detail"))
    assert too_large.status_code == 413
    assert json.loads(too_large.body) == {"error": "ARCHIVE_TOO_LARGE"}
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
    assert service.reviewed.attestations.reviewer_authorization_confirmed is True


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
