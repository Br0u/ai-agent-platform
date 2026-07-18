"""Stable Agno model delegate with atomic activation and owned cleanup."""

import asyncio
from collections.abc import AsyncIterator, Callable, Iterator
from dataclasses import dataclass
import math
import threading
from typing import Any, Literal, cast

from agno.models.base import Model
from agno.models.response import ModelResponse

from agent_service.model_config_types import (
    MODEL_ID_MAX_CODE_POINTS,
    MODEL_PROVIDERS,
    ModelProvider,
)
from agent_service.model_runtime_types import ManagedModel


RuntimeModelCapability = Literal["placeholder", "available", "degraded"]
RuntimeModelSource = Literal["dynamic", "deployment"]


class ModelRuntimeUnavailableError(RuntimeError):
    """Fixed public failure when the slot has no active model."""


class ModelRuntimeActivationError(RuntimeError):
    """Fixed public failure for an invalid or stale activation."""


class ModelRuntimeCleanupError(RuntimeError):
    """Fixed public failure when owned model cleanup cannot finish safely."""


def _invalid_metadata() -> None:
    raise ValueError("invalid runtime model metadata") from None


def _validate_label(value: object, *, max_length: int) -> str:
    if type(value) is not str:
        _invalid_metadata()
    label = cast(str, value)
    if not 1 <= len(label) <= max_length or label != label.strip():
        _invalid_metadata()
    if any(
        ord(character) <= 0x1F or 0x7F <= ord(character) <= 0x9F for character in label
    ):
        _invalid_metadata()
    return label


@dataclass(frozen=True, slots=True)
class RuntimeModelMetadata:
    """Safe metadata attached to one active delegate; never contains secrets."""

    source: RuntimeModelSource
    provider: ModelProvider
    model_id: str
    config_revision: int | None

    def __post_init__(self) -> None:
        if type(self.source) is not str or self.source not in {
            "dynamic",
            "deployment",
        }:
            _invalid_metadata()
        provider = _validate_label(self.provider, max_length=32)
        if provider not in MODEL_PROVIDERS:
            _invalid_metadata()
        model_id = _validate_label(
            self.model_id,
            max_length=MODEL_ID_MAX_CODE_POINTS,
        )
        revision = self.config_revision
        if revision is not None and (type(revision) is not int or revision < 1):
            _invalid_metadata()
        if self.source == "dynamic" and revision is None:
            _invalid_metadata()
        if self.source == "deployment" and revision is not None:
            _invalid_metadata()
        object.__setattr__(self, "provider", provider)
        object.__setattr__(self, "model_id", model_id)


@dataclass(frozen=True, slots=True)
class RuntimeModelStatus:
    """Metadata-only snapshot suitable for health and control status."""

    capability: RuntimeModelCapability
    source: RuntimeModelSource | None
    provider: ModelProvider | None
    model_id: str | None
    config_revision: int | None
    activation_version: int | None


@dataclass(slots=True)
class _SlotEntry:
    managed: ManagedModel
    activation_version: int
    metadata: RuntimeModelMetadata
    in_flight: int = 0
    retired: bool = False


_STOP_REAPER = object()


class _SyncSlotIterator(Iterator[ModelResponse]):
    def __init__(
        self,
        iterator: Iterator[ModelResponse],
        release: Callable[[], None],
    ) -> None:
        self._iterator = iterator
        self._release = release
        self._condition = threading.Condition()
        self._operation_active = False
        self._close_requested = False
        self._closing = False
        self._released = False

    def __iter__(self) -> Iterator[ModelResponse]:
        return self

    def __next__(self) -> ModelResponse:
        with self._condition:
            if self._close_requested:
                raise StopIteration
            if self._operation_active:
                raise RuntimeError("stream iteration already in progress")
            self._operation_active = True
        try:
            response = next(self._iterator)
        except BaseException:
            self._finish_operation()
            try:
                self.close()
            except BaseException:
                pass
            raise
        self._finish_operation()
        return response

    def _finish_operation(self) -> None:
        with self._condition:
            self._operation_active = False
            self._condition.notify_all()

    def close(self) -> None:
        with self._condition:
            self._close_requested = True
            while self._operation_active:
                self._condition.wait()
            while self._closing and not self._released:
                self._condition.wait()
            if self._released:
                return
            self._closing = True
        try:
            close = getattr(self._iterator, "close", None)
            if callable(close):
                close()
        finally:
            try:
                self._release()
            finally:
                with self._condition:
                    self._released = True
                    self._closing = False
                    self._condition.notify_all()


class _AsyncSlotIterator(AsyncIterator[ModelResponse]):
    def __init__(
        self,
        iterator: AsyncIterator[ModelResponse],
        release: Callable[[], None],
    ) -> None:
        self._iterator = iterator
        self._release = release
        self._condition = asyncio.Condition()
        self._operation_active = False
        self._close_requested = False
        self._released = False
        self._close_task: asyncio.Task[None] | None = None

    def __aiter__(self) -> AsyncIterator[ModelResponse]:
        return self

    async def __anext__(self) -> ModelResponse:
        async with self._condition:
            if self._close_requested:
                raise StopAsyncIteration
            if self._operation_active:
                raise RuntimeError("stream iteration already in progress")
            self._operation_active = True
        try:
            response = await anext(self._iterator)
        except BaseException:
            await self._finish_operation()
            try:
                await self.aclose()
            except BaseException:
                pass
            raise
        await self._finish_operation()
        return response

    async def _finish_operation(self) -> None:
        async with self._condition:
            self._operation_active = False
            self._condition.notify_all()

    async def aclose(self) -> None:
        async with self._condition:
            self._close_requested = True
            close_task = self._close_task
            if close_task is None:
                close_task = asyncio.create_task(
                    self._close_once(),
                    name="model-runtime-slot-stream-close",
                )
                self._close_task = close_task
        await asyncio.shield(close_task)

    async def _close_once(self) -> None:
        async with self._condition:
            while self._operation_active:
                await self._condition.wait()
        try:
            close = getattr(self._iterator, "aclose", None)
            if callable(close):
                await close()
        finally:
            try:
                self._release()
            finally:
                async with self._condition:
                    self._released = True
                    self._condition.notify_all()


class ModelRuntimeSlot(Model):
    """One stable model identity backed by one captured delegate per call."""

    def __init__(self, *, cleanup_timeout_seconds: float = 10.0) -> None:
        super().__init__(
            id="maduoduo-runtime-slot",
            name="ModelRuntimeSlot",
            provider="managed",
        )
        if (
            type(cleanup_timeout_seconds) not in {int, float}
            or not math.isfinite(cleanup_timeout_seconds)
            or cleanup_timeout_seconds <= 0
        ):
            raise ValueError("invalid model cleanup timeout")
        self._cleanup_timeout_seconds = float(cleanup_timeout_seconds)
        self._lock = threading.Lock()
        self._active: _SlotEntry | None = None
        self._last_activation_version = -1
        self._capability: RuntimeModelCapability = "placeholder"
        self._pending_retired = 0
        self._cleanup_failed = False
        self._loop: asyncio.AbstractEventLoop | None = None
        self._cleanup_queue: asyncio.Queue[_SlotEntry | object] | None = None
        self._drained_event: asyncio.Event | None = None
        self._reaper_task: asyncio.Task[None] | None = None
        self._shutdown_task: asyncio.Task[None] | None = None
        self._started = False
        self._shutting_down = False
        self._stopped = False

    @property
    def reaper_stopped(self) -> bool:
        task = self._reaper_task
        return self._stopped and (task is None or task.done())

    async def start(self) -> None:
        """Create loop-owned cleanup state before runtime reconciliation."""
        loop = asyncio.get_running_loop()
        with self._lock:
            if self._stopped or self._shutting_down:
                raise ModelRuntimeCleanupError("model runtime cleanup failed")
            if self._started:
                if self._loop is not loop:
                    raise ModelRuntimeCleanupError("model runtime cleanup failed")
                return
            self._loop = loop
            self._cleanup_queue = asyncio.Queue()
            self._drained_event = asyncio.Event()
            self._drained_event.set()
            self._started = True
            self._reaper_task = asyncio.create_task(
                self._run_reaper(),
                name="model-runtime-slot-reaper",
            )

    def runtime_status(self) -> RuntimeModelStatus:
        """Return one safe, lock-consistent runtime snapshot."""
        with self._lock:
            entry = self._active
            capability = self._capability
            if entry is None:
                return RuntimeModelStatus(
                    capability=capability,
                    source=None,
                    provider=None,
                    model_id=None,
                    config_revision=None,
                    activation_version=None,
                )
            metadata = entry.metadata
            return RuntimeModelStatus(
                capability=capability,
                source=metadata.source,
                provider=metadata.provider,
                model_id=metadata.model_id,
                config_revision=metadata.config_revision,
                activation_version=(
                    entry.activation_version if metadata.source == "dynamic" else None
                ),
            )

    def _activation_error(self) -> ModelRuntimeActivationError:
        return ModelRuntimeActivationError("model activation rejected")

    def activate(
        self,
        managed: ManagedModel,
        activation_version: int,
        metadata: RuntimeModelMetadata,
    ) -> None:
        """Atomically install a strictly newer global activation version."""
        if (
            not isinstance(managed, ManagedModel)
            or type(metadata) is not RuntimeModelMetadata
            or type(activation_version) is not int
            or activation_version < 0
            or (metadata.source == "deployment" and activation_version != 0)
            or (metadata.source == "dynamic" and activation_version < 1)
        ):
            raise self._activation_error() from None

        retired: _SlotEntry | None = None
        with self._lock:
            if (
                not self._started
                or self._shutting_down
                or self._stopped
                or activation_version <= self._last_activation_version
            ):
                raise self._activation_error() from None
            previous = self._active
            self._active = _SlotEntry(
                managed=managed,
                activation_version=activation_version,
                metadata=metadata,
            )
            self._last_activation_version = activation_version
            self._capability = "available"
            if previous is not None:
                retired = self._retire_locked(previous)
        if retired is not None:
            self._enqueue_from_sync(retired)

    def deactivate(
        self,
        *,
        capability: Literal["placeholder", "degraded"] = "placeholder",
    ) -> None:
        """Make new calls unavailable and retire the former active delegate."""
        if capability not in {"placeholder", "degraded"}:
            raise self._activation_error() from None
        retired: _SlotEntry | None = None
        with self._lock:
            if self._shutting_down or self._stopped:
                return
            previous = self._active
            self._active = None
            self._capability = capability
            if previous is not None:
                retired = self._retire_locked(previous)
        if retired is not None:
            self._enqueue_from_sync(retired)

    def _retire_locked(self, entry: _SlotEntry) -> _SlotEntry | None:
        if entry.retired:
            return None
        entry.retired = True
        self._pending_retired += 1
        return entry if entry.in_flight == 0 else None

    def _capture(self) -> _SlotEntry:
        with self._lock:
            entry = self._active
            if entry is None or self._shutting_down or self._stopped:
                raise ModelRuntimeUnavailableError(
                    "assistant model is unavailable"
                ) from None
            entry.in_flight += 1
            return entry

    def _release_locked(self, entry: _SlotEntry) -> _SlotEntry | None:
        entry.in_flight -= 1
        if entry.in_flight < 0:
            raise AssertionError("runtime slot in-flight count underflow")
        if entry.retired and entry.in_flight == 0:
            return entry
        return None

    def _release_from_sync(self, entry: _SlotEntry) -> None:
        with self._lock:
            retired = self._release_locked(entry)
        if retired is not None:
            self._enqueue_from_sync(retired)

    def _release_from_async(self, entry: _SlotEntry) -> None:
        with self._lock:
            retired = self._release_locked(entry)
        if retired is None:
            return
        loop = self._loop
        queue = self._cleanup_queue
        drained = self._drained_event
        if loop is None or queue is None or drained is None:
            raise AssertionError("runtime slot cleanup loop is absent")
        if asyncio.get_running_loop() is loop:
            drained.clear()
            queue.put_nowait(retired)
        else:  # pragma: no cover - defensive support for foreign async loops
            loop.call_soon_threadsafe(self._enqueue_retired, retired)

    def _enqueue_retired(self, entry: _SlotEntry) -> None:
        queue = self._cleanup_queue
        drained = self._drained_event
        if queue is None or drained is None:
            raise AssertionError("runtime slot cleanup state is absent")
        drained.clear()
        queue.put_nowait(entry)

    def _enqueue_from_sync(self, entry: _SlotEntry) -> None:
        loop = self._loop
        if loop is None or self._cleanup_queue is None:
            raise AssertionError("runtime slot cleanup loop is absent")
        loop.call_soon_threadsafe(self._enqueue_retired, entry)

    async def _run_reaper(self) -> None:
        queue = self._cleanup_queue
        drained = self._drained_event
        if queue is None or drained is None:
            raise AssertionError("runtime slot cleanup state is absent")
        while True:
            item = await queue.get()
            try:
                if item is _STOP_REAPER:
                    return
                entry = cast(_SlotEntry, item)
                try:
                    await entry.managed.aclose()
                except Exception:
                    with self._lock:
                        self._cleanup_failed = True
                finally:
                    with self._lock:
                        self._pending_retired -= 1
                        is_drained = self._pending_retired == 0
                    if is_drained:
                        drained.set()
            finally:
                queue.task_done()

    async def _cancel_reaper(self) -> None:
        task = self._reaper_task
        if task is None or task.done():
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def shutdown(self) -> None:
        """Await the one shielded drain shared by every shutdown caller."""
        loop = asyncio.get_running_loop()
        with self._lock:
            if not self._started or self._loop is not loop:
                raise ModelRuntimeCleanupError("model runtime cleanup failed") from None
            shutdown_task = self._shutdown_task
            if shutdown_task is None:
                self._shutting_down = True
                shutdown_task = asyncio.create_task(
                    self._shutdown_once(),
                    name="model-runtime-slot-shutdown",
                )
                self._shutdown_task = shutdown_task
        await asyncio.shield(shutdown_task)

    async def _shutdown_once(self) -> None:
        """Retire delegates, drain owned clients and stop the reaper once."""
        retired: _SlotEntry | None = None
        with self._lock:
            previous = self._active
            self._active = None
            self._capability = "placeholder"
            if previous is not None:
                retired = self._retire_locked(previous)
            pending = self._pending_retired
            drained = self._drained_event
            queue = self._cleanup_queue
            task = self._reaper_task
            if pending and drained is not None:
                drained.clear()
        if drained is None or queue is None or task is None:
            raise ModelRuntimeCleanupError("model runtime cleanup failed") from None
        if retired is not None:
            self._enqueue_from_sync(retired)

        timed_out = False
        try:
            async with asyncio.timeout(self._cleanup_timeout_seconds):
                if pending:
                    await drained.wait()
                await queue.join()
                queue.put_nowait(_STOP_REAPER)
                await task
        except TimeoutError:
            timed_out = True
            await self._cancel_reaper()
        except asyncio.CancelledError:
            await self._cancel_reaper()
            raise
        finally:
            with self._lock:
                self._stopped = True

        with self._lock:
            failed = self._cleanup_failed
        if timed_out or failed:
            raise ModelRuntimeCleanupError("model runtime cleanup failed") from None

    def invoke(self, *args: Any, **kwargs: Any) -> ModelResponse:
        entry = self._capture()
        try:
            return entry.managed.model.invoke(*args, **kwargs)
        finally:
            self._release_from_sync(entry)

    async def ainvoke(self, *args: Any, **kwargs: Any) -> ModelResponse:
        entry = self._capture()
        try:
            return await entry.managed.model.ainvoke(*args, **kwargs)
        finally:
            self._release_from_async(entry)

    def invoke_stream(self, *args: Any, **kwargs: Any) -> Iterator[ModelResponse]:
        entry = self._capture()
        try:
            iterator = iter(entry.managed.model.invoke_stream(*args, **kwargs))
        except BaseException:
            self._release_from_sync(entry)
            raise
        return _SyncSlotIterator(
            iterator,
            lambda: self._release_from_sync(entry),
        )

    def ainvoke_stream(self, *args: Any, **kwargs: Any) -> AsyncIterator[ModelResponse]:
        entry = self._capture()
        try:
            iterator = aiter(entry.managed.model.ainvoke_stream(*args, **kwargs))
        except BaseException:
            self._release_from_sync(entry)
            raise
        return _AsyncSlotIterator(
            iterator,
            lambda: self._release_from_async(entry),
        )

    def _parse_provider_response(self, response: Any, **kwargs: Any) -> ModelResponse:
        entry = self._capture()
        try:
            return entry.managed.model._parse_provider_response(response, **kwargs)
        finally:
            self._release_from_sync(entry)

    def _parse_provider_response_delta(self, response: Any) -> ModelResponse:
        entry = self._capture()
        try:
            return entry.managed.model._parse_provider_response_delta(response)
        finally:
            self._release_from_sync(entry)
