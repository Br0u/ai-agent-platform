from __future__ import annotations

from pathlib import Path
from uuid import UUID

from agno.agent import Agent
from agno.db.postgres import AsyncPostgresDb
from agno.factory import FactoryContextRequired, RequestContext
from agno.skills import Skills
import pytest

from agent_service.config import RuntimeSettings
from agent_service.database import build_database
from agent_service.model_runtime_slot import ModelRuntimeSlot
from agent_service.skill_agent_factory import (
    build_skill_agent_factory,
    runtime_generation_context,
)
from agent_service.skill_generation_slot import RuntimeGeneration


DATABASE_URL = "postgresql+psycopg_async://runtime:password@db:5432/platform"
SET_ID = UUID("10000000-0000-4000-8000-000000000001")


def dependencies() -> tuple[ModelRuntimeSlot, AsyncPostgresDb]:
    settings = RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": "internal-security-key-0123456789abcdef",
            "AGNO_DATABASE_URL": DATABASE_URL,
            "SKILL_REGISTRY_RUNTIME_DATABASE_URL": DATABASE_URL,
        }
    )
    return ModelRuntimeSlot(), build_database(settings)


def test_factory_reuses_model_and_database_and_selects_generation_skills() -> None:
    slot, database = dependencies()
    skills = Skills(loaders=[])
    generation = RuntimeGeneration(
        True,
        SET_ID,
        1,
        skills,
        Path(f"/run/aap-skills/generation-{SET_ID}"),
    )
    factory = build_skill_agent_factory(slot, database)

    with runtime_generation_context(generation):
        agent = factory.resolve(RequestContext(), Agent)

    assert agent.id == factory.id == "maduoduo"
    assert agent.model is slot
    assert agent.db is database
    assert agent.skills is skills
    assert all("没有工具或操作权限" not in item for item in agent.instructions)
    assert any("当前已审核 Skill" in item for item in agent.instructions)


def test_factory_explicit_empty_generation_exposes_no_skills() -> None:
    slot, database = dependencies()
    generation = RuntimeGeneration(
        True,
        SET_ID,
        1,
        None,
        Path(f"/run/aap-skills/generation-{SET_ID}"),
    )
    factory = build_skill_agent_factory(slot, database)

    with runtime_generation_context(generation):
        agent = factory.resolve(RequestContext(), Agent)

    assert agent.skills is None
    assert agent.tools == []
    assert any("没有工具或操作权限" in item for item in agent.instructions)


def test_factory_fails_closed_without_middleware_generation_context() -> None:
    slot, database = dependencies()
    factory = build_skill_agent_factory(slot, database)

    with pytest.raises(FactoryContextRequired):
        factory.resolve(RequestContext(), Agent)
