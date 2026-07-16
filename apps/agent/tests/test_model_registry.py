import asyncio
from importlib import import_module
import os
from pathlib import Path
from types import MappingProxyType
import socket
import subprocess
import sys
from typing import Any, cast

from agno.models.base import Model
import httpx
from pydantic import SecretStr, ValidationError
import pytest

from agent_service.config import ActiveModelSettings, ModelProvider, RuntimeSettings
import agent_service.model_registry as model_registry
from agent_service.model_registry import ModelFactory


EXPLICIT_API_KEY = "explicit-model-api-key"
MODEL_ID = "contract-model-id"
TIMEOUT_SECONDS = 23
CUSTOM_BASE_URL = "https://models.example.com/v1"
OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"
ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com"
GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com"
RUNTIME_DATABASE_URL = (
    "postgresql+psycopg_async://runtime:runtime-password@db:5432/platform"
)
RUNTIME_SECURITY_KEY = "internal-security-key-0123456789abcdef"
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
OpenAICompatibleEndpointCase = tuple[ModelProvider, str | None, str]
OPENAI_COMPATIBLE_ENDPOINT_CASES: tuple[OpenAICompatibleEndpointCase, ...] = (
    ("openai", None, OPENAI_DEFAULT_BASE_URL),
    ("openai", CUSTOM_BASE_URL, CUSTOM_BASE_URL),
    (
        "dashscope",
        None,
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    ),
    ("dashscope", CUSTOM_BASE_URL, CUSTOM_BASE_URL),
    ("deepseek", None, "https://api.deepseek.com"),
    ("deepseek", CUSTOM_BASE_URL, CUSTOM_BASE_URL),
    ("minimax", None, "https://api.minimax.io/v1"),
    ("minimax", CUSTOM_BASE_URL, CUSTOM_BASE_URL),
)
POISONED_PROVIDER_ENVIRONMENT = {
    "OPENAI_API_KEY": "poison-openai-key",
    "OPENAI_ADMIN_KEY": "poison-openai-admin-key",
    "OPENAI_BASE_URL": "https://poison-openai.invalid/v1",
    "OPENAI_ORG_ID": "poison-openai-organization",
    "OPENAI_PROJECT_ID": "poison-openai-project",
    "ANTHROPIC_API_KEY": "poison-anthropic-key",
    "ANTHROPIC_AUTH_TOKEN": "poison-anthropic-token",
    "ANTHROPIC_BASE_URL": "https://poison-anthropic.invalid",
    "ANTHROPIC_WEBHOOK_SIGNING_KEY": "poison-anthropic-webhook-key",
    "GOOGLE_API_KEY": "poison-google-key",
    "GOOGLE_GENAI_USE_VERTEXAI": "true",
    "GOOGLE_GENAI_USE_ENTERPRISE": "true",
    "GOOGLE_CLOUD_PROJECT": "poison-google-project",
    "GOOGLE_CLOUD_LOCATION": "poison-google-location",
    "DASHSCOPE_API_KEY": "poison-dashscope-key",
    "QWEN_API_KEY": "poison-qwen-key",
    "DEEPSEEK_API_KEY": "poison-deepseek-key",
    "MINIMAX_API_KEY": "poison-minimax-key",
}


@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_network(*args: object, **kwargs: object) -> None:
        raise AssertionError("model construction must not access the network")

    monkeypatch.setattr(socket, "create_connection", fail_network)


@pytest.fixture
def poisoned_provider_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in POISONED_PROVIDER_ENVIRONMENT.items():
        monkeypatch.setenv(name, value)


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


def get_client(model: Model) -> Any:
    return getattr(model, "get_client")()


def normalized_base_url(client: Any) -> str:
    return str(client.base_url).rstrip("/")


def has_explicit_api_key(client: Any) -> bool:
    return bool(client.api_key == EXPLICIT_API_KEY)


def model_repr_contains_explicit_api_key(model: Model) -> bool:
    return EXPLICIT_API_KEY in repr(model)


def invoke_openai_compatible_client(client: Any, provider: ModelProvider) -> None:
    if provider == "openai":
        client.responses.create(model=MODEL_ID, input="ping")
        return
    client.chat.completions.create(
        model=MODEL_ID,
        messages=[{"role": "user", "content": "ping"}],
    )


async def invoke_openai_compatible_async_client(
    client: Any,
    provider: ModelProvider,
) -> None:
    if provider == "openai":
        await client.responses.create(model=MODEL_ID, input="ping")
        return
    await client.chat.completions.create(
        model=MODEL_ID,
        messages=[{"role": "user", "content": "ping"}],
    )


def test_registry_does_not_eagerly_import_provider_modules() -> None:
    script = (
        "import sys\n"
        "import agent_service.model_registry\n"
        f"provider_modules = {PROVIDER_MODULES!r}\n"
        "loaded = [name for name in provider_modules if name in sys.modules]\n"
        "if loaded:\n"
        "    raise SystemExit(','.join(loaded))\n"
    )

    source_root = str(Path(__file__).resolve().parents[1] / "src")
    inherited_pythonpath = os.environ.get("PYTHONPATH")
    pythonpath = os.pathsep.join(
        [source_root, inherited_pythonpath]
        if inherited_pythonpath
        else [source_root]
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "PYTHONPATH": pythonpath},
    )

    assert result.returncode == 0, result.stderr or result.stdout


@pytest.mark.parametrize(
    ("provider", "environment_name", "payload"),
    [
        (
            "openai",
            "OPENAI_CUSTOM_HEADERS",
            "Authorization: Bearer rejected-openai-header",
        ),
        (
            "anthropic",
            "ANTHROPIC_CUSTOM_HEADERS",
            "X-Api-Key: rejected-anthropic-header",
        ),
    ],
)
def test_runtime_rejects_custom_headers_before_model_build(
    provider: ModelProvider,
    environment_name: str,
    payload: str,
) -> None:
    with pytest.raises(ValidationError):
        settings = RuntimeSettings.model_validate(
            {
                "OS_SECURITY_KEY": RUNTIME_SECURITY_KEY,
                "AGNO_DATABASE_URL": RUNTIME_DATABASE_URL,
                "AGENT_ENABLED": True,
                "MODEL_PROVIDER": provider,
                "MODEL_ID": MODEL_ID,
                "MODEL_API_KEY": EXPLICIT_API_KEY,
                environment_name: payload,
            }
        )
        active_model = settings.active_model
        assert active_model is not None
        model_registry.build_model(active_model)


@pytest.mark.parametrize("provider", ALL_PROVIDERS)
def test_model_repr_never_contains_raw_api_key(provider: ModelProvider) -> None:
    model = model_registry.build_model(make_settings(provider))
    get_client(model)
    repr_leaks_api_key = model_repr_contains_explicit_api_key(model)

    assert not repr_leaks_api_key


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


@pytest.mark.parametrize(
    ("provider", "base_url", "expected_base_url"),
    OPENAI_COMPATIBLE_ENDPOINT_CASES,
)
def test_openai_compatible_client_ignores_poisoned_environment(
    provider: ModelProvider,
    base_url: str | None,
    expected_base_url: str,
    poisoned_provider_environment: None,
) -> None:
    model = model_registry.build_model(make_settings(provider, base_url=base_url))

    client = get_client(model)

    assert normalized_base_url(client) == expected_base_url
    assert has_explicit_api_key(client)


@pytest.mark.parametrize("provider", ("openai", "dashscope", "deepseek", "minimax"))
def test_openai_compatible_requests_ignore_poisoned_custom_auth_headers(
    provider: ModelProvider,
    poisoned_provider_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RequestCaptured(BaseException):
        pass

    captured_requests: list[httpx.Request] = []

    def capture_request(
        client: httpx.Client,
        request: httpx.Request,
        **kwargs: object,
    ) -> httpx.Response:
        del client, kwargs
        captured_requests.append(request)
        raise RequestCaptured

    async def capture_async_request(
        client: httpx.AsyncClient,
        request: httpx.Request,
        **kwargs: object,
    ) -> httpx.Response:
        del client, kwargs
        captured_requests.append(request)
        raise RequestCaptured

    monkeypatch.setattr(httpx.Client, "send", capture_request)
    monkeypatch.setattr(httpx.AsyncClient, "send", capture_async_request)
    monkeypatch.setenv(
        "OPENAI_CUSTOM_HEADERS",
        "Authorization: Bearer poison-openai-auth\n"
        "OpenAI-Project: poison-header-project",
    )
    model = model_registry.build_model(make_settings(provider))

    with pytest.raises(RequestCaptured):
        invoke_openai_compatible_client(get_client(model), provider)
    with pytest.raises(RequestCaptured):
        asyncio.run(
            invoke_openai_compatible_async_client(
                getattr(model, "get_async_client")(),
                provider,
            )
        )

    assert len(captured_requests) == 2
    for request in captured_requests:
        uses_explicit_authorization = (
            request.headers.get("authorization")
            == f"Bearer {EXPLICIT_API_KEY}"
        )
        project_header_is_absent = "openai-project" not in request.headers
        assert uses_explicit_authorization
        assert project_header_is_absent


def test_anthropic_clients_ignore_poisoned_endpoint_and_auth_token(
    poisoned_provider_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RequestCaptured(BaseException):
        pass

    captured_requests: list[httpx.Request] = []

    def capture_request(
        client: httpx.Client,
        request: httpx.Request,
        **kwargs: object,
    ) -> httpx.Response:
        del client, kwargs
        captured_requests.append(request)
        raise RequestCaptured

    async def capture_async_request(
        client: httpx.AsyncClient,
        request: httpx.Request,
        **kwargs: object,
    ) -> httpx.Response:
        del client, kwargs
        captured_requests.append(request)
        raise RequestCaptured

    monkeypatch.setattr(httpx.Client, "send", capture_request)
    monkeypatch.setattr(httpx.AsyncClient, "send", capture_async_request)
    monkeypatch.setenv(
        "ANTHROPIC_CUSTOM_HEADERS",
        "X-Api-Key: poison-anthropic-key\n"
        "Authorization: Bearer poison-anthropic-auth",
    )
    model = model_registry.build_model(make_settings("anthropic"))

    client = get_client(model)
    async_client = getattr(model, "get_async_client")()

    assert normalized_base_url(client) == ANTHROPIC_DEFAULT_BASE_URL
    assert normalized_base_url(async_client) == ANTHROPIC_DEFAULT_BASE_URL
    assert client.auth_token is None
    assert async_client.auth_token is None
    assert has_explicit_api_key(client)
    assert has_explicit_api_key(async_client)
    with pytest.raises(RequestCaptured):
        client.messages.create(
            model=MODEL_ID,
            max_tokens=1,
            messages=[{"role": "user", "content": "ping"}],
        )
    with pytest.raises(RequestCaptured):
        asyncio.run(
            async_client.messages.create(
                model=MODEL_ID,
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
        )

    assert len(captured_requests) == 2
    for request in captured_requests:
        uses_explicit_api_key = request.headers.get("x-api-key") == EXPLICIT_API_KEY
        authorization_is_absent = "authorization" not in request.headers
        assert uses_explicit_api_key
        assert authorization_is_absent


def test_gemini_client_ignores_poisoned_vertex_project_and_credentials(
    poisoned_provider_environment: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RequestCaptured(BaseException):
        pass

    captured_requests: list[httpx.Request] = []

    def capture_request(
        client: httpx.Client,
        request: httpx.Request,
        **kwargs: object,
    ) -> httpx.Response:
        del client, kwargs
        captured_requests.append(request)
        raise RequestCaptured

    monkeypatch.setattr(httpx.Client, "send", capture_request)
    model = model_registry.build_model(make_settings("google"))

    client = get_client(model)

    assert client.vertexai is False
    with pytest.raises(RequestCaptured):
        client.models.generate_content(model=MODEL_ID, contents="ping")

    assert len(captured_requests) == 1
    request = captured_requests[0]
    request_uses_explicit_key = request.headers.get("x-goog-api-key") == EXPLICIT_API_KEY
    assert request.url.host == "generativelanguage.googleapis.com"
    assert request.url.path == f"/v1beta/models/{MODEL_ID}:generateContent"
    assert "poison-google-project" not in str(request.url)
    assert "poison-google-location" not in str(request.url)
    assert request_uses_explicit_key


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
    monkeypatch.setattr(model_registry, "_MODEL_FACTORIES", factories)

    result = model_registry.build_model(make_settings(selected_provider))

    assert result is selected_model
    assert calls == [selected_provider]


def test_registry_contains_one_factory_for_each_supported_provider() -> None:
    assert set(model_registry._MODEL_FACTORIES) == set(ALL_PROVIDERS)


def test_registry_factory_mapping_is_runtime_immutable() -> None:
    factories = model_registry._MODEL_FACTORIES

    assert isinstance(factories, MappingProxyType)
    with pytest.raises(TypeError):
        cast(dict[ModelProvider, ModelFactory], factories)["openai"] = factories[
            "openai"
        ]


def test_openai_client_params_are_isolated_between_models() -> None:
    first = model_registry.build_model(make_settings("openai"))
    second = model_registry.build_model(make_settings("openai"))

    assert getattr(first, "client_params") is not getattr(second, "client_params")
    first_client_params = getattr(first, "client_params")
    second_client_params = getattr(second, "client_params")
    assert first_client_params is not None
    assert second_client_params is not None
    first_client_params["project"] = "mutated-project"

    assert second_client_params["project"] == ""

    third = model_registry.build_model(make_settings("openai"))

    assert getattr(third, "client_params")["project"] == ""
