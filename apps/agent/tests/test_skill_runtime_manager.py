from __future__ import annotations

from pathlib import Path
from uuid import UUID

from pydantic import SecretStr
import pytest

from agent_service.config import RuntimeSettings
from agent_service.database import build_database
from agent_service.model_runtime_slot import ModelRuntimeSlot
from agent_service.skill_artifact_repository import SkillRuntimeRepositoryError
from agent_service.skill_runtime_manager import SkillRuntimeManager
from agent_service.skill_runtime_types import ReconcileResult, RuntimeSetSnapshot


DATABASE_URL = "postgresql+psycopg_async://runtime:password@db:5432/platform"
SET_ID = UUID("10000000-0000-4000-8000-000000000001")


def database():
    settings = RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": "internal-security-key-0123456789abcdef",
            "AGNO_DATABASE_URL": DATABASE_URL,
            "SKILL_REGISTRY_RUNTIME_DATABASE_URL": DATABASE_URL,
        }
    )
    return build_database(settings)


def active_snapshot() -> RuntimeSetSnapshot:
    return RuntimeSetSnapshot(
        SET_ID,
        "active",
        0,
        0,
        (),
        3,
        None,
    )


class Repository:
    def __init__(self, active: RuntimeSetSnapshot | None = None) -> None:
        self.active = active
        self.opened = 0
        self.closed = 0
        self.probe_result = True

    async def open(self) -> None:
        self.opened += 1

    async def probe(self) -> bool:
        return self.probe_result

    async def aclose(self) -> None:
        self.closed += 1

    async def load_active(self) -> RuntimeSetSnapshot | None:
        return self.active

    async def load_candidate(self, set_id: UUID) -> RuntimeSetSnapshot:
        raise SkillRuntimeRepositoryError("skill_set_not_found")

    async def activate(self, command: object) -> int:
        raise AssertionError(command)

    async def mark_failed(self, command: object) -> bool:
        raise AssertionError(command)

    async def reconcile(self, set_id: UUID) -> ReconcileResult:
        raise AssertionError(set_id)


def manager(root: Path, repository: Repository) -> SkillRuntimeManager:
    return SkillRuntimeManager(
        database_url=SecretStr(DATABASE_URL),
        runtime_root=root,
        model_slot=ModelRuntimeSlot(),
        agno_database=database(),
        repository_builder=lambda _: repository,  # type: ignore[arg-type]
    )


@pytest.mark.asyncio
async def test_empty_startup_is_ready_and_shutdown_closes_repository(
    tmp_path: Path,
) -> None:
    repository = Repository()
    runtime = manager(tmp_path, repository)

    await runtime.start()
    try:
        assert runtime.is_ready() is True
        assert runtime.status().skill_capability == "unconfigured"
        assert runtime.slot.current.configured is False
        assert await runtime.probe() is True
    finally:
        await runtime.shutdown()

    assert repository.opened == 1
    assert repository.closed == 1


@pytest.mark.asyncio
async def test_process_restart_cleans_stale_generation_then_restores_active(
    tmp_path: Path,
) -> None:
    stale = tmp_path / f"generation-{SET_ID}"
    stale.mkdir()
    (stale / "old-file").write_text("stale")
    preparing = tmp_path / ".preparing-20000000-0000-4000-8000-000000000001"
    preparing.mkdir()
    repository = Repository(active_snapshot())
    runtime = manager(tmp_path, repository)

    await runtime.start()
    try:
        assert runtime.is_ready() is True
        assert runtime.status().skill_capability == "ready"
        assert runtime.status().active_set_id == SET_ID
        assert runtime.slot.current.set_id == SET_ID
        assert sorted(path.name for path in tmp_path.iterdir()) == [
            f"generation-{SET_ID}"
        ]
        assert list((tmp_path / f"generation-{SET_ID}").iterdir()) == []
    finally:
        await runtime.shutdown()

    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_unexpected_runtime_root_entry_fails_closed_without_deleting_it(
    tmp_path: Path,
) -> None:
    unexpected = tmp_path / "do-not-delete"
    unexpected.write_text("owned elsewhere")
    repository = Repository()
    runtime = manager(tmp_path, repository)

    await runtime.start()
    try:
        assert runtime.is_ready() is False
        assert runtime.status().skill_capability == "degraded"
        assert await runtime.probe() is False
        assert unexpected.read_text() == "owned elsewhere"
    finally:
        await runtime.shutdown()


@pytest.mark.asyncio
async def test_repository_probe_failure_changes_readiness_without_state_mutation(
    tmp_path: Path,
) -> None:
    repository = Repository()
    runtime = manager(tmp_path, repository)
    await runtime.start()
    repository.probe_result = False
    try:
        assert runtime.status().skill_capability == "unconfigured"
        assert await runtime.probe() is False
        assert runtime.status().skill_capability == "unconfigured"
    finally:
        await runtime.shutdown()
