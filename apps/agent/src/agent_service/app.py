"""Configured runtime Agent and AgentOS application composition."""

import asyncio
from collections.abc import Awaitable, Callable, Iterable
from contextlib import asynccontextmanager
import hmac
import inspect
from pathlib import Path
import time
from typing import Protocol, cast

from agno.db.postgres import AsyncPostgresDb
from agno.os import AgentOS
from agno.os.settings import AgnoAPISettings
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import SecretStr
from sqlalchemy import text
from starlette.types import ASGIApp, Receive, Scope, Send

from agent_service.catalog import AgentCapability, AgentCatalog, build_catalog
from agent_service.config import (
    ActiveModelSettings,
    RuntimeSettings,
)
from agent_service.database import build_database
from agent_service.model_config_crypto import ModelConfigCipher
from agent_service.model_config_repository import (
    ModelConfigRepository,
    PostgresModelConfigRepository,
    StoredActiveConfig,
)
from agent_service.model_endpoint_catalog import (
    ModelEndpointCatalog,
    load_model_endpoint_catalog,
)
from agent_service.model_registry import build_managed_model
from agent_service.model_control_api import (
    CONTROL_PATH_PREFIX,
    ModelControlAuthMiddleware,
    build_model_control_router,
)
from agent_service.model_control_auth import ModelControlAuthenticator
from agent_service.model_control_service import (
    ModelControlService,
    ModelControlStorageError,
)
from agent_service.model_verifier import ModelVerificationResult, verify_model
from agent_service.model_runtime_slot import (
    ModelRuntimeSlot,
    RuntimeModelMetadata,
)
from agent_service.model_runtime_types import ManagedModel
from agent_service.runtime_logging import install_agno_log_redaction
from agent_service.skill_activation_coordinator import (
    ActivateSkillRuntime,
    SkillActivationResult,
    SkillRuntimeStatus,
)
from agent_service.skill_control_api import (
    SkillControlAuthMiddleware,
    build_skill_control_router,
)
from agent_service.skill_control_auth import SkillControlAuthenticator
from agent_service.skill_generation_slot import SkillGenerationSlot
from agent_service.skill_runtime_manager import SkillRuntimeManager
from agent_service.skill_runtime_middleware import SkillRuntimeMiddleware


class AgentOSApplication(Protocol):
    def get_app(self) -> FastAPI: ...


AgentOSFactory = Callable[..., AgentOSApplication]
CatalogBuilder = Callable[[RuntimeSettings, AsyncPostgresDb], AgentCatalog]


ReadinessProbe = Callable[[AsyncPostgresDb], Awaitable[bool]]


class ActiveConfigRepository(Protocol):
    async def load_active(self) -> StoredActiveConfig | None: ...


RepositoryBuilder = Callable[[SecretStr], ActiveConfigRepository]
CipherBuilder = Callable[[SecretStr], ModelConfigCipher]
EndpointCatalogBuilder = Callable[[str | None], ModelEndpointCatalog]
ManagedModelBuilder = Callable[[ActiveModelSettings], ManagedModel]
ModelVerifier = Callable[..., Awaitable[ModelVerificationResult]]
ControlServiceFactory = Callable[..., ModelControlService]
DynamicDependenciesBuilder = Callable[
    [],
    tuple[ModelConfigCipher | None, ModelEndpointCatalog | None],
]


class SkillRuntimeApplication(Protocol):
    slot: SkillGenerationSlot

    def status(self) -> SkillRuntimeStatus: ...

    def is_ready(self) -> bool: ...

    async def start(self) -> None: ...

    async def probe(self) -> bool: ...

    async def activate(self, command: ActivateSkillRuntime) -> SkillActivationResult: ...

    async def shutdown(self) -> None: ...


SkillRuntimeManagerBuilder = Callable[
    [RuntimeSettings, ModelRuntimeSlot, AsyncPostgresDb],
    SkillRuntimeApplication,
]


def _build_repository(database_url: SecretStr) -> ActiveConfigRepository:
    return PostgresModelConfigRepository(database_url=database_url)


def _build_cipher(master_key: SecretStr) -> ModelConfigCipher:
    return ModelConfigCipher(master_key=master_key)


def _build_skill_runtime_manager(
    settings: RuntimeSettings,
    model_slot: ModelRuntimeSlot,
    database: AsyncPostgresDb,
) -> SkillRuntimeApplication:
    return SkillRuntimeManager(
        database_url=cast(
            SecretStr,
            settings.skill_registry_runtime_database_url,
        ),
        runtime_root=Path(settings.skill_runtime_root),
        model_slot=model_slot,
        agno_database=database,
        activate_timeout_seconds=settings.skill_activate_timeout_seconds,
        shutdown_timeout_seconds=settings.skill_shutdown_timeout_seconds,
    )


async def _close_candidate(managed: ManagedModel | None) -> None:
    if managed is None:
        return
    try:
        await managed.aclose()
    except Exception:
        pass


async def _close_repository(repository: ActiveConfigRepository | None) -> None:
    if repository is None:
        return
    close = getattr(repository, "aclose", None)
    if not callable(close):
        return
    try:
        result = close()
        if inspect.isawaitable(result):
            await result
    except Exception:
        pass


async def _ordered_runtime_cleanup(
    slot: ModelRuntimeSlot,
    repository: ActiveConfigRepository | None,
) -> None:
    """Drain every model handle before releasing control repository resources."""
    try:
        await slot.shutdown()
    finally:
        await _close_repository(repository)


async def _finish_runtime_cleanup(
    slot: ModelRuntimeSlot,
    repository: ActiveConfigRepository | None,
) -> None:
    """Finish ordered cleanup despite outer cancellation, then re-propagate it."""
    cleanup_task = asyncio.create_task(
        _ordered_runtime_cleanup(slot, repository),
        name="agent-runtime-ordered-cleanup",
    )
    cancellation_received = False
    while True:
        try:
            await asyncio.shield(cleanup_task)
            break
        except asyncio.CancelledError:
            if cleanup_task.cancelled():
                raise
            cancellation_received = True
    if cancellation_received:
        raise asyncio.CancelledError


async def _finish_repository_cleanup(
    repository: ActiveConfigRepository | None,
) -> None:
    """Finish repository cleanup despite outer cancellation, then re-propagate it."""
    cleanup_task = asyncio.create_task(
        _close_repository(repository),
        name="agent-control-repository-cleanup",
    )
    cancellation_received = False
    while True:
        try:
            await asyncio.shield(cleanup_task)
            break
        except asyncio.CancelledError:
            if cleanup_task.cancelled():
                raise
            cancellation_received = True
    if cancellation_received:
        raise asyncio.CancelledError


async def _finish_skill_runtime_cleanup(
    runtime: SkillRuntimeApplication,
) -> None:
    """Finish Skill drain despite outer cancellation, then re-propagate it."""
    cleanup_task = asyncio.create_task(
        runtime.shutdown(),
        name="skill-runtime-ordered-cleanup",
    )
    cancellation_received = False
    while True:
        try:
            await asyncio.shield(cleanup_task)
            break
        except asyncio.CancelledError:
            if cleanup_task.cancelled():
                raise
            cancellation_received = True
    if cancellation_received:
        raise asyncio.CancelledError


async def reconcile_runtime_model(
    *,
    settings: RuntimeSettings,
    slot: ModelRuntimeSlot,
    repository: ActiveConfigRepository | None,
    cipher: ModelConfigCipher | None,
    endpoint_catalog: ModelEndpointCatalog | None,
    model_builder: ManagedModelBuilder = build_managed_model,
    dynamic_dependencies_builder: DynamicDependenciesBuilder | None = None,
) -> None:
    """Restore one dynamic pointer, or the deployment bootstrap when none exists."""
    active = None
    if repository is not None:
        try:
            active = await repository.load_active()
        except Exception:
            slot.deactivate(capability="degraded")
            return

    managed: ManagedModel | None = None
    if active is not None:
        try:
            if dynamic_dependencies_builder is not None:
                cipher, endpoint_catalog = dynamic_dependencies_builder()
            if cipher is None or endpoint_catalog is None:
                raise RuntimeError("dynamic model dependencies unavailable")
            api_key = cipher.open(
                config_id=active.config_id,
                provider=active.provider,
                revision=active.revision,
                sealed=active.sealed,
            )
            endpoint = endpoint_catalog.resolve(
                active.endpoint_id,
                active.provider,
            )
            active_settings = ActiveModelSettings(
                provider=active.provider,
                model_id=active.model_id,
                api_key=api_key,
                base_url=endpoint.base_url,
                timeout_seconds=settings.model_run_timeout_seconds,
            )
            managed = model_builder(active_settings)
            slot.activate(
                managed,
                active.activation_version,
                RuntimeModelMetadata(
                    source="dynamic",
                    provider=active.provider,
                    model_id=active.model_id,
                    config_revision=active.revision,
                ),
            )
            managed = None
            return
        except Exception:
            await _close_candidate(managed)
            slot.deactivate(capability="degraded")
            return

    bootstrap = settings.bootstrap_model
    if bootstrap is None:
        slot.deactivate(capability="placeholder")
        return
    try:
        managed = model_builder(bootstrap)
        slot.activate(
            managed,
            0,
            RuntimeModelMetadata(
                source="deployment",
                provider=bootstrap.provider,
                model_id=bootstrap.model_id,
                config_revision=None,
            ),
        )
        managed = None
    except Exception:
        await _close_candidate(managed)
        slot.deactivate(capability="degraded")


def _has_valid_bearer_header(
    headers: Iterable[tuple[bytes, bytes]],
    security_key: bytes,
) -> bool:
    authorization_values = [
        value for name, value in headers if name.lower() == b"authorization"
    ]
    if len(authorization_values) != 1:
        return False

    parts = authorization_values[0].split(b" ")
    if len(parts) != 2:
        return False

    scheme, token = parts
    scheme_matches = hmac.compare_digest(scheme.lower(), b"bearer")
    token_matches = hmac.compare_digest(token, security_key)
    return scheme_matches and token_matches


class BearerAuthMiddleware:
    """Apply one constant-time bearer-key boundary to HTTP and WebSocket routes."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        security_key: SecretStr,
        bypass_http_prefixes: tuple[str, ...] = (),
    ) -> None:
        self.app = app
        self._security_key = security_key.get_secret_value().encode("utf-8")
        self._bypass_http_prefixes = bypass_http_prefixes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        scope_type = scope["type"]
        if scope_type not in {"http", "websocket"}:
            await self.app(scope, receive, send)
            return
        if scope_type == "http" and scope.get("path", "").startswith(
            self._bypass_http_prefixes
        ):
            await self.app(scope, receive, send)
            return

        if not _has_valid_bearer_header(
            scope.get("headers", []),
            self._security_key,
        ):
            if scope_type == "websocket":
                await send(
                    {
                        "type": "websocket.close",
                        "code": 4401,
                        "reason": "Unauthorized",
                    }
                )
                return

            response = JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized"},
                headers={"Cache-Control": "no-store"},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


async def probe_database(database: AsyncPostgresDb) -> bool:
    """Check the existing runtime engine without constructing another database."""
    async with database.db_engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
    return True


def _status_response(
    *,
    ready: bool,
    capability: AgentCapability,
    message: str,
    status_code: int,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "live": True,
            "ready": ready,
            "capability": capability,
            "message": message,
        },
        headers={"Cache-Control": "no-store"},
    )


def _readiness_response(
    *,
    ready: bool,
    capability: AgentCapability,
    status_code: int,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"ready": ready, "capability": capability},
        headers={"Cache-Control": "no-store"},
    )


def create_app(
    settings: RuntimeSettings | None = None,
    *,
    database: AsyncPostgresDb | None = None,
    agent_os_factory: AgentOSFactory = AgentOS,
    readiness_probe: ReadinessProbe = probe_database,
    catalog_builder: CatalogBuilder = build_catalog,
    repository_builder: RepositoryBuilder = _build_repository,
    cipher_builder: CipherBuilder = _build_cipher,
    endpoint_catalog_builder: EndpointCatalogBuilder = load_model_endpoint_catalog,
    model_builder: ManagedModelBuilder = build_managed_model,
    model_verifier: ModelVerifier = verify_model,
    control_service_factory: ControlServiceFactory = ModelControlService,
    control_clock: Callable[[], float] = time.time,
    skill_runtime_manager_builder: SkillRuntimeManagerBuilder = (
        _build_skill_runtime_manager
    ),
) -> FastAPI:
    """Compose the protected FastAPI and configured AgentOS surfaces."""
    install_agno_log_redaction()
    runtime_settings = settings or RuntimeSettings()
    control_values = (
        runtime_settings.agent_control_database_url,
        runtime_settings.model_config_encryption_key,
        runtime_settings.agent_config_control_key,
    )
    if any(value is not None for value in control_values) and not all(
        value is not None for value in control_values
    ):
        raise ValueError("model control configuration is incomplete") from None
    control_configured = all(value is not None for value in control_values)
    control_authenticator = (
        ModelControlAuthenticator(
            control_key=cast(SecretStr, runtime_settings.agent_config_control_key),
            os_security_key=runtime_settings.os_security_key,
        )
        if control_configured
        else None
    )
    skill_control_authenticator = (
        SkillControlAuthenticator(
            control_key=cast(SecretStr, runtime_settings.agent_config_control_key),
            os_security_key=runtime_settings.os_security_key,
        )
        if control_configured
        else None
    )
    runtime_database = database or build_database(runtime_settings)
    catalog = catalog_builder(runtime_settings, runtime_database)
    control_slot = catalog.slot or ModelRuntimeSlot()
    skill_runtime = (
        skill_runtime_manager_builder(runtime_settings, catalog.slot, runtime_database)
        if catalog.slot is not None
        else None
    )
    control_service: ModelControlService | None = None

    def get_control_service() -> ModelControlService:
        if control_service is None:
            raise ModelControlStorageError("storage_unavailable") from None
        return control_service

    @asynccontextmanager
    async def runtime_lifespan(_: FastAPI):
        nonlocal control_service
        slot = catalog.slot
        repository: ActiveConfigRepository | None = None
        cipher: ModelConfigCipher | None = None
        endpoints: ModelEndpointCatalog | None = None
        repository_unavailable = False
        if slot is not None:
            await slot.start()
        try:
            if control_configured:
                try:
                    repository = repository_builder(
                        cast(SecretStr, runtime_settings.agent_control_database_url)
                    )
                except Exception:
                    repository_unavailable = True

                if repository is not None:
                    try:
                        cipher = cipher_builder(
                            cast(
                                SecretStr,
                                runtime_settings.model_config_encryption_key,
                            )
                        )
                        endpoints = endpoint_catalog_builder(
                            runtime_settings.model_endpoints_file
                        )
                        control_service = control_service_factory(
                            repository=cast(ModelConfigRepository, repository),
                            cipher=cipher,
                            endpoint_catalog=endpoints,
                            slot=control_slot,
                            bootstrap_model=runtime_settings.bootstrap_model,
                            control_enabled=runtime_settings.agent_enabled,
                            model_builder=model_builder,
                            verifier=model_verifier,
                            verification_timeout_seconds=(
                                runtime_settings.model_run_timeout_seconds
                            ),
                        )
                    except Exception:
                        control_service = None

            def build_dynamic_dependencies() -> tuple[
                ModelConfigCipher | None,
                ModelEndpointCatalog | None,
            ]:
                dynamic_cipher = (
                    None
                    if runtime_settings.model_config_encryption_key is None
                    else cipher_builder(runtime_settings.model_config_encryption_key)
                )
                dynamic_endpoints = endpoint_catalog_builder(
                    runtime_settings.model_endpoints_file
                )
                return dynamic_cipher, dynamic_endpoints

            if slot is not None:
                if repository_unavailable:
                    slot.deactivate(capability="degraded")
                else:
                    try:
                        await reconcile_runtime_model(
                            settings=runtime_settings,
                            slot=slot,
                            repository=repository,
                            cipher=cipher,
                            endpoint_catalog=endpoints,
                            model_builder=model_builder,
                            dynamic_dependencies_builder=(
                                None
                                if cipher is not None and endpoints is not None
                                else build_dynamic_dependencies
                            ),
                        )
                    except Exception:
                        slot.deactivate(capability="degraded")
            if skill_runtime is not None:
                try:
                    await skill_runtime.start()
                except Exception:
                    pass
            yield
        finally:
            control_service = None
            try:
                if skill_runtime is not None:
                    await _finish_skill_runtime_cleanup(skill_runtime)
            finally:
                if slot is not None:
                    await _finish_runtime_cleanup(slot, repository)
                else:
                    await _finish_repository_cleanup(repository)

    base_app = FastAPI(
        title="AI Agent Platform AgentOS",
        lifespan=runtime_lifespan,
    )
    base_app.state.model_runtime_status = catalog.runtime_status_provider
    if control_configured:
        base_app.include_router(build_model_control_router(get_control_service))
        if skill_runtime is not None:
            base_app.include_router(build_skill_control_router(lambda: skill_runtime))
    if skill_runtime is not None:
        base_app.state.skill_runtime_status = skill_runtime.status

    @base_app.get("/internal/health/live", include_in_schema=False)
    async def live() -> JSONResponse:
        return _status_response(
            ready=False,
            capability=catalog.capability,
            message="service is live",
            status_code=200,
        )

    @base_app.get("/internal/health/ready", include_in_schema=False)
    async def ready() -> JSONResponse:
        try:
            database_is_ready = await asyncio.wait_for(
                readiness_probe(runtime_database),
                timeout=runtime_settings.health_db_probe_timeout_seconds,
            )
        except Exception:
            database_is_ready = False

        skill_is_ready = True
        if skill_runtime is not None:
            try:
                skill_is_ready = await asyncio.wait_for(
                    skill_runtime.probe(),
                    timeout=runtime_settings.health_db_probe_timeout_seconds,
                )
            except Exception:
                skill_is_ready = False
        model_is_ready = catalog.capability != "degraded"
        if not database_is_ready or not skill_is_ready or not model_is_ready:
            return _readiness_response(
                ready=False,
                capability=catalog.capability,
                status_code=503,
            )
        return _readiness_response(
            ready=True,
            capability=catalog.capability,
            status_code=200,
        )

    agent_os = agent_os_factory(
        id="ai-agent-platform",
        agents=catalog.agents,
        db=runtime_database,
        base_app=base_app,
        # The service owns the bearer boundary below. Keep Agno's auth layer
        # disabled so its middleware does not capture the key in repr/log state
        # or read a different CI-provided OS_SECURITY_KEY from the environment.
        settings=AgnoAPISettings(os_security_key=None),
        auto_provision_dbs=False,
        telemetry=False,
    )
    application = agent_os.get_app()
    application.state.model_runtime_status = catalog.runtime_status_provider
    if skill_runtime is not None:
        application.state.skill_runtime_status = skill_runtime.status
        application.add_middleware(
            SkillRuntimeMiddleware,
            slot=skill_runtime.slot,
        )
    application.add_middleware(
        BearerAuthMiddleware,
        security_key=runtime_settings.os_security_key,
        bypass_http_prefixes=(CONTROL_PATH_PREFIX,) if control_configured else (),
    )
    if control_authenticator is not None:
        application.add_middleware(
            ModelControlAuthMiddleware,
            authenticator=control_authenticator,
            clock=control_clock,
        )
    if skill_control_authenticator is not None and skill_runtime is not None:
        application.add_middleware(
            SkillControlAuthMiddleware,
            authenticator=skill_control_authenticator,
            clock=control_clock,
        )
    return application


def app_factory() -> FastAPI:
    """Uvicorn-compatible zero-argument application factory."""
    return create_app()
