"""Private HTTP boundary for the single-Agent Skill runtime."""

from __future__ import annotations

from collections.abc import Callable
import json
import re
import time
from typing import Final, Protocol, cast
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from agent_service.skill_activation_coordinator import (
    ActivateSkillRuntime,
    SkillActivationError,
    SkillActivationResult,
    SkillRuntimeStatus,
)
from agent_service.skill_control_auth import (
    SkillControlAction,
    SkillControlAssertion,
    SkillControlAssertionError,
    SkillControlAuthenticator,
    SkillControlBearerError,
)


SKILL_CONTROL_PATH_PREFIX: Final = "/internal/control/skill-runtime"
_ASSERTION_STATE_KEY: Final = "skill_control_assertion"
_REQUEST_BODY_MAX_BYTES: Final = 8 * 1024
_BIGINT_MAX: Final = 9_223_372_036_854_775_807
_NO_STORE_HEADERS: Final = {"Cache-Control": "no-store"}
_ERROR_STATUS: Final = {
    "activation_busy": 423,
    "runtime_busy": 423,
    "candidate_invalid": 400,
    "artifact_invalid": 422,
    "skill_validation_failed": 422,
    "activation_conflict": 409,
    "activation_timeout": 504,
    "activation_result_unknown": 503,
    "runtime_degraded": 503,
    "storage_unavailable": 503,
}


class SkillActivationService(Protocol):
    def status(self) -> SkillRuntimeStatus: ...

    async def activate(self, command: ActivateSkillRuntime) -> SkillActivationResult: ...


def _match_skill_control_target(
    method: str,
    path: str,
) -> tuple[SkillControlAction | None, UUID | None]:
    if method == "GET" and path == SKILL_CONTROL_PATH_PREFIX:
        return "skill_runtime_status", None
    parts = path.split("/")
    if (
        method == "POST"
        and len(parts) == 6
        and parts[1:4] == ["internal", "control", "skill-runtime"]
        and parts[5] == "activate"
    ):
        try:
            set_id = UUID(parts[4])
        except (AttributeError, ValueError):
            return None, None
        if str(set_id) == parts[4]:
            return "skill_runtime_activate", set_id
    return None, None


def skill_control_target(
    scope: Scope,
) -> tuple[SkillControlAction | None, UUID | None, bool]:
    """Return the recognized Skill route and whether its path is canonical."""
    method = scope.get("method")
    path = scope.get("path")
    if type(method) is not str or type(path) is not str:
        return None, None, True
    action, set_id = _match_skill_control_target(method, path)
    if action is not None:
        return action, set_id, True
    normalized = path.rstrip("/")
    if normalized != path:
        action, set_id = _match_skill_control_target(method, normalized)
        if action is not None:
            return action, set_id, False
    return None, None, True


def is_recognized_skill_control_route(scope: Scope) -> bool:
    action, _, _ = skill_control_target(scope)
    return action is not None


def _response(status_code: int, content: dict[str, object]) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=content,
        headers=_NO_STORE_HEADERS,
    )


class SkillControlAuthMiddleware:
    """Authenticate exact Skill control routes before accepting a request body."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        authenticator: SkillControlAuthenticator,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.app = app
        self._authenticator = authenticator
        self._clock = clock

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        action, set_id, canonical = skill_control_target(scope)
        if action is None:
            await self.app(scope, receive, send)
            return
        target = "maduoduo" if action == "skill_runtime_status" else None
        target_prefix = (
            None
            if set_id is None
            else f"maduoduo:{set_id}:"
        )
        try:
            assertion = self._authenticator.authenticate(
                headers=scope.get("headers", ()),
                action=action,
                target=target,
                target_prefix=target_prefix,
                now=int(self._clock()),
            )
        except SkillControlBearerError:
            await _response(401, {"error": "authentication_failed"})(
                scope, receive, send
            )
            return
        except SkillControlAssertionError:
            await _response(403, {"error": "authorization_failed"})(
                scope, receive, send
            )
            return
        if not canonical:
            await _response(403, {"error": "authorization_failed"})(
                scope, receive, send
            )
            return
        scope.setdefault("state", {})[_ASSERTION_STATE_KEY] = assertion
        await self.app(scope, receive, send)


def _strict_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate request field")
        result[key] = value
    return result


async def _read_json_object(request: Request) -> dict[str, object] | None:
    headers = request.scope.get("headers", ())
    content_types = [
        value
        for name, value in headers
        if type(name) is bytes and name.lower() == b"content-type"
    ]
    if content_types != [b"application/json"]:
        return None
    lengths = [
        value
        for name, value in headers
        if type(name) is bytes and name.lower() == b"content-length"
    ]
    if len(lengths) > 1:
        return None
    if lengths:
        if re.fullmatch(rb"0|[1-9][0-9]*", lengths[0]) is None:
            return None
        if int(lengths[0]) > _REQUEST_BODY_MAX_BYTES:
            return None
    raw = bytearray()
    message: Message | None = None
    try:
        while True:
            message = await request.receive()
            if message["type"] != "http.request":
                return None
            chunk = message.get("body", b"")
            more = message.get("more_body", False)
            if type(chunk) is not bytes or type(more) is not bool:
                return None
            if len(raw) + len(chunk) > _REQUEST_BODY_MAX_BYTES:
                return None
            raw.extend(chunk)
            if not more:
                break
        parsed = json.loads(bytes(raw), object_pairs_hook=_strict_object)
    except (UnicodeError, json.JSONDecodeError, TypeError, ValueError):
        return None
    finally:
        raw.clear()
        message = None
        del request
    if type(parsed) is not dict:
        return None
    return cast(dict[str, object], parsed)


def _request_id(assertion: object) -> str | None:
    if type(assertion) is SkillControlAssertion:
        return str(assertion.request_id)
    return None


def _error(request_id: str | None, code: str, status_code: int) -> JSONResponse:
    content: dict[str, object] = {"error": code}
    if request_id is not None:
        content = {"requestId": request_id, "error": code}
    return _response(status_code, content)


def _activation_version(assertion: SkillControlAssertion, set_id: UUID) -> int | None:
    prefix = f"maduoduo:{set_id}:"
    if not assertion.target.startswith(prefix):
        return None
    raw = assertion.target[len(prefix) :]
    if re.fullmatch(r"0|[1-9][0-9]*", raw) is None:
        return None
    version = int(raw)
    return version if version <= _BIGINT_MAX else None


def _status_content(status: SkillRuntimeStatus) -> dict[str, object]:
    return {
        "skillCapability": status.skill_capability,
        "configured": status.configured,
        "activeSetId": (
            None if status.active_set_id is None else str(status.active_set_id)
        ),
        "loadedSetId": (
            None if status.loaded_set_id is None else str(status.loaded_set_id)
        ),
        "previousSetId": (
            None if status.previous_set_id is None else str(status.previous_set_id)
        ),
        "activationVersion": status.activation_version,
        "failureCode": status.failure_code,
    }


def build_skill_control_router(
    coordinator_provider: Callable[[], SkillActivationService],
) -> APIRouter:
    """Build status and activation routes around one lifespan-owned coordinator."""
    router = APIRouter()

    @router.get(SKILL_CONTROL_PATH_PREFIX, include_in_schema=False)
    async def skill_runtime_status(request: Request) -> JSONResponse:
        assertion = request.scope.get("state", {}).get(_ASSERTION_STATE_KEY)
        if type(assertion) is not SkillControlAssertion:
            return _error(None, "authorization_failed", 403)
        try:
            status = coordinator_provider().status()
        except Exception:
            return _error(str(assertion.request_id), "runtime_degraded", 503)
        return _response(200, _status_content(status))

    @router.post(
        f"{SKILL_CONTROL_PATH_PREFIX}/{{set_id}}/activate",
        include_in_schema=False,
    )
    async def activate_skill_runtime(set_id: UUID, request: Request) -> JSONResponse:
        assertion = request.scope.get("state", {}).get(_ASSERTION_STATE_KEY)
        request_id = _request_id(assertion)
        if type(assertion) is not SkillControlAssertion:
            return _error(None, "authorization_failed", 403)
        payload = await _read_json_object(request)
        if payload is None or set(payload) != {
            "expectedActivationVersion",
            "requestId",
        }:
            return _error(request_id, "candidate_invalid", 400)
        version = payload["expectedActivationVersion"]
        body_request_id = payload["requestId"]
        asserted_version = _activation_version(assertion, set_id)
        if (
            type(version) is not int
            or not 0 <= version <= _BIGINT_MAX
            or type(body_request_id) is not str
            or body_request_id != request_id
            or asserted_version != version
        ):
            return _error(request_id, "candidate_invalid", 400)
        command = ActivateSkillRuntime(
            set_id=set_id,
            expected_activation_version=version,
            actor=assertion.actor,
            request_id=assertion.request_id,
        )
        try:
            result = await coordinator_provider().activate(command)
        except SkillActivationError as error:
            code = error.code
            return _error(
                request_id,
                code,
                _ERROR_STATUS.get(code, 503),
            )
        except Exception:
            return _error(request_id, "runtime_degraded", 503)
        return _response(
            200,
            {
                "requestId": request_id,
                "setId": str(result.set_id),
                "activationVersion": result.activation_version,
            },
        )

    return router
