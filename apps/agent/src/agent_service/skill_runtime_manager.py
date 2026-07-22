"""Lifespan ownership for the single-Agent Skill runtime."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
import os
from pathlib import Path
import re
import stat
from typing import Protocol

from agno.agent import Agent
from agno.db.postgres import AsyncPostgresDb
from agno.factory import RequestContext
from pydantic import SecretStr

from agent_service.model_runtime_slot import ModelRuntimeSlot
from agent_service.skill_activation_coordinator import (
    ActivateSkillRuntime,
    SkillActivationError,
    SkillActivationResult,
    SkillActivationCoordinator,
    SkillArtifactRepository,
    SkillRuntimeStatus,
)
from agent_service.skill_agent_factory import (
    build_skill_agent_factory,
    runtime_generation_context,
)
from agent_service.skill_artifact_repository import PostgresSkillArtifactRepository
from agent_service.skill_generation_slot import (
    RuntimeGeneration,
    SkillGenerationSlot,
)
from agent_service.skill_materializer import SkillGenerationMaterializer


_DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_STALE_DIRECTORY = re.compile(
    r"(?:\.preparing-|generation-)"
    r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\Z"
)
_LOGGER = logging.getLogger(__name__)


class RuntimeRepository(SkillArtifactRepository, Protocol):
    async def open(self) -> None: ...

    async def probe(self) -> bool: ...

    async def aclose(self) -> None: ...


SkillRepositoryBuilder = Callable[[SecretStr], RuntimeRepository]


def _build_repository(database_url: SecretStr) -> RuntimeRepository:
    return PostgresSkillArtifactRepository(database_url=database_url)


def _remove_contents(directory_fd: int) -> None:
    for name in os.listdir(directory_fd):
        metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if stat.S_ISDIR(metadata.st_mode):
            child_fd = os.open(name, _DIRECTORY_FLAGS, dir_fd=directory_fd)
            try:
                _remove_contents(child_fd)
            finally:
                os.close(child_fd)
            os.rmdir(name, dir_fd=directory_fd)
        else:
            os.unlink(name, dir_fd=directory_fd)


def _remove_entry(root_fd: int, name: str) -> None:
    metadata = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
    if stat.S_ISDIR(metadata.st_mode):
        child_fd = os.open(name, _DIRECTORY_FLAGS, dir_fd=root_fd)
        try:
            _remove_contents(child_fd)
        finally:
            os.close(child_fd)
        os.rmdir(name, dir_fd=root_fd)
    else:
        os.unlink(name, dir_fd=root_fd)


def _validate_runtime_root(root: Path, root_fd: int) -> None:
    path_metadata = os.lstat(root)
    fd_metadata = os.fstat(root_fd)
    if (
        not stat.S_ISDIR(path_metadata.st_mode)
        or not stat.S_ISDIR(fd_metadata.st_mode)
        or (path_metadata.st_dev, path_metadata.st_ino)
        != (fd_metadata.st_dev, fd_metadata.st_ino)
    ):
        raise OSError("invalid Skill runtime root")


def clean_stale_runtime_root(root_fd: int) -> None:
    """Remove only recognized old generations from the already-open root."""
    names = os.listdir(root_fd)
    if any(_STALE_DIRECTORY.fullmatch(name) is None for name in names):
        raise OSError("unexpected Skill runtime entry")
    for name in names:
        _remove_entry(root_fd, name)


class SkillRuntimeManager:
    """Open, restore, probe, drain, and close one runtime generation service."""

    def __init__(
        self,
        *,
        database_url: SecretStr,
        runtime_root: Path,
        model_slot: ModelRuntimeSlot,
        agno_database: AsyncPostgresDb,
        activate_timeout_seconds: float = 60,
        shutdown_timeout_seconds: float = 30,
        repository_builder: SkillRepositoryBuilder = _build_repository,
    ) -> None:
        self._database_url = database_url
        self._runtime_root = runtime_root
        self._model_slot = model_slot
        self._agno_database = agno_database
        self._activate_timeout_seconds = activate_timeout_seconds
        self._shutdown_timeout_seconds = shutdown_timeout_seconds
        self._repository_builder = repository_builder
        self._root_fd: int | None = None
        self._repository: RuntimeRepository | None = None
        self._coordinator: SkillActivationCoordinator | None = None
        self._slot_started = False

        def clean_generation(generation: RuntimeGeneration) -> None:
            root_fd = self._root_fd
            if root_fd is None or generation.root is None:
                return
            name = generation.root.name
            if name != f"generation-{generation.set_id}":
                raise OSError("generation root mismatch")
            try:
                _remove_entry(root_fd, name)
            except FileNotFoundError:
                pass

        self.slot = SkillGenerationSlot(
            initial=RuntimeGeneration.unconfigured(),
            cleaner=clean_generation,
        )

    def status(self) -> SkillRuntimeStatus:
        coordinator = self._coordinator
        if coordinator is None:
            current = self.slot.current
            return SkillRuntimeStatus(
                "degraded",
                current.configured,
                None,
                current.set_id,
                None,
                current.activation_version,
                "runtime_degraded",
            )
        return coordinator.status()

    def is_ready(self) -> bool:
        coordinator = self._coordinator
        return coordinator is not None and coordinator.is_ready()

    def _validate_generation(self, generation: RuntimeGeneration) -> None:
        factory = build_skill_agent_factory(self._model_slot, self._agno_database)
        with runtime_generation_context(generation):
            agent = factory.resolve(RequestContext(), Agent)
        if agent.id != "maduoduo" or agent.skills is not generation.skills:
            raise RuntimeError("Skill Agent validation failed")

    async def start(self) -> None:
        if self._repository is not None or self._root_fd is not None:
            raise RuntimeError("Skill runtime already started")
        self.slot.set_accepting_runs(False)
        try:
            repository = self._repository_builder(self._database_url)
            self._repository = repository
            await repository.open()
            root_fd = os.open(self._runtime_root, _DIRECTORY_FLAGS)
            self._root_fd = root_fd
            _validate_runtime_root(self._runtime_root, root_fd)
            clean_stale_runtime_root(root_fd)
            await self.slot.start()
            self._slot_started = True
            materializer = SkillGenerationMaterializer(
                root_path=self._runtime_root,
                root_fd=root_fd,
            )
            coordinator = SkillActivationCoordinator(
                repository=repository,
                materializer=materializer,
                slot=self.slot,
                generation_validator=self._validate_generation,
                activate_timeout_seconds=self._activate_timeout_seconds,
            )
            self._coordinator = coordinator
            await coordinator.restore()
        except Exception:
            self.slot.set_accepting_runs(False)
            _LOGGER.warning("Skill runtime startup failed")

    async def probe(self) -> bool:
        repository = self._repository
        if repository is None or not self.is_ready():
            return False
        try:
            return await repository.probe()
        except Exception:
            return False

    async def activate(self, command: ActivateSkillRuntime) -> SkillActivationResult:
        coordinator = self._coordinator
        if coordinator is None:
            raise SkillActivationError("runtime_degraded") from None
        return await coordinator.activate(command)

    async def shutdown(self) -> None:
        self.slot.begin_draining()
        coordinator = self._coordinator
        if coordinator is not None:
            await coordinator.shutdown()
        if self._slot_started:
            try:
                async with asyncio.timeout(self._shutdown_timeout_seconds):
                    await self.slot.wait_leases_drained()
                    await self.slot.wait_reaped()
                    await self.slot.cleanup_current()
            except TimeoutError:
                _LOGGER.warning("Skill runtime lease drain timed out")
            finally:
                await self.slot.aclose()
                self._slot_started = False
        repository = self._repository
        self._repository = None
        if repository is not None:
            try:
                await repository.aclose()
            except Exception:
                _LOGGER.warning("Skill runtime repository cleanup failed")
        root_fd = self._root_fd
        self._root_fd = None
        if root_fd is not None:
            os.close(root_fd)
        self._coordinator = None
