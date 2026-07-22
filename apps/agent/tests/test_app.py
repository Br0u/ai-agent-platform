import asyncio
from collections.abc import Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from datetime import UTC, datetime
import inspect
from typing import Any, cast
from uuid import uuid4

import pytest
from agno.agent import Agent
from agno.db.postgres import AsyncPostgresDb
from agno.models.openai import OpenAIResponses
from agno.os import AgentOS
from agno.os.settings import AgnoAPISettings
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from starlette.types import Message, Receive, Scope, Send
from starlette.websockets import WebSocketDisconnect

import agent_service.app as app_module
from agent_service.app import (
    BearerAuthMiddleware,
    create_app,
    probe_database,
    reconcile_runtime_model,
)
from agent_service.catalog import AgentCapability, AgentCatalog, build_catalog
from agent_service.config import ActiveModelSettings, RuntimeSettings
from agent_service.database import build_database
from agent_service.model_config_crypto import ModelConfigCipher
from agent_service.model_config_repository import StoredActiveConfig
from agent_service.model_config_types import ModelProvider
from agent_service.model_endpoint_catalog import (
    ModelEndpointCatalog,
    load_model_endpoint_catalog,
)
from agent_service.model_runtime_slot import (
    ModelRuntimeCleanupError,
    ModelRuntimeSlot,
    RuntimeModelMetadata,
    RuntimeModelStatus,
)
from agent_service.model_runtime_types import ManagedModel
from agent_service.model_control_service import ModelControlService
from agent_service.model_verifier import ModelVerificationResult


DATABASE_URL = "postgresql+psycopg_async://runtime:private-password@db:5432/platform"
SECURITY_KEY = "internal-security-key-0123456789abcdef"
MODEL_ID = "health-must-not-expose-model-id"
MODEL_API_KEY = "health-must-not-expose-model-api-key"
CONTROL_DATABASE_URL = (
    "postgresql+psycopg_async://control:private-password@db:5432/platform"
)
ENCRYPTION_KEY = "11" * 32
CONTROL_KEY = "model-control-key-0123456789abcdef"
AUTHORIZATION = {"Authorization": f"Bearer {SECURITY_KEY}"}
CONTROL_AUTHORIZATION = {"Authorization": f"Bearer {CONTROL_KEY}"}
DISABLED_MODEL_CONTROL_SETTINGS: dict[str, object] = {
    "SKILL_REGISTRY_RUNTIME_DATABASE_URL": DATABASE_URL,
    "AGENT_CONTROL_DATABASE_URL": None,
    "MODEL_CONFIG_ENCRYPTION_KEY": None,
    "AGENT_CONFIG_CONTROL_KEY": None,
}
LIVE_SAFE_KEYS = {"live", "ready", "capability", "message"}
READY_SAFE_KEYS = {"ready", "capability"}
Probe = Callable[[AsyncPostgresDb], Awaitable[bool]]


def managed_model(
    model_id: str,
    closes: list[str],
    *,
    close_entered: asyncio.Event | None = None,
    close_release: asyncio.Event | None = None,
) -> ManagedModel:
    async def close() -> None:
        closes.append(model_id)
        if close_entered is not None:
            close_entered.set()
        if close_release is not None:
            await close_release.wait()

    return ManagedModel(
        model=OpenAIResponses(id=model_id, api_key="test-api-key"),
        close_callback=close,
    )


def dynamic_settings(
    *,
    bootstrap: bool = False,
    model_timeout_seconds: int = 50,
) -> RuntimeSettings:
    values: dict[str, object] = {
        "OS_SECURITY_KEY": SECURITY_KEY,
        "AGNO_DATABASE_URL": DATABASE_URL,
        "SKILL_REGISTRY_RUNTIME_DATABASE_URL": DATABASE_URL,
        "AGENT_CONTROL_DATABASE_URL": CONTROL_DATABASE_URL,
        "MODEL_CONFIG_ENCRYPTION_KEY": ENCRYPTION_KEY,
        "AGENT_CONFIG_CONTROL_KEY": CONTROL_KEY,
        "AGENT_ENABLED": True,
        "MODEL_RUN_TIMEOUT_SECONDS": model_timeout_seconds,
    }
    if bootstrap:
        values.update(
            {
                "MODEL_PROVIDER": "anthropic",
                "MODEL_ID": "bootstrap-model",
                "MODEL_API_KEY": "bootstrap-api-key",
            }
        )
    return RuntimeSettings.model_validate(values)


def stored_active(
    *,
    provider: ModelProvider = "openai",
    model_id: str = "active-rev1",
    revision: int = 1,
    activation_version: int = 7,
    cipher: ModelConfigCipher | None = None,
) -> StoredActiveConfig:
    config_id = uuid4()
    active_cipher = cipher or ModelConfigCipher(
        master_key=dynamic_settings().model_config_encryption_key  # type: ignore[arg-type]
    )
    sealed = active_cipher.seal(
        config_id=config_id,
        provider=provider,
        revision=revision,
        secret=dynamic_settings(bootstrap=True).model_api_key,  # type: ignore[arg-type]
    )
    return StoredActiveConfig(
        config_id=config_id,
        provider=provider,
        model_id=model_id,
        endpoint_id=f"{provider}-official",
        revision=revision,
        test_status="passed",
        sealed=sealed,
        activation_version=activation_version,
        activated_at=datetime.now(UTC),
    )


class ActiveRepository:
    def __init__(
        self,
        active: StoredActiveConfig | None = None,
        *,
        failure: Exception | None = None,
        close_events: list[str] | None = None,
    ) -> None:
        self.active = active
        self.failure = failure
        self.loads = 0
        self.close_events = close_events
        self.current_head: tuple[str, int, str] | None = None

    async def load_active(self) -> StoredActiveConfig | None:
        self.loads += 1
        if self.failure is not None:
            raise self.failure
        return self.active

    async def aclose(self) -> None:
        if self.close_events is not None:
            self.close_events.append("repository")


@pytest.fixture
def settings() -> RuntimeSettings:
    return RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": SECURITY_KEY,
            "AGNO_DATABASE_URL": DATABASE_URL,
            **DISABLED_MODEL_CONTROL_SETTINGS,
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
            **DISABLED_MODEL_CONTROL_SETTINGS,
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


def test_unconfigured_control_paths_remain_behind_the_agentos_bearer(
    settings: RuntimeSettings,
) -> None:
    app = make_app(settings, ready_probe)

    with TestClient(app) as client:
        missing = client.get("/internal/control/model-configs")
        authorized = client.get(
            "/internal/control/model-configs",
            headers=AUTHORIZATION,
        )

    assert missing.status_code == 401
    assert missing.json() == {"detail": "Unauthorized"}
    assert missing.headers["cache-control"] == "no-store"
    assert authorized.status_code == 404


@pytest.mark.parametrize(
    "control_values",
    (
        {"AGENT_CONTROL_DATABASE_URL": CONTROL_DATABASE_URL},
        {"MODEL_CONFIG_ENCRYPTION_KEY": ENCRYPTION_KEY},
        {"AGENT_CONFIG_CONTROL_KEY": CONTROL_KEY},
        {
            "AGENT_CONTROL_DATABASE_URL": CONTROL_DATABASE_URL,
            "MODEL_CONFIG_ENCRYPTION_KEY": ENCRYPTION_KEY,
        },
        {
            "AGENT_CONTROL_DATABASE_URL": CONTROL_DATABASE_URL,
            "AGENT_CONFIG_CONTROL_KEY": CONTROL_KEY,
        },
        {
            "MODEL_CONFIG_ENCRYPTION_KEY": ENCRYPTION_KEY,
            "AGENT_CONFIG_CONTROL_KEY": CONTROL_KEY,
        },
    ),
)
def test_partial_model_control_configuration_fails_app_construction(
    control_values: dict[str, str],
) -> None:
    settings = RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": SECURITY_KEY,
            "AGNO_DATABASE_URL": DATABASE_URL,
            **DISABLED_MODEL_CONTROL_SETTINGS,
            **control_values,
        }
    )
    catalog_called = False

    def unexpected_catalog(
        _settings: RuntimeSettings,
        _database: AsyncPostgresDb,
    ) -> AgentCatalog:
        nonlocal catalog_called
        catalog_called = True
        raise AssertionError("partial control settings must fail before composition")

    with pytest.raises(
        ValueError,
        match="^model control configuration is incomplete$",
    ) as error:
        create_app(settings=settings, catalog_builder=unexpected_catalog)

    assert catalog_called is False
    assert CONTROL_DATABASE_URL not in str(error.value)
    assert ENCRYPTION_KEY not in str(error.value)
    assert CONTROL_KEY not in str(error.value)


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

    app = create_app(
        settings=runtime_settings,
        database=database,
        agent_os_factory=CapturingAgentOS,
        readiness_probe=probe,
        catalog_builder=fake_build_catalog,
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


def test_create_app_defaults_to_the_production_catalog_builder() -> None:
    parameter = inspect.signature(create_app).parameters["catalog_builder"]

    assert parameter.default is app_module.build_catalog


def test_create_app_installs_agno_log_redaction_before_building_runtime(
    settings: RuntimeSettings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    database = build_database(settings)

    def install_redaction() -> None:
        events.append("logging")

    def catalog_builder(
        _: RuntimeSettings,
        __: AsyncPostgresDb,
    ) -> AgentCatalog:
        events.append("catalog")
        return AgentCatalog(agents=[], capability="placeholder")

    class CapturingAgentOS:
        def __init__(self, **kwargs: Any) -> None:
            events.append("agentos")
            self._app = kwargs["base_app"]

        def get_app(self) -> FastAPI:
            return self._app

    monkeypatch.setattr(app_module, "install_agno_log_redaction", install_redaction)

    create_app(
        settings=settings,
        database=database,
        agent_os_factory=CapturingAgentOS,
        catalog_builder=catalog_builder,
    )

    assert events == ["logging", "catalog", "agentos"]


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
    for variable in DISABLED_MODEL_CONTROL_SETTINGS:
        monkeypatch.delenv(variable, raising=False)
    monkeypatch.setenv("SKILL_REGISTRY_RUNTIME_DATABASE_URL", DATABASE_URL)

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


@pytest.mark.asyncio
async def test_reconciliation_prefers_exact_dynamic_active_revision() -> None:
    settings = dynamic_settings(bootstrap=True)
    cipher = ModelConfigCipher(
        master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
    )
    active = stored_active(cipher=cipher, revision=3, activation_version=11)
    repository = ActiveRepository(active)
    built: list[ActiveModelSettings] = []
    closes: list[str] = []
    slot = ModelRuntimeSlot()
    await slot.start()

    def build_model(model_settings: ActiveModelSettings) -> ManagedModel:
        built.append(model_settings)
        return managed_model(model_settings.model_id, closes)

    await reconcile_runtime_model(
        settings=settings,
        slot=slot,
        repository=repository,
        cipher=cipher,
        endpoint_catalog=load_model_endpoint_catalog(),
        model_builder=build_model,
    )

    assert repository.loads == 1
    assert [item.model_id for item in built] == ["active-rev1"]
    assert built[0].provider == "openai"
    assert built[0].base_url == "https://api.openai.com/v1"
    assert slot.runtime_status() == RuntimeModelStatus(
        capability="available",
        source="dynamic",
        provider="openai",
        model_id="active-rev1",
        config_revision=3,
        activation_version=11,
    )
    await slot.shutdown()
    assert closes == ["active-rev1"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider", "expected_base_url"),
    [
        ("openai", "https://api.openai.com/v1"),
        ("anthropic", "https://api.anthropic.com"),
        ("google", "https://generativelanguage.googleapis.com"),
        (
            "dashscope",
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        ),
        ("deepseek", "https://api.deepseek.com"),
        ("minimax", "https://api.minimax.io/v1"),
    ],
)
async def test_dynamic_reconciliation_supports_every_catalog_provider(
    provider: ModelProvider,
    expected_base_url: str,
) -> None:
    settings = dynamic_settings()
    cipher = ModelConfigCipher(
        master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
    )
    active = stored_active(
        cipher=cipher,
        provider=provider,
        model_id=f"{provider}-dynamic",
    )
    built: list[ActiveModelSettings] = []
    closes: list[str] = []
    slot = ModelRuntimeSlot()
    await slot.start()

    def build_model(model_settings: ActiveModelSettings) -> ManagedModel:
        built.append(model_settings)
        return managed_model(model_settings.model_id, closes)

    await reconcile_runtime_model(
        settings=settings,
        slot=slot,
        repository=ActiveRepository(active),
        cipher=cipher,
        endpoint_catalog=load_model_endpoint_catalog(),
        model_builder=build_model,
    )

    assert len(built) == 1
    assert built[0].provider == provider
    assert built[0].model_id == f"{provider}-dynamic"
    assert built[0].base_url == expected_base_url
    assert slot.runtime_status().capability == "available"
    assert slot.runtime_status().provider == provider
    await slot.shutdown()


@pytest.mark.asyncio
async def test_corrupt_dynamic_active_degrades_and_never_falls_back_to_bootstrap() -> (
    None
):
    settings = dynamic_settings(bootstrap=True)
    active = stored_active()
    wrong_cipher = ModelConfigCipher(
        master_key=RuntimeSettings.model_validate(
            {
                "OS_SECURITY_KEY": SECURITY_KEY,
                "AGNO_DATABASE_URL": DATABASE_URL,
                "SKILL_REGISTRY_RUNTIME_DATABASE_URL": DATABASE_URL,
                "MODEL_CONFIG_ENCRYPTION_KEY": "22" * 32,
            }
        ).model_config_encryption_key  # type: ignore[arg-type]
    )
    slot = ModelRuntimeSlot()
    await slot.start()

    def unexpected_builder(_: ActiveModelSettings) -> ManagedModel:
        raise AssertionError("dynamic corruption must suppress bootstrap")

    await reconcile_runtime_model(
        settings=settings,
        slot=slot,
        repository=ActiveRepository(active),
        cipher=wrong_cipher,
        endpoint_catalog=load_model_endpoint_catalog(),
        model_builder=unexpected_builder,
    )

    assert slot.runtime_status().capability == "degraded"
    assert slot.runtime_status().source is None
    await slot.shutdown()


@pytest.mark.asyncio
async def test_dynamic_builder_failure_degrades_without_bootstrap_fallback() -> None:
    settings = dynamic_settings(bootstrap=True)
    cipher = ModelConfigCipher(
        master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
    )
    built: list[str] = []
    slot = ModelRuntimeSlot()
    await slot.start()

    def failing_builder(model_settings: ActiveModelSettings) -> ManagedModel:
        built.append(model_settings.model_id)
        raise RuntimeError("private provider construction details")

    await reconcile_runtime_model(
        settings=settings,
        slot=slot,
        repository=ActiveRepository(stored_active(cipher=cipher)),
        cipher=cipher,
        endpoint_catalog=load_model_endpoint_catalog(),
        model_builder=failing_builder,
    )

    assert built == ["active-rev1"]
    assert slot.runtime_status().capability == "degraded"
    assert slot.runtime_status().source is None
    await slot.shutdown()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("bootstrap", "repository_failure", "expected_capability", "expected_source"),
    [
        (True, None, "available", "deployment"),
        (False, None, "placeholder", None),
        (True, RuntimeError("control unavailable"), "degraded", None),
    ],
)
async def test_reconciliation_bootstrap_placeholder_and_unavailable_precedence(
    bootstrap: bool,
    repository_failure: Exception | None,
    expected_capability: AgentCapability,
    expected_source: str | None,
) -> None:
    settings = dynamic_settings(bootstrap=bootstrap)
    slot = ModelRuntimeSlot()
    closes: list[str] = []
    built: list[ActiveModelSettings] = []
    await slot.start()

    def build_model(model_settings: ActiveModelSettings) -> ManagedModel:
        built.append(model_settings)
        return managed_model(model_settings.model_id, closes)

    await reconcile_runtime_model(
        settings=settings,
        slot=slot,
        repository=ActiveRepository(failure=repository_failure),
        cipher=ModelConfigCipher(
            master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
        ),
        endpoint_catalog=load_model_endpoint_catalog(),
        model_builder=build_model,
    )

    assert slot.runtime_status().capability == expected_capability
    assert slot.runtime_status().source == expected_source
    assert [item.model_id for item in built] == (
        ["bootstrap-model"] if expected_source == "deployment" else []
    )
    await slot.shutdown()


@pytest.mark.asyncio
async def test_reconciliation_closes_constructed_handle_when_activation_fails() -> None:
    settings = dynamic_settings()
    cipher = ModelConfigCipher(
        master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
    )
    closes: list[str] = []
    slot = ModelRuntimeSlot()

    await reconcile_runtime_model(
        settings=settings,
        slot=slot,
        repository=ActiveRepository(stored_active(cipher=cipher)),
        cipher=cipher,
        endpoint_catalog=load_model_endpoint_catalog(),
        model_builder=lambda model_settings: managed_model(
            model_settings.model_id,
            closes,
        ),
    )

    assert closes == ["active-rev1"]
    assert slot.runtime_status().capability == "degraded"


@pytest.mark.asyncio
@pytest.mark.parametrize("new_head_status", ["untested", "failed"])
async def test_restart_recovers_pointer_revision_not_new_current_head(
    new_head_status: str,
) -> None:
    settings = dynamic_settings()
    cipher = ModelConfigCipher(
        master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
    )
    active_rev1 = stored_active(
        cipher=cipher,
        model_id="provider-rev1",
        revision=1,
        activation_version=4,
    )
    repository = ActiveRepository(active_rev1)
    repository.current_head = ("provider-rev2", 2, new_head_status)
    built: list[str] = []
    closes: list[str] = []

    def build_model(model_settings: ActiveModelSettings) -> ManagedModel:
        built.append(model_settings.model_id)
        return managed_model(model_settings.model_id, closes)

    slot = ModelRuntimeSlot()
    await slot.start()
    await reconcile_runtime_model(
        settings=settings,
        slot=slot,
        repository=repository,
        cipher=cipher,
        endpoint_catalog=load_model_endpoint_catalog(),
        model_builder=build_model,
    )

    assert built == ["provider-rev1"]
    assert slot.runtime_status().config_revision == 1
    assert slot.runtime_status().activation_version == 4
    await slot.shutdown()


def test_lifespan_reconciles_before_requests_and_closes_model_before_repository() -> (
    None
):
    settings = dynamic_settings()
    cipher = ModelConfigCipher(
        master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
    )
    events: list[str] = []
    repository = ActiveRepository(
        stored_active(cipher=cipher),
        close_events=events,
    )

    async def probe(_: AsyncPostgresDb) -> bool:
        events.append("request")
        return True

    def build_model(model_settings: ActiveModelSettings) -> ManagedModel:
        events.append("reconciled")
        return managed_model(model_settings.model_id, events)

    app = create_app(
        settings=settings,
        readiness_probe=probe,
        repository_builder=lambda _: repository,
        cipher_builder=lambda _: cipher,
        model_builder=build_model,
    )

    with TestClient(app) as client:
        response = client.get("/internal/health/ready", headers=AUTHORIZATION)
        assert response.json() == {"ready": True, "capability": "available"}
        assert events == ["reconciled", "request"]

    assert events == ["reconciled", "request", "active-rev1", "repository"]


def test_lifespan_injects_one_control_dependency_graph_with_runtime_verifier() -> None:
    settings = dynamic_settings(model_timeout_seconds=37)
    events: list[str] = []
    repository = ActiveRepository(close_events=events)
    cipher = ModelConfigCipher(
        master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
    )
    endpoints = load_model_endpoint_catalog()
    slot = ModelRuntimeSlot()
    catalog = AgentCatalog(
        agents=[Agent(id="maduoduo", name="码多多", model=slot)],
        slot=slot,
        runtime_status_provider=slot.runtime_status,
    )
    repository_builds = 0
    cipher_builds = 0
    endpoint_builds = 0
    captured: dict[str, object] = {}

    def build_repository(_: SecretStr) -> ActiveRepository:
        nonlocal repository_builds
        repository_builds += 1
        return repository

    def build_cipher(_: SecretStr) -> ModelConfigCipher:
        nonlocal cipher_builds
        cipher_builds += 1
        return cipher

    def build_endpoints(_: str | None) -> ModelEndpointCatalog:
        nonlocal endpoint_builds
        endpoint_builds += 1
        return endpoints

    async def verifier(
        _managed: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        raise AssertionError(f"verifier must not run during startup: {timeout_seconds}")

    def build_control_service(**kwargs: Any) -> ModelControlService:
        captured.update(kwargs)
        return ModelControlService(**kwargs)

    app = create_app(
        settings=settings,
        readiness_probe=ready_probe,
        catalog_builder=lambda _settings, _database: catalog,
        repository_builder=build_repository,
        cipher_builder=build_cipher,
        endpoint_catalog_builder=build_endpoints,
        model_verifier=verifier,
        control_service_factory=build_control_service,
    )

    with TestClient(app) as client:
        response = client.get("/internal/health/ready", headers=AUTHORIZATION)

    assert response.status_code == 200
    assert repository_builds == 1
    assert cipher_builds == 1
    assert endpoint_builds == 1
    assert repository.loads == 1
    assert events == ["repository"]
    assert captured["repository"] is repository
    assert captured["cipher"] is cipher
    assert captured["endpoint_catalog"] is endpoints
    assert captured["slot"] is slot
    assert captured["bootstrap_model"] is None
    assert captured["control_enabled"] is True
    assert captured["verifier"] is verifier
    assert captured["verification_timeout_seconds"] == 37


@pytest.mark.asyncio
async def test_lifespan_cancellation_waits_for_ordered_runtime_cleanup() -> None:
    settings = dynamic_settings()
    cipher = ModelConfigCipher(
        master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
    )
    events: list[str] = []
    close_entered = asyncio.Event()
    close_release = asyncio.Event()
    repository = ActiveRepository(
        stored_active(cipher=cipher),
        close_events=events,
    )
    slot = ModelRuntimeSlot()
    catalog = AgentCatalog(
        agents=[Agent(id="maduoduo", name="码多多", model=slot)],
        slot=slot,
        runtime_status_provider=slot.runtime_status,
    )

    class BaseAppAgentOS:
        def __init__(self, **kwargs: Any) -> None:
            self.app = cast(FastAPI, kwargs["base_app"])

        def get_app(self) -> FastAPI:
            return self.app

    def build_model(model_settings: ActiveModelSettings) -> ManagedModel:
        return managed_model(
            model_settings.model_id,
            events,
            close_entered=close_entered,
            close_release=close_release,
        )

    app = create_app(
        settings=settings,
        agent_os_factory=BaseAppAgentOS,
        catalog_builder=lambda _settings, _database: catalog,
        repository_builder=lambda _: repository,
        cipher_builder=lambda _: cipher,
        model_builder=build_model,
    )
    lifespan = app.router.lifespan_context(app)
    await lifespan.__aenter__()
    assert slot.runtime_status().capability == "available"

    exit_task = asyncio.create_task(lifespan.__aexit__(None, None, None))
    await asyncio.wait_for(close_entered.wait(), timeout=5)
    exit_task.cancel()
    await asyncio.sleep(0)
    exit_task.cancel()
    await asyncio.sleep(0)
    repository_closed_before_model = "repository" in events
    exit_finished_before_model = exit_task.done()

    close_release.set()
    cancellation_propagated = False
    try:
        await exit_task
    except asyncio.CancelledError:
        cancellation_propagated = True
    async with asyncio.timeout(5):
        while not slot.reaper_stopped:
            await asyncio.sleep(0)

    assert repository_closed_before_model is False
    assert exit_finished_before_model is False
    assert events == ["active-rev1", "repository"]
    assert slot.reaper_stopped is True
    assert cancellation_propagated is True


@pytest.mark.asyncio
async def test_disabled_lifespan_cancellation_waits_for_one_repository_close() -> None:
    settings = RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": SECURITY_KEY,
            "AGNO_DATABASE_URL": DATABASE_URL,
            "SKILL_REGISTRY_RUNTIME_DATABASE_URL": DATABASE_URL,
            "AGENT_CONTROL_DATABASE_URL": CONTROL_DATABASE_URL,
            "MODEL_CONFIG_ENCRYPTION_KEY": ENCRYPTION_KEY,
            "AGENT_CONFIG_CONTROL_KEY": CONTROL_KEY,
            "AGENT_ENABLED": False,
        }
    )
    close_entered = asyncio.Event()
    close_release = asyncio.Event()
    close_calls = 0
    close_finished = False

    class BlockingRepository(ActiveRepository):
        async def aclose(self) -> None:
            nonlocal close_calls, close_finished
            close_calls += 1
            close_entered.set()
            await close_release.wait()
            close_finished = True

    repository = BlockingRepository()
    app = create_app(
        settings=settings,
        repository_builder=lambda _: repository,
    )
    lifespan = app.router.lifespan_context(app)
    await lifespan.__aenter__()

    exit_task = asyncio.create_task(lifespan.__aexit__(None, None, None))
    await asyncio.wait_for(close_entered.wait(), timeout=5)
    exit_task.cancel()
    await asyncio.sleep(0)
    assert exit_task.done() is False
    exit_task.cancel()
    await asyncio.sleep(0)
    assert exit_task.done() is False

    close_release.set()
    with pytest.raises(asyncio.CancelledError):
        await exit_task

    assert close_calls == 1
    assert close_finished is True


@pytest.mark.asyncio
async def test_lifespan_preserves_fixed_cleanup_failure_after_repository_close() -> (
    None
):
    settings = dynamic_settings()
    cipher = ModelConfigCipher(
        master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
    )
    events: list[str] = []
    repository = ActiveRepository(
        stored_active(cipher=cipher),
        close_events=events,
    )
    slot = ModelRuntimeSlot()
    catalog = AgentCatalog(
        agents=[Agent(id="maduoduo", name="码多多", model=slot)],
        slot=slot,
        runtime_status_provider=slot.runtime_status,
    )

    class BaseAppAgentOS:
        def __init__(self, **kwargs: Any) -> None:
            self.app = cast(FastAPI, kwargs["base_app"])

        def get_app(self) -> FastAPI:
            return self.app

    def build_model(model_settings: ActiveModelSettings) -> ManagedModel:
        async def failing_close() -> None:
            events.append(model_settings.model_id)
            raise RuntimeError("private model cleanup failure")

        return ManagedModel(
            model=OpenAIResponses(
                id=model_settings.model_id,
                api_key="test-api-key",
            ),
            close_callback=failing_close,
        )

    app = create_app(
        settings=settings,
        agent_os_factory=BaseAppAgentOS,
        catalog_builder=lambda _settings, _database: catalog,
        repository_builder=lambda _: repository,
        cipher_builder=lambda _: cipher,
        model_builder=build_model,
    )
    lifespan = app.router.lifespan_context(app)
    await lifespan.__aenter__()

    with pytest.raises(
        ModelRuntimeCleanupError,
        match="^model runtime cleanup failed$",
    ):
        await lifespan.__aexit__(None, None, None)

    assert events == ["active-rev1", "repository"]
    assert slot.reaper_stopped is True


@pytest.mark.parametrize("failing_dependency", ["cipher", "endpoint"])
def test_lifespan_control_dependency_failure_isolated_from_bootstrap_reconciliation(
    failing_dependency: str,
) -> None:
    settings = dynamic_settings(bootstrap=True)
    repository = ActiveRepository()
    built: list[ActiveModelSettings] = []
    closes: list[str] = []

    def unexpected_cipher(_: SecretStr) -> ModelConfigCipher:
        if failing_dependency == "cipher":
            raise AssertionError("cipher is dynamic-only")
        return ModelConfigCipher(
            master_key=settings.model_config_encryption_key  # type: ignore[arg-type]
        )

    def unexpected_endpoint(_: str | None) -> ModelEndpointCatalog:
        if failing_dependency == "endpoint":
            raise AssertionError("endpoint catalog is dynamic-only")
        return load_model_endpoint_catalog()

    def build_model(model_settings: ActiveModelSettings) -> ManagedModel:
        built.append(model_settings)
        return managed_model(model_settings.model_id, closes)

    app = create_app(
        settings=settings,
        readiness_probe=ready_probe,
        repository_builder=lambda _: repository,
        cipher_builder=unexpected_cipher,
        endpoint_catalog_builder=unexpected_endpoint,
        model_builder=build_model,
    )

    with TestClient(app) as client:
        response = client.get("/internal/health/ready", headers=AUTHORIZATION)
        control_response = client.get(
            "/internal/control/model-configs",
            headers=CONTROL_AUTHORIZATION,
        )
        status = app.state.model_runtime_status()

    assert repository.loads == 1
    assert response.json() == {"ready": True, "capability": "available"}
    assert control_response.status_code == 503
    assert control_response.json() == {"error": "storage_unavailable"}
    assert control_response.headers["cache-control"] == "no-store"
    assert [item.model_id for item in built] == ["bootstrap-model"]
    assert status.capability == "available"
    assert status.source == "deployment"
    assert status.activation_version is None
    assert closes == ["bootstrap-model"]


def test_lifespan_turns_control_failure_into_degraded_safe_runtime_status() -> None:
    settings = dynamic_settings(bootstrap=True)
    repository = ActiveRepository(failure=RuntimeError("private DB URL and key"))
    app = create_app(
        settings=settings,
        readiness_probe=ready_probe,
        repository_builder=lambda _: repository,
    )

    with TestClient(app) as client:
        response = client.get("/internal/health/ready", headers=AUTHORIZATION)
        control_response = client.get(
            "/internal/control/model-configs",
            headers=CONTROL_AUTHORIZATION,
        )
        status = app.state.model_runtime_status()

    assert response.json() == {"ready": True, "capability": "degraded"}
    assert status == RuntimeModelStatus(
        capability="degraded",
        source=None,
        provider=None,
        model_id=None,
        config_revision=None,
        activation_version=None,
    )
    assert control_response.status_code == 503
    assert control_response.json() == {"error": "storage_unavailable"}
    assert "private" not in response.text


def test_health_reads_live_slot_capability_on_every_request() -> None:
    settings = dynamic_settings()
    slot = ModelRuntimeSlot()
    catalog = AgentCatalog(
        agents=[Agent(id="maduoduo", name="码多多", model=slot)],
        slot=slot,
        runtime_status_provider=slot.runtime_status,
    )
    closes: list[str] = []
    app = create_app(
        settings=settings,
        readiness_probe=ready_probe,
        catalog_builder=lambda _settings, _database: catalog,
        repository_builder=lambda _: ActiveRepository(),
    )

    with TestClient(app) as client:
        placeholder = client.get(
            "/internal/health/ready",
            headers=AUTHORIZATION,
        )
        slot.activate(
            managed_model("runtime", closes),
            1,
            RuntimeModelMetadata(
                source="dynamic",
                provider="openai",
                model_id="runtime-model",
                config_revision=1,
            ),
        )
        available = client.get(
            "/internal/health/ready",
            headers=AUTHORIZATION,
        )
        slot.deactivate(capability="degraded")
        degraded = client.get(
            "/internal/health/ready",
            headers=AUTHORIZATION,
        )

    assert placeholder.json()["capability"] == "placeholder"
    assert available.json()["capability"] == "available"
    assert degraded.json()["capability"] == "degraded"
    assert closes == ["runtime"]
