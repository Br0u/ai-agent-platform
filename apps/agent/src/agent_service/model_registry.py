"""Deterministic registry for native Agno model adapters."""

from collections.abc import Mapping
from typing import Protocol

from agno.models.base import Model

from agent_service.config import ActiveModelSettings, ModelProvider


class ModelFactory(Protocol):
    """Construct one Agno model from validated runtime settings."""

    def __call__(self, settings: ActiveModelSettings, /) -> Model: ...


def _build_openai_model(settings: ActiveModelSettings) -> Model:
    from agno.models.openai import OpenAIResponses

    if settings.base_url is None:
        return OpenAIResponses(
            id=settings.model_id,
            api_key=settings.api_key.get_secret_value(),
            timeout=settings.timeout_seconds,
        )
    return OpenAIResponses(
        id=settings.model_id,
        api_key=settings.api_key.get_secret_value(),
        base_url=settings.base_url,
        timeout=settings.timeout_seconds,
    )


def _build_anthropic_model(settings: ActiveModelSettings) -> Model:
    from agno.models.anthropic import Claude

    return Claude(
        id=settings.model_id,
        api_key=settings.api_key.get_secret_value(),
        timeout=settings.timeout_seconds,
    )


def _build_google_model(settings: ActiveModelSettings) -> Model:
    from agno.models.google import Gemini

    return Gemini(
        id=settings.model_id,
        api_key=settings.api_key.get_secret_value(),
        timeout=settings.timeout_seconds,
    )


def _build_dashscope_model(settings: ActiveModelSettings) -> Model:
    from agno.models.dashscope import DashScope

    if settings.base_url is None:
        return DashScope(
            id=settings.model_id,
            api_key=settings.api_key.get_secret_value(),
            timeout=settings.timeout_seconds,
        )
    return DashScope(
        id=settings.model_id,
        api_key=settings.api_key.get_secret_value(),
        base_url=settings.base_url,
        timeout=settings.timeout_seconds,
    )


def _build_deepseek_model(settings: ActiveModelSettings) -> Model:
    from agno.models.deepseek import DeepSeek

    if settings.base_url is None:
        return DeepSeek(
            id=settings.model_id,
            api_key=settings.api_key.get_secret_value(),
            timeout=settings.timeout_seconds,
        )
    return DeepSeek(
        id=settings.model_id,
        api_key=settings.api_key.get_secret_value(),
        base_url=settings.base_url,
        timeout=settings.timeout_seconds,
    )


def _build_minimax_model(settings: ActiveModelSettings) -> Model:
    from agno.models.minimax import MiniMax

    if settings.base_url is None:
        return MiniMax(
            id=settings.model_id,
            api_key=settings.api_key.get_secret_value(),
            timeout=settings.timeout_seconds,
        )
    return MiniMax(
        id=settings.model_id,
        api_key=settings.api_key.get_secret_value(),
        base_url=settings.base_url,
        timeout=settings.timeout_seconds,
    )


MODEL_FACTORIES: Mapping[ModelProvider, ModelFactory] = {
    "openai": _build_openai_model,
    "anthropic": _build_anthropic_model,
    "google": _build_google_model,
    "dashscope": _build_dashscope_model,
    "deepseek": _build_deepseek_model,
    "minimax": _build_minimax_model,
}


def build_model(settings: ActiveModelSettings) -> Model:
    """Build only the explicitly selected native Agno model."""
    return MODEL_FACTORIES[settings.provider](settings)
