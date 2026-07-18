import asyncio
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field
from io import StringIO
import logging
from types import SimpleNamespace
from typing import Any, cast, get_args

from agno.exceptions import ModelAuthenticationError, ModelProviderError
from agno.models.base import Model
from agno.models.message import Message
from agno.models.response import ModelResponse
import pytest
from agno.utils.log import log_error

import agent_service.model_verifier as model_verifier
from agent_service.model_runtime_types import ManagedModel
from agent_service.model_verifier import (
    ModelVerificationResult,
    VerificationCategory,
    verify_model,
)


@dataclass
class ProbeModel(Model):
    id: str = "offline-verifier"
    name: str = "ProbeModel"
    provider: str = "Offline"
    responses: list[object] = field(
        default_factory=lambda: [ModelResponse(role="assistant", content=" verified ")]
    )
    calls: list[tuple[list[Message], Message, dict[str, Any]]] = field(
        default_factory=list
    )

    def invoke(self, *_args: object, **_kwargs: object) -> ModelResponse:
        raise AssertionError("verification must use the async non-streaming boundary")

    async def ainvoke(
        self,
        messages: list[Message],
        assistant_message: Message,
        **kwargs: Any,
    ) -> ModelResponse:
        self.calls.append((messages, assistant_message, kwargs))
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        return response  # type: ignore[return-value]

    def invoke_stream(
        self, *_args: object, **_kwargs: object
    ) -> Iterator[ModelResponse]:
        raise AssertionError("verification must not stream")
        yield  # pragma: no cover

    async def ainvoke_stream(
        self, *_args: object, **_kwargs: object
    ) -> AsyncIterator[ModelResponse]:
        raise AssertionError("verification must not stream")
        yield  # pragma: no cover

    def _parse_provider_response(
        self, response: ModelResponse, **_kwargs: Any
    ) -> ModelResponse:
        return response

    def _parse_provider_response_delta(
        self, response_delta: ModelResponse
    ) -> ModelResponse:
        return response_delta


@dataclass
class BlockingProbeModel(ProbeModel):
    entered: asyncio.Event = field(default_factory=asyncio.Event)
    cancelled: bool = False

    async def ainvoke(
        self,
        messages: list[Message],
        assistant_message: Message,
        **kwargs: Any,
    ) -> ModelResponse:
        self.calls.append((messages, assistant_message, kwargs))
        self.entered.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        raise AssertionError("unreachable")


@dataclass
class LoggingFailureProbeModel(ProbeModel):
    private_failure: str = "private provider URL, status body, key, and prompt"

    async def ainvoke(
        self,
        messages: list[Message],
        assistant_message: Message,
        **kwargs: Any,
    ) -> ModelResponse:
        self.calls.append((messages, assistant_message, kwargs))
        log_error(self.private_failure)
        raise RuntimeError(self.private_failure)


@dataclass
class NamespacedLoggingProbeModel(ProbeModel):
    logger_name: str = "openai.task7_default"
    private_failure: str = "private SDK URL, status body, key, and exception"
    entered: asyncio.Event = field(default_factory=asyncio.Event)
    release: asyncio.Event = field(default_factory=asyncio.Event)

    async def ainvoke(
        self,
        messages: list[Message],
        assistant_message: Message,
        **kwargs: Any,
    ) -> ModelResponse:
        self.calls.append((messages, assistant_message, kwargs))
        logging.getLogger(self.logger_name).error(self.private_failure)
        self.entered.set()
        await self.release.wait()
        return ModelResponse(role="assistant", content="verified")


class ExplosiveStatusProviderError(ModelProviderError):
    def __getattribute__(self, name: str) -> Any:
        if name == "status_code":
            raise RuntimeError("private status property secret")
        return super().__getattribute__(name)


class ExplosiveStrip(str):
    def strip(self, *_args: object, **_kwargs: object) -> str:
        raise RuntimeError("private response strip secret")


class ExplosiveContentResponse(ModelResponse):
    def __getattribute__(self, name: str) -> Any:
        if name == "content":
            raise RuntimeError("private response content secret")
        return super().__getattribute__(name)


def _managed(model: Model, closed: list[bool] | None = None) -> ManagedModel:
    async def close_callback() -> None:
        if closed is not None:
            closed.append(True)

    return ManagedModel(model=model, close_callback=close_callback)


def test_verifier_invokes_model_once_without_tools_and_leaves_it_open() -> None:
    async def scenario() -> None:
        model = ProbeModel()
        closed: list[bool] = []

        result = await verify_model(_managed(model, closed), timeout_seconds=5)

        assert result == ModelVerificationResult(ok=True, category="success")
        assert len(model.calls) == 1
        messages, assistant_message, kwargs = model.calls[0]
        assert [(message.role, message.content) for message in messages] == [
            ("user", "Reply with one short confirmation word.")
        ]
        assert assistant_message.role == "assistant"
        assert kwargs == {"tools": None}
        assert closed == []

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "response",
    [
        ModelResponse(role="assistant", content=None),
        ModelResponse(role="assistant", content=""),
        ModelResponse(role="assistant", content=" \r\n\t "),
        ModelResponse(role="assistant", content=7),
        SimpleNamespace(content="not an Agno response"),
        object(),
    ],
    ids=[
        "none-content",
        "empty-content",
        "whitespace-content",
        "wrong-content-type",
        "wrong-response-type",
        "malformed-response",
    ],
)
def test_invalid_provider_responses_map_to_unreachable(response: object) -> None:
    async def scenario() -> None:
        result = await verify_model(
            _managed(ProbeModel(responses=[response])),
            timeout_seconds=5,
        )

        assert result == ModelVerificationResult(
            ok=False,
            category="provider_unreachable",
        )

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "response",
    [
        ModelResponse(role="assistant", content=ExplosiveStrip("looks valid")),
        ExplosiveContentResponse(role="assistant", content="looks valid"),
    ],
    ids=["str-subclass-strip", "model-response-subclass-content"],
)
def test_response_validation_never_executes_untrusted_object_magic(
    response: object,
    caplog: pytest.LogCaptureFixture,
    capfd: pytest.CaptureFixture[str],
) -> None:
    caplog.set_level(logging.DEBUG)

    try:
        result = asyncio.run(
            verify_model(
                _managed(ProbeModel(responses=[response])),
                timeout_seconds=5,
            )
        )
    except BaseException as error:  # pragma: no cover - RED safety assertion
        pytest.fail(f"response validation escaped {type(error).__name__}")

    assert result == ModelVerificationResult(False, "provider_unreachable")
    assert "private response" not in caplog.text
    assert capfd.readouterr() == ("", "")


def test_provider_response_body_is_discarded_without_output_or_logs(
    caplog: pytest.LogCaptureFixture,
    capfd: pytest.CaptureFixture[str],
) -> None:
    private_content = "private response with key, URL, status body, and prompt"
    caplog.set_level(logging.DEBUG)

    result = asyncio.run(
        verify_model(
            _managed(
                ProbeModel(
                    responses=[ModelResponse(role="assistant", content=private_content)]
                )
            ),
            timeout_seconds=5,
        )
    )

    assert result == ModelVerificationResult(ok=True, category="success")
    assert private_content not in repr(result)
    assert private_content not in caplog.text
    assert capfd.readouterr() == ("", "")


def test_verification_result_exposes_only_the_fixed_category_contract() -> None:
    assert get_args(VerificationCategory) == (
        "success",
        "credential_rejected",
        "model_not_found",
        "provider_unreachable",
        "provider_timeout",
    )
    assert ModelVerificationResult._fields == ("ok", "category")


@pytest.mark.parametrize(
    ("failure", "expected"),
    [
        (
            ModelAuthenticationError("private authentication body"),
            "credential_rejected",
        ),
        (
            ModelProviderError("private 401 body", status_code=401),
            "credential_rejected",
        ),
        (
            ModelProviderError("private 403 body", status_code=403),
            "credential_rejected",
        ),
        (
            ModelProviderError("private missing model", status_code=404),
            "model_not_found",
        ),
        (
            ModelProviderError("private request timeout", status_code=408),
            "provider_timeout",
        ),
        (
            ModelProviderError("private gateway timeout", status_code=504),
            "provider_timeout",
        ),
        (
            ModelProviderError("private bad request", status_code=400),
            "provider_unreachable",
        ),
        (
            RuntimeError("private URL, status body, key, and prompt"),
            "provider_unreachable",
        ),
    ],
)
def test_provider_failures_map_without_retry_or_raw_details(
    failure: Exception,
    expected: VerificationCategory,
    caplog: pytest.LogCaptureFixture,
    capfd: pytest.CaptureFixture[str],
) -> None:
    async def scenario() -> tuple[ModelVerificationResult, ProbeModel]:
        model = ProbeModel(
            responses=[
                failure,
                ModelResponse(role="assistant", content="retry must not happen"),
            ]
        )
        result = await verify_model(_managed(model), timeout_seconds=5)
        return result, model

    caplog.set_level(logging.DEBUG)
    result, model = asyncio.run(scenario())

    assert result == ModelVerificationResult(ok=False, category=expected)
    assert len(model.calls) == 1
    assert len(model.responses) == 1
    assert str(failure) not in repr(result)
    assert str(failure) not in caplog.text
    assert capfd.readouterr() == ("", "")


@pytest.mark.parametrize(
    "status_code",
    [[], True, "401", object()],
    ids=["unhashable", "bool", "string", "object"],
)
def test_malformed_provider_status_is_always_unreachable_and_sanitized(
    status_code: object,
    caplog: pytest.LogCaptureFixture,
    capfd: pytest.CaptureFixture[str],
) -> None:
    caplog.set_level(logging.DEBUG)
    failure = ModelProviderError(
        "private malformed status secret",
        status_code=cast(Any, status_code),
    )

    try:
        result = asyncio.run(
            verify_model(
                _managed(ProbeModel(responses=[failure])),
                timeout_seconds=5,
            )
        )
    except BaseException as error:  # pragma: no cover - RED safety assertion
        pytest.fail(f"status classification escaped {type(error).__name__}")

    assert result == ModelVerificationResult(False, "provider_unreachable")
    assert "private malformed status secret" not in caplog.text
    assert capfd.readouterr() == ("", "")


def test_throwing_provider_status_accessor_is_unreachable_and_sanitized(
    caplog: pytest.LogCaptureFixture,
    capfd: pytest.CaptureFixture[str],
) -> None:
    caplog.set_level(logging.DEBUG)
    failure = ExplosiveStatusProviderError("private provider error secret")

    try:
        result = asyncio.run(
            verify_model(
                _managed(ProbeModel(responses=[failure])),
                timeout_seconds=5,
            )
        )
    except BaseException as error:  # pragma: no cover - RED safety assertion
        pytest.fail(f"status accessor escaped {type(error).__name__}")

    assert result == ModelVerificationResult(False, "provider_unreachable")
    assert "private" not in caplog.text
    assert capfd.readouterr() == ("", "")


def test_verification_suppresses_raw_adapter_error_logs(
    capfd: pytest.CaptureFixture[str],
) -> None:
    model = LoggingFailureProbeModel()

    result = asyncio.run(verify_model(_managed(model), timeout_seconds=5))

    assert result == ModelVerificationResult(False, "provider_unreachable")
    captured = capfd.readouterr()
    assert captured == ("", "")
    assert model.private_failure not in captured.out
    assert model.private_failure not in captured.err

    log_error("ordinary non-verification log")
    ordinary = capfd.readouterr()
    assert ordinary.out + ordinary.err
    assert model.private_failure not in ordinary.out + ordinary.err


def test_verification_log_suppression_is_task_local_and_filter_is_idempotent(
    capfd: pytest.CaptureFixture[str],
) -> None:
    async def scenario() -> None:
        model = BlockingProbeModel()
        verification = asyncio.create_task(
            verify_model(_managed(model), timeout_seconds=50)
        )
        await model.entered.wait()

        log_error("ordinary concurrent task log")
        verification.cancel()
        with pytest.raises(asyncio.CancelledError):
            await verification

        await verify_model(_managed(ProbeModel()), timeout_seconds=5)

    asyncio.run(scenario())

    captured = capfd.readouterr()
    assert captured.out + captured.err
    assert (
        sum(
            item is model_verifier._VERIFICATION_LOG_FILTER
            for item in model_verifier.agno_log.logger.filters
        )
        == 1
    )


SENSITIVE_LOGGER_PREFIXES = (
    "agno",
    "agno-team",
    "agno-workflow",
    "openai",
    "anthropic",
    "google_genai",
    "google.genai",
    "httpx",
    "httpcore",
)


def test_sensitive_logger_prefixes_match_locked_provider_dependencies() -> None:
    assert model_verifier._SENSITIVE_LOGGER_PREFIXES == SENSITIVE_LOGGER_PREFIXES


@pytest.mark.parametrize("logger_prefix", SENSITIVE_LOGGER_PREFIXES)
def test_existing_sensitive_logger_handlers_suppress_only_verification_task(
    logger_prefix: str,
) -> None:
    logger_name = f"{logger_prefix}.task7_existing_handler"
    logger = logging.getLogger(logger_name)
    output = StringIO()
    handler = logging.StreamHandler(output)
    original_level = logger.level
    original_propagate = logger.propagate
    logger.setLevel(logging.ERROR)
    logger.propagate = False
    logger.addHandler(handler)

    async def scenario() -> None:
        model = NamespacedLoggingProbeModel(logger_name=logger_name)
        verification = asyncio.create_task(
            verify_model(_managed(model), timeout_seconds=5)
        )
        await model.entered.wait()

        logger.error("ordinary concurrent SDK log")
        model.release.set()
        assert await verification == ModelVerificationResult(True, "success")

        await verify_model(_managed(ProbeModel()), timeout_seconds=5)

    try:
        asyncio.run(scenario())
        rendered = output.getvalue()
        assert "ordinary concurrent SDK log" in rendered
        assert "private SDK" not in rendered
        assert (
            sum(
                item is model_verifier._VERIFICATION_LOG_FILTER
                for item in logger.filters
            )
            == 1
        )
        assert (
            sum(
                item is model_verifier._VERIFICATION_LOG_FILTER
                for item in handler.filters
            )
            == 1
        )
    finally:
        logger.removeHandler(handler)
        logger.setLevel(original_level)
        logger.propagate = original_propagate


@pytest.mark.parametrize("logger_prefix", SENSITIVE_LOGGER_PREFIXES)
def test_lazy_sensitive_child_logger_is_filtered_by_root_handler(
    logger_prefix: str,
) -> None:
    logger_name = f"{logger_prefix}.task7_lazy_child"
    root_logger = logging.getLogger()
    namespace_logger = logging.getLogger(logger_prefix)
    original_namespace_propagate = namespace_logger.propagate
    if logger_prefix in {"agno", "agno-team", "agno-workflow"}:
        namespace_logger.propagate = True
    output = StringIO()
    handler = logging.StreamHandler(output)
    handler.setLevel(logging.ERROR)
    root_logger.addHandler(handler)

    async def scenario() -> None:
        model = NamespacedLoggingProbeModel(logger_name=logger_name)
        verification = asyncio.create_task(
            verify_model(_managed(model), timeout_seconds=5)
        )
        await model.entered.wait()

        logging.getLogger(logger_name).error("ordinary lazy SDK log")
        model.release.set()
        assert await verification == ModelVerificationResult(True, "success")

        await verify_model(_managed(ProbeModel()), timeout_seconds=5)

    try:
        asyncio.run(scenario())
        rendered = output.getvalue()
        assert len(rendered.splitlines()) == 1
        assert "ordinary lazy SDK log" in rendered or "agno_runtime_error" in rendered
        assert "private SDK" not in rendered
        assert (
            sum(
                item is model_verifier._VERIFICATION_LOG_FILTER
                for item in handler.filters
            )
            == 1
        )
        child_logger = logging.getLogger(logger_name)
        assert (
            sum(
                item is model_verifier._VERIFICATION_LOG_FILTER
                for item in child_logger.filters
            )
            == 1
        )
    finally:
        root_logger.removeHandler(handler)
        namespace_logger.propagate = original_namespace_propagate


def test_verifier_timeout_cancels_the_only_invocation_without_closing() -> None:
    async def scenario() -> None:
        model = BlockingProbeModel()
        closed: list[bool] = []

        result = await verify_model(_managed(model, closed), timeout_seconds=1)

        assert result == ModelVerificationResult(
            ok=False,
            category="provider_timeout",
        )
        assert len(model.calls) == 1
        assert model.cancelled is True
        assert closed == []

    asyncio.run(scenario())


def test_caller_cancellation_propagates_and_cancels_provider_invocation() -> None:
    async def scenario() -> None:
        model = BlockingProbeModel()
        verification = asyncio.create_task(
            verify_model(_managed(model), timeout_seconds=50)
        )
        await model.entered.wait()

        verification.cancel()

        with pytest.raises(asyncio.CancelledError):
            await verification
        assert len(model.calls) == 1
        assert model.cancelled is True

    asyncio.run(scenario())


class IntSubclass(int):
    pass


@pytest.mark.parametrize("timeout_seconds", [True, 1.0, IntSubclass(5), 0, 51])
def test_verifier_rejects_timeouts_outside_integer_one_to_fifty(
    timeout_seconds: object,
) -> None:
    async def scenario() -> None:
        with pytest.raises(
            ValueError,
            match="^timeout_seconds must be an integer from 1 to 50$",
        ):
            await verify_model(
                _managed(ProbeModel()),
                timeout_seconds=cast(int, timeout_seconds),
            )

    asyncio.run(scenario())
