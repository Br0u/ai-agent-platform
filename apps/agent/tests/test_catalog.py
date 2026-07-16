from agno.agent import Agent
from agno.db.postgres import AsyncPostgresDb
from agno.models.base import Model
from agno.models.openai import OpenAIResponses
import pytest

from agent_service.catalog import build_catalog
from agent_service.config import ActiveModelSettings, RuntimeSettings
from agent_service.database import build_database


DATABASE_URL = "postgresql+psycopg_async://runtime:password@db:5432/platform"
SECURITY_KEY = "internal-security-key-0123456789abcdef"


def make_settings(*, enabled: bool) -> RuntimeSettings:
    values: dict[str, object] = {
        "OS_SECURITY_KEY": SECURITY_KEY,
        "AGNO_DATABASE_URL": DATABASE_URL,
        "AGENT_ENABLED": enabled,
    }
    if enabled:
        values.update(
            {
                "MODEL_PROVIDER": "openai",
                "MODEL_ID": "catalog-model-id",
                "MODEL_API_KEY": "catalog-model-api-key",
            }
        )
    return RuntimeSettings.model_validate(values)


def test_disabled_catalog_is_placeholder_and_does_not_call_builders() -> None:
    settings = make_settings(enabled=False)
    database = build_database(settings)

    def unexpected_model_builder(_: ActiveModelSettings) -> Model:
        raise AssertionError("disabled catalog must not build a model")

    def unexpected_agent_builder(_: Model, __: AsyncPostgresDb) -> Agent:
        raise AssertionError("disabled catalog must not build an agent")

    catalog = build_catalog(
        settings,
        database,
        model_builder=unexpected_model_builder,
        agent_builder=unexpected_agent_builder,
    )

    assert catalog.agents == []
    assert catalog.capability == "placeholder"
    assert not hasattr(catalog, "models")
    assert not hasattr(catalog, "teams")
    assert not hasattr(catalog, "workflows")
    assert not hasattr(catalog, "knowledge")
    assert not hasattr(catalog, "skills")


def test_enabled_catalog_builds_exactly_one_default_agent_and_is_available() -> None:
    settings = make_settings(enabled=True)
    database = build_database(settings)
    model = OpenAIResponses(id="test-model", api_key="test-api-key")
    agent = Agent(id="maduoduo", name="码多多", model=model, db=database)
    model_inputs: list[ActiveModelSettings] = []
    agent_inputs: list[tuple[Model, AsyncPostgresDb]] = []

    def model_builder(active_model: ActiveModelSettings) -> Model:
        model_inputs.append(active_model)
        return model

    def agent_builder(received_model: Model, received_database: AsyncPostgresDb) -> Agent:
        agent_inputs.append((received_model, received_database))
        return agent

    catalog = build_catalog(
        settings,
        database,
        model_builder=model_builder,
        agent_builder=agent_builder,
    )

    assert model_inputs == [settings.active_model]
    assert agent_inputs == [(model, database)]
    assert catalog.agents == [agent]
    assert [registered.id for registered in catalog.agents] == ["maduoduo"]
    assert catalog.capability == "available"


def test_model_builder_exception_propagates_without_available_catalog() -> None:
    settings = make_settings(enabled=True)
    database = build_database(settings)
    error = RuntimeError("model builder failed")

    def exploding_model_builder(_: ActiveModelSettings) -> Model:
        raise error

    def unexpected_agent_builder(_: Model, __: AsyncPostgresDb) -> Agent:
        raise AssertionError("agent builder must not run after model failure")

    with pytest.raises(RuntimeError) as caught:
        build_catalog(
            settings,
            database,
            model_builder=exploding_model_builder,
            agent_builder=unexpected_agent_builder,
        )

    assert caught.value is error


def test_agent_builder_exception_propagates_without_available_catalog() -> None:
    settings = make_settings(enabled=True)
    database = build_database(settings)
    model = OpenAIResponses(id="test-model", api_key="test-api-key")
    error = RuntimeError("agent builder failed")

    def model_builder(_: ActiveModelSettings) -> Model:
        return model

    def exploding_agent_builder(_: Model, __: AsyncPostgresDb) -> Agent:
        raise error

    with pytest.raises(RuntimeError) as caught:
        build_catalog(
            settings,
            database,
            model_builder=model_builder,
            agent_builder=exploding_agent_builder,
        )

    assert caught.value is error
