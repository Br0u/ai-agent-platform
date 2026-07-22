"""Private HTTP boundary for the fixed-Agent Skill set configuration."""

from __future__ import annotations

from collections.abc import Callable
import json
import re
from typing import Final, NoReturn, Protocol, cast
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from skill_registry.api import _header_values, _read_body, _request_assertion
from skill_registry.types import (
    ClonePreviousSkillSet,
    CreateSkillSet,
    CreateSkillSetResult,
    DiscardSkillSet,
    PublishedRevisionPage,
    RegistryError,
    SkillRuntimeStatus,
    StoredSkillSet,
)


class SkillSetAPIService(Protocol):
    async def create_skill_set(self, command: CreateSkillSet) -> CreateSkillSetResult: ...

    async def discard_skill_set(self, command: DiscardSkillSet) -> CreateSkillSetResult: ...

    async def clone_previous_skill_set(
        self, command: ClonePreviousSkillSet
    ) -> CreateSkillSetResult: ...

    async def get_runtime_status(self, agent_id: str) -> SkillRuntimeStatus: ...

    async def list_available_revisions(
        self, *, limit: int, offset: int
    ) -> PublishedRevisionPage: ...


_BODY_MAX_BYTES: Final = 8 * 1024
_NO_STORE_HEADERS: Final = {"Cache-Control": "no-store"}
_PAGE_NUMBER_MAX_DIGITS: Final = 7
_POSTGRES_BIGINT_MAX: Final = 9_223_372_036_854_775_807
_CREATE_FIELDS: Final = frozenset({"agentId", "revisionIds", "requestId"})
_DISCARD_FIELDS: Final = frozenset({"requestId"})
_ROLLBACK_FIELDS: Final = frozenset(
    {"agentId", "expectedActivationVersion", "expectedPreviousSetId", "requestId"}
)


def _strict_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate field")
        result[key] = value
    return result


def _reject_constant(_: str) -> NoReturn:
    raise ValueError("non-standard number")


def _parse_uuid(value: object) -> UUID | None:
    if type(value) is not str:
        return None
    try:
        parsed = UUID(value)
    except ValueError:
        return None
    return parsed if str(parsed) == value else None


async def _read_json(request: Request) -> dict[str, object] | None:
    if _header_values(request, b"content-type") != [b"application/json"]:
        return None
    raw = await _read_body(request, _BODY_MAX_BYTES)
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
    return cast(dict[str, object], parsed) if type(parsed) is dict else None


def _parse_page(request: Request) -> tuple[int, int] | None:
    if set(request.query_params) - {"limit", "offset"}:
        return None
    if (
        len(request.query_params.getlist("limit")) > 1
        or len(request.query_params.getlist("offset")) > 1
    ):
        return None
    raw_limit = request.query_params.get("limit", "100")
    raw_offset = request.query_params.get("offset", "0")
    if (
        len(raw_limit) > _PAGE_NUMBER_MAX_DIGITS
        or len(raw_offset) > _PAGE_NUMBER_MAX_DIGITS
        or re.fullmatch(r"0|[1-9][0-9]*", raw_limit) is None
        or re.fullmatch(r"0|[1-9][0-9]*", raw_offset) is None
    ):
        return None
    limit, offset = int(raw_limit), int(raw_offset)
    return (limit, offset) if 1 <= limit <= 100 and 0 <= offset <= 1_000_000 else None


def _error(code: str, status_code: int) -> JSONResponse:
    return JSONResponse({"error": code}, status_code=status_code, headers=_NO_STORE_HEADERS)


def _registry_error(error: RegistryError) -> JSONResponse:
    mapping = {
        "CANDIDATE_INVALID": ("candidate_invalid", 400),
        "SKILL_SET_NOT_FOUND": ("skill_set_not_found", 404),
        "SKILL_SET_STATE_CONFLICT": ("skill_set_state_conflict", 409),
        "IDEMPOTENCY_CONFLICT": ("idempotency_conflict", 409),
    }
    code, status = mapping.get(error.code, ("registry_unavailable", 503))
    return _error(code, status)


def _mutation_summary(skill_set: StoredSkillSet) -> dict[str, object]:
    return {
        "id": str(skill_set.id),
        "state": skill_set.state,
        "revisionIds": [str(revision_id) for revision_id in skill_set.revision_ids],
        "itemCount": skill_set.item_count,
        "totalExtractedSize": skill_set.total_extracted_size,
    }


def _status_summary(skill_set: StoredSkillSet | None) -> dict[str, object] | None:
    if skill_set is None:
        return None
    return {**_mutation_summary(skill_set), "failureCode": skill_set.failure_code}


def _result(result: CreateSkillSetResult, *, status_code: int) -> JSONResponse:
    return JSONResponse(
        {"set": _mutation_summary(result.skill_set), "replayed": result.replayed},
        status_code=status_code,
        headers=_NO_STORE_HEADERS,
    )


def _invalid() -> JSONResponse:
    return _error("candidate_invalid", 400)


def build_skill_set_router(
    service_provider: Callable[[], SkillSetAPIService],
) -> APIRouter:
    router = APIRouter()

    @router.post("/internal/skill-sets", include_in_schema=False)
    async def create_skill_set(request: Request) -> JSONResponse:
        assertion = _request_assertion(request)
        payload = await _read_json(request)
        if assertion is None or payload is None or set(payload) != _CREATE_FIELDS:
            return _invalid()
        request_id = _parse_uuid(payload["requestId"])
        raw_revisions = payload["revisionIds"]
        if (
            payload["agentId"] != "maduoduo"
            or request_id is None
            or request_id != assertion.request_id
            or request_id != assertion.nonce
            or type(raw_revisions) is not list
            or len(raw_revisions) > 16
        ):
            return _invalid()
        revision_ids = tuple(_parse_uuid(value) for value in raw_revisions)
        if any(revision_id is None for revision_id in revision_ids):
            return _invalid()
        command = CreateSkillSet(
            actor=assertion.actor,
            request_id=request_id,
            assertion_nonce=assertion.nonce,
            agent_id="maduoduo",
            revision_ids=cast(tuple[UUID, ...], revision_ids),
        )
        try:
            return _result(await service_provider().create_skill_set(command), status_code=201)
        except RegistryError as error:
            return _registry_error(error)

    @router.get("/internal/skill-sets/runtime-status", include_in_schema=False)
    async def runtime_status() -> JSONResponse:
        try:
            status = await service_provider().get_runtime_status("maduoduo")
        except RegistryError as error:
            return _registry_error(error)
        return JSONResponse(
            {
                "active": _status_summary(status.active),
                "previous": _status_summary(status.previous),
                "activationVersion": status.activation_version,
                "candidateCount": status.candidate_count,
                "candidates": [_status_summary(item) for item in status.candidates],
            },
            headers=_NO_STORE_HEADERS,
        )

    @router.get("/internal/skill-sets/available-revisions", include_in_schema=False)
    async def available_revisions(request: Request) -> JSONResponse:
        page = _parse_page(request)
        if page is None:
            return _invalid()
        try:
            result = await service_provider().list_available_revisions(
                limit=page[0], offset=page[1]
            )
        except RegistryError as error:
            return _registry_error(error)
        return JSONResponse(
            {
                "items": [
                    {
                        "skillId": str(item.skill_id),
                        "revisionId": str(item.revision_id),
                        "slug": item.slug,
                        "revisionNo": item.revision_no,
                        "artifactSha256": item.artifact_sha256,
                        "extractedSize": item.extracted_size,
                    }
                    for item in result.items
                ],
                "limit": result.limit,
                "offset": result.offset,
                "total": result.total,
            },
            headers=_NO_STORE_HEADERS,
        )

    @router.post("/internal/skill-sets/{set_id}/discard", include_in_schema=False)
    async def discard_skill_set(set_id: str, request: Request) -> JSONResponse:
        assertion = _request_assertion(request)
        payload = await _read_json(request)
        parsed_set_id = _parse_uuid(set_id)
        if (
            assertion is None
            or payload is None
            or set(payload) != _DISCARD_FIELDS
            or parsed_set_id is None
        ):
            return _invalid()
        request_id = _parse_uuid(payload["requestId"])
        if (
            request_id is None
            or request_id != assertion.request_id
            or request_id != assertion.nonce
        ):
            return _invalid()
        command = DiscardSkillSet(
            assertion.actor,
            request_id,
            assertion.nonce,
            "maduoduo",
            parsed_set_id,
        )
        try:
            return _result(await service_provider().discard_skill_set(command), status_code=200)
        except RegistryError as error:
            return _registry_error(error)

    @router.post("/internal/skill-sets/rollback-candidates", include_in_schema=False)
    async def rollback_candidate(request: Request) -> JSONResponse:
        assertion = _request_assertion(request)
        payload = await _read_json(request)
        if assertion is None or payload is None or set(payload) != _ROLLBACK_FIELDS:
            return _invalid()
        request_id = _parse_uuid(payload["requestId"])
        previous_set_id = _parse_uuid(payload["expectedPreviousSetId"])
        version = payload["expectedActivationVersion"]
        if (
            payload["agentId"] != "maduoduo"
            or request_id is None
            or request_id != assertion.request_id
            or request_id != assertion.nonce
            or previous_set_id is None
            or type(version) is not int
            or not 1 <= version <= _POSTGRES_BIGINT_MAX
        ):
            return _invalid()
        command = ClonePreviousSkillSet(
            assertion.actor,
            request_id,
            assertion.nonce,
            "maduoduo",
            version,
            previous_set_id,
        )
        try:
            return _result(
                await service_provider().clone_previous_skill_set(command), status_code=201
            )
        except RegistryError as error:
            return _registry_error(error)

    return router
