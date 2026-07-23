"""Uvicorn application factory for the private skill registry."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
import logging
from pathlib import Path
from types import TracebackType
from typing import Protocol, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import SecretStr
from psycopg_pool import AsyncConnectionPool
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from skill_registry.api import build_skill_registry_router
from skill_registry.artifact_store import PostgresSkillArtifactStore
from skill_registry.auth import SkillRegistryAuthMiddleware, SkillRegistryAuthenticator
from skill_registry.config import RegistryConfigError, RegistrySettings, load_scan_policy
from skill_registry.repository import PostgresSkillRegistryRepository, RepositoryCursor
from skill_registry.service import SkillRegistryService, SkillSetService
from skill_registry.skill_set_api import build_skill_set_router
from skill_registry.skill_set_repository import PostgresSkillSetRepository
from skill_registry.types import ScanPolicy


logger = logging.getLogger(__name__)


class RegistryPoolConnection(Protocol):
    async def __aenter__(self) -> RegistryPoolConnection: ...

    async def __aexit__(self, *args: object) -> None: ...

    def cursor(self) -> RepositoryCursor: ...

    def transaction(self) -> AbstractAsyncContextManager[object]: ...


class RegistryPool(Protocol):
    async def open(self, *, wait: bool) -> None: ...

    async def close(self) -> None: ...

    def connection(self) -> AbstractAsyncContextManager[RegistryPoolConnection]: ...


PoolFactory = Callable[[SecretStr], RegistryPool]
PolicyLoader = Callable[[Path], ScanPolicy]
ServiceFactory = Callable[[RegistryPool, ScanPolicy], SkillRegistryService]
SkillSetServiceFactory = Callable[[RegistryPool], SkillSetService]
ReadinessProbe = Callable[[RegistryPool], Awaitable[bool]]


class RegistryStartupError(RuntimeError):
    """Stable startup failure without database or key material."""


class RegistryResponseAborted(RuntimeError):
    """Stable signal that an HTTP response ended before its final body."""


class RegistryTransportError(RuntimeError):
    """Stable signal that the ASGI server rejected an outbound message."""


class RegistryHttpBoundary:
    """Enforce stable failures and non-cacheable responses outside Starlette."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        stable_body = b'{"error":"REGISTRY_UNAVAILABLE"}'
        response_started = False
        response_completed = False
        send_failed = False
        stable_error_candidate = False
        stable_body_matched = 0

        async def send_no_store(message: Message) -> None:
            nonlocal response_completed
            nonlocal response_started
            nonlocal send_failed
            nonlocal stable_body_matched
            nonlocal stable_error_candidate
            if message["type"] == "http.response.start":
                headers = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() != b"cache-control"
                ]
                headers.append((b"cache-control", b"no-store"))
                message["headers"] = headers
            try:
                await send(message)
            except Exception:
                send_failed = True
                raise
            if message["type"] == "http.response.start":
                response_started = True
                content_types = [
                    value.lower()
                    for name, value in message.get("headers", [])
                    if name.lower() == b"content-type"
                ]
                stable_error_candidate = message["status"] in {500, 503} and any(
                    value.startswith(b"application/json") for value in content_types
                )
            elif message["type"] == "http.response.body":
                chunk = message.get("body", b"")
                if stable_error_candidate:
                    end = stable_body_matched + len(chunk)
                    if end > len(stable_body) or stable_body[stable_body_matched:end] != chunk:
                        stable_error_candidate = False
                    else:
                        stable_body_matched = end
                if message.get("more_body", False) is False:
                    response_completed = True

        app_failed = False
        try:
            await self.app(scope, receive, send_no_store)
        except Exception:
            app_failed = True
        if send_failed:
            raise RegistryTransportError("Skill registry transport failed") from None
        if not app_failed:
            return
        if not response_started:
            response = JSONResponse(
                {"error": "REGISTRY_UNAVAILABLE"},
                status_code=503,
                headers={"Cache-Control": "no-store"},
            )
            fallback_failed = False
            try:
                await response(scope, receive, send_no_store)
            except Exception:
                fallback_failed = True
            if send_failed:
                raise RegistryTransportError("Skill registry transport failed") from None
            if fallback_failed:
                raise RegistryResponseAborted("Skill registry response aborted") from None
            return
        if (
            response_completed
            and stable_error_candidate
            and stable_body_matched == len(stable_body)
        ):
            return
        raise RegistryResponseAborted("Skill registry response aborted") from None


class RegistryFastAPI(FastAPI):
    def build_middleware_stack(self) -> ASGIApp:
        return RegistryHttpBoundary(super().build_middleware_stack())


def _psycopg_url(value: str) -> str:
    return value.replace("postgresql+psycopg_async://", "postgresql://", 1)


def _default_pool_factory(database_url: SecretStr) -> RegistryPool:
    conninfo = _psycopg_url(database_url.get_secret_value())
    try:
        pool = AsyncConnectionPool(
            conninfo=conninfo,
            min_size=1,
            max_size=10,
            open=False,
            timeout=2.0,
        )
    finally:
        conninfo = ""
    return cast(RegistryPool, pool)


class _PoolLease:
    """Adapt a pool connection context to the repository connection contract."""

    __slots__ = ("_connection", "_context")

    def __init__(self, pool: RegistryPool) -> None:
        self._context = pool.connection()
        self._connection: RegistryPoolConnection | None = None

    async def __aenter__(self) -> _PoolLease:
        self._connection = await self._context.__aenter__()
        return self

    async def __aexit__(self, *args: object) -> None:
        exception_type = cast(type[BaseException] | None, args[0] if args else None)
        exception = cast(BaseException | None, args[1] if len(args) > 1 else None)
        traceback = cast(TracebackType | None, args[2] if len(args) > 2 else None)
        try:
            await self._context.__aexit__(exception_type, exception, traceback)
        finally:
            self._connection = None

    def cursor(self) -> RepositoryCursor:
        if self._connection is None:
            raise RegistryStartupError("Skill registry connection is unavailable")
        return self._connection.cursor()

    def transaction(self) -> AbstractAsyncContextManager[object]:
        if self._connection is None:
            raise RegistryStartupError("Skill registry connection is unavailable")
        return self._connection.transaction()


def _default_service_factory(pool: RegistryPool, policy: ScanPolicy) -> SkillRegistryService:
    repository = PostgresSkillRegistryRepository(lambda: _PoolLease(pool))
    artifact_store = PostgresSkillArtifactStore(lambda: _PoolLease(pool))
    return SkillRegistryService(repository, artifact_store, policy)


def _default_skill_set_service_factory(pool: RegistryPool) -> SkillSetService:
    return SkillSetService(PostgresSkillSetRepository(lambda: _PoolLease(pool)))


async def _default_readiness_probe(pool: RegistryPool) -> bool:
    async with pool.connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute("SELECT 1")
            row = await cursor.fetchone()
            return bool(row == (1,))


def create_app(
    settings: RegistrySettings | None = None,
    *,
    pool_factory: PoolFactory = _default_pool_factory,
    policy_loader: PolicyLoader = load_scan_policy,
    service_factory: ServiceFactory = _default_service_factory,
    skill_set_service_factory: SkillSetServiceFactory = _default_skill_set_service_factory,
    readiness_probe: ReadinessProbe = _default_readiness_probe,
) -> FastAPI:
    """Compose one lifespan-owned pool, policy, and registry service."""
    runtime_settings = settings or RegistrySettings()  # type: ignore[call-arg]
    pool: RegistryPool | None = None
    service: SkillRegistryService | None = None
    skill_set_service: SkillSetService | None = None

    def get_service() -> SkillRegistryService:
        if service is None:
            raise RegistryStartupError("Skill registry service is unavailable")
        return service

    def get_skill_set_service() -> SkillSetService:
        if skill_set_service is None:
            raise RegistryStartupError("Skill set service is unavailable")
        return skill_set_service

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        nonlocal pool, service, skill_set_service
        pool_touched = False
        try:
            startup_failed = False
            try:
                policy = policy_loader(runtime_settings.runtime_imports_file)
                pool = pool_factory(runtime_settings.database_url)
                pool_touched = True
                await pool.open(wait=True)
                service = service_factory(pool, policy)
                skill_set_service = skill_set_service_factory(pool)
                app.state.skill_registry_service = service
                app.state.skill_set_service = skill_set_service
            except RegistryConfigError:
                raise
            except Exception:
                startup_failed = True
            if startup_failed:
                raise RegistryStartupError("Skill registry startup failed") from None
            yield
        finally:
            service = None
            skill_set_service = None
            app.state.skill_registry_service = None
            app.state.skill_set_service = None
            candidate_pool = pool
            pool = None
            if pool_touched and candidate_pool is not None:
                try:
                    await candidate_pool.close()
                except Exception:
                    logger.error("Skill registry pool close failed")

    app = RegistryFastAPI(
        title="AI Agent Platform Skill Registry",
        lifespan=lifespan,
        openapi_url=None,
        docs_url=None,
        redoc_url=None,
    )
    app.include_router(build_skill_registry_router(get_service))
    app.include_router(build_skill_set_router(get_skill_set_service))

    @app.get("/internal/health/live", include_in_schema=False)
    async def live() -> JSONResponse:
        return JSONResponse({"live": True, "ready": False})

    @app.get("/internal/health/ready", include_in_schema=False)
    async def ready() -> JSONResponse:
        candidate_pool = pool
        try:
            available = candidate_pool is not None and await asyncio.wait_for(
                readiness_probe(candidate_pool), timeout=2.0
            )
        except Exception:
            available = False
        available = available is True
        return JSONResponse(
            {"live": True, "ready": available}, status_code=200 if available else 503
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
        return JSONResponse({"error": "VALIDATION_ERROR"}, status_code=400)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, error: HTTPException) -> JSONResponse:
        code = "NOT_FOUND" if error.status_code == 404 else "HTTP_ERROR"
        return JSONResponse({"error": code}, status_code=error.status_code)

    @app.exception_handler(Exception)
    async def unhandled_error(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            {"error": "REGISTRY_UNAVAILABLE"},
            status_code=503,
            headers={"Cache-Control": "no-store"},
        )

    app.add_middleware(
        SkillRegistryAuthMiddleware,
        authenticator=SkillRegistryAuthenticator(control_key=runtime_settings.control_key),
    )
    return app


def app_factory() -> FastAPI:
    """Uvicorn-compatible zero-argument application factory."""
    return create_app()
