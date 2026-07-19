import asyncio

from agno.models.base import Model
from agno.models.openai import OpenAIResponses
import pytest

from agent_service.model_runtime_types import (
    ManagedModel,
    ManagedModelCloseError,
)


def make_model() -> Model:
    return OpenAIResponses(id="managed-test", api_key="test-api-key")


def test_concurrent_aclose_invokes_callback_exactly_once() -> None:
    async def scenario() -> None:
        calls = 0
        entered = asyncio.Event()
        release = asyncio.Event()

        async def close_callback() -> None:
            nonlocal calls
            calls += 1
            entered.set()
            await release.wait()

        model = make_model()
        managed = ManagedModel(model=model, close_callback=close_callback)
        callers = [asyncio.create_task(managed.aclose()) for _ in range(20)]

        await entered.wait()
        assert calls == 1
        release.set()
        await asyncio.gather(*callers)
        await managed.aclose()

        assert managed.model is model
        assert calls == 1

    asyncio.run(scenario())


def test_callback_failure_is_fixed_redacted_and_stable_for_all_callers() -> None:
    async def scenario() -> None:
        calls = 0
        raw_error = "provider-secret-close-error"

        async def failing_close_callback() -> None:
            nonlocal calls
            calls += 1
            await asyncio.sleep(0)
            raise RuntimeError(raw_error)

        managed = ManagedModel(
            model=make_model(),
            close_callback=failing_close_callback,
        )
        results = await asyncio.gather(
            *(managed.aclose() for _ in range(10)),
            return_exceptions=True,
        )
        repeated_result = await asyncio.gather(
            managed.aclose(),
            return_exceptions=True,
        )

        errors = [*results, *repeated_result]
        assert calls == 1
        assert all(isinstance(error, ManagedModelCloseError) for error in errors)
        assert all(str(error) == "managed model close failed" for error in errors)
        assert all(raw_error not in repr(error) for error in errors)
        assert len({id(error) for error in errors}) == 1

    asyncio.run(scenario())


def test_cancelled_waiter_does_not_cancel_shared_close() -> None:
    async def scenario() -> None:
        calls = 0
        entered = asyncio.Event()
        release = asyncio.Event()

        async def close_callback() -> None:
            nonlocal calls
            calls += 1
            entered.set()
            await release.wait()

        managed = ManagedModel(
            model=make_model(),
            close_callback=close_callback,
        )
        cancelled_waiter = asyncio.create_task(managed.aclose())
        surviving_waiter = asyncio.create_task(managed.aclose())

        await entered.wait()
        cancelled_waiter.cancel()
        with pytest.raises(asyncio.CancelledError):
            await cancelled_waiter
        release.set()
        await surviving_waiter
        await managed.aclose()

        assert calls == 1

    asyncio.run(scenario())


def test_close_callback_is_hidden_from_managed_repr() -> None:
    secret = "callback-secret"

    class SecretCallback:
        def __repr__(self) -> str:
            return secret

        async def __call__(self) -> None:
            return None

    managed = ManagedModel(
        model=make_model(),
        close_callback=SecretCallback(),
    )

    assert secret not in repr(managed)
