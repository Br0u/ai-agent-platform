from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
import json
from pathlib import Path
from typing import Any

from agno.os import AgentOS
from agno.skills import Skills
import pytest
from starlette.types import Message

from agent_service.config import RuntimeSettings
from agent_service.database import build_database
from agent_service.model_runtime_slot import ModelRuntimeSlot
from agent_service.skill_agent_factory import (
    build_skill_agent_factory,
    current_runtime_generation,
)
from agent_service.skill_generation_slot import RuntimeGeneration, SkillGenerationSlot
from agent_service.skill_runtime_middleware import (
    AGNO_2_7_2_AGENT_ROUTE_SNAPSHOT,
    SkillRuntimeMiddleware,
)


SET_ID = "10000000-0000-4000-8000-000000000001"
BOUNDARY = "runtime-boundary"
Downstream = Callable[
    [
        dict[str, Any],
        Callable[[], Awaitable[dict[str, Any]]],
        Callable[[dict[str, Any]], Awaitable[None]],
    ],
    Awaitable[None],
]


def multipart(*fields: tuple[str, str]) -> bytes:
    chunks: list[bytes] = []
    for name, value in fields:
        chunks.extend(
            [
                f"--{BOUNDARY}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode(),
                b"\r\n",
            ]
        )
    chunks.append(f"--{BOUNDARY}--\r\n".encode())
    return b"".join(chunks)


def scope(
    path: str = "/agents/maduoduo/runs", method: str = "POST", body: bytes = b""
) -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [
            (b"content-type", f"multipart/form-data; boundary={BOUNDARY}".encode()),
            (b"content-length", str(len(body)).encode()),
        ],
        "client": ("127.0.0.1", 1),
        "server": ("test", 80),
    }


async def dispatch(
    middleware: SkillRuntimeMiddleware,
    request_scope: dict[str, Any],
    body: bytes,
) -> list[Message]:
    received = False
    sent: list[Message] = []

    async def receive() -> dict[str, Any]:
        nonlocal received
        if received:
            return {"type": "http.disconnect"}
        received = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message: Message) -> None:
        sent.append(message)

    await middleware(request_scope, receive, send)
    return sent


def test_agno_2_7_2_agent_route_snapshot_is_locked() -> None:
    settings = RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": "internal-security-key-0123456789abcdef",
            "AGNO_DATABASE_URL": "postgresql+psycopg_async://runtime:password@db/platform",
            "SKILL_REGISTRY_RUNTIME_DATABASE_URL": "postgresql+psycopg_async://runtime:password@db/platform",
        }
    )
    database = build_database(settings)
    factory = build_skill_agent_factory(ModelRuntimeSlot(), database)
    app = AgentOS(agents=[factory], db=database, auto_provision_dbs=False).get_app()
    actual = frozenset(
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        if path.startswith("/agents/{agent_id}")
        for method in operations
    )

    assert actual == AGNO_2_7_2_AGENT_ROUTE_SNAPSHOT


@pytest.mark.asyncio
@pytest.mark.parametrize("background", [None, "false"])
async def test_valid_run_preserves_exact_body_and_binds_generation(
    background: str | None,
) -> None:
    fields = [("message", "hello"), ("stream", "true")]
    if background is not None:
        fields.append(("background", background))
    body = multipart(*fields)
    generation = RuntimeGeneration(
        True,
        __import__("uuid").UUID(SET_ID),
        1,
        Skills(loaders=[]),
        Path(f"/run/aap-skills/generation-{SET_ID}"),
    )
    slot = SkillGenerationSlot(initial=generation, cleaner=lambda _: None)
    seen: list[bytes] = []

    async def downstream(_, receive, send) -> None:
        message = await receive()
        seen.append(message["body"])
        assert current_runtime_generation() is generation
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    await dispatch(
        SkillRuntimeMiddleware(downstream, slot=slot), scope(body=body), body
    )

    assert seen == [body]
    assert slot.current_reference_count == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fields",
    [
        (("message", "x"), ("background", "true")),
        (("message", "x"), ("background", "false"), ("background", "false")),
        (("message", "x"), ("background", "0")),
    ],
    ids=["true", "duplicate", "malformed"],
)
async def test_background_variants_fail_before_capture(
    fields: tuple[tuple[str, str], ...],
) -> None:
    body = multipart(*fields)
    called = False
    slot = SkillGenerationSlot(
        initial=RuntimeGeneration.unconfigured(), cleaner=lambda _: None
    )

    async def downstream(*_: Any) -> None:
        nonlocal called
        called = True

    sent = await dispatch(
        SkillRuntimeMiddleware(downstream, slot=slot), scope(body=body), body
    )

    assert called is False
    assert sent[0]["status"] == 400
    assert json.loads(sent[1]["body"]) == {"detail": "Invalid run request"}
    assert slot.current_reference_count == 0


@pytest.mark.asyncio
async def test_sse_response_holds_lease_until_completion() -> None:
    body = multipart(("message", "x"), ("stream", "true"))
    release = asyncio.Event()
    entered = asyncio.Event()
    slot = SkillGenerationSlot(
        initial=RuntimeGeneration.unconfigured(), cleaner=lambda _: None
    )

    async def downstream(_, __, send) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": []})
        entered.set()
        await release.wait()
        await send({"type": "http.response.body", "body": b"done"})

    task = asyncio.create_task(
        dispatch(SkillRuntimeMiddleware(downstream, slot=slot), scope(body=body), body)
    )
    await entered.wait()
    assert slot.current_reference_count == 1
    release.set()
    await task
    assert slot.current_reference_count == 0


@pytest.mark.asyncio
async def test_cancellation_and_draining_release_or_reject_safely() -> None:
    body = multipart(("message", "x"))
    entered = asyncio.Event()
    slot = SkillGenerationSlot(
        initial=RuntimeGeneration.unconfigured(), cleaner=lambda _: None
    )

    async def downstream(*_: Any) -> None:
        entered.set()
        await asyncio.Event().wait()

    middleware = SkillRuntimeMiddleware(downstream, slot=slot)
    task = asyncio.create_task(dispatch(middleware, scope(body=body), body))
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert slot.current_reference_count == 0

    slot.begin_draining()
    sent = await dispatch(middleware, scope(body=body), body)
    assert sent[0]["status"] == 503
    assert json.loads(sent[1]["body"]) == {"detail": "runtime_degraded"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "method", "status"),
    [
        ("/agents/maduoduo/runs", "GET", 405),
        ("/agents/maduoduo", "GET", 404),
        ("/agents/maduoduo/runs/id/resume", "POST", 404),
        ("/agents/maduoduo/sessions/id/fork", "POST", 404),
        ("/agents/maduoduo/runs/", "POST", 404),
    ],
)
async def test_incompatible_factory_paths_are_guarded_before_downstream(
    path: str, method: str, status: int
) -> None:
    called = False
    slot = SkillGenerationSlot(
        initial=RuntimeGeneration.unconfigured(), cleaner=lambda _: None
    )

    async def downstream(*_: Any) -> None:
        nonlocal called
        called = True

    sent = await dispatch(
        SkillRuntimeMiddleware(downstream, slot=slot),
        scope(path=path, method=method),
        b"",
    )
    assert called is False
    assert sent[0]["status"] == status


@pytest.mark.asyncio
async def test_non_target_path_does_not_read_body_or_capture_slot() -> None:
    received = False
    called = False
    slot = SkillGenerationSlot(
        initial=RuntimeGeneration.unconfigured(), cleaner=lambda _: None
    )

    async def downstream(_, __, send) -> None:
        nonlocal called
        called = True
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive() -> dict[str, Any]:
        nonlocal received
        received = True
        return {"type": "http.request", "body": b"secret", "more_body": False}

    sent: list[Message] = []

    async def send(message: Message) -> None:
        sent.append(message)

    middleware = SkillRuntimeMiddleware(downstream, slot=slot)
    await middleware(scope(path="/health", method="GET"), receive, send)

    assert called is True
    assert received is False
    assert sent[0]["status"] == 204
    assert slot.current_reference_count == 0
