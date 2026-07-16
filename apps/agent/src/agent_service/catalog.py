"""Typed catalog for capabilities registered with AgentOS."""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

from agno.agent import Agent
from agno.db.postgres import AsyncPostgresDb
from agno.models.base import Model

from agent_service.config import ActiveModelSettings, RuntimeSettings
from agent_service.default_agent import build_default_agent
from agent_service.model_registry import build_model


AgentCapability = Literal["placeholder", "available"]
ModelBuilder = Callable[[ActiveModelSettings], Model]
AgentBuilder = Callable[[Model, AsyncPostgresDb], Agent]


@dataclass(frozen=True, slots=True)
class AgentCatalog:
    """Only capabilities that are actually registered by this service."""

    agents: list[Agent] = field(default_factory=list)
    capability: AgentCapability = "placeholder"


def build_catalog(
    settings: RuntimeSettings,
    database: AsyncPostgresDb,
    *,
    model_builder: ModelBuilder = build_model,
    agent_builder: AgentBuilder = build_default_agent,
) -> AgentCatalog:
    """Build the disabled placeholder or the single configured Agent."""
    active_model = settings.active_model
    if active_model is None:
        return AgentCatalog()

    model = model_builder(active_model)
    agent = agent_builder(model, database)
    return AgentCatalog(agents=[agent], capability="available")
