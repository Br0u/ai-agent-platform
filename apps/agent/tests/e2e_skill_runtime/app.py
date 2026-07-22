"""Acceptance-only AgentOS app proving real Agno Skill tool execution."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
import hmac
import json
import os
from pathlib import Path
from typing import Any

from agno.models.base import Model
from agno.models.message import Message
from agno.models.response import ModelResponse
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import SecretStr

from agent_service.app import create_app
from agent_service.config import ActiveModelSettings, RuntimeSettings
from agent_service.model_runtime_slot import ModelRuntimeSlot
from agent_service.model_runtime_types import ManagedModel
from agent_service.skill_artifact_repository import PostgresSkillArtifactRepository
from agent_service.skill_runtime_manager import SkillRuntimeManager
from e2e_skill_runtime.faults import (
    FaultInjectingSkillRepository,
    fault_mode,
    set_fault_mode,
)


_TOOL_NAME = "get_skill_script"
_TOOL_ARGUMENTS = {
    "skill_name": "deterministic-runtime",
    "script_path": "record.py",
    "execute": True,
}


def _tool_available(tools: object) -> bool:
    if not isinstance(tools, list):
        return False
    return any(
        isinstance(tool, dict)
        and isinstance(tool.get("function"), dict)
        and tool["function"].get("name") == _TOOL_NAME
        for tool in tools
    )


@dataclass
class DeterministicSkillModel(Model):
    """Call the exact Agno Skill tool once, then return a fixed terminal marker."""

    id: str = "e2e-skill-runtime"
    name: str = "DeterministicSkillModel"
    provider: str = "Acceptance"

    def _response(self, messages: list[Message], tools: object) -> ModelResponse:
        if any(message.role == "tool" for message in messages):
            return ModelResponse(role="assistant", content="skill-tool-finished")
        if not _tool_available(tools):
            return ModelResponse(role="assistant", content="empty-set-no-skill-tools")
        return ModelResponse(
            role="assistant",
            tool_calls=[
                {
                    "id": "skill-runtime-e2e-call",
                    "type": "function",
                    "function": {
                        "name": _TOOL_NAME,
                        "arguments": json.dumps(_TOOL_ARGUMENTS, separators=(",", ":")),
                    },
                }
            ],
        )

    def invoke(
        self,
        messages: list[Message],
        assistant_message: Message,
        **kwargs: Any,
    ) -> ModelResponse:
        return self._response(messages, kwargs.get("tools"))

    async def ainvoke(
        self,
        messages: list[Message],
        assistant_message: Message,
        **kwargs: Any,
    ) -> ModelResponse:
        return self._response(messages, kwargs.get("tools"))

    def invoke_stream(
        self,
        messages: list[Message],
        assistant_message: Message,
        **kwargs: Any,
    ) -> Iterator[ModelResponse]:
        yield self._response(messages, kwargs.get("tools"))

    async def ainvoke_stream(
        self,
        messages: list[Message],
        assistant_message: Message,
        **kwargs: Any,
    ) -> AsyncIterator[ModelResponse]:
        yield self._response(messages, kwargs.get("tools"))

    def _parse_provider_response(
        self,
        response: ModelResponse,
        **_: Any,
    ) -> ModelResponse:
        return response

    def _parse_provider_response_delta(
        self,
        response_delta: ModelResponse,
    ) -> ModelResponse:
        return response_delta


def _build_model(_: ActiveModelSettings) -> ManagedModel:
    return ManagedModel(model=DeterministicSkillModel(), close_callback=_close_model)


async def _close_model() -> None:
    return None


def _build_skill_runtime(
    settings: RuntimeSettings,
    model_slot: ModelRuntimeSlot,
    database: Any,
) -> SkillRuntimeManager:
    database_url = settings.skill_registry_runtime_database_url
    if not isinstance(database_url, SecretStr):
        raise RuntimeError("Skill runtime database URL is required")

    def repository_builder(url: SecretStr) -> FaultInjectingSkillRepository:
        return FaultInjectingSkillRepository(
            PostgresSkillArtifactRepository(database_url=url)
        )

    return SkillRuntimeManager(
        database_url=database_url,
        runtime_root=Path(settings.skill_runtime_root),
        model_slot=model_slot,
        agno_database=database,
        activate_timeout_seconds=settings.skill_activate_timeout_seconds,
        shutdown_timeout_seconds=settings.skill_shutdown_timeout_seconds,
        repository_builder=repository_builder,
    )


def _authorized(request: Request) -> bool:
    expected = os.environ.get("OS_SECURITY_KEY", "")
    authorization = request.headers.get("authorization", "")
    return bool(expected) and hmac.compare_digest(authorization, f"Bearer {expected}")


def app_factory() -> FastAPI:
    """Build production runtime components plus one bearer-protected fault route."""
    app = create_app(
        model_builder=_build_model,
        skill_runtime_manager_builder=_build_skill_runtime,
    )

    @app.post("/acceptance/skill-runtime/fault", include_in_schema=False)
    async def select_fault(request: Request) -> JSONResponse:
        if not _authorized(request):
            return JSONResponse(status_code=401, content={"error": "authentication_failed"})
        try:
            payload = await request.json()
            if type(payload) is not dict or set(payload) != {"mode"}:
                raise ValueError
            mode = payload["mode"]
            if mode not in {"none", "response_lost", "not_committed", "unreachable"}:
                raise ValueError
            set_fault_mode(mode)
        except (ValueError, TypeError):
            return JSONResponse(status_code=400, content={"error": "invalid_fault"})
        return JSONResponse(content={"mode": fault_mode()})

    @app.get("/acceptance/skill-runtime/status", include_in_schema=False)
    async def runtime_status(request: Request) -> JSONResponse:
        if not _authorized(request):
            return JSONResponse(status_code=401, content={"error": "authentication_failed"})
        status = app.state.skill_runtime_status()
        runtime_entries = sorted(
            entry.name for entry in Path("/run/aap-skills").iterdir()
        )
        return JSONResponse(
            content={
                "skillCapability": status.skill_capability,
                "configured": status.configured,
                "activeSetId": (
                    None if status.active_set_id is None else str(status.active_set_id)
                ),
                "loadedSetId": (
                    None if status.loaded_set_id is None else str(status.loaded_set_id)
                ),
                "previousSetId": (
                    None
                    if status.previous_set_id is None
                    else str(status.previous_set_id)
                ),
                "activationVersion": status.activation_version,
                "failureCode": status.failure_code,
                "runtimeEntries": runtime_entries,
            }
        )

    return app
