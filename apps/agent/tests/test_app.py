from collections.abc import Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from typing import Any, cast

import pytest
from agno.agent import Agent
from agno.db.postgres import AsyncPostgresDb
from agno.models.openai import OpenAIResponses
from agno.os import AgentOS
from agno.os.settings import AgnoAPISettings
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.types import Message, Receive, Scope, Send
from starlette.websockets import WebSocketDisconnect

import agent_service.app as app_module
from agent_service.app import BearerAuthMiddleware, create_app, probe_database
from agent_service.catalog import AgentCapability, AgentCatalog, build_catalog
from agent_service.config import RuntimeSettings
from agent_service.database import build_database


DATABASE_URL = "postgresql+psycopg_async://runtime:private-password@db:5432/platform"
SECURITY_KEY = "internal-security-key-0123456789abcdef"
MODEL_ID = "health-must-not-expose-model-id"
MODEL_API_KEY = "health-must-not-expose-model-api-key"
AUTHORIZATION = {"Authorization": f"Bearer {SECURITY_KEY}"}
LIVE_SAFE_KEYS = {"live", "ready", "capability", "message"}
READY_SAFE_KEYS = {"ready", "capability"}
Probe = Callable[[AsyncPostgresDb], Awaitable[bool]]


@pytest.fixture
def settings() -> RuntimeSettings:
    return RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": SECURITY_KEY,
            "AGNO_DATABASE_URL": DATABASE_URL,
        }
    )


@pytest.fixture
def enabled_settings() -> RuntimeSettings:
    return RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": SECURITY_KEY,
            "AGNO_DATABASE_URL": DATABASE_URL,
            "AGENT_ENABLED": True,
            "MODEL_PROVIDER": "openai",
            "MODEL_ID": MODEL_ID,
            "MODEL_API_KEY": MODEL_API_KEY,
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
    assert response.content == b'{"detail":"Unauthorized"}'
    assert response.json() == {"detail": "Unauthorized"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-type"] == "application/json"
    assert SECURITY_KEY not in response.text


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer wrong-key"}],
)
def test_websocket_rejects_missing_or_invalid_bearer_before_accept(
    settings: RuntimeSettings,
    headers: dict[str, str],
) -> None:
    app = make_app(settings, ready_probe)

    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/workflows/ws", headers=headers):
                pass

    assert exc_info.value.code == 4401
    assert exc_info.value.reason == "Unauthorized"
    assert SECURITY_KEY not in str(exc_info.value)


def test_websocket_correct_bearer_reaches_agentos_route(
    settings: RuntimeSettings,
) -> None:
    app = make_app(settings, ready_probe)

    with TestClient(app) as client:
        with client.websocket_connect(
            "/workflows/ws",
            headers=AUTHORIZATION,
        ) as websocket:
            connected = websocket.receive_json()
            websocket.send_json({"action": "ping"})
            pong = websocket.receive_json()

    assert connected["event"] == "connected"
    assert pong == {"event": "pong"}


@pytest.mark.asyncio
@pytest.mark.parametrize("scope_type", ["lifespan", "custom"])
async def test_websocket_boundary_passes_unrelated_asgi_scopes_through_unchanged(
    settings: RuntimeSettings,
    scope_type: str,
) -> None:
    calls: list[tuple[bool, bool, bool]] = []
    scope = cast(Scope, {"type": scope_type})

    async def receive() -> Message:
        return cast(Message, {"type": "test.receive"})

    async def send(_: Message) -> None:
        return None

    async def downstream(
        received_scope: Scope,
        received_receive: Receive,
        received_send: Send,
    ) -> None:
        calls.append(
            (
                received_scope is scope,
                received_receive is receive,
                received_send is send,
            )
        )

    middleware = BearerAuthMiddleware(
        downstream,
        security_key=settings.os_security_key,
    )

    await middleware(scope, receive, send)

    assert calls == [(True, True, True)]


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
    assert set(response.json()) == LIVE_SAFE_KEYS
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
        "ready": False,
        "capability": "placeholder",
    }
    assert response.json()["ready"] is False
    assert set(response.json()) == READY_SAFE_KEYS
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
        "ready": False,
        "capability": "placeholder",
    }
    assert response.json()["ready"] is False
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
        "ready": True,
        "capability": "placeholder",
    }
    assert response.json()["ready"] is True
    assert set(response.json()) == READY_SAFE_KEYS


@pytest.mark.parametrize(
    ("settings_fixture", "capability"),
    [("settings", "placeholder"), ("enabled_settings", "available")],
)
def test_health_uses_catalog_capability_same_database_and_no_model_details(
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
    settings_fixture: str,
    capability: AgentCapability,
) -> None:
    runtime_settings = cast(RuntimeSettings, request.getfixturevalue(settings_fixture))
    database = build_database(runtime_settings)
    captured: dict[str, Any] = {}
    catalog_inputs: list[tuple[RuntimeSettings, AsyncPostgresDb]] = []
    probe_inputs: list[AsyncPostgresDb] = []

    model = OpenAIResponses(id=MODEL_ID, api_key=MODEL_API_KEY)

    def fail_if_model_runs(*args: object, **kwargs: object) -> None:
        raise AssertionError("health must not invoke the configured model")

    monkeypatch.setattr(model, "invoke", fail_if_model_runs)
    monkeypatch.setattr(model, "ainvoke", fail_if_model_runs)
    agents = (
        [Agent(id="maduoduo", name="码多多", model=model, db=database)]
        if capability == "available"
        else []
    )

    def fake_build_catalog(
        received_settings: RuntimeSettings,
        received_database: AsyncPostgresDb,
    ) -> AgentCatalog:
        catalog_inputs.append((received_settings, received_database))
        return AgentCatalog(agents=agents, capability=capability)

    class CapturingAgentOS:
        def __init__(self, **kwargs: Any) -> None:
            captured.update(kwargs)

        def get_app(self) -> FastAPI:
            return captured["base_app"]

    async def probe(received_database: AsyncPostgresDb) -> bool:
        probe_inputs.append(received_database)
        return True

    monkeypatch.setattr(app_module, "build_catalog", fake_build_catalog)
    app = create_app(
        settings=runtime_settings,
        database=database,
        agent_os_factory=CapturingAgentOS,
        readiness_probe=probe,
    )

    with TestClient(app) as client:
        live_response = client.get("/internal/health/live", headers=AUTHORIZATION)
        ready_response = client.get("/internal/health/ready", headers=AUTHORIZATION)

    assert live_response.json() == {
        "live": True,
        "ready": False,
        "capability": capability,
        "message": "service is live",
    }
    assert ready_response.json() == {"ready": True, "capability": capability}
    responses = live_response.text + ready_response.text
    assert MODEL_ID not in responses
    assert MODEL_API_KEY not in responses
    assert catalog_inputs == [(runtime_settings, database)]
    assert captured["db"] is database
    assert captured["agents"] == agents
    assert probe_inputs == [database]


def test_agentos_receives_exact_disabled_composition_and_same_database(
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

    catalog = build_catalog(settings, database)
    assert response.status_code == 200
    assert captured == {
        "id": "ai-agent-platform",
        "agents": catalog.agents,
        "db": database,
        "base_app": captured["base_app"],
        "settings": AgnoAPISettings(os_security_key=None),
        "auto_provision_dbs": False,
        "telemetry": False,
    }
    assert isinstance(captured["base_app"], FastAPI)
    assert probed == [database]


def test_enabled_real_composition_disables_telemetry_and_reuses_database(
    enabled_settings: RuntimeSettings,
) -> None:
    instances: list[AgentOS] = []
    probed: list[AsyncPostgresDb] = []

    def real_factory(**kwargs: Any) -> AgentOS:
        instance = AgentOS(**kwargs)
        instances.append(instance)
        return instance

    async def probe(received: AsyncPostgresDb) -> bool:
        probed.append(received)
        return True

    database = build_database(enabled_settings)
    app = create_app(
        settings=enabled_settings,
        database=database,
        agent_os_factory=real_factory,
        readiness_probe=probe,
    )

    with TestClient(app) as client:
        response = client.get("/internal/health/ready", headers=AUTHORIZATION)

    assert len(instances) == 1
    agent_os = instances[0]
    assert response.status_code == 200
    assert response.json() == {"ready": True, "capability": "available"}
    assert agent_os.telemetry is False
    assert agent_os.db is database
    assert agent_os.agents is not None
    assert len(agent_os.agents) == 1
    agent = agent_os.agents[0]
    assert isinstance(agent, Agent)
    assert agent.id == "maduoduo"
    assert agent.telemetry is False
    assert agent.db is database
    assert probed == [database]


def test_bearer_middleware_configuration_does_not_retain_plaintext_key(
    settings: RuntimeSettings,
) -> None:
    app = make_app(settings, ready_probe)

    assert SECURITY_KEY not in repr(app.user_middleware)
    assert all(SECURITY_KEY not in repr(entry.kwargs) for entry in app.user_middleware)


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


def test_real_agentos_route_accepts_runtime_credentials_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", SECURITY_KEY)
    monkeypatch.setenv("AGNO_DATABASE_URL", DATABASE_URL)

    app = create_app()
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

    with TestClient(app, raise_server_exceptions=False) as client:
        missing = client.get(discovered_path)
        wrong = client.get(
            discovered_path,
            headers={"Authorization": "Bearer wrong-key"},
        )
        correct = client.get(discovered_path, headers=AUTHORIZATION)

    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert correct.status_code not in {401, 500}
    assert SECURITY_KEY not in missing.text
    assert SECURITY_KEY not in wrong.text
    assert SECURITY_KEY not in correct.text


@pytest.mark.asyncio
async def test_probe_database_uses_the_supplied_engine_and_executes_select_one() -> (
    None
):
    statements: list[str] = []
    connections = 0

    class FakeConnection:
        async def execute(self, statement: object) -> None:
            statements.append(str(statement))

    class FakeConnectionContext(AbstractAsyncContextManager[FakeConnection]):
        async def __aenter__(self) -> FakeConnection:
            return FakeConnection()

        async def __aexit__(
            self,
            exc_type: object,
            exc_value: object,
            traceback: object,
        ) -> None:
            return None

    class FakeEngine:
        def connect(self) -> FakeConnectionContext:
            nonlocal connections
            connections += 1
            return FakeConnectionContext()

    class FakeDatabase:
        db_engine = FakeEngine()

    result = await probe_database(cast(AsyncPostgresDb, FakeDatabase()))

    assert result is True
    assert connections == 1
    assert statements == ["SELECT 1"]


@pytest.mark.asyncio
async def test_sqlalchemy_async_greenlet_bridge_is_available() -> None:
    from sqlalchemy.util.concurrency import greenlet_spawn

    result = await greenlet_spawn(lambda: "available")

    assert result == "available"
