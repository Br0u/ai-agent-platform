"""Deterministic registry for native Agno model adapters."""

from collections.abc import Mapping
from types import MappingProxyType
from typing import Final, Protocol, cast

from agno.models.base import Model

from agent_service.config import ActiveModelSettings, ModelProvider


_OPENAI_BASE_URL: Final = "https://api.openai.com/v1"
_ANTHROPIC_BASE_URL: Final = "https://api.anthropic.com"
_GEMINI_BASE_URL: Final = "https://generativelanguage.googleapis.com/"
_DASHSCOPE_BASE_URL: Final = (
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
)
_DEEPSEEK_BASE_URL: Final = "https://api.deepseek.com"
_MINIMAX_BASE_URL: Final = "https://api.minimax.io/v1"


class _RedactedApiKey(str):
    def __repr__(self) -> str:
        return "<redacted>"


class ModelFactory(Protocol):
    """Construct one Agno model from validated runtime settings."""

    def __call__(self, settings: ActiveModelSettings, /) -> Model: ...


def _api_key(settings: ActiveModelSettings) -> _RedactedApiKey:
    return _RedactedApiKey(settings.api_key.get_secret_value())


def _openai_default_headers(api_key: _RedactedApiKey) -> dict[str, str]:
    from openai import Omit

    return {
        "Authorization": _RedactedApiKey(f"Bearer {api_key}"),
        "OpenAI-Organization": cast(str, Omit()),
        "OpenAI-Project": cast(str, Omit()),
    }


def _openai_client_params() -> dict[str, str]:
    return {
        "admin_api_key": "",
        "project": "",
        "webhook_secret": "",
    }


def _anthropic_default_headers(api_key: _RedactedApiKey) -> dict[str, str]:
    from anthropic import Omit

    return {
        "X-Api-Key": api_key,
        "Authorization": cast(str, Omit()),
    }


def _build_openai_model(settings: ActiveModelSettings) -> Model:
    from agno.models.openai import OpenAIResponses

    api_key = _api_key(settings)
    return OpenAIResponses(
        id=settings.model_id,
        api_key=api_key,
        organization="",
        base_url=settings.base_url or _OPENAI_BASE_URL,
        timeout=settings.timeout_seconds,
        default_headers=_openai_default_headers(api_key),
        client_params=_openai_client_params(),
    )


def _build_anthropic_model(settings: ActiveModelSettings) -> Model:
    from agno.models.anthropic import Claude
    from anthropic import Anthropic, AsyncAnthropic

    api_key = _api_key(settings)

    return Claude(
        id=settings.model_id,
        api_key=api_key,
        timeout=settings.timeout_seconds,
        client=Anthropic(
            api_key=api_key,
            auth_token=None,
            webhook_key="",
            base_url=_ANTHROPIC_BASE_URL,
            timeout=settings.timeout_seconds,
            default_headers=_anthropic_default_headers(api_key),
        ),
        async_client=AsyncAnthropic(
            api_key=api_key,
            auth_token=None,
            webhook_key="",
            base_url=_ANTHROPIC_BASE_URL,
            timeout=settings.timeout_seconds,
            default_headers=_anthropic_default_headers(api_key),
        ),
    )


def _build_google_model(settings: ActiveModelSettings) -> Model:
    from agno.models.google import Gemini
    from google import genai
    from google.genai.client import DebugConfig

    api_key = _api_key(settings)
    # Developer API mode ignores the SDK's inactive environment-derived
    # project and location fields; the explicit endpoint keeps requests isolated.
    client = genai.Client(
        vertexai=False,
        api_key=api_key,
        debug_config=DebugConfig(
            client_mode=None,
            replays_directory=None,
            replay_id=None,
        ),
        http_options={
            "base_url": _GEMINI_BASE_URL,
            "timeout": settings.timeout_seconds * 1000,
        },
    )

    return Gemini(
        id=settings.model_id,
        api_key=api_key,
        timeout=settings.timeout_seconds,
        vertexai=False,
        project_id=None,
        location=None,
        client=client,
    )


def _build_dashscope_model(settings: ActiveModelSettings) -> Model:
    from agno.models.dashscope import DashScope

    api_key = _api_key(settings)
    return DashScope(
        id=settings.model_id,
        api_key=api_key,
        organization="",
        base_url=settings.base_url or _DASHSCOPE_BASE_URL,
        timeout=settings.timeout_seconds,
        default_headers=_openai_default_headers(api_key),
        client_params=_openai_client_params(),
    )


def _build_deepseek_model(settings: ActiveModelSettings) -> Model:
    from agno.models.deepseek import DeepSeek

    api_key = _api_key(settings)
    return DeepSeek(
        id=settings.model_id,
        api_key=api_key,
        organization="",
        base_url=settings.base_url or _DEEPSEEK_BASE_URL,
        timeout=settings.timeout_seconds,
        default_headers=_openai_default_headers(api_key),
        client_params=_openai_client_params(),
    )


def _build_minimax_model(settings: ActiveModelSettings) -> Model:
    from agno.models.minimax import MiniMax

    api_key = _api_key(settings)
    return MiniMax(
        id=settings.model_id,
        api_key=api_key,
        organization="",
        base_url=settings.base_url or _MINIMAX_BASE_URL,
        timeout=settings.timeout_seconds,
        default_headers=_openai_default_headers(api_key),
        client_params=_openai_client_params(),
    )


_MODEL_FACTORIES: Final[Mapping[ModelProvider, ModelFactory]] = MappingProxyType(
    {
        "openai": _build_openai_model,
        "anthropic": _build_anthropic_model,
        "google": _build_google_model,
        "dashscope": _build_dashscope_model,
        "deepseek": _build_deepseek_model,
        "minimax": _build_minimax_model,
    }
)


def build_model(settings: ActiveModelSettings) -> Model:
    """Build only the explicitly selected native Agno model."""
    return _MODEL_FACTORIES[settings.provider](settings)
