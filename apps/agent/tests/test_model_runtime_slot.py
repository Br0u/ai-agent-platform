import asyncio
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field
import threading
from typing import Any

from agno.models.base import Model
from agno.models.response import ModelResponse
import pytest

from agent_service.model_runtime_slot import (
    ModelRuntimeActivationError,
    ModelRuntimeCleanupError,
    ModelRuntimeSlot,
    ModelRuntimeUnavailableError,
    RuntimeModelMetadata,
    RuntimeModelStatus,
)
from agent_service.model_runtime_types import ManagedModel


LOCKED_MODEL_METHODS = {
    "invoke",
    "ainvoke",
    "invoke_stream",
    "ainvoke_stream",
    "_parse_provider_response",
    "_parse_provider_response_delta",
}


@dataclass
class RuntimeProbeModel(Model):
    id: str = "probe"
    name: str = "RuntimeProbeModel"
    provider: str = "offline"
    calls: list[str] = field(default_factory=list)
    sync_entered: threading.Event | None = None
    sync_release: threading.Event | None = None
    async_entered: asyncio.Event | None = None
    async_release: asyncio.Event | None = None
    fail_sync: BaseException | None = None
    fail_async: BaseException | None = None
    fail_sync_stream: BaseException | None = None
    fail_async_stream: BaseException | None = None

    def _response(self, operation: str) -> ModelResponse:
        self.calls.append(operation)
        return ModelResponse(role="assistant", content=f"{self.id}:{operation}")

    def invoke(self, *_args: object, **_kwargs: object) -> ModelResponse:
        if self.sync_entered is not None:
            self.sync_entered.set()
        if self.sync_release is not None:
            assert self.sync_release.wait(timeout=5)
        if self.fail_sync is not None:
            raise self.fail_sync
        return self._response("invoke")

    async def ainvoke(self, *_args: object, **_kwargs: object) -> ModelResponse:
        if self.async_entered is not None:
            self.async_entered.set()
        if self.async_release is not None:
            await self.async_release.wait()
        if self.fail_async is not None:
            raise self.fail_async
        return self._response("ainvoke")

    def invoke_stream(
        self, *_args: object, **_kwargs: object
    ) -> Iterator[ModelResponse]:
        self.calls.append("invoke_stream:start")
        yield ModelResponse(role="assistant", content=f"{self.id}:sync:1")
        if self.fail_sync_stream is not None:
            raise self.fail_sync_stream
        self.calls.append("invoke_stream:second")
        yield ModelResponse(role="assistant", content=f"{self.id}:sync:2")

    async def ainvoke_stream(
        self, *_args: object, **_kwargs: object
    ) -> AsyncIterator[ModelResponse]:
        self.calls.append("ainvoke_stream:start")
        yield ModelResponse(role="assistant", content=f"{self.id}:async:1")
        if self.fail_async_stream is not None:
            raise self.fail_async_stream
        self.calls.append("ainvoke_stream:second")
        yield ModelResponse(role="assistant", content=f"{self.id}:async:2")

    def _parse_provider_response(self, response: Any, **_kwargs: Any) -> ModelResponse:
        self.calls.append("parse")
        return ModelResponse(role="assistant", content=f"{self.id}:{response}")

    def _parse_provider_response_delta(self, response: Any) -> ModelResponse:
        self.calls.append("parse_delta")
        return ModelResponse(role="assistant", content=f"{self.id}:{response}")


@dataclass
class BlockingAsyncStreamModel(RuntimeProbeModel):
    stream_entered: asyncio.Event = field(default_factory=asyncio.Event)
    stream_cancelled: bool = False

    async def ainvoke_stream(
        self, *_args: object, **_kwargs: object
    ) -> AsyncIterator[ModelResponse]:
        self.stream_entered.set()
        try:
            yield ModelResponse(role="assistant", content=f"{self.id}:first")
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.stream_cancelled = True
            raise


@dataclass
class StreamConstructionFailureModel(RuntimeProbeModel):
    private_failure: str = "private iterator construction body"

    def invoke_stream(
        self, *_args: object, **_kwargs: object
    ) -> Iterator[ModelResponse]:
        raise RuntimeError(self.private_failure)

    def ainvoke_stream(  # type: ignore[override]
        self, *_args: object, **_kwargs: object
    ) -> AsyncIterator[ModelResponse]:
        raise RuntimeError(self.private_failure)


def metadata(
    provider: str,
    *,
    revision: int | None = 1,
    source: str = "dynamic",
) -> RuntimeModelMetadata:
    return RuntimeModelMetadata(
        source=source,
        provider=provider,
        model_id=f"{provider}-model",
        config_revision=revision,
    )


def managed(
    model: Model,
    closes: list[str],
    *,
    close_entered: asyncio.Event | None = None,
    close_release: asyncio.Event | None = None,
    close_failure: BaseException | None = None,
) -> ManagedModel:
    async def close() -> None:
        closes.append(model.id)
        if close_entered is not None:
            close_entered.set()
        if close_release is not None:
            await close_release.wait()
        if close_failure is not None:
            raise close_failure

    return ManagedModel(model=model, close_callback=close)


def content(response: ModelResponse) -> str:
    assert isinstance(response.content, str)
    return response.content


def test_locked_agno_model_contract_has_exactly_six_abstract_methods() -> None:
    assert Model.__abstractmethods__ == LOCKED_MODEL_METHODS
    assert ModelRuntimeSlot.__abstractmethods__ == frozenset()


def test_runtime_metadata_and_status_reject_unsafe_or_invalid_values() -> None:
    with pytest.raises(ValueError, match="invalid runtime model metadata"):
        metadata("openai\nsecret")
    with pytest.raises(ValueError, match="invalid runtime model metadata"):
        metadata("openai\u0085secret")
    with pytest.raises(ValueError, match="invalid runtime model metadata"):
        metadata("openai", revision=0)
    with pytest.raises(ValueError, match="invalid runtime model metadata"):
        metadata("openai", source="private provider URL")
    with pytest.raises(ValueError, match="invalid runtime model metadata"):
        metadata("safe-but-unknown")
    with pytest.raises(ValueError, match="invalid runtime model metadata"):
        metadata("openai", revision=None)
    with pytest.raises(ValueError, match="invalid runtime model metadata"):
        metadata("openai", revision=1, source="deployment")

    assert metadata(
        "openai", revision=None, source="deployment"
    ) == RuntimeModelMetadata(
        source="deployment",
        provider="openai",
        model_id="openai-model",
        config_revision=None,
    )


def test_dormant_slot_is_safely_unavailable_without_provider_io() -> None:
    slot = ModelRuntimeSlot()

    assert slot.runtime_status() == RuntimeModelStatus(
        capability="placeholder",
        source=None,
        provider=None,
        model_id=None,
        config_revision=None,
        activation_version=None,
    )
    with pytest.raises(
        ModelRuntimeUnavailableError, match="^assistant model is unavailable$"
    ):
        slot.invoke()
    with pytest.raises(
        ModelRuntimeUnavailableError, match="^assistant model is unavailable$"
    ):
        slot._parse_provider_response("raw")
    with pytest.raises(ModelRuntimeUnavailableError):
        slot.invoke_stream()
    with pytest.raises(ModelRuntimeUnavailableError):
        slot.ainvoke_stream()


def test_activation_uses_global_version_not_provider_revision() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        slot = ModelRuntimeSlot()
        await slot.start()
        first = RuntimeProbeModel(id="openai-v99")
        second = RuntimeProbeModel(id="anthropic-v1")
        slot.activate(managed(first, closes), 4, metadata("openai", revision=99))
        slot.activate(managed(second, closes), 5, metadata("anthropic", revision=1))

        assert content(slot.invoke()) == "anthropic-v1:invoke"
        assert slot.runtime_status() == RuntimeModelStatus(
            capability="available",
            source="dynamic",
            provider="anthropic",
            model_id="anthropic-model",
            config_revision=1,
            activation_version=5,
        )
        await slot.shutdown()
        assert closes == ["openai-v99", "anthropic-v1"]

    asyncio.run(scenario())


def test_stale_or_invalid_activation_is_fixed_and_does_not_close_candidate() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        slot = ModelRuntimeSlot()
        await slot.start()
        active = managed(RuntimeProbeModel(id="active"), closes)
        rejected = managed(RuntimeProbeModel(id="rejected"), closes)
        slot.activate(active, 7, metadata("openai"))

        for version in (7, 6, True, -1):
            with pytest.raises(
                ModelRuntimeActivationError,
                match="^model activation rejected$",
            ) as error:
                slot.activate(rejected, version, metadata("anthropic"))  # type: ignore[arg-type]
            assert error.value.__cause__ is None
            assert error.value.__context__ is None

        assert content(slot.invoke()) == "active:invoke"
        assert closes == []
        await slot.shutdown()
        assert closes == ["active"]

    asyncio.run(scenario())


def test_deployment_zero_version_yields_to_first_dynamic_global_version() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(
            managed(RuntimeProbeModel(id="bootstrap"), closes),
            0,
            metadata("openai", revision=None, source="deployment"),
        )
        assert slot.runtime_status().activation_version is None
        assert slot.runtime_status().source == "deployment"

        slot.activate(
            managed(RuntimeProbeModel(id="dynamic"), closes),
            1,
            metadata("anthropic", revision=1),
        )
        assert slot.runtime_status().activation_version == 1
        assert content(slot.invoke()) == "dynamic:invoke"
        await slot.shutdown()
        assert closes == ["bootstrap", "dynamic"]

    asyncio.run(scenario())


def test_deactivate_sets_safe_capability_and_retires_active() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(
            managed(RuntimeProbeModel(id="active"), closes),
            1,
            metadata("openai"),
        )

        slot.deactivate(capability="degraded")
        with pytest.raises(ModelRuntimeUnavailableError):
            await slot.ainvoke()
        assert slot.runtime_status().capability == "degraded"
        await slot.shutdown()
        assert closes == ["active"]

    asyncio.run(scenario())


def test_sync_in_flight_snapshot_survives_activation_on_worker_thread() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        entered = threading.Event()
        release = threading.Event()
        old = RuntimeProbeModel(id="old", sync_entered=entered, sync_release=release)
        new = RuntimeProbeModel(id="new")
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(old, closes), 1, metadata("openai"))

        old_call = asyncio.create_task(asyncio.to_thread(slot.invoke))
        assert await asyncio.to_thread(entered.wait, 5)
        slot.activate(managed(new, closes), 2, metadata("anthropic"))
        assert content(slot.invoke()) == "new:invoke"
        assert closes == []
        release.set()
        assert content(await old_call) == "old:invoke"

        await slot.shutdown()
        assert closes == ["old", "new"]

    asyncio.run(scenario())


def test_sync_exception_after_retirement_releases_entry_once() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        secret = RuntimeError("private provider body")
        entered = threading.Event()
        release = threading.Event()
        old = RuntimeProbeModel(
            id="old",
            sync_entered=entered,
            sync_release=release,
            fail_sync=secret,
        )
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(old, closes), 1, metadata("openai"))
        call = asyncio.create_task(asyncio.to_thread(slot.invoke))
        assert await asyncio.to_thread(entered.wait, 5)
        slot.activate(
            managed(RuntimeProbeModel(id="new"), closes),
            2,
            metadata("anthropic"),
        )
        release.set()

        with pytest.raises(RuntimeError, match="private provider body"):
            await call
        await slot.shutdown()
        assert closes == ["old", "new"]

    asyncio.run(scenario())


def test_sync_stream_uses_one_snapshot_and_early_close_releases_it() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        old = RuntimeProbeModel(id="old")
        new = RuntimeProbeModel(id="new")
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(old, closes), 1, metadata("openai"))

        stream = slot.invoke_stream()
        assert content(next(stream)) == "old:sync:1"
        slot.activate(managed(new, closes), 2, metadata("anthropic"))
        assert content(next(stream)) == "old:sync:2"
        with pytest.raises(StopIteration):
            next(stream)
        await asyncio.sleep(0)

        early = slot.invoke_stream()
        assert content(next(early)) == "new:sync:1"
        early.close()
        await slot.shutdown()
        assert closes == ["old", "new"]

    asyncio.run(scenario())


def test_stream_calls_capture_before_first_item_and_unstarted_close_releases() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        old = RuntimeProbeModel(id="old")
        new = RuntimeProbeModel(id="new")
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(old, closes), 1, metadata("openai"))

        sync_stream = slot.invoke_stream()
        async_stream = slot.ainvoke_stream()
        slot.activate(managed(new, closes), 2, metadata("anthropic"))
        assert content(next(sync_stream)) == "old:sync:1"
        assert content(await anext(async_stream)) == "old:async:1"
        sync_stream.close()  # type: ignore[attr-defined]
        await async_stream.aclose()  # type: ignore[attr-defined]

        unstarted_sync = slot.invoke_stream()
        unstarted_async = slot.ainvoke_stream()
        slot.deactivate()
        unstarted_sync.close()  # type: ignore[attr-defined]
        await unstarted_async.aclose()  # type: ignore[attr-defined]
        await slot.shutdown()
        assert closes == ["old", "new"]

    asyncio.run(scenario())


def test_stream_iterator_construction_failure_releases_capture() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(
            managed(StreamConstructionFailureModel(id="broken"), closes),
            1,
            metadata("openai"),
        )

        with pytest.raises(RuntimeError, match="private iterator construction body"):
            slot.invoke_stream()
        with pytest.raises(RuntimeError, match="private iterator construction body"):
            slot.ainvoke_stream()
        slot.deactivate()
        await slot.shutdown()
        assert closes == ["broken"]

    asyncio.run(scenario())


def test_stream_iteration_exceptions_preserve_error_and_release_once() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        old = RuntimeProbeModel(
            id="old",
            fail_sync_stream=RuntimeError("private sync stream body"),
            fail_async_stream=RuntimeError("private async stream body"),
        )
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(old, closes), 1, metadata("openai"))
        sync_stream = slot.invoke_stream()
        async_stream = slot.ainvoke_stream()
        assert content(next(sync_stream)) == "old:sync:1"
        assert content(await anext(async_stream)) == "old:async:1"
        slot.activate(
            managed(RuntimeProbeModel(id="new"), closes),
            2,
            metadata("anthropic"),
        )

        with pytest.raises(RuntimeError, match="private sync stream body"):
            next(sync_stream)
        with pytest.raises(RuntimeError, match="private async stream body"):
            await anext(async_stream)
        await slot.shutdown()
        assert closes == ["old", "new"]

    asyncio.run(scenario())


def test_async_in_flight_snapshot_survives_activation_and_exception() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        entered = asyncio.Event()
        release = asyncio.Event()
        old = RuntimeProbeModel(id="old", async_entered=entered, async_release=release)
        new = RuntimeProbeModel(id="new")
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(old, closes), 1, metadata("openai"))

        old_call = asyncio.create_task(slot.ainvoke())
        await entered.wait()
        slot.activate(managed(new, closes), 2, metadata("anthropic"))
        assert content(await slot.ainvoke()) == "new:ainvoke"
        assert closes == []
        release.set()
        assert content(await old_call) == "old:ainvoke"
        await slot.shutdown()
        assert closes == ["old", "new"]

    asyncio.run(scenario())


def test_async_cancellation_releases_retired_entry_and_propagates() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        entered = asyncio.Event()
        old = RuntimeProbeModel(
            id="old",
            async_entered=entered,
            async_release=asyncio.Event(),
        )
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(old, closes), 1, metadata("openai"))
        call = asyncio.create_task(slot.ainvoke())
        await entered.wait()
        slot.deactivate()

        call.cancel()
        with pytest.raises(asyncio.CancelledError):
            await call
        await slot.shutdown()
        assert closes == ["old"]

    asyncio.run(scenario())


def test_async_exception_after_retirement_releases_entry_once() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        entered = asyncio.Event()
        release = asyncio.Event()
        old = RuntimeProbeModel(
            id="old",
            async_entered=entered,
            async_release=release,
            fail_async=RuntimeError("private async provider body"),
        )
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(old, closes), 1, metadata("openai"))
        call = asyncio.create_task(slot.ainvoke())
        await entered.wait()
        slot.activate(
            managed(RuntimeProbeModel(id="new"), closes),
            2,
            metadata("anthropic"),
        )
        release.set()

        with pytest.raises(RuntimeError, match="private async provider body"):
            await call
        await slot.shutdown()
        assert closes == ["old", "new"]

    asyncio.run(scenario())


def test_async_stream_early_close_and_cancel_release_exactly_once() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        old = BlockingAsyncStreamModel(id="old")
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(old, closes), 1, metadata("openai"))

        stream = slot.ainvoke_stream()
        assert content(await anext(stream)) == "old:first"
        slot.deactivate()
        await stream.aclose()
        await slot.shutdown()
        assert closes == ["old"]

        closes.clear()
        cancelling = BlockingAsyncStreamModel(id="cancelling")
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(managed(cancelling, closes), 1, metadata("openai"))
        stream = slot.ainvoke_stream()
        assert content(await anext(stream)) == "cancelling:first"
        slot.deactivate()
        next_item = asyncio.create_task(anext(stream))
        await asyncio.sleep(0)
        next_item.cancel()
        with pytest.raises(asyncio.CancelledError):
            await next_item
        assert cancelling.stream_cancelled
        await slot.shutdown()
        assert closes == ["cancelling"]

    asyncio.run(scenario())


def test_response_parsers_each_capture_one_current_entry() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        slot = ModelRuntimeSlot()
        await slot.start()
        old = RuntimeProbeModel(id="old")
        new = RuntimeProbeModel(id="new")
        slot.activate(managed(old, closes), 1, metadata("openai"))
        assert content(slot._parse_provider_response("one")) == "old:one"
        slot.activate(managed(new, closes), 2, metadata("anthropic"))
        assert content(slot._parse_provider_response_delta("two")) == "new:two"
        await slot.shutdown()

    asyncio.run(scenario())


def test_reaper_closes_outside_lock_and_activation_does_not_wait_for_io() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        close_entered = asyncio.Event()
        close_release = asyncio.Event()
        slot = ModelRuntimeSlot()
        await slot.start()
        slot.activate(
            managed(
                RuntimeProbeModel(id="old"),
                closes,
                close_entered=close_entered,
                close_release=close_release,
            ),
            1,
            metadata("openai"),
        )
        slot.activate(
            managed(RuntimeProbeModel(id="current"), closes),
            2,
            metadata("anthropic"),
        )
        await close_entered.wait()

        # A blocked Provider close cannot hold the slot lock.
        slot.activate(
            managed(RuntimeProbeModel(id="new"), closes),
            3,
            metadata("google"),
        )
        assert content(slot.invoke()) == "new:invoke"
        close_release.set()
        await slot.shutdown()
        assert sorted(closes) == ["current", "new", "old"]

    asyncio.run(scenario())


def test_shutdown_waits_for_in_flight_then_drains_and_stops_reaper() -> None:
    async def scenario() -> None:
        closes: list[str] = []
        entered = asyncio.Event()
        release = asyncio.Event()
        slot = ModelRuntimeSlot(cleanup_timeout_seconds=2)
        await slot.start()
        slot.activate(
            managed(
                RuntimeProbeModel(
                    id="active",
                    async_entered=entered,
                    async_release=release,
                ),
                closes,
            ),
            1,
            metadata("openai"),
        )
        call = asyncio.create_task(slot.ainvoke())
        await entered.wait()
        shutdown = asyncio.create_task(slot.shutdown())
        await asyncio.sleep(0)
        assert not shutdown.done()
        with pytest.raises(ModelRuntimeUnavailableError):
            slot.invoke()
        release.set()
        await call
        await shutdown
        assert closes == ["active"]
        assert slot.reaper_stopped

    asyncio.run(scenario())


def test_immediate_retirement_and_shutdown_never_misses_drain_signal() -> None:
    async def scenario() -> None:
        for attempt in range(50):
            closes: list[str] = []
            slot = ModelRuntimeSlot(cleanup_timeout_seconds=1)
            await slot.start()
            slot.activate(
                managed(RuntimeProbeModel(id=f"old-{attempt}"), closes),
                1,
                metadata("openai"),
            )
            slot.activate(
                managed(RuntimeProbeModel(id=f"new-{attempt}"), closes),
                2,
                metadata("anthropic"),
            )
            await slot.shutdown()
            assert sorted(closes) == [f"new-{attempt}", f"old-{attempt}"]

    asyncio.run(scenario())


@pytest.mark.parametrize("mode", ["failure", "timeout"])
def test_shutdown_cleanup_failures_are_fixed_and_sanitized(mode: str) -> None:
    async def scenario() -> None:
        private = "private provider URL body key"
        closes: list[str] = []
        close_release = asyncio.Event() if mode == "timeout" else None
        close_failure = RuntimeError(private) if mode == "failure" else None
        slot = ModelRuntimeSlot(cleanup_timeout_seconds=0.02)
        await slot.start()
        slot.activate(
            managed(
                RuntimeProbeModel(id="active"),
                closes,
                close_release=close_release,
                close_failure=close_failure,
            ),
            1,
            metadata("openai"),
        )

        with pytest.raises(
            ModelRuntimeCleanupError, match="^model runtime cleanup failed$"
        ) as error:
            await slot.shutdown()
        assert private not in repr(error.value)
        assert error.value.__cause__ is None
        assert error.value.__context__ is None

    asyncio.run(scenario())
