from agno.agent import Agent
from agno.db.postgres import AsyncPostgresDb
import pytest

from agent_service.catalog import build_catalog
from agent_service.config import RuntimeSettings
from agent_service.database import build_database
from agent_service.model_runtime_slot import ModelRuntimeSlot


DATABASE_URL = "postgresql+psycopg_async://runtime:password@db:5432/platform"
SECURITY_KEY = "internal-security-key-0123456789abcdef"


def make_settings(*, enabled: bool, bootstrap: bool = False) -> RuntimeSettings:
    values: dict[str, object] = {
        "OS_SECURITY_KEY": SECURITY_KEY,
        "AGNO_DATABASE_URL": DATABASE_URL,
        "SKILL_REGISTRY_RUNTIME_DATABASE_URL": DATABASE_URL,
        "AGENT_ENABLED": enabled,
    }
    if bootstrap:
        values.update(
            {
                "MODEL_PROVIDER": "openai",
                "MODEL_ID": "catalog-model-id",
                "MODEL_API_KEY": "catalog-model-api-key",
            }
        )
    return RuntimeSettings.model_validate(values)


def test_disabled_catalog_is_placeholder_and_does_not_build_agent_or_slot() -> None:
    settings = make_settings(enabled=False)
    database = build_database(settings)

    def unexpected_slot_builder() -> ModelRuntimeSlot:
        raise AssertionError("disabled catalog must not build a slot")

    def unexpected_agent_builder(_: ModelRuntimeSlot, __: AsyncPostgresDb) -> Agent:
        raise AssertionError("disabled catalog must not build an agent")

    catalog = build_catalog(
        settings,
        database,
        slot_builder=unexpected_slot_builder,
        agent_builder=unexpected_agent_builder,
    )

    assert catalog.agents == []
    assert catalog.capability == "placeholder"
    assert catalog.slot is None
    assert not hasattr(catalog, "models")
    assert not hasattr(catalog, "teams")
    assert not hasattr(catalog, "workflows")
    assert not hasattr(catalog, "knowledge")
    assert not hasattr(catalog, "skills")


@pytest.mark.parametrize("bootstrap", [False, True])
def test_enabled_catalog_always_builds_one_agent_around_dormant_slot(
    bootstrap: bool,
) -> None:
    settings = make_settings(enabled=True, bootstrap=bootstrap)
    database = build_database(settings)
    slot = ModelRuntimeSlot()
    agent = Agent(id="maduoduo", name="码多多", model=slot, db=database)
    slot_builds = 0
    agent_inputs: list[tuple[ModelRuntimeSlot, AsyncPostgresDb]] = []

    def slot_builder() -> ModelRuntimeSlot:
        nonlocal slot_builds
        slot_builds += 1
        return slot

    def agent_builder(
        received_slot: ModelRuntimeSlot,
        received_database: AsyncPostgresDb,
    ) -> Agent:
        agent_inputs.append((received_slot, received_database))
        return agent

    catalog = build_catalog(
        settings,
        database,
        slot_builder=slot_builder,
        agent_builder=agent_builder,
    )

    assert slot_builds == 1
    assert agent_inputs == [(slot, database)]
    assert catalog.agents == [agent]
    assert [registered.id for registered in catalog.agents] == ["maduoduo"]
    assert catalog.slot is slot
    assert catalog.capability == "placeholder"
    assert catalog.runtime_status_provider() == slot.runtime_status()


def test_slot_builder_exception_propagates_without_agent_catalog() -> None:
    settings = make_settings(enabled=True)
    database = build_database(settings)
    error = RuntimeError("model builder failed")

    def exploding_slot_builder() -> ModelRuntimeSlot:
        raise error

    def unexpected_agent_builder(_: ModelRuntimeSlot, __: AsyncPostgresDb) -> Agent:
        raise AssertionError("agent builder must not run after slot failure")

    with pytest.raises(RuntimeError) as caught:
        build_catalog(
            settings,
            database,
            slot_builder=exploding_slot_builder,
            agent_builder=unexpected_agent_builder,
        )

    assert caught.value is error


def test_agent_builder_exception_propagates_without_available_catalog() -> None:
    settings = make_settings(enabled=True)
    database = build_database(settings)
    slot = ModelRuntimeSlot()
    error = RuntimeError("agent builder failed")

    def slot_builder() -> ModelRuntimeSlot:
        return slot

    def exploding_agent_builder(_: ModelRuntimeSlot, __: AsyncPostgresDb) -> Agent:
        raise error

    with pytest.raises(RuntimeError) as caught:
        build_catalog(
            settings,
            database,
            slot_builder=slot_builder,
            agent_builder=exploding_agent_builder,
        )

    assert caught.value is error
