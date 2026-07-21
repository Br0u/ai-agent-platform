"""Thin private HTTP boundary for reviewed skill revisions."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
import json
import re
from typing import Final, Literal, NoReturn, Protocol, cast
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.types import Message

from skill_core.types import MAX_ARCHIVE_BYTES, MAX_FILE_BYTES
from skill_registry.auth import SkillRegistryAssertion
from skill_registry.types import (
    RegistryError,
    ReviewAttestations,
    ReviewDecision,
    ReviewRevision,
    RevisionDetail,
    SkillSummary,
    StoredFile,
    StoredRevision,
)


class RegistryAPIService(Protocol):
    async def list_skills(self, *, limit: int, offset: int) -> tuple[SkillSummary, ...]: ...

    async def upload_zip(
        self,
        *,
        actor: UUID,
        request_id: UUID,
        assertion_nonce: UUID,
        archive: bytes,
        target_skill_id: UUID | None,
    ) -> RevisionDetail: ...

    async def get_revision_detail(self, skill_id: UUID, revision_id: UUID) -> RevisionDetail: ...

    async def get_file_text(self, skill_id: UUID, revision_id: UUID, path: str) -> str: ...

    async def review_revision(self, command: ReviewRevision) -> StoredRevision: ...


ParsedReview = tuple[
    ReviewDecision,
    Literal["pending_review"],
    str | None,
    ReviewAttestations,
]


_NO_STORE_HEADERS: Final = {"Cache-Control": "no-store"}
_ASSERTION_STATE_KEY: Final = "skill_registry_assertion"
_REVIEW_BODY_MAX_BYTES: Final = 8 * 1024
_RESPONSE_BODY_MAX_BYTES: Final = 3 * 1024 * 1024
_FILE_RESPONSE_BODY_MAX_BYTES: Final = MAX_FILE_BYTES * 6 + 1024
_CONTENT_LENGTH_MAX_DIGITS: Final = 20
_PAGE_NUMBER_MAX_DIGITS: Final = 7
_CONTENT_LENGTH_PATTERN: Final = re.compile(rb"0|[1-9][0-9]*\Z")
_REVIEW_FIELDS: Final = frozenset({"decision", "expectedState", "reason", "attestations"})
_ATTESTATION_FIELDS: Final = frozenset(
    {
        "contentReviewed",
        "usageRightsConfirmed",
        "executionRiskAccepted",
        "independentReviewerConfirmed",
    }
)
_STABLE_REGISTRY_CODES: Final = frozenset(
    {
        "ARCHIVE_ENCRYPTED",
        "ARCHIVE_EXTRACTED_TOO_LARGE",
        "ARCHIVE_INVALID",
        "ARCHIVE_MULTIPLE_SKILL_ROOTS",
        "ARCHIVE_NESTED",
        "ARCHIVE_PATH_TOO_DEEP",
        "ARCHIVE_PATH_TOO_LONG",
        "ARCHIVE_TOO_LARGE",
        "ARCHIVE_TOO_MANY_FILES",
        "ARCHIVE_UNSAFE_PATH",
        "ARTIFACT_DIGEST_MISMATCH",
        "ARTIFACT_NOT_FOUND",
        "ARTIFACT_STORAGE_ERROR",
        "ASSERTION_REPLAY",
        "FILE_NOT_FOUND",
        "MANIFEST_INVALID",
        "REGISTRY_STORAGE_ERROR",
        "REVIEW_BLOCKED",
        "REVIEW_SELF_APPROVAL_DENIED",
        "REVISION_NOT_FOUND",
        "REVISION_STATE_CONFLICT",
        "SKILL_FILE_NOT_UTF8",
        "SKILL_FILE_TOO_LARGE",
        "SKILL_NAME_CONFLICT",
        "SKILL_NOT_FOUND",
        "SKILL_SCAN_FAILED",
        "VALIDATION_ERROR",
    }
)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _error(code: str, *, status_code: int) -> JSONResponse:
    return JSONResponse({"error": code}, status_code=status_code, headers=_NO_STORE_HEADERS)


def _registry_error(error: RegistryError) -> JSONResponse:
    code = error.code if error.code in _STABLE_REGISTRY_CODES else "REGISTRY_UNAVAILABLE"
    if code in {"SKILL_NOT_FOUND", "REVISION_NOT_FOUND", "FILE_NOT_FOUND"}:
        status = 404
    elif code in {
        "ASSERTION_REPLAY",
        "SKILL_NAME_CONFLICT",
        "REVISION_STATE_CONFLICT",
        "REVIEW_SELF_APPROVAL_DENIED",
        "REVIEW_BLOCKED",
    }:
        status = 409
    elif code in {
        "REGISTRY_STORAGE_ERROR",
        "ARTIFACT_STORAGE_ERROR",
        "ARTIFACT_DIGEST_MISMATCH",
        "SKILL_SCAN_FAILED",
    }:
        status = 503
    elif code == "REGISTRY_UNAVAILABLE":
        status = 503
    else:
        status = 400
    return _error(code, status_code=status)


def _bounded(
    content: dict[str, object],
    *,
    status_code: int = 200,
    maximum_bytes: int = _RESPONSE_BODY_MAX_BYTES,
) -> JSONResponse:
    response = JSONResponse(content, status_code=status_code, headers=_NO_STORE_HEADERS)
    if len(response.body) > maximum_bytes:
        return _error("RESPONSE_TOO_LARGE", status_code=503)
    return response


def _revision_metadata(revision: StoredRevision) -> dict[str, object]:
    return {
        "id": str(revision.id),
        "skillId": str(revision.skill_id),
        "name": revision.skill_slug,
        "number": revision.revision_no,
        "state": revision.state,
        "sourceType": revision.source_type,
        "artifactSha256": revision.artifact_sha256,
        "createdBy": str(revision.created_by),
        "createdAt": _iso(revision.created_at),
        "reviewedBy": None if revision.reviewed_by is None else str(revision.reviewed_by),
        "reviewedAt": _iso(revision.reviewed_at),
    }


def _summary_content(summary: SkillSummary) -> dict[str, object]:
    revision: dict[str, object] | None = None
    if summary.latest_revision_id is not None:
        revision = {
            "id": str(summary.latest_revision_id),
            "number": summary.latest_revision_no,
            "state": summary.latest_state,
            "sourceType": summary.latest_source_type,
            "artifactSha256Prefix": (
                None
                if summary.latest_artifact_sha256 is None
                else summary.latest_artifact_sha256[:12]
            ),
            "createdBy": (
                None if summary.latest_created_by is None else str(summary.latest_created_by)
            ),
            "createdAt": _iso(summary.latest_created_at),
            "reviewedBy": (
                None if summary.latest_reviewed_by is None else str(summary.latest_reviewed_by)
            ),
            "reviewedAt": _iso(summary.latest_reviewed_at),
        }
    return {
        "id": str(summary.id),
        "name": summary.slug,
        "createdAt": _iso(summary.created_at),
        "revision": revision,
    }


def _file_metadata(file: StoredFile) -> dict[str, object]:
    if file.path == "SKILL.md":
        kind = "manifest"
    elif file.path.startswith("scripts/"):
        kind = "script"
    elif file.path.startswith("references/"):
        kind = "reference"
    else:
        kind = "other"
    return {
        "path": file.path,
        "sha256": file.sha256,
        "size": file.size,
        "mediaType": file.media_type,
        "kind": kind,
    }


def _detail_content(detail: RevisionDetail) -> dict[str, object]:
    revision = detail.revision
    package_diff: dict[str, object] | None = None
    if detail.diff is not None:
        package_diff = {
            "truncated": detail.diff.truncated,
            "files": [
                {
                    "path": item.path,
                    "status": item.status,
                    "binary": item.binary,
                    "diff": item.diff,
                }
                for item in detail.diff.files
            ],
        }
    return {
        "version": "1",
        "revision": {
            **_revision_metadata(revision),
            "description": revision.manifest.description,
            "license": revision.manifest.license,
            "compatibility": revision.manifest.compatibility,
            "allowedTools": list(revision.manifest.allowed_tools),
            "compressedSize": revision.compressed_size,
            "extractedSize": revision.extracted_size,
            "fileCount": revision.file_count,
        },
        "files": [_file_metadata(item) for item in detail.files],
        "dependencies": {
            "pythonModules": list(detail.python_imports.modules),
            "unavailablePythonModules": list(detail.python_imports.unavailable_modules),
        },
        "findings": [
            {
                "path": item.path,
                "line": item.line,
                "code": item.code,
                "message": item.message,
                "blocking": item.blocking,
            }
            for item in revision.findings
        ],
        "previousPublishedRevisionId": (
            None
            if detail.previous_published_revision_id is None
            else str(detail.previous_published_revision_id)
        ),
        "diff": package_diff,
        "reviewAttestations": {
            "contentReviewed": True,
            "usageRightsConfirmed": True,
            "executionRiskAccepted": True,
            "independentReviewerConfirmed": True,
        },
    }


def _request_assertion(request: Request) -> SkillRegistryAssertion | None:
    candidate = request.scope.get("state", {}).get(_ASSERTION_STATE_KEY)
    return candidate if type(candidate) is SkillRegistryAssertion else None


def _header_values(request: Request, name: bytes) -> list[bytes] | None:
    values: list[bytes] = []
    try:
        for header_name, value in request.scope.get("headers", ()):
            if type(header_name) is not bytes or type(value) is not bytes:
                return None
            if header_name.lower() == name:
                values.append(value)
    except (TypeError, ValueError):
        return None
    return values


def _content_length(request: Request) -> tuple[bool, int | None]:
    values = _header_values(request, b"content-length")
    if values is None or len(values) > 1:
        return False, None
    if not values:
        return True, None
    raw = values[0]
    if len(raw) > _CONTENT_LENGTH_MAX_DIGITS or _CONTENT_LENGTH_PATTERN.fullmatch(raw) is None:
        return False, None
    try:
        return True, int(raw)
    except ValueError:
        return False, None


async def _read_body(request: Request, maximum: int) -> bytes | None:
    valid_length, length = _content_length(request)
    if not valid_length or (length is not None and length > maximum):
        return None
    raw = bytearray()
    message: Message | None = None
    chunk = b""
    try:
        while True:
            message = await request.receive()
            if message["type"] != "http.request":
                return None
            chunk = message.get("body", b"")
            if type(chunk) is not bytes or len(raw) + len(chunk) > maximum:
                return None
            raw.extend(chunk)
            more = message.get("more_body", False)
            if type(more) is not bool:
                return None
            if not more:
                return bytes(raw)
    except Exception:
        return None
    finally:
        raw.clear()
        message = None
        chunk = b""


def _strict_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate field")
        value[key] = item
    return value


def _reject_constant(_: str) -> NoReturn:
    raise ValueError("invalid number")


async def _read_review(request: Request) -> ParsedReview | None:
    content_types = _header_values(request, b"content-type")
    if content_types != [b"application/json"]:
        return None
    raw = await _read_body(request, _REVIEW_BODY_MAX_BYTES)
    if raw is None:
        return None
    parsed: object | None = None
    try:
        parsed = json.loads(
            raw,
            object_pairs_hook=_strict_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeError, json.JSONDecodeError, TypeError, ValueError):
        pass
    finally:
        raw = b""
    if type(parsed) is not dict:
        return None
    payload = cast(dict[str, object], parsed)
    if set(payload) != _REVIEW_FIELDS or type(payload["attestations"]) is not dict:
        return None
    attestations = cast(dict[str, object], payload["attestations"])
    if set(attestations) != _ATTESTATION_FIELDS or any(
        type(attestations[key]) is not bool for key in _ATTESTATION_FIELDS
    ):
        return None
    decision = payload["decision"]
    expected_state = payload["expectedState"]
    reason = payload["reason"]
    if (
        type(decision) is not str
        or decision not in ("approve", "reject")
        or type(expected_state) is not str
        or expected_state != "pending_review"
        or (reason is not None and type(reason) is not str)
    ):
        return None
    return (
        cast(ReviewDecision, decision),
        cast(Literal["pending_review"], expected_state),
        reason,
        ReviewAttestations(
            content_reviewed=cast(bool, attestations["contentReviewed"]),
            usage_rights_confirmed=cast(bool, attestations["usageRightsConfirmed"]),
            execution_risk_accepted=cast(bool, attestations["executionRiskAccepted"]),
            independent_reviewer_confirmed=cast(bool, attestations["independentReviewerConfirmed"]),
        ),
    )


def _parse_uuid(value: str) -> UUID | None:
    try:
        parsed = UUID(value)
    except (AttributeError, ValueError):
        return None
    return parsed if str(parsed) == value else None


def _parse_page(request: Request) -> tuple[int, int] | None:
    if set(request.query_params) - {"limit", "offset"}:
        return None
    if (
        len(request.query_params.getlist("limit")) > 1
        or len(request.query_params.getlist("offset")) > 1
    ):
        return None
    raw_limit = request.query_params.get("limit", "50")
    raw_offset = request.query_params.get("offset", "0")
    if (
        len(raw_limit) > _PAGE_NUMBER_MAX_DIGITS
        or len(raw_offset) > _PAGE_NUMBER_MAX_DIGITS
        or re.fullmatch(r"0|[1-9][0-9]*", raw_limit) is None
        or re.fullmatch(r"0|[1-9][0-9]*", raw_offset) is None
    ):
        return None
    try:
        limit, offset = int(raw_limit), int(raw_offset)
    except ValueError:
        return None
    return (limit, offset) if 1 <= limit <= 100 and 0 <= offset <= 1_000_000 else None


def build_skill_registry_router(
    service_provider: Callable[[], RegistryAPIService],
) -> APIRouter:
    router = APIRouter()

    @router.get("/internal/skills", include_in_schema=False)
    async def list_skills(request: Request) -> JSONResponse:
        page = _parse_page(request)
        if page is None:
            return _error("VALIDATION_ERROR", status_code=400)
        limit, offset = page
        try:
            skills = await service_provider().list_skills(limit=limit, offset=offset)
        except RegistryError as error:
            return _registry_error(error)
        except Exception:
            return _error("REGISTRY_UNAVAILABLE", status_code=503)
        if len(skills) > limit:
            return _error("REGISTRY_STORAGE_ERROR", status_code=503)
        return _bounded(
            {
                "version": "1",
                "skills": [_summary_content(item) for item in skills],
                "page": {"limit": limit, "offset": offset, "returned": len(skills)},
            }
        )

    @router.post("/internal/skills/uploads", include_in_schema=False)
    async def upload_skill(request: Request) -> JSONResponse:
        assertion = _request_assertion(request)
        if assertion is None:
            return _error("AUTHORIZATION_FAILED", status_code=403)
        content_types = _header_values(request, b"content-type")
        if content_types != [b"application/zip"]:
            return _error("VALIDATION_ERROR", status_code=400)
        valid_length, length = _content_length(request)
        if not valid_length or (length is not None and length > MAX_ARCHIVE_BYTES):
            return _error("ARCHIVE_TOO_LARGE", status_code=413)
        archive = await _read_body(request, MAX_ARCHIVE_BYTES)
        if archive is None:
            return _error("ARCHIVE_TOO_LARGE", status_code=413)
        target_raw = request.query_params.get("targetSkillId")
        target_skill_id = None if target_raw is None else _parse_uuid(target_raw)
        if target_raw is not None and target_skill_id is None:
            return _error("VALIDATION_ERROR", status_code=400)
        try:
            try:
                detail = await service_provider().upload_zip(
                    actor=assertion.actor,
                    request_id=assertion.request_id,
                    assertion_nonce=assertion.nonce,
                    archive=archive,
                    target_skill_id=target_skill_id,
                )
            except RegistryError as error:
                return _registry_error(error)
            except Exception:
                return _error("REGISTRY_UNAVAILABLE", status_code=503)
        finally:
            archive = b""
        return _bounded(
            {"version": "1", "revision": _revision_metadata(detail.revision)},
            status_code=201,
        )

    @router.get("/internal/skills/{skill_id}/revisions/{revision_id}", include_in_schema=False)
    async def get_revision(skill_id: str, revision_id: str) -> JSONResponse:
        skill_uuid, revision_uuid = _parse_uuid(skill_id), _parse_uuid(revision_id)
        if skill_uuid is None or revision_uuid is None:
            return _error("VALIDATION_ERROR", status_code=400)
        try:
            detail = await service_provider().get_revision_detail(skill_uuid, revision_uuid)
        except RegistryError as error:
            return _registry_error(error)
        except Exception:
            return _error("REGISTRY_UNAVAILABLE", status_code=503)
        return _bounded(_detail_content(detail))

    @router.get(
        "/internal/skills/{skill_id}/revisions/{revision_id}/files/{file_path:path}",
        include_in_schema=False,
    )
    async def get_file(skill_id: str, revision_id: str, file_path: str) -> JSONResponse:
        skill_uuid, revision_uuid = _parse_uuid(skill_id), _parse_uuid(revision_id)
        if skill_uuid is None or revision_uuid is None or not file_path:
            return _error("VALIDATION_ERROR", status_code=400)
        try:
            content = await service_provider().get_file_text(skill_uuid, revision_uuid, file_path)
        except RegistryError as error:
            return _registry_error(error)
        except Exception:
            return _error("REGISTRY_UNAVAILABLE", status_code=503)
        if not isinstance(content, str):
            return _error("REGISTRY_UNAVAILABLE", status_code=503)
        try:
            content_bytes = len(content.encode("utf-8"))
        except UnicodeEncodeError:
            return _error("SKILL_FILE_NOT_UTF8", status_code=400)
        if content_bytes > MAX_FILE_BYTES:
            return _error("SKILL_FILE_TOO_LARGE", status_code=400)
        return _bounded(
            {"version": "1", "path": file_path, "content": content},
            maximum_bytes=_FILE_RESPONSE_BODY_MAX_BYTES,
        )

    @router.post(
        "/internal/skills/{skill_id}/revisions/{revision_id}/review",
        include_in_schema=False,
    )
    async def review_revision(skill_id: str, revision_id: str, request: Request) -> JSONResponse:
        assertion = _request_assertion(request)
        skill_uuid, revision_uuid = _parse_uuid(skill_id), _parse_uuid(revision_id)
        if assertion is None or skill_uuid is None or revision_uuid is None:
            return _error("VALIDATION_ERROR", status_code=400)
        parsed = await _read_review(request)
        if parsed is None:
            return _error("VALIDATION_ERROR", status_code=400)
        decision, expected_state, reason, attestations = parsed
        try:
            reviewed = await service_provider().review_revision(
                ReviewRevision(
                    revision_id=revision_uuid,
                    reviewer=assertion.actor,
                    request_id=assertion.request_id,
                    assertion_nonce=assertion.nonce,
                    decision=decision,
                    expected_state=expected_state,
                    reason=reason,
                    attestations=attestations,
                    skill_id=skill_uuid,
                )
            )
        except RegistryError as error:
            return _registry_error(error)
        except Exception:
            return _error("REGISTRY_UNAVAILABLE", status_code=503)
        if reviewed.skill_id != skill_uuid:
            return _error("REVISION_NOT_FOUND", status_code=404)
        return _bounded({"version": "1", "revision": _revision_metadata(reviewed)})

    return router
