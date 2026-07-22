"""Single-Agent Skill activation, CAS handoff, and unknown-result reconciliation."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
import hashlib
import json
import threading
from typing import Any, Literal, NoReturn, Protocol
from uuid import UUID

from agent_service.skill_artifact_repository import SkillRuntimeRepositoryError
from agent_service.skill_generation_slot import (
    GenerationCapacityError,
    GenerationReservation,
    RuntimeGeneration,
    SkillGenerationSlot,
)
from agent_service.skill_materializer import (
    PreparedGeneration,
    SkillMaterializerError,
)
from agent_service.skill_runtime_types import (
    ActivateSkillSet,
    FailSkillSet,
    ReconcileResult,
    RuntimeSetSnapshot,
)


SkillCapability = Literal["unconfigured", "ready", "preparing", "degraded"]
_BIGINT_MAX = 9_223_372_036_854_775_807
_FAILURE_CODES = frozenset(
    {
        "activation_busy",
        "runtime_busy",
        "candidate_invalid",
        "artifact_invalid",
        "skill_validation_failed",
        "activation_conflict",
        "activation_timeout",
        "activation_result_unknown",
        "runtime_degraded",
        "storage_unavailable",
    }
)


class SkillActivationError(RuntimeError):
    def __init__(self, code: str) -> None:
        self.code = code if code in _FAILURE_CODES else "runtime_degraded"
        super().__init__(self.code)


def _fail(code: str) -> NoReturn:
    raise SkillActivationError(code) from None


@dataclass(frozen=True, slots=True)
class ActivateSkillRuntime:
    set_id: UUID
    expected_activation_version: int
    actor: UUID
    request_id: UUID

    def __post_init__(self) -> None:
        if (
            type(self.set_id) is not UUID
            or type(self.actor) is not UUID
            or type(self.request_id) is not UUID
            or type(self.expected_activation_version) is not int
            or not 0 <= self.expected_activation_version <= _BIGINT_MAX
        ):
            raise ValueError("invalid Skill activation command")


@dataclass(frozen=True, slots=True)
class SkillActivationResult:
    set_id: UUID
    activation_version: int


@dataclass(frozen=True, slots=True)
class SkillRuntimeStatus:
    skill_capability: SkillCapability
    configured: bool
    active_set_id: UUID | None
    loaded_set_id: UUID | None
    previous_set_id: UUID | None
    activation_version: int
    failure_code: str | None


class SkillArtifactRepository(Protocol):
    async def load_active(self) -> RuntimeSetSnapshot | None: ...

    async def load_candidate(self, set_id: UUID) -> RuntimeSetSnapshot: ...

    async def activate(self, command: ActivateSkillSet) -> int: ...

    async def mark_failed(self, command: FailSkillSet) -> bool: ...

    async def reconcile(self, set_id: UUID) -> ReconcileResult: ...


class SkillMaterializer(Protocol):
    def prepare(self, snapshot: RuntimeSetSnapshot) -> PreparedGeneration: ...


GenerationValidator = Callable[[RuntimeGeneration], None]


def _fingerprint(command: ActivateSkillRuntime) -> str:
    payload = json.dumps(
        {
            "agentId": "maduoduo",
            "expectedActivationVersion": command.expected_activation_version,
            "requestId": str(command.request_id),
            "setId": str(command.set_id),
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(payload).hexdigest()


def _repository_code(error: SkillRuntimeRepositoryError) -> str:
    if error.code == "activation_conflict":
        return "activation_conflict"
    if error.code == "artifact_invalid":
        return "artifact_invalid"
    if error.code == "activation_timeout":
        return "activation_timeout"
    if error.code == "skill_set_not_found":
        return "candidate_invalid"
    return "storage_unavailable"


class SkillActivationCoordinator:
    """Own the one activation admission lock and the runtime/DB convergence state."""

    def __init__(
        self,
        *,
        repository: SkillArtifactRepository,
        materializer: SkillMaterializer,
        slot: SkillGenerationSlot,
        generation_validator: GenerationValidator,
        activate_timeout_seconds: float = 60,
        reconcile_delay_seconds: float = 0.25,
    ) -> None:
        if not all(
            callable(getattr(repository, name, None))
            for name in (
                "load_active",
                "load_candidate",
                "activate",
                "mark_failed",
                "reconcile",
            )
        ):
            raise ValueError("invalid Skill repository")
        if (
            not callable(getattr(materializer, "prepare", None))
            or not callable(generation_validator)
            or type(activate_timeout_seconds) not in {int, float}
            or not 0 < activate_timeout_seconds <= 60
            or type(reconcile_delay_seconds) not in {int, float}
            or not 0 <= reconcile_delay_seconds <= 5
        ):
            raise ValueError("invalid Skill coordinator configuration")
        self._repository = repository
        self._materializer = materializer
        self._slot = slot
        self._generation_validator = generation_validator
        self._activate_timeout_seconds = float(activate_timeout_seconds)
        self._reconcile_delay_seconds = float(reconcile_delay_seconds)
        self._activation_lock = asyncio.Lock()
        self._status_lock = threading.Lock()
        self._status = SkillRuntimeStatus(
            "unconfigured", False, None, None, None, 0, None
        )
        self._operation_task: asyncio.Task[Any] | None = None
        self._stop_reconcile = asyncio.Event()
        self._draining = False

    def status(self) -> SkillRuntimeStatus:
        with self._status_lock:
            return self._status

    def _set_status(self, status: SkillRuntimeStatus) -> None:
        with self._status_lock:
            self._status = status

    def _restore_status(
        self,
        active: RuntimeSetSnapshot | None,
        *,
        failure_code: str | None,
    ) -> None:
        current = self._slot.current
        capability: SkillCapability = "ready" if current.configured else "unconfigured"
        self._set_status(
            SkillRuntimeStatus(
                capability,
                current.configured,
                None if active is None else active.set_id,
                current.set_id,
                None if active is None else active.previous_set_id,
                0 if active is None else active.activation_version or 0,
                failure_code,
            )
        )

    def _degrade(
        self,
        active: RuntimeSetSnapshot | None,
        *,
        failure_code: str,
    ) -> None:
        current = self._slot.current
        self._slot.set_accepting_runs(False)
        self._set_status(
            SkillRuntimeStatus(
                "degraded",
                current.configured,
                None if active is None else active.set_id,
                current.set_id,
                None if active is None else active.previous_set_id,
                0 if active is None else active.activation_version or 0,
                failure_code,
            )
        )

    def _is_consistent(self, active: RuntimeSetSnapshot | None) -> bool:
        current = self._slot.current
        if active is None:
            return not current.configured
        return (
            current.configured
            and current.set_id == active.set_id
            and current.activation_version == active.activation_version
        )

    def is_ready(self) -> bool:
        status = self.status()
        return status.skill_capability != "degraded" and (
            (
                not status.configured
                and status.active_set_id is None
                and status.loaded_set_id is None
            )
            or (
                status.configured
                and status.active_set_id == status.loaded_set_id
                and status.activation_version >= 1
            )
        )

    async def restore(self) -> None:
        if self._activation_lock.locked():
            _fail("activation_busy")
        await self._activation_lock.acquire()
        reservation: GenerationReservation | None = None
        generation: RuntimeGeneration | None = None
        active: RuntimeSetSnapshot | None = None
        try:
            active = await self._repository.load_active()
            if active is None:
                self._slot.set_accepting_runs(True)
                self._restore_status(None, failure_code=None)
                return
            reservation = self._slot.reserve_replacement()
            prepared = self._materializer.prepare(active)
            generation = RuntimeGeneration(
                True,
                active.set_id,
                active.activation_version or 0,
                prepared.skills,
                prepared.root,
            )
            self._generation_validator(generation)
            reservation.commit(generation)
            reservation = None
            generation = None
            self._slot.set_accepting_runs(True)
            self._restore_status(active, failure_code=None)
        except Exception:
            if generation is not None:
                await self._slot.discard_generation(generation)
            if reservation is not None:
                reservation.cancel()
            self._degrade(active, failure_code="runtime_degraded")
        finally:
            self._activation_lock.release()

    async def _mark_failed(
        self,
        command: ActivateSkillRuntime,
        failure_code: str,
    ) -> bool:
        stable_code = (
            failure_code
            if failure_code
            in {
                "artifact_invalid",
                "skill_validation_failed",
                "activation_conflict",
            }
            else "skill_validation_failed"
        )
        return await self._repository.mark_failed(
            FailSkillSet(
                command.set_id,
                command.expected_activation_version,
                command.actor,
                command.request_id,
                command.request_id,
                _fingerprint(command),
                stable_code,
            )
        )

    def _track(self, task: asyncio.Task[Any]) -> None:
        self._operation_task = task

        def completed(done: asyncio.Task[Any]) -> None:
            try:
                done.exception()
            except asyncio.CancelledError:
                pass
            if self._operation_task is done:
                self._operation_task = None

        task.add_done_callback(completed)

    async def activate(self, command: ActivateSkillRuntime) -> SkillActivationResult:
        if type(command) is not ActivateSkillRuntime:
            _fail("candidate_invalid")
        if self._draining or self.status().skill_capability == "degraded":
            _fail("runtime_degraded")
        if self._activation_lock.locked():
            _fail("activation_busy")
        await self._activation_lock.acquire()
        reservation: GenerationReservation | None = None
        generation: RuntimeGeneration | None = None
        active: RuntimeSetSnapshot | None = None
        transferred = False
        try:
            async with asyncio.timeout(self._activate_timeout_seconds):
                active = await self._repository.load_active()
                if not self._is_consistent(active):
                    self._degrade(active, failure_code="runtime_degraded")
                    _fail("runtime_degraded")
                actual_version = 0 if active is None else active.activation_version or 0
                if actual_version != command.expected_activation_version:
                    _fail("activation_conflict")
                candidate = await self._repository.load_candidate(command.set_id)
                try:
                    reservation = self._slot.reserve_replacement()
                except GenerationCapacityError:
                    _fail("runtime_busy")
                current = self._slot.current
                self._set_status(
                    SkillRuntimeStatus(
                        "preparing",
                        current.configured,
                        None if active is None else active.set_id,
                        current.set_id,
                        None if active is None else active.previous_set_id,
                        actual_version,
                        None,
                    )
                )
                try:
                    prepared = self._materializer.prepare(candidate)
                    generation = RuntimeGeneration(
                        True,
                        candidate.set_id,
                        actual_version + 1,
                        prepared.skills,
                        prepared.root,
                    )
                    self._generation_validator(generation)
                except SkillMaterializerError as error:
                    code = (
                        error.code
                        if error.code in {"artifact_invalid", "skill_validation_failed"}
                        else "skill_validation_failed"
                    )
                    try:
                        await self._mark_failed(command, code)
                    except Exception:
                        pass
                    self._restore_status(active, failure_code=code)
                    _fail(code)
                except Exception:
                    try:
                        await self._mark_failed(command, "skill_validation_failed")
                    except Exception:
                        pass
                    self._restore_status(
                        active,
                        failure_code="skill_validation_failed",
                    )
                    _fail("skill_validation_failed")

                task = asyncio.create_task(
                    self._commit_phase(command, active, reservation, generation),
                    name=f"skill-activation-{command.request_id}",
                )
                self._track(task)
                transferred = True
                return await asyncio.shield(task)
        except TimeoutError:
            _fail("activation_timeout")
        except SkillRuntimeRepositoryError as error:
            self._restore_status(active, failure_code=_repository_code(error))
            _fail(_repository_code(error))
        finally:
            if not transferred:
                if generation is not None:
                    await self._slot.discard_generation(generation)
                if reservation is not None:
                    reservation.cancel()
                if self._activation_lock.locked():
                    self._activation_lock.release()

    async def _commit_phase(
        self,
        command: ActivateSkillRuntime,
        active: RuntimeSetSnapshot | None,
        reservation: GenerationReservation,
        generation: RuntimeGeneration,
    ) -> SkillActivationResult:
        transferred = False
        try:
            try:
                version = await self._repository.activate(
                    ActivateSkillSet(
                        command.set_id,
                        command.expected_activation_version,
                        command.actor,
                        command.request_id,
                        command.request_id,
                        _fingerprint(command),
                    )
                )
            except SkillRuntimeRepositoryError as error:
                if error.code == "storage_unavailable":
                    self._degrade(active, failure_code="activation_result_unknown")
                    reconcile_task = asyncio.create_task(
                        self._reconcile_unknown(
                            command, active, reservation, generation
                        ),
                        name=f"skill-reconcile-{command.request_id}",
                    )
                    self._track(reconcile_task)
                    transferred = True
                    _fail("activation_result_unknown")
                code = _repository_code(error)
                await self._slot.discard_generation(generation)
                reservation.cancel()
                self._restore_status(active, failure_code=code)
                _fail(code)
            if version != command.expected_activation_version + 1:
                self._degrade(active, failure_code="activation_result_unknown")
                reconcile_task = asyncio.create_task(
                    self._reconcile_unknown(command, active, reservation, generation),
                    name=f"skill-reconcile-{command.request_id}",
                )
                self._track(reconcile_task)
                transferred = True
                _fail("activation_result_unknown")
            final_generation = RuntimeGeneration(
                True,
                generation.set_id,
                version,
                generation.skills,
                generation.root,
            )
            try:
                reservation.commit(final_generation)
            except Exception:
                self._degrade(active, failure_code="activation_result_unknown")
                reconcile_task = asyncio.create_task(
                    self._reconcile_unknown(
                        command,
                        active,
                        reservation,
                        final_generation,
                    ),
                    name=f"skill-reconcile-{command.request_id}",
                )
                self._track(reconcile_task)
                transferred = True
                _fail("activation_result_unknown")
            self._slot.set_accepting_runs(not self._draining)
            self._set_status(
                SkillRuntimeStatus(
                    "ready",
                    True,
                    command.set_id,
                    command.set_id,
                    None if active is None else active.set_id,
                    version,
                    None,
                )
            )
            return SkillActivationResult(command.set_id, version)
        finally:
            if not transferred and self._activation_lock.locked():
                self._activation_lock.release()

    def _pointer_is_unchanged(
        self,
        result: ReconcileResult,
        active: RuntimeSetSnapshot | None,
    ) -> bool:
        return (
            result.active_set_id == (None if active is None else active.set_id)
            and result.previous_set_id
            == (None if active is None else active.previous_set_id)
            and result.activation_version
            == (0 if active is None else active.activation_version or 0)
        )

    async def _wait_reconcile_delay(self) -> None:
        if self._reconcile_delay_seconds == 0:
            await asyncio.sleep(0)
            return
        try:
            await asyncio.wait_for(
                self._stop_reconcile.wait(),
                timeout=self._reconcile_delay_seconds,
            )
        except TimeoutError:
            pass

    async def _reconcile_unknown(
        self,
        command: ActivateSkillRuntime,
        active: RuntimeSetSnapshot | None,
        reservation: GenerationReservation,
        generation: RuntimeGeneration,
    ) -> None:
        try:
            while not self._stop_reconcile.is_set():
                try:
                    result = await self._repository.reconcile(command.set_id)
                except SkillRuntimeRepositoryError:
                    await self._wait_reconcile_delay()
                    continue
                expected_version = command.expected_activation_version + 1
                if (
                    result.target_state == "active"
                    and result.active_set_id == command.set_id
                    and result.previous_set_id
                    == (None if active is None else active.set_id)
                    and result.activation_version == expected_version
                ):
                    final_generation = RuntimeGeneration(
                        True,
                        generation.set_id,
                        expected_version,
                        generation.skills,
                        generation.root,
                    )
                    reservation.commit(final_generation)
                    self._slot.set_accepting_runs(not self._draining)
                    self._set_status(
                        SkillRuntimeStatus(
                            "ready",
                            True,
                            command.set_id,
                            command.set_id,
                            None if active is None else active.set_id,
                            expected_version,
                            None,
                        )
                    )
                    return
                if result.target_state == "candidate" and self._pointer_is_unchanged(
                    result, active
                ):
                    try:
                        if not await self._mark_failed(command, "artifact_invalid"):
                            await self._wait_reconcile_delay()
                            continue
                    except SkillRuntimeRepositoryError:
                        await self._wait_reconcile_delay()
                        continue
                    await self._slot.discard_generation(generation)
                    reservation.cancel()
                    self._slot.set_accepting_runs(not self._draining)
                    self._restore_status(active, failure_code="artifact_invalid")
                    return
                if result.target_state in {
                    "failed",
                    "discarded",
                } and self._pointer_is_unchanged(result, active):
                    failure_code = (
                        "activation_conflict"
                        if result.target_state == "discarded"
                        else "artifact_invalid"
                    )
                    await self._slot.discard_generation(generation)
                    reservation.cancel()
                    self._slot.set_accepting_runs(not self._draining)
                    self._restore_status(active, failure_code=failure_code)
                    return
                await self._wait_reconcile_delay()
        finally:
            if self._activation_lock.locked():
                self._activation_lock.release()

    async def wait_idle(self) -> None:
        while True:
            task = self._operation_task
            if task is None:
                return
            try:
                await asyncio.shield(task)
            except (SkillActivationError, SkillRuntimeRepositoryError):
                pass
            if self._operation_task is task and task.done():
                self._operation_task = None

    async def shutdown(self) -> None:
        if self._draining:
            await self.wait_idle()
            return
        self._draining = True
        self._slot.begin_draining()
        self._stop_reconcile.set()
        await self.wait_idle()
