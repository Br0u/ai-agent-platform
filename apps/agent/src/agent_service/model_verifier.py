"""One bounded, content-discarding Provider verification invocation."""

import asyncio
from contextvars import ContextVar
import logging
from typing import Literal, NamedTuple

from agno.exceptions import ModelAuthenticationError, ModelProviderError
from agno.models.message import Message
from agno.models.response import ModelResponse
from agno.utils import log as agno_log

from agent_service.model_runtime_types import ManagedModel


_VERIFICATION_PROMPT = "Reply with one short confirmation word."
_SENSITIVE_LOGGER_PREFIXES = (
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
_suppress_adapter_logs: ContextVar[bool] = ContextVar(
    "suppress_model_verification_adapter_logs",
    default=False,
)


class _VerificationLogFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        sensitive = any(
            record.name == prefix or record.name.startswith(f"{prefix}.")
            for prefix in _SENSITIVE_LOGGER_PREFIXES
        )
        return not (sensitive and _suppress_adapter_logs.get())


_VERIFICATION_LOG_FILTER = _VerificationLogFilter()

VerificationCategory = Literal[
    "success",
    "credential_rejected",
    "model_not_found",
    "provider_unreachable",
    "provider_timeout",
]


class ModelVerificationResult(NamedTuple):
    ok: bool
    category: VerificationCategory


def _failure_category(error: Exception) -> VerificationCategory:
    if isinstance(error, ModelAuthenticationError):
        return "credential_rejected"
    if isinstance(error, ModelProviderError):
        try:
            status_code = error.status_code
        except BaseException:
            return "provider_unreachable"
        if type(status_code) is not int:
            return "provider_unreachable"
        if status_code == 401 or status_code == 403:
            return "credential_rejected"
        if status_code == 404:
            return "model_not_found"
        if status_code == 408 or status_code == 504:
            return "provider_timeout"
    return "provider_unreachable"


def _install_verification_log_filter() -> None:
    root_logger = logging.getLogger()
    for handler in root_logger.handlers:
        handler.addFilter(_VERIFICATION_LOG_FILTER)

    for prefix in _SENSITIVE_LOGGER_PREFIXES:
        logging.getLogger(prefix)

    logger_registry = tuple(logging.Logger.manager.loggerDict.items())
    for logger_name, registered in logger_registry:
        if not isinstance(registered, logging.Logger):
            continue
        if not any(
            logger_name == prefix or logger_name.startswith(f"{prefix}.")
            for prefix in _SENSITIVE_LOGGER_PREFIXES
        ):
            continue
        registered.addFilter(_VERIFICATION_LOG_FILTER)
        for handler in registered.handlers:
            handler.addFilter(_VERIFICATION_LOG_FILTER)

    agno_logger = agno_log.logger
    if isinstance(agno_logger, logging.Logger):
        agno_logger.addFilter(_VERIFICATION_LOG_FILTER)
        for handler in agno_logger.handlers:
            handler.addFilter(_VERIFICATION_LOG_FILTER)


async def verify_model(
    managed: ManagedModel,
    *,
    timeout_seconds: int,
) -> ModelVerificationResult:
    """Execute one fixed probe and discard all model content."""
    if type(timeout_seconds) is not int or not 1 <= timeout_seconds <= 50:
        raise ValueError("timeout_seconds must be an integer from 1 to 50")
    _install_verification_log_filter()
    suppression_token = _suppress_adapter_logs.set(True)
    try:
        try:
            async with asyncio.timeout(timeout_seconds):
                response = await managed.model.ainvoke(
                    [Message(role="user", content=_VERIFICATION_PROMPT)],
                    Message(role="assistant"),
                    tools=None,
                )
        except TimeoutError:
            return ModelVerificationResult(ok=False, category="provider_timeout")
        except Exception as error:
            return ModelVerificationResult(ok=False, category=_failure_category(error))
        valid = (
            type(response) is ModelResponse
            and type(response.content) is str
            and bool(response.content.strip())
        )
        del response
        return ModelVerificationResult(
            ok=valid,
            category="success" if valid else "provider_unreachable",
        )
    finally:
        _suppress_adapter_logs.reset(suppression_token)
