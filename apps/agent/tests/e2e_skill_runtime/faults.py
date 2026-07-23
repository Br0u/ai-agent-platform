"""Acceptance-only transport faults around the production Skill repository."""

from __future__ import annotations

from threading import Lock
from typing import Literal

from agent_service.skill_artifact_repository import (
    PostgresSkillArtifactRepository,
    SkillRuntimeRepositoryError,
)
from agent_service.skill_runtime_types import ActivateSkillSet, FailSkillSet


FaultMode = Literal["none", "response_lost", "not_committed", "unreachable"]
_mode: FaultMode = "none"
_lock = Lock()


def set_fault_mode(mode: FaultMode) -> None:
    """Select one process-local acceptance fault without changing production code."""
    if mode not in {"none", "response_lost", "not_committed", "unreachable"}:
        raise ValueError("invalid acceptance fault mode")
    global _mode
    with _lock:
        _mode = mode


def fault_mode() -> FaultMode:
    with _lock:
        return _mode


def _unavailable() -> None:
    raise SkillRuntimeRepositoryError("storage_unavailable") from None


class FaultInjectingSkillRepository:
    """Delegate to PostgreSQL except for an explicitly selected transport fault."""

    def __init__(self, delegate: PostgresSkillArtifactRepository) -> None:
        self._delegate = delegate

    async def open(self) -> None:
        await self._delegate.open()

    async def aclose(self) -> None:
        await self._delegate.aclose()

    async def probe(self) -> bool:
        if fault_mode() == "unreachable":
            _unavailable()
        return await self._delegate.probe()

    async def load_active(self):  # type: ignore[no-untyped-def]
        if fault_mode() == "unreachable":
            _unavailable()
        return await self._delegate.load_active()

    async def load_candidate(self, set_id):  # type: ignore[no-untyped-def]
        if fault_mode() == "unreachable":
            _unavailable()
        return await self._delegate.load_candidate(set_id)

    async def activate(self, command: ActivateSkillSet) -> int:
        mode = fault_mode()
        if mode in {"not_committed", "unreachable"}:
            _unavailable()
        version = await self._delegate.activate(command)
        if mode == "response_lost":
            _unavailable()
        return version

    async def mark_failed(self, command: FailSkillSet) -> bool:
        if fault_mode() == "unreachable":
            _unavailable()
        return await self._delegate.mark_failed(command)

    async def reconcile(self, set_id):  # type: ignore[no-untyped-def]
        if fault_mode() == "unreachable":
            _unavailable()
        return await self._delegate.reconcile(set_id)
