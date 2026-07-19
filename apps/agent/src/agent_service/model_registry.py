"""Deterministic registry for owned native Agno model adapters."""

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Final, Protocol, cast

from agno.models.base import Model
import httpx

from agent_service.config import ActiveModelSettings, ModelProvider
from agent_service.model_runtime_types import ManagedModel


_OPENAI_BASE_URL: Final = "https://api.openai.com/v1"
_ANTHROPIC_BASE_URL: Final = "https://api.anthropic.com"
_GEMINI_BASE_URL: Final = "https://generativelanguage.googleapis.com"
_DASHSCOPE_BASE_URL: Final = (
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
)
_DEEPSEEK_BASE_URL: Final = "https://api.deepseek.com"
_MINIMAX_BASE_URL: Final = "https://api.minimax.io/v1"


class ProviderRequestError(RuntimeError):
    """Fixed error raised before a Provider redirect can be followed."""


class _RedactedApiKey(str):
    def __repr__(self) -> str:
        return "<redacted>"


@dataclass(frozen=True, slots=True)
class _HttpClients:
    sync: httpx.Client
    asynchronous: httpx.AsyncClient
    owns_sync: bool
    owns_asynchronous: bool


@dataclass(frozen=True, slots=True)
class _RedirectHookRegistration:
    sync_client: httpx.Client
    asynchronous_client: httpx.AsyncClient
    sync_hook: Callable[[httpx.Response], None]
    asynchronous_hook: Callable[[httpx.Response], Awaitable[None]]

    def detach(self) -> None:
        sync_hooks = self.sync_client.event_hooks["response"]
        for index, hook in enumerate(sync_hooks):
            if hook is self.sync_hook:
                del sync_hooks[index]
                break

        asynchronous_hooks = self.asynchronous_client.event_hooks["response"]
        for index, hook in enumerate(asynchronous_hooks):
            if hook is self.asynchronous_hook:
                del asynchronous_hooks[index]
                break


class ModelFactory(Protocol):
    """Construct one owned Agno model from validated runtime settings."""

    def __call__(
        self,
        settings: ActiveModelSettings,
        /,
        *,
        http_client: httpx.Client | None = None,
        http_async_client: httpx.AsyncClient | None = None,
    ) -> ManagedModel: ...


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


def _http_clients(
    settings: ActiveModelSettings,
    *,
    http_client: httpx.Client | None,
    http_async_client: httpx.AsyncClient | None,
) -> _HttpClients:
    if http_client is not None and http_client.follow_redirects:
        raise ValueError("provider HTTP clients must reject redirects")
    if http_async_client is not None and http_async_client.follow_redirects:
        raise ValueError("provider HTTP clients must reject redirects")

    owns_sync = http_client is None
    owns_asynchronous = http_async_client is None
    sync_client = http_client or httpx.Client(
        follow_redirects=False,
        timeout=settings.timeout_seconds,
    )
    asynchronous_client = http_async_client or httpx.AsyncClient(
        follow_redirects=False,
        timeout=settings.timeout_seconds,
    )
    return _HttpClients(
        sync=sync_client,
        asynchronous=asynchronous_client,
        owns_sync=owns_sync,
        owns_asynchronous=owns_asynchronous,
    )


def _attach_redirect_hooks(clients: _HttpClients) -> _RedirectHookRegistration:
    def reject_sync_redirect(response: httpx.Response) -> None:
        if response.is_redirect:
            raise ProviderRequestError("provider request failed")

    async def reject_async_redirect(response: httpx.Response) -> None:
        if response.is_redirect:
            raise ProviderRequestError("provider request failed")

    registration = _RedirectHookRegistration(
        sync_client=clients.sync,
        asynchronous_client=clients.asynchronous,
        sync_hook=reject_sync_redirect,
        asynchronous_hook=reject_async_redirect,
    )
    clients.sync.event_hooks["response"].append(reject_sync_redirect)
    try:
        clients.asynchronous.event_hooks["response"].append(
            reject_async_redirect
        )
    except BaseException:
        registration.detach()
        raise
    return registration


async def _close_resources(
    *,
    sync_closers: tuple[Callable[[], object], ...] = (),
    async_closers: tuple[Callable[[], Awaitable[object]], ...] = (),
) -> None:
    failed = False
    for close in sync_closers:
        try:
            close()
        except BaseException:
            failed = True
    for close in async_closers:
        try:
            await close()
        except BaseException:
            failed = True
    if failed:
        raise RuntimeError("owned provider client close failed")


def _openai_compatible_managed_model(
    settings: ActiveModelSettings,
    *,
    model_type: Callable[..., Model],
    default_base_url: str,
    http_client: httpx.Client | None,
    http_async_client: httpx.AsyncClient | None,
) -> ManagedModel:
    from openai import AsyncOpenAI, OpenAI

    clients = _http_clients(
        settings,
        http_client=http_client,
        http_async_client=http_async_client,
    )
    api_key = _api_key(settings)
    base_url = settings.base_url or default_base_url
    default_headers = _openai_default_headers(api_key)
    sync_sdk = OpenAI(
        api_key=api_key,
        admin_api_key="",
        organization="",
        project="",
        webhook_secret="",
        base_url=base_url,
        timeout=settings.timeout_seconds,
        max_retries=0,
        default_headers=default_headers,
        http_client=clients.sync,
    )
    async_sdk = AsyncOpenAI(
        api_key=api_key,
        admin_api_key="",
        organization="",
        project="",
        webhook_secret="",
        base_url=base_url,
        timeout=settings.timeout_seconds,
        max_retries=0,
        default_headers=default_headers,
        http_client=clients.asynchronous,
    )
    model = model_type(
        id=settings.model_id,
        retries=0,
        api_key=api_key,
        organization="",
        base_url=base_url,
        timeout=settings.timeout_seconds,
        max_retries=0,
        default_headers=default_headers,
        client_params=_openai_client_params(),
        client=sync_sdk,
        async_client=async_sdk,
    )
    redirect_hooks = _attach_redirect_hooks(clients)

    async def close_callback() -> None:
        try:
            await _close_resources(
                sync_closers=(sync_sdk.close,) if clients.owns_sync else (),
                async_closers=(async_sdk.close,)
                if clients.owns_asynchronous
                else (),
            )
        finally:
            redirect_hooks.detach()

    return ManagedModel(model=model, close_callback=close_callback)


def _build_openai_model(
    settings: ActiveModelSettings,
    /,
    *,
    http_client: httpx.Client | None = None,
    http_async_client: httpx.AsyncClient | None = None,
) -> ManagedModel:
    from agno.models.openai import OpenAIResponses

    return _openai_compatible_managed_model(
        settings,
        model_type=OpenAIResponses,
        default_base_url=_OPENAI_BASE_URL,
        http_client=http_client,
        http_async_client=http_async_client,
    )


def _build_anthropic_model(
    settings: ActiveModelSettings,
    /,
    *,
    http_client: httpx.Client | None = None,
    http_async_client: httpx.AsyncClient | None = None,
) -> ManagedModel:
    from agno.models.anthropic import Claude
    from anthropic import Anthropic, AsyncAnthropic

    clients = _http_clients(
        settings,
        http_client=http_client,
        http_async_client=http_async_client,
    )
    api_key = _api_key(settings)
    base_url = settings.base_url or _ANTHROPIC_BASE_URL
    default_headers = _anthropic_default_headers(api_key)
    sync_sdk = Anthropic(
        api_key=api_key,
        auth_token=None,
        webhook_key="",
        base_url=base_url,
        timeout=settings.timeout_seconds,
        max_retries=0,
        default_headers=default_headers,
        http_client=clients.sync,
    )
    async_sdk = AsyncAnthropic(
        api_key=api_key,
        auth_token=None,
        webhook_key="",
        base_url=base_url,
        timeout=settings.timeout_seconds,
        max_retries=0,
        default_headers=default_headers,
        http_client=clients.asynchronous,
    )
    model = Claude(
        id=settings.model_id,
        retries=0,
        api_key=api_key,
        timeout=settings.timeout_seconds,
        client=sync_sdk,
        async_client=async_sdk,
    )
    redirect_hooks = _attach_redirect_hooks(clients)

    async def close_callback() -> None:
        try:
            await _close_resources(
                sync_closers=(sync_sdk.close,) if clients.owns_sync else (),
                async_closers=(async_sdk.close,)
                if clients.owns_asynchronous
                else (),
            )
        finally:
            redirect_hooks.detach()

    return ManagedModel(model=model, close_callback=close_callback)


def _build_google_model(
    settings: ActiveModelSettings,
    /,
    *,
    http_client: httpx.Client | None = None,
    http_async_client: httpx.AsyncClient | None = None,
) -> ManagedModel:
    from agno.models.google import Gemini
    from google import genai
    from google.genai.client import DebugConfig
    from google.genai.types import HttpOptions, HttpRetryOptions

    clients = _http_clients(
        settings,
        http_client=http_client,
        http_async_client=http_async_client,
    )
    api_key = _api_key(settings)
    base_url = settings.base_url or _GEMINI_BASE_URL
    http_options = HttpOptions(
        base_url=base_url,
        timeout=settings.timeout_seconds * 1000,
        retry_options=HttpRetryOptions(attempts=1),
        httpx_client=clients.sync,
        httpx_async_client=clients.asynchronous,
    )
    sdk_client = genai.Client(
        vertexai=False,
        api_key=api_key,
        debug_config=DebugConfig(
            client_mode=None,
            replays_directory=None,
            replay_id=None,
        ),
        http_options=http_options,
    )
    model = Gemini(
        id=settings.model_id,
        retries=0,
        api_key=api_key,
        timeout=settings.timeout_seconds,
        vertexai=False,
        project_id=None,
        location=None,
        client=sdk_client,
    )
    redirect_hooks = _attach_redirect_hooks(clients)

    async def close_callback() -> None:
        try:
            await _close_resources(
                sync_closers=(
                    sdk_client.close,
                    *((clients.sync.close,) if clients.owns_sync else ()),
                ),
                async_closers=(
                    sdk_client.aio.aclose,
                    *((clients.asynchronous.aclose,)
                      if clients.owns_asynchronous
                      else ()),
                ),
            )
        finally:
            redirect_hooks.detach()

    return ManagedModel(model=model, close_callback=close_callback)


def _build_dashscope_model(
    settings: ActiveModelSettings,
    /,
    *,
    http_client: httpx.Client | None = None,
    http_async_client: httpx.AsyncClient | None = None,
) -> ManagedModel:
    from agno.models.dashscope import DashScope

    return _openai_compatible_managed_model(
        settings,
        model_type=DashScope,
        default_base_url=_DASHSCOPE_BASE_URL,
        http_client=http_client,
        http_async_client=http_async_client,
    )


def _build_deepseek_model(
    settings: ActiveModelSettings,
    /,
    *,
    http_client: httpx.Client | None = None,
    http_async_client: httpx.AsyncClient | None = None,
) -> ManagedModel:
    from agno.models.deepseek import DeepSeek

    return _openai_compatible_managed_model(
        settings,
        model_type=DeepSeek,
        default_base_url=_DEEPSEEK_BASE_URL,
        http_client=http_client,
        http_async_client=http_async_client,
    )


def _build_minimax_model(
    settings: ActiveModelSettings,
    /,
    *,
    http_client: httpx.Client | None = None,
    http_async_client: httpx.AsyncClient | None = None,
) -> ManagedModel:
    from agno.models.minimax import MiniMax

    return _openai_compatible_managed_model(
        settings,
        model_type=MiniMax,
        default_base_url=_MINIMAX_BASE_URL,
        http_client=http_client,
        http_async_client=http_async_client,
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


def build_managed_model(
    settings: ActiveModelSettings,
    *,
    http_client: httpx.Client | None = None,
    http_async_client: httpx.AsyncClient | None = None,
) -> ManagedModel:
    """Build only the explicitly selected native Agno model and its owners."""
    return _MODEL_FACTORIES[settings.provider](
        settings,
        http_client=http_client,
        http_async_client=http_async_client,
    )


def build_model(settings: ActiveModelSettings) -> Model:
    """Compatibility wrapper for current catalog and smoke callers."""
    return build_managed_model(settings).model
