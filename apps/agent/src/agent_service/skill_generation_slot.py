"""Lease immutable Skill generations across complete AgentOS run responses."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
import logging
import os
from pathlib import Path
import stat
import threading
from typing import NoReturn
from uuid import UUID

from agno.skills import Skills


_BIGINT_MAX = 9_223_372_036_854_775_807
_DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_LOGGER = logging.getLogger(__name__)


class GenerationCapacityError(RuntimeError):
    def __init__(self, code: str = "runtime_busy") -> None:
        self.code = code
        super().__init__(code)


class GenerationUnavailableError(RuntimeError):
    def __init__(self, code: str = "runtime_degraded") -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class RuntimeGeneration:
    configured: bool
    set_id: UUID | None
    activation_version: int
    skills: Skills | None
    root: Path | None

    def __post_init__(self) -> None:
        if (
            type(self.configured) is not bool
            or type(self.activation_version) is not int
        ):
            raise ValueError("invalid runtime generation")
        if not self.configured:
            if (
                self.set_id is not None
                or self.activation_version != 0
                or self.skills is not None
                or self.root is not None
            ):
                raise ValueError("invalid runtime generation")
            return
        if (
            type(self.set_id) is not UUID
            or not 1 <= self.activation_version <= _BIGINT_MAX
            or (self.skills is not None and not isinstance(self.skills, Skills))
            or not isinstance(self.root, Path)
            or not self.root.is_absolute()
            or self.root.name != f"generation-{self.set_id}"
        ):
            raise ValueError("invalid runtime generation")

    @classmethod
    def unconfigured(cls) -> RuntimeGeneration:
        return cls(False, None, 0, None, None)


@dataclass(slots=True)
class _GenerationEntry:
    generation: RuntimeGeneration
    references: int = 0
    reaping: bool = False


class GenerationLease:
    def __init__(
        self,
        generation: RuntimeGeneration,
        release: Callable[[], None],
    ) -> None:
        self.generation = generation
        self._release = release
        self._lock = threading.Lock()
        self._released = False

    def release(self) -> None:
        with self._lock:
            if self._released:
                return
            self._released = True
        self._release()


class GenerationReservation:
    def __init__(self, slot: SkillGenerationSlot, token: object) -> None:
        self._slot = slot
        self._token = token
        self._lock = threading.Lock()
        self._done = False

    def commit(self, generation: RuntimeGeneration) -> None:
        with self._lock:
            if self._done:
                raise GenerationCapacityError()
            self._slot._commit_reservation(self._token, generation)
            self._done = True

    def cancel(self) -> None:
        with self._lock:
            if self._done:
                return
            self._slot._cancel_reservation(self._token)
            self._done = True


GenerationCleaner = Callable[[RuntimeGeneration], None]


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


def _clean_generation(root_fd: int, generation: RuntimeGeneration) -> None:
    root = generation.root
    if root is None or generation.set_id is None:
        return
    name = f"generation-{generation.set_id}"
    if root.name != name:
        raise OSError("generation root mismatch")
    try:
        metadata = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
    except FileNotFoundError:
        return
    if not stat.S_ISDIR(metadata.st_mode):
        os.unlink(name, dir_fd=root_fd)
        return
    directory_fd = os.open(name, _DIRECTORY_FLAGS, dir_fd=root_fd)
    try:
        _remove_contents(directory_fd)
    finally:
        os.close(directory_fd)
    os.rmdir(name, dir_fd=root_fd)


def _capacity_failure() -> NoReturn:
    raise GenerationCapacityError() from None


class SkillGenerationSlot:
    """Atomic current generation plus at most one draining retired generation."""

    def __init__(
        self,
        *,
        initial: RuntimeGeneration,
        root_fd: int | None = None,
        cleaner: GenerationCleaner | None = None,
    ) -> None:
        if type(initial) is not RuntimeGeneration:
            raise ValueError("invalid runtime generation")
        if cleaner is None:
            if type(root_fd) is not int:
                raise ValueError("runtime root fd is required")
            validated_root_fd = root_fd

            def clean_generation(generation: RuntimeGeneration) -> None:
                _clean_generation(validated_root_fd, generation)

            cleaner = clean_generation
        self._lock = threading.Lock()
        self._current = _GenerationEntry(initial)
        self._retired: _GenerationEntry | None = None
        self._reservation: object | None = None
        self._accepting_runs = True
        self._cleaner = cleaner
        self._loop: asyncio.AbstractEventLoop | None = None
        self._wakeup: asyncio.Event | None = None
        self._reaper_task: asyncio.Task[None] | None = None
        self._closing = False
        self._waiters: list[asyncio.Future[None]] = []

    @property
    def current(self) -> RuntimeGeneration:
        with self._lock:
            return self._current.generation

    @property
    def current_reference_count(self) -> int:
        with self._lock:
            return self._current.references

    async def start(self) -> None:
        with self._lock:
            if self._reaper_task is not None:
                raise RuntimeError("generation slot already started")
            self._loop = asyncio.get_running_loop()
            self._wakeup = asyncio.Event()
            self._closing = False
            self._reaper_task = asyncio.create_task(
                self._run_reaper(),
                name="skill-generation-reaper",
            )
        self._notify_reaper()

    def capture(self) -> GenerationLease:
        with self._lock:
            if not self._accepting_runs:
                raise GenerationUnavailableError() from None
            entry = self._current
            entry.references += 1
        return GenerationLease(entry.generation, lambda: self._release(entry))

    def _release(self, entry: _GenerationEntry) -> None:
        notify = False
        with self._lock:
            if entry.references <= 0:
                return
            entry.references -= 1
            notify = self._retired is entry and entry.references == 0
        if notify:
            self._notify_reaper()

    def reserve_replacement(self) -> GenerationReservation:
        with self._lock:
            if self._reservation is not None or self._retired is not None:
                _capacity_failure()
            token = object()
            self._reservation = token
        return GenerationReservation(self, token)

    def _commit_reservation(
        self,
        token: object,
        generation: RuntimeGeneration,
    ) -> None:
        if type(generation) is not RuntimeGeneration:
            raise ValueError("invalid runtime generation")
        notify = False
        with self._lock:
            if self._reservation is not token or self._retired is not None:
                _capacity_failure()
            old = self._current
            self._current = _GenerationEntry(generation)
            self._reservation = None
            if old.references > 0 or old.generation.root is not None:
                self._retired = old
                notify = old.references == 0
        if notify:
            self._notify_reaper()

    def _cancel_reservation(self, token: object) -> None:
        with self._lock:
            if self._reservation is token:
                self._reservation = None

    def begin_draining(self) -> None:
        with self._lock:
            self._accepting_runs = False

    def set_accepting_runs(self, value: bool) -> None:
        if type(value) is not bool:
            raise ValueError("invalid runtime availability")
        with self._lock:
            self._accepting_runs = value

    def _notify_reaper(self) -> None:
        with self._lock:
            loop = self._loop
            wakeup = self._wakeup
        if loop is not None and wakeup is not None:
            loop.call_soon_threadsafe(wakeup.set)

    async def _run_reaper(self) -> None:
        while True:
            with self._lock:
                wakeup = self._wakeup
            assert wakeup is not None
            await wakeup.wait()
            wakeup.clear()
            while True:
                with self._lock:
                    retired = self._retired
                    if (
                        retired is not None
                        and retired.references == 0
                        and not retired.reaping
                    ):
                        retired.reaping = True
                        candidate = retired
                    else:
                        candidate = None
                    should_close = self._closing and candidate is None
                if candidate is None:
                    if should_close:
                        return
                    break
                try:
                    await asyncio.to_thread(self._cleaner, candidate.generation)
                except Exception:
                    _LOGGER.warning("Skill generation cleanup failed")
                with self._lock:
                    if self._retired is candidate:
                        self._retired = None
                    waiters = self._waiters
                    self._waiters = []
                for waiter in waiters:
                    if not waiter.done():
                        waiter.set_result(None)

    async def wait_reaped(self) -> None:
        while True:
            with self._lock:
                if self._retired is None:
                    return
                waiter = asyncio.get_running_loop().create_future()
                self._waiters.append(waiter)
            await waiter

    async def aclose(self) -> None:
        self.begin_draining()
        with self._lock:
            task = self._reaper_task
            if task is None:
                return
            self._closing = True
        self._notify_reaper()
        await task
        with self._lock:
            self._reaper_task = None
            self._loop = None
            self._wakeup = None
