from __future__ import annotations

import os
from pathlib import Path
from uuid import UUID

from agno.skills import Skills
import pytest

from agent_service.skill_generation_slot import (
    GenerationCapacityError,
    GenerationUnavailableError,
    RuntimeGeneration,
    SkillGenerationSlot,
)


SET_A = UUID("10000000-0000-4000-8000-000000000001")
SET_B = UUID("10000000-0000-4000-8000-000000000002")
SET_C = UUID("10000000-0000-4000-8000-000000000003")


def generation(
    root: Path, set_id: UUID, version: int, *, empty: bool = False
) -> RuntimeGeneration:
    path = root / f"generation-{set_id}"
    path.mkdir()
    return RuntimeGeneration(
        True, set_id, version, None if empty else Skills(loaders=[]), path
    )


def test_generation_contract_distinguishes_unconfigured_and_explicit_empty(
    tmp_path: Path,
) -> None:
    unconfigured = RuntimeGeneration.unconfigured()
    explicit_empty = generation(tmp_path, SET_A, 1, empty=True)

    assert unconfigured.configured is False
    assert unconfigured.set_id is None
    assert unconfigured.skills is None
    assert unconfigured.root is None
    assert explicit_empty.configured is True
    assert explicit_empty.set_id == SET_A
    assert explicit_empty.skills is None

    with pytest.raises(ValueError):
        RuntimeGeneration(False, SET_A, 1, None, explicit_empty.root)


@pytest.mark.asyncio
async def test_capture_survives_atomic_activation_until_release_then_reaps(
    tmp_path: Path,
) -> None:
    old = generation(tmp_path, SET_A, 1)
    new = generation(tmp_path, SET_B, 2)
    root_fd = os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)
    slot = SkillGenerationSlot(initial=old, root_fd=root_fd)
    await slot.start()
    try:
        lease = slot.capture()
        reservation = slot.reserve_replacement()
        reservation.commit(new)

        assert lease.generation is old
        assert slot.current is new
        assert old.root is not None and old.root.exists()
        lease.release()
        lease.release()
        await slot.wait_reaped()

        assert not old.root.exists()
        assert new.root is not None and new.root.exists()
    finally:
        await slot.aclose()
        os.close(root_fd)


@pytest.mark.asyncio
async def test_only_one_unreaped_retired_generation_and_cancel_frees_reservation(
    tmp_path: Path,
) -> None:
    old = generation(tmp_path, SET_A, 1)
    second = generation(tmp_path, SET_B, 2)
    third = generation(tmp_path, SET_C, 3)
    root_fd = os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)
    slot = SkillGenerationSlot(initial=old, root_fd=root_fd)
    await slot.start()
    try:
        lease = slot.capture()
        slot.reserve_replacement().commit(second)

        with pytest.raises(GenerationCapacityError) as caught:
            slot.reserve_replacement()
        assert caught.value.code == "runtime_busy"

        lease.release()
        await slot.wait_reaped()
        reservation = slot.reserve_replacement()
        reservation.cancel()
        slot.reserve_replacement().commit(third)
        await slot.wait_reaped()
        assert slot.current is third
    finally:
        await slot.aclose()
        os.close(root_fd)


@pytest.mark.asyncio
async def test_cleanup_failure_is_contained_and_capacity_recovers(
    tmp_path: Path,
) -> None:
    old = generation(tmp_path, SET_A, 1)
    second = generation(tmp_path, SET_B, 2)
    third = generation(tmp_path, SET_C, 3)
    attempts: list[RuntimeGeneration] = []

    def failing_cleaner(value: RuntimeGeneration) -> None:
        attempts.append(value)
        raise OSError("private cleanup detail")

    slot = SkillGenerationSlot(initial=old, cleaner=failing_cleaner)
    await slot.start()
    try:
        slot.reserve_replacement().commit(second)
        await slot.wait_reaped()
        assert attempts == [old]
        slot.reserve_replacement().commit(third)
        await slot.wait_reaped()
        assert slot.current is third
    finally:
        await slot.aclose()


def test_draining_rejects_new_capture_but_existing_lease_can_release() -> None:
    slot = SkillGenerationSlot(
        initial=RuntimeGeneration.unconfigured(), cleaner=lambda _: None
    )
    lease = slot.capture()
    slot.begin_draining()

    with pytest.raises(GenerationUnavailableError) as caught:
        slot.capture()
    assert caught.value.code == "runtime_degraded"
    lease.release()
