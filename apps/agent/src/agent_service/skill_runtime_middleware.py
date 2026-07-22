"""Guard AgentFactory routes and lease one Skill generation per run response."""

from __future__ import annotations

from typing import Final

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from agent_service.skill_agent_factory import (
    reset_runtime_generation,
    set_runtime_generation,
)
from agent_service.skill_generation_slot import (
    GenerationUnavailableError,
    SkillGenerationSlot,
)


RUN_PATH: Final = "/agents/maduoduo/runs"
_AGENT_PREFIX: Final = "/agents/maduoduo"
_MAX_RUN_BODY_BYTES: Final = 64 * 1024

AGNO_2_7_2_AGENT_ROUTE_SNAPSHOT: Final = frozenset(
    {
        ("GET", "/agents/{agent_id}"),
        ("GET", "/agents/{agent_id}/runs"),
        ("POST", "/agents/{agent_id}/runs"),
        ("GET", "/agents/{agent_id}/runs/{run_id}"),
        ("POST", "/agents/{agent_id}/runs/{run_id}/cancel"),
        ("GET", "/agents/{agent_id}/runs/{run_id}/checkpoints"),
        ("GET", "/agents/{agent_id}/runs/{run_id}/checkpoints/{message_index}"),
        ("POST", "/agents/{agent_id}/runs/{run_id}/continue"),
        ("POST", "/agents/{agent_id}/runs/{run_id}/resume"),
        ("POST", "/agents/{agent_id}/sessions/{session_id}/fork"),
    }
)


class _RunRequestError(ValueError):
    def __init__(self, status_code: int = 400) -> None:
        self.status_code = status_code
        super().__init__("invalid run request")


def _response(
    status_code: int, detail: str, *, allow: str | None = None
) -> JSONResponse:
    headers = {"Cache-Control": "no-store"}
    if allow is not None:
        headers["Allow"] = allow
    return JSONResponse(
        status_code=status_code, content={"detail": detail}, headers=headers
    )


def _header_values(scope: Scope, name: bytes) -> list[bytes]:
    values: list[bytes] = []
    for key, value in scope.get("headers", []):
        if type(key) is not bytes or type(value) is not bytes:
            raise _RunRequestError()
        if key.lower() == name:
            values.append(value)
    return values


def _declared_length(scope: Scope) -> int | None:
    values = _header_values(scope, b"content-length")
    if not values:
        return None
    if len(values) != 1 or not values[0].isascii() or not values[0].isdigit():
        raise _RunRequestError()
    raw = values[0]
    if raw.startswith(b"0") and raw != b"0":
        raise _RunRequestError()
    value = int(raw)
    if value > _MAX_RUN_BODY_BYTES:
        raise _RunRequestError(413)
    return value


async def _buffer_body(scope: Scope, receive: Receive) -> tuple[Message, ...]:
    declared = _declared_length(scope)
    messages: list[Message] = []
    total = 0
    while True:
        message = await receive()
        if message.get("type") != "http.request":
            raise _RunRequestError()
        body = message.get("body", b"")
        more_body = message.get("more_body", False)
        if type(body) is not bytes or type(more_body) is not bool:
            raise _RunRequestError()
        total += len(body)
        if total > _MAX_RUN_BODY_BYTES:
            raise _RunRequestError(413)
        messages.append(dict(message))
        if not more_body:
            break
    if declared is not None and declared != total:
        raise _RunRequestError()
    return tuple(messages)


def _replay(messages: tuple[Message, ...], fallback: Receive) -> Receive:
    index = 0

    async def receive() -> Message:
        nonlocal index
        if index < len(messages):
            message = messages[index]
            index += 1
            return dict(message)
        return await fallback()

    return receive


async def _validate_background(
    scope: Scope,
    messages: tuple[Message, ...],
) -> None:
    content_types = _header_values(scope, b"content-type")
    if len(content_types) != 1 or not content_types[0].lower().startswith(
        b"multipart/form-data;"
    ):
        raise _RunRequestError()

    async def disconnected() -> Message:
        return {"type": "http.disconnect"}

    try:
        request = Request(scope, _replay(messages, disconnected))
        async with request.form(
            max_files=4,
            max_fields=32,
            max_part_size=_MAX_RUN_BODY_BYTES,
        ) as form:
            values = form.getlist("background")
            if not values:
                return
            if (
                len(values) != 1
                or isinstance(values[0], UploadFile)
                or values[0] != "false"
            ):
                raise _RunRequestError()
    except _RunRequestError:
        raise
    except Exception:
        raise _RunRequestError() from None


class SkillRuntimeMiddleware:
    """Fail closed around the sole AgentFactory-compatible product route."""

    def __init__(self, app: ASGIApp, *, slot: SkillGenerationSlot) -> None:
        self.app = app
        self._slot = slot

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        scope_type = scope.get("type")
        if scope_type == "websocket" and path.startswith(_AGENT_PREFIX):
            await send({"type": "websocket.close", "code": 4404, "reason": "Not Found"})
            return
        if scope_type != "http":
            await self.app(scope, receive, send)
            return
        if path.startswith(_AGENT_PREFIX) and path != RUN_PATH:
            await _response(404, "Not Found")(scope, receive, send)
            return
        if path != RUN_PATH:
            await self.app(scope, receive, send)
            return
        if scope.get("method") != "POST":
            await _response(405, "Method Not Allowed", allow="POST")(
                scope, receive, send
            )
            return

        try:
            messages = await _buffer_body(scope, receive)
            await _validate_background(scope, messages)
        except _RunRequestError as error:
            await _response(error.status_code, "Invalid run request")(
                scope, receive, send
            )
            return

        try:
            lease = self._slot.capture()
        except GenerationUnavailableError:
            await _response(503, "runtime_degraded")(scope, receive, send)
            return
        token = set_runtime_generation(lease.generation)
        try:
            await self.app(scope, _replay(messages, receive), send)
        finally:
            reset_runtime_generation(token)
            lease.release()
