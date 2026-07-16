from importlib import import_module
import socket
import sys
from typing import cast

from agno.models.base import Model
from pydantic import SecretStr
import pytest

from agent_service.config import ActiveModelSettings, ModelProvider
import agent_service.model_registry as model_registry
from agent_service.model_registry import ModelFactory


EXPLICIT_API_KEY = "explicit-model-api-key"
MODEL_ID = "contract-model-id"
TIMEOUT_SECONDS = 23
CUSTOM_BASE_URL = "https://models.example.com/v1"
ALL_PROVIDERS: tuple[ModelProvider, ...] = (
    "openai",
    "anthropic",
    "google",
    "dashscope",
    "deepseek",
    "minimax",
)
PROVIDER_MODULES = (
    "agno.models.openai.responses",
    "agno.models.anthropic.claude",
    "agno.models.google.gemini",
    "agno.models.dashscope.dashscope",
    "agno.models.deepseek.deepseek",
    "agno.models.minimax.minimax",
)
ProviderCase = tuple[ModelProvider, str, str, str | None, tuple[str, ...]]
PROVIDER_CASES: tuple[ProviderCase, ...] = (
    (
        "openai",
        "agno.models.openai",
        "OpenAIResponses",
        CUSTOM_BASE_URL,
        ("OPENAI_API_KEY",),
    ),
    (
        "anthropic",
        "agno.models.anthropic",
        "Claude",
        None,
        ("ANTHROPIC_API_KEY",),
    ),
    (
        "google",
        "agno.models.google",
        "Gemini",
        None,
        ("GOOGLE_API_KEY",),
    ),
    (
        "dashscope",
        "agno.models.dashscope",
        "DashScope",
        CUSTOM_BASE_URL,
        ("DASHSCOPE_API_KEY", "QWEN_API_KEY"),
    ),
    (
        "deepseek",
        "agno.models.deepseek",
        "DeepSeek",
        CUSTOM_BASE_URL,
        ("DEEPSEEK_API_KEY",),
    ),
    (
        "minimax",
        "agno.models.minimax",
        "MiniMax",
        CUSTOM_BASE_URL,
        ("MINIMAX_API_KEY",),
    ),
)


@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_network(*args: object, **kwargs: object) -> None:
        raise AssertionError("model construction must not access the network")

    monkeypatch.setattr(socket, "create_connection", fail_network)


def make_settings(
    provider: ModelProvider,
    *,
    base_url: str | None = None,
) -> ActiveModelSettings:
    return ActiveModelSettings(
        provider=provider,
        model_id=MODEL_ID,
        api_key=SecretStr(EXPLICIT_API_KEY),
        base_url=base_url,
        timeout_seconds=TIMEOUT_SECONDS,
    )


def test_registry_does_not_eagerly_import_provider_modules() -> None:
    assert all(module_name not in sys.modules for module_name in PROVIDER_MODULES)


@pytest.mark.parametrize(
    ("provider", "module_name", "class_name", "base_url", "environment_names"),
    PROVIDER_CASES,
)
def test_build_model_constructs_exact_native_agno_model(
    provider: ModelProvider,
    module_name: str,
    class_name: str,
    base_url: str | None,
    environment_names: tuple[str, ...],
) -> None:
    del environment_names

    model = model_registry.build_model(make_settings(provider, base_url=base_url))
    expected_model_type = getattr(import_module(module_name), class_name)

    assert type(model) is expected_model_type
    assert model.id == MODEL_ID
    assert getattr(model, "api_key") == EXPLICIT_API_KEY
    assert getattr(model, "timeout") == TIMEOUT_SECONDS
    if base_url is not None:
        assert getattr(model, "base_url") == base_url
    else:
        assert not hasattr(model, "base_url")


@pytest.mark.parametrize(
    ("provider", "module_name", "class_name", "base_url", "environment_names"),
    PROVIDER_CASES,
)
def test_build_model_ignores_provider_specific_environment_keys(
    provider: ModelProvider,
    module_name: str,
    class_name: str,
    base_url: str | None,
    environment_names: tuple[str, ...],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    del module_name, class_name
    for environment_name in environment_names:
        monkeypatch.setenv(environment_name, "environment-model-api-key")

    model = model_registry.build_model(make_settings(provider, base_url=base_url))

    assert getattr(model, "api_key") == EXPLICIT_API_KEY
    assert EXPLICIT_API_KEY not in caplog.text


@pytest.mark.parametrize("selected_provider", ALL_PROVIDERS)
def test_build_model_calls_only_selected_factory(
    selected_provider: ModelProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[ModelProvider] = []
    selected_model = cast(Model, object())

    def factory_for(provider: ModelProvider) -> ModelFactory:
        def factory(settings: ActiveModelSettings, /) -> Model:
            calls.append(provider)
            return selected_model

        return factory

    factories: dict[ModelProvider, ModelFactory] = {
        provider: factory_for(provider) for provider in ALL_PROVIDERS
    }
    monkeypatch.setattr(model_registry, "MODEL_FACTORIES", factories)

    result = model_registry.build_model(make_settings(selected_provider))

    assert result is selected_model
    assert calls == [selected_provider]


def test_registry_contains_one_factory_for_each_supported_provider() -> None:
    assert set(model_registry.MODEL_FACTORIES) == set(ALL_PROVIDERS)
