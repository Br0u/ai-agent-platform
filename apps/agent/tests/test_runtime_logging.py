from importlib import import_module
import io
import logging
from typing import Any

from agno.exceptions import ModelProviderError
from agno.models.message import Message
from agno.models.openai import OpenAIResponses
import httpx
from openai import APIStatusError
import pytest


RAW_SECRET = "dynamic-provider-secret"


def _runtime_logging() -> Any:
    return import_module("agent_service.runtime_logging")


def _failing_openai_model(monkeypatch: pytest.MonkeyPatch) -> OpenAIResponses:
    request = httpx.Request(
        "POST",
        f"https://{RAW_SECRET}.invalid/v1/responses?key={RAW_SECRET}",
    )
    response = httpx.Response(
        500,
        request=request,
        json={"error": {"message": RAW_SECRET}},
    )
    provider_error = APIStatusError(
        f"provider body contained {RAW_SECRET}",
        response=response,
        body={"error": {"message": RAW_SECRET}},
    )

    class FailingResponses:
        def create(self, **_: object) -> None:
            raise provider_error

    class FailingClient:
        responses = FailingResponses()

    model = OpenAIResponses(id="logging-test", api_key=RAW_SECRET)
    monkeypatch.setattr(model, "get_client", lambda: FailingClient())
    return model


def _invoke(model: OpenAIResponses) -> None:
    with pytest.raises(ModelProviderError):
        model.invoke(
            [Message(role="user", content="hello")],
            Message(role="assistant"),
        )


def test_install_redacts_dynamic_openai_status_error_from_agno_stderr_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime_logging = _runtime_logging()
    model = _failing_openai_model(monkeypatch)
    logger = logging.getLogger("agno")
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(message)s"))
    original_handlers = logger.handlers[:]
    logger.handlers = [handler]
    try:
        _invoke(model)
        assert RAW_SECRET in stream.getvalue()

        stream.seek(0)
        stream.truncate()
        runtime_logging.install_agno_log_redaction()
        _invoke(model)

        assert stream.getvalue().strip() == "agno_runtime_error"
        assert RAW_SECRET not in stream.getvalue()
    finally:
        logger.handlers = original_handlers


def test_redaction_clears_all_dynamic_exception_and_formatting_fields() -> None:
    runtime_logging = _runtime_logging()
    logger = logging.getLogger("agno")
    captured: list[logging.LogRecord] = []

    class CaptureHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    handler = CaptureHandler()
    original_handlers = logger.handlers[:]
    logger.handlers = [handler]
    try:
        runtime_logging.install_agno_log_redaction()
        try:
            raise RuntimeError(RAW_SECRET)
        except RuntimeError:
            logger.error(
                "provider failure %s",
                RAW_SECRET,
                exc_info=True,
                stack_info=True,
            )

        record = captured[-1]
        assert record.msg == "agno_runtime_error"
        assert record.args == ()
        assert record.exc_info is None
        assert record.exc_text is None
        assert record.stack_info is None
    finally:
        logger.handlers = original_handlers


def test_redaction_preserves_info_messages_and_is_idempotent() -> None:
    runtime_logging = _runtime_logging()
    logger = logging.getLogger("agno")
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(message)s"))
    original_handlers = logger.handlers[:]
    logger.handlers = [handler]
    try:
        runtime_logging.install_agno_log_redaction()
        runtime_logging.install_agno_log_redaction()
        logger.log(logging.INFO, "safe info %s", "context")

        assert stream.getvalue().strip() == "safe info context"
        assert len(handler.filters) == 1
    finally:
        logger.handlers = original_handlers
