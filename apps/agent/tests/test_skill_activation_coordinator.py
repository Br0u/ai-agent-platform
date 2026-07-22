from __future__ import annotations

import asyncio
from collections import deque
import os
from pathlib import Path
from uuid import UUID

import pytest

from agent_service.skill_activation_coordinator import (
    ActivateSkillRuntime,
    SkillActivationCoordinator,
    SkillActivationError,
)
from agent_service.skill_artifact_repository import SkillRuntimeRepositoryError
from agent_service.skill_materializer import PreparedGeneration, SkillMaterializerError
from agent_service.skill_runtime_types import ReconcileResult, RuntimeSetSnapshot
from agent_service.skill_generation_slot import RuntimeGeneration, SkillGenerationSlot


SET_ID = UUID("10000000-0000-4000-8000-000000000001")
ACTOR = UUID("20000000-0000-4000-8000-000000000001")
REQUEST_ID = UUID("30000000-0000-4000-8000-000000000001")


def snapshot(
    *,
    state: str = "candidate",
    set_id: UUID = SET_ID,
    version: int | None = None,
    previous: UUID | None = None,
) -> RuntimeSetSnapshot:
    return RuntimeSetSnapshot(
        set_id=set_id,
        state=state,  # type: ignore[arg-type]
        item_count=0,
        total_extracted_size=0,
        items=(),
        activation_version=version,
        previous_set_id=previous,
    )


class Repository:
    def __init__(self) -> None:
        self.active: RuntimeSetSnapshot | None = None
        self.candidate = snapshot()
        self.activation_result: int | BaseException = 1
        self.activate_entered = asyncio.Event()
        self.activate_release: asyncio.Event | None = None
        self.load_release: asyncio.Event | None = None
        self.failed: list[object] = []
        self.reconciliations: deque[ReconcileResult | BaseException] = deque()

    async def load_active(self) -> RuntimeSetSnapshot | None:
        return self.active

    async def load_candidate(self, set_id: UUID) -> RuntimeSetSnapshot:
        assert set_id == SET_ID
        if self.load_release is not None:
            await self.load_release.wait()
        return self.candidate

    async def activate(self, command: object) -> int:
        self.activate_entered.set()
        if self.activate_release is not None:
            await self.activate_release.wait()
        if isinstance(self.activation_result, BaseException):
            raise self.activation_result
        return self.activation_result

    async def mark_failed(self, command: object) -> bool:
        self.failed.append(command)
        return True

    async def reconcile(self, set_id: UUID) -> ReconcileResult:
        assert set_id == SET_ID
        if not self.reconciliations:
            raise SkillRuntimeRepositoryError("storage_unavailable")
        result = self.reconciliations.popleft()
        if isinstance(result, BaseException):
            raise result
        return result


class Materializer:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.failure: SkillMaterializerError | None = None
        self.calls = 0

    def prepare(self, candidate: RuntimeSetSnapshot) -> PreparedGeneration:
        self.calls += 1
        if self.failure is not None:
            raise self.failure
        path = self.root / f"generation-{candidate.set_id}"
        path.mkdir()
        return PreparedGeneration(candidate.set_id, None, path)


async def coordinator(
    tmp_path: Path,
    repository: Repository,
    *,
    timeout: float = 60,
    reconcile_delay: float = 0,
) -> tuple[SkillActivationCoordinator, SkillGenerationSlot, int, Materializer]:
    root_fd = os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)
    slot = SkillGenerationSlot(
        initial=RuntimeGeneration.unconfigured(),
        root_fd=root_fd,
    )
    await slot.start()
    materializer = Materializer(tmp_path)
    service = SkillActivationCoordinator(
        repository=repository,
        materializer=materializer,  # type: ignore[arg-type]
        slot=slot,
        generation_validator=lambda _: None,
        activate_timeout_seconds=timeout,
        reconcile_delay_seconds=reconcile_delay,
    )
    return service, slot, root_fd, materializer


def command() -> ActivateSkillRuntime:
    return ActivateSkillRuntime(SET_ID, 0, ACTOR, REQUEST_ID)


async def close(
    service: SkillActivationCoordinator, slot: SkillGenerationSlot, root_fd: int
) -> None:
    await service.shutdown()
    await slot.aclose()
    os.close(root_fd)


@pytest.mark.asyncio
async def test_success_prepares_cas_and_atomically_installs_generation(
    tmp_path: Path,
) -> None:
    repository = Repository()
    service, slot, root_fd, materializer = await coordinator(tmp_path, repository)
    try:
        result = await service.activate(command())

        assert result.set_id == SET_ID
        assert result.activation_version == 1
        assert materializer.calls == 1
        assert slot.current.configured is True
        assert slot.current.set_id == SET_ID
        assert service.status().skill_capability == "ready"
        assert service.status().active_set_id == SET_ID
        assert service.status().loaded_set_id == SET_ID
    finally:
        await close(service, slot, root_fd)


@pytest.mark.asyncio
async def test_prepare_failure_marks_candidate_failed_and_keeps_old_runtime(
    tmp_path: Path,
) -> None:
    repository = Repository()
    service, slot, root_fd, materializer = await coordinator(tmp_path, repository)
    materializer.failure = SkillMaterializerError("artifact_invalid")
    try:
        with pytest.raises(SkillActivationError) as caught:
            await service.activate(command())

        assert caught.value.code == "artifact_invalid"
        assert len(repository.failed) == 1
        assert slot.current == RuntimeGeneration.unconfigured()
        assert service.status().skill_capability == "unconfigured"
        assert service.status().failure_code == "artifact_invalid"
    finally:
        await close(service, slot, root_fd)


@pytest.mark.asyncio
async def test_nonblocking_busy_and_runtime_capacity_fail_before_cas(
    tmp_path: Path,
) -> None:
    repository = Repository()
    repository.load_release = asyncio.Event()
    service, slot, root_fd, _ = await coordinator(tmp_path, repository)
    first = asyncio.create_task(service.activate(command()))
    await asyncio.sleep(0)
    try:
        with pytest.raises(SkillActivationError) as caught:
            await service.activate(command())
        assert caught.value.code == "activation_busy"

        repository.load_release.set()
        await first
        lease = slot.capture()
        another_set = UUID("10000000-0000-4000-8000-000000000002")
        another_root = tmp_path / f"generation-{another_set}"
        another_root.mkdir()
        slot.reserve_replacement().commit(
            RuntimeGeneration(True, another_set, 2, None, another_root)
        )
        repository.active = snapshot(
            state="active",
            set_id=another_set,
            version=2,
            previous=SET_ID,
        )
        repository.candidate = snapshot()
        with pytest.raises(SkillActivationError) as capacity:
            await service.activate(ActivateSkillRuntime(SET_ID, 2, ACTOR, REQUEST_ID))
        assert capacity.value.code == "runtime_busy"
        assert repository.activate_entered.is_set()
        lease.release()
        await slot.wait_reaped()
    finally:
        repository.load_release.set()
        if not first.done():
            await first
        await close(service, slot, root_fd)


@pytest.mark.asyncio
async def test_conflict_or_discard_race_cleans_prepared_generation(
    tmp_path: Path,
) -> None:
    repository = Repository()
    repository.activation_result = SkillRuntimeRepositoryError("activation_conflict")
    service, slot, root_fd, _ = await coordinator(tmp_path, repository)
    try:
        with pytest.raises(SkillActivationError) as caught:
            await service.activate(command())
        assert caught.value.code == "activation_conflict"
        assert list(tmp_path.iterdir()) == []
        assert slot.current == RuntimeGeneration.unconfigured()
    finally:
        await close(service, slot, root_fd)


@pytest.mark.asyncio
async def test_cancellation_before_cas_releases_activation_admission(
    tmp_path: Path,
) -> None:
    repository = Repository()
    repository.load_release = asyncio.Event()
    service, slot, root_fd, _ = await coordinator(tmp_path, repository)
    task = asyncio.create_task(service.activate(command()))
    await asyncio.sleep(0)
    task.cancel()
    try:
        with pytest.raises(asyncio.CancelledError):
            await task
        repository.load_release.set()
        result = await service.activate(command())
        assert result.activation_version == 1
    finally:
        repository.load_release.set()
        await close(service, slot, root_fd)


@pytest.mark.asyncio
async def test_cancellation_after_cas_does_not_cancel_database_task(
    tmp_path: Path,
) -> None:
    repository = Repository()
    repository.activate_release = asyncio.Event()
    service, slot, root_fd, _ = await coordinator(tmp_path, repository)
    task = asyncio.create_task(service.activate(command()))
    await repository.activate_entered.wait()
    task.cancel()
    try:
        with pytest.raises(asyncio.CancelledError):
            await task
        repository.activate_release.set()
        await service.wait_idle()
        assert slot.current.set_id == SET_ID
        assert service.status().skill_capability == "ready"
    finally:
        repository.activate_release.set()
        await close(service, slot, root_fd)


@pytest.mark.asyncio
async def test_deadline_returns_timeout_but_cas_task_finishes(tmp_path: Path) -> None:
    repository = Repository()
    repository.activate_release = asyncio.Event()
    service, slot, root_fd, _ = await coordinator(tmp_path, repository, timeout=0.01)
    try:
        with pytest.raises(SkillActivationError) as caught:
            await service.activate(command())
        assert caught.value.code == "activation_timeout"
        repository.activate_release.set()
        await service.wait_idle()
        assert slot.current.set_id == SET_ID
    finally:
        repository.activate_release.set()
        await close(service, slot, root_fd)


@pytest.mark.asyncio
async def test_unknown_commit_reconciles_active_and_installs_retained_generation(
    tmp_path: Path,
) -> None:
    repository = Repository()
    repository.activation_result = SkillRuntimeRepositoryError("storage_unavailable")
    repository.reconciliations.append(ReconcileResult(SET_ID, None, 1, "active"))
    service, slot, root_fd, _ = await coordinator(tmp_path, repository)
    try:
        with pytest.raises(SkillActivationError) as caught:
            await service.activate(command())
        assert caught.value.code == "activation_result_unknown"
        await service.wait_idle()
        assert slot.current.set_id == SET_ID
        assert service.status().skill_capability == "ready"
    finally:
        await close(service, slot, root_fd)


@pytest.mark.asyncio
async def test_unknown_not_committed_marks_failed_and_restores_old(
    tmp_path: Path,
) -> None:
    repository = Repository()
    repository.activation_result = SkillRuntimeRepositoryError("storage_unavailable")
    repository.reconciliations.append(ReconcileResult(None, None, 0, "candidate"))
    service, slot, root_fd, _ = await coordinator(tmp_path, repository)
    try:
        with pytest.raises(SkillActivationError) as caught:
            await service.activate(command())
        assert caught.value.code == "activation_result_unknown"
        await service.wait_idle()
        assert len(repository.failed) == 1
        assert slot.current == RuntimeGeneration.unconfigured()
        assert service.status().skill_capability == "unconfigured"
        assert list(tmp_path.iterdir()) == []
    finally:
        await close(service, slot, root_fd)


@pytest.mark.asyncio
async def test_unknown_discarded_restores_old_with_conflict(tmp_path: Path) -> None:
    repository = Repository()
    repository.activation_result = SkillRuntimeRepositoryError("storage_unavailable")
    repository.reconciliations.append(ReconcileResult(None, None, 0, "discarded"))
    service, slot, root_fd, _ = await coordinator(tmp_path, repository)
    try:
        with pytest.raises(SkillActivationError):
            await service.activate(command())
        await service.wait_idle()
        assert service.status().failure_code == "activation_conflict"
        assert service.status().skill_capability == "unconfigured"
    finally:
        await close(service, slot, root_fd)


def test_mutation_contract_rejects_invalid_or_unsanitized_values() -> None:
    with pytest.raises(ValueError):
        ActivateSkillRuntime(SET_ID, -1, ACTOR, REQUEST_ID)
    with pytest.raises(ValueError):
        ActivateSkillRuntime(SET_ID, 2**63, ACTOR, REQUEST_ID)
