"""Configured runtime Agent and AgentOS application composition."""

import asyncio
from collections.abc import Awaitable, Callable
import hmac
from typing import Protocol

from agno.db.postgres import AsyncPostgresDb
from agno.os import AgentOS
from agno.os.settings import AgnoAPISettings
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import SecretStr
from sqlalchemy import text
from starlette.types import ASGIApp, Receive, Scope, Send

from agent_service.catalog import AgentCapability, build_catalog
from agent_service.config import RuntimeSettings
from agent_service.database import build_database


class AgentOSApplication(Protocol):
    def get_app(self) -> FastAPI: ...


AgentOSFactory = Callable[..., AgentOSApplication]


ReadinessProbe = Callable[[AsyncPostgresDb], Awaitable[bool]]


class BearerAuthMiddleware:
    """Apply one constant-time bearer-key boundary to every HTTP route."""

    def __init__(self, app: ASGIApp, *, security_key: SecretStr) -> None:
        self.app = app
        self._security_key = security_key.get_secret_value().encode("utf-8")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        authorization_values = [
            value
            for name, value in scope.get("headers", [])
            if name.lower() == b"authorization"
        ]
        authorized = False
        if len(authorization_values) == 1:
            parts = authorization_values[0].split(b" ")
            if len(parts) == 2:
                scheme, token = parts
                authorized = hmac.compare_digest(
                    scheme.lower(), b"bearer"
                ) and hmac.compare_digest(
                    token,
                    self._security_key,
                )

        if not authorized:
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
) -> FastAPI:
    """Compose the protected FastAPI and configured AgentOS surfaces."""
    runtime_settings = settings or RuntimeSettings()
    runtime_database = database or build_database(runtime_settings)
    catalog = build_catalog(runtime_settings, runtime_database)
    base_app = FastAPI(title="AI Agent Platform AgentOS")

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

        if not database_is_ready:
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
    application.add_middleware(
        BearerAuthMiddleware,
        security_key=runtime_settings.os_security_key,
    )
    return application


def app_factory() -> FastAPI:
    """Uvicorn-compatible zero-argument application factory."""
    return create_app()
