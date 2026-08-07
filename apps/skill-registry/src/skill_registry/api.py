"""Thin private HTTP boundary for validated Skill revisions."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
import json
import re
from typing import Final, Protocol
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.types import Message

from skill_core.types import MAX_ARCHIVE_BYTES, MAX_FILE_BYTES
from skill_registry.auth import SkillRegistryAssertion
from skill_registry.types import (
    RegistryError,
    RevisionDetail,
    SkillLibraryItem,
    StoredFile,
    StoredRevision,
)


class RegistryAPIService(Protocol):
    async def list_skills(self, *, limit: int, offset: int) -> tuple[SkillLibraryItem, ...]: ...

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

    async def archive_skill(
        self,
        *,
        actor: UUID,
        request_id: UUID,
        assertion_nonce: UUID,
        skill_id: UUID,
        expected_artifact_sha256: str,
    ) -> None: ...

_NO_STORE_HEADERS: Final = {"Cache-Control": "no-store"}
_ASSERTION_STATE_KEY: Final = "skill_registry_assertion"
_RESPONSE_BODY_MAX_BYTES: Final = 3 * 1024 * 1024
_FILE_RESPONSE_BODY_MAX_BYTES: Final = MAX_FILE_BYTES * 6 + 1024
_CONTENT_LENGTH_MAX_DIGITS: Final = 20
_PAGE_NUMBER_MAX_DIGITS: Final = 7
_CONTENT_LENGTH_PATTERN: Final = re.compile(rb"0|[1-9][0-9]*\Z")
_STABLE_REGISTRY_CODES: Final = frozenset(
    {
        "ARCHIVE_ENCRYPTED",
        "ARCHIVE_EXTRACTED_TOO_LARGE",
        "ARCHIVE_FILE_TOO_LARGE",
        "ARCHIVE_GIT_LFS_POINTER",
        "ARCHIVE_GIT_METADATA",
        "ARCHIVE_INVALID",
        "ARCHIVE_MULTIPLE_SKILL_ROOTS",
        "ARCHIVE_NESTED",
        "ARCHIVE_PATH_CONFLICT",
        "ARCHIVE_PATH_TOO_DEEP",
        "ARCHIVE_PATH_TOO_LONG",
        "ARCHIVE_SKILL_ROOT_REQUIRED",
        "ARCHIVE_TOO_LARGE",
        "ARCHIVE_TOO_MANY_FILES",
        "ARCHIVE_UNSAFE_PATH",
        "ARCHIVE_UNSUPPORTED_FILE",
        "ARTIFACT_DIGEST_MISMATCH",
        "ARTIFACT_NOT_FOUND",
        "ARTIFACT_STORAGE_ERROR",
        "ASSERTION_REPLAY",
        "FILE_NOT_FOUND",
        "MANIFEST_INVALID",
        "REGISTRY_STORAGE_ERROR",
        "REVISION_NOT_FOUND",
        "SKILL_SCAN_BLOCKED",
        "SKILL_BINARY_FILE",
        "SKILL_ACTIVE",
        "SKILL_CHANGED",
        "SKILL_FILE_NOT_UTF8",
        "SKILL_FILE_TOO_LARGE",
        "SKILL_NAME_CONFLICT",
        "SKILL_NOT_FOUND",
        "SKILL_SCAN_FAILED",
        "SKILL_SCRIPT_SHEBANG_UNSUPPORTED",
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
        "SKILL_CHANGED",
        "SKILL_ACTIVE",
    }:
        status = 409
    elif code in {
        "REGISTRY_STORAGE_ERROR",
        "ARTIFACT_STORAGE_ERROR",
        "ARTIFACT_DIGEST_MISMATCH",
        "SKILL_SCAN_FAILED",
    }:
        status = 503
    elif code == "ARCHIVE_TOO_LARGE":
        status = 413
    elif code == "REGISTRY_UNAVAILABLE":
        status = 503
    else:
        status = 400
    if code == "SKILL_NAME_CONFLICT" and error.conflicting_skill_id is not None:
        return JSONResponse(
            {"error": code, "conflictingSkillId": str(error.conflicting_skill_id)},
            status_code=status,
            headers=_NO_STORE_HEADERS,
        )
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
    }


def _summary_content(summary: SkillLibraryItem) -> dict[str, object]:
    return {
        "id": str(summary.id),
        "name": summary.name,
        "description": summary.description,
        "enabled": summary.enabled,
        "uploadedAt": _iso(summary.uploaded_at),
        "replacementToken": summary.replacement_token,
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

    @router.post("/internal/skills/{skill_id}/archive", include_in_schema=False)
    async def archive_skill(skill_id: UUID, request: Request) -> JSONResponse:
        assertion = _request_assertion(request)
        body = await _read_body(request, 512)
        try:
            payload = None if body is None else json.loads(body)
        except (UnicodeError, json.JSONDecodeError):
            payload = None
        if (
            assertion is None
            or type(payload) is not dict
            or set(payload) != {"requestId", "expectedArtifactSha256"}
            or payload.get("requestId") != str(assertion.request_id)
            or type(payload.get("expectedArtifactSha256")) is not str
            or re.fullmatch(r"[0-9a-f]{64}", payload["expectedArtifactSha256"]) is None
        ):
            return _error("VALIDATION_ERROR", status_code=400)
        try:
            await service_provider().archive_skill(
                actor=assertion.actor,
                request_id=assertion.request_id,
                assertion_nonce=assertion.nonce,
                skill_id=skill_id,
                expected_artifact_sha256=payload["expectedArtifactSha256"],
            )
        except RegistryError as error:
            return _registry_error(error)
        except Exception:
            return _error("REGISTRY_UNAVAILABLE", status_code=503)
        return _bounded({"version": "1", "archivedSkillId": str(skill_id)})

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

    return router
