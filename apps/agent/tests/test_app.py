from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from agno.db.postgres import AsyncPostgresDb
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_service.app import create_app
from agent_service.catalog import build_catalog
from agent_service.config import RuntimeSettings
from agent_service.database import build_database


DATABASE_URL = "postgresql+psycopg_async://runtime:private-password@db:5432/platform"
SECURITY_KEY = "internal-security-key"
AUTHORIZATION = {"Authorization": f"Bearer {SECURITY_KEY}"}
SAFE_KEYS = {"live", "ready", "capability", "message"}
Probe = Callable[[AsyncPostgresDb], Awaitable[bool]]


@pytest.fixture
def settings() -> RuntimeSettings:
    return RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": SECURITY_KEY,
            "AGNO_DATABASE_URL": DATABASE_URL,
        }
    )


async def ready_probe(_: AsyncPostgresDb) -> bool:
    return True


def make_app(settings: RuntimeSettings, probe: Probe) -> FastAPI:
    return create_app(settings=settings, readiness_probe=probe)


@pytest.mark.parametrize(
    "path",
    ["/internal/health/live", "/internal/health/ready", "/docs", "/openapi.json"],
)
@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Basic abc"},
        {"Authorization": "Bearer"},
        {"Authorization": "Bearer wrong-key"},
        {"Authorization": f"Bearer {SECURITY_KEY} extra"},
    ],
)
def test_every_http_surface_rejects_missing_or_invalid_bearer(
    settings: RuntimeSettings,
    path: str,
    headers: dict[str, str],
) -> None:
    app = make_app(settings, ready_probe)

    with TestClient(app) as client:
        response = client.get(path, headers=headers)

    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}
    assert SECURITY_KEY not in response.text


@pytest.mark.parametrize("path", ["/docs", "/openapi.json"])
def test_documentation_surfaces_accept_the_correct_bearer(
    settings: RuntimeSettings,
    path: str,
) -> None:
    app = make_app(settings, ready_probe)

    with TestClient(app) as client:
        response = client.get(path, headers=AUTHORIZATION)

    assert response.status_code == 200


def test_live_is_independent_of_database_and_not_cached(
    settings: RuntimeSettings,
) -> None:
    calls = 0

    async def failing_if_called(_: AsyncPostgresDb) -> bool:
        nonlocal calls
        calls += 1
        raise AssertionError("liveness must not query the database")

    app = make_app(settings, failing_if_called)

    with TestClient(app) as client:
        response = client.get("/internal/health/live", headers=AUTHORIZATION)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "live": True,
        "ready": False,
        "capability": "placeholder",
        "message": "service is live",
    }
    assert set(response.json()) == SAFE_KEYS
    assert calls == 0


@pytest.mark.parametrize("probe_result", [False])
def test_ready_returns_safe_503_when_database_is_unavailable(
    settings: RuntimeSettings,
    probe_result: bool,
) -> None:
    seen_databases: list[object] = []

    async def probe(database: AsyncPostgresDb) -> bool:
        seen_databases.append(database)
        return probe_result

    database = build_database(settings)
    app = create_app(settings=settings, database=database, readiness_probe=probe)

    with TestClient(app) as client:
        response = client.get("/internal/health/ready", headers=AUTHORIZATION)

    assert response.status_code == 503
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "live": True,
        "ready": False,
        "capability": "placeholder",
        "message": "database unavailable",
    }
    assert set(response.json()) == SAFE_KEYS
    assert seen_databases == [database]


def test_ready_converts_probe_exceptions_to_safe_503(
    settings: RuntimeSettings,
) -> None:
    async def exploding_probe(_: AsyncPostgresDb) -> bool:
        raise RuntimeError(f"could not connect to {DATABASE_URL}; key={SECURITY_KEY}")

    app = make_app(settings, exploding_probe)

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/internal/health/ready", headers=AUTHORIZATION)

    assert response.status_code == 503
    assert response.json() == {
        "live": True,
        "ready": False,
        "capability": "placeholder",
        "message": "database unavailable",
    }
    assert DATABASE_URL not in response.text
    assert SECURITY_KEY not in response.text


def test_ready_can_be_true_while_capability_remains_placeholder(
    settings: RuntimeSettings,
) -> None:
    app = make_app(settings, ready_probe)

    with TestClient(app) as client:
        response = client.get("/internal/health/ready", headers=AUTHORIZATION)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "live": True,
        "ready": True,
        "capability": "placeholder",
        "message": "service is ready",
    }
    assert set(response.json()) == SAFE_KEYS


def test_agentos_receives_exact_model_free_composition_and_same_database(
    settings: RuntimeSettings,
) -> None:
    captured: dict[str, Any] = {}
    probed: list[object] = []
    database = build_database(settings)

    class CapturingAgentOS:
        def __init__(self, **kwargs: Any) -> None:
            captured.update(kwargs)

        def get_app(self) -> FastAPI:
            return captured["base_app"]

    async def probe(received: AsyncPostgresDb) -> bool:
        probed.append(received)
        return True

    app = create_app(
        settings=settings,
        database=database,
        agent_os_factory=CapturingAgentOS,
        readiness_probe=probe,
    )

    with TestClient(app) as client:
        response = client.get("/internal/health/ready", headers=AUTHORIZATION)

    catalog = build_catalog(settings)
    assert response.status_code == 200
    assert captured == {
        "id": "ai-agent-platform",
        "agents": catalog.agents,
        "db": database,
        "base_app": captured["base_app"],
        "auto_provision_dbs": False,
    }
    assert isinstance(captured["base_app"], FastAPI)
    assert probed == [database]


def test_discovered_agentos_route_uses_the_same_bearer_boundary(
    settings: RuntimeSettings,
) -> None:
    app = make_app(settings, ready_probe)
    schema = app.openapi()
    candidates = [
        path
        for path, operations in schema["paths"].items()
        if not path.startswith("/internal/")
        and "{" not in path
        and "get" in operations
        and not any(
            parameter.get("required")
            for parameter in operations["get"].get("parameters", [])
        )
    ]

    assert candidates, "AgentOS must contribute a discoverable GET route"
    discovered_path = candidates[0]

    with TestClient(app) as client:
        missing = client.get(discovered_path)
        wrong = client.get(
            discovered_path,
            headers={"Authorization": "Bearer wrong-key"},
        )
        correct = client.get(discovered_path, headers=AUTHORIZATION)

    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert correct.status_code != 401
    assert SECURITY_KEY not in missing.text
    assert SECURITY_KEY not in wrong.text
