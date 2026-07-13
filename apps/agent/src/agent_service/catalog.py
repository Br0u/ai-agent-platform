"""Typed, deliberately empty AgentOS capability catalog."""

from dataclasses import dataclass, field
from typing import Literal

from agno.agent import Agent

from agent_service.config import RuntimeSettings


@dataclass(frozen=True, slots=True)
class AgentCatalog:
    """Only capabilities that are actually registered by this service."""

    agents: list[Agent] = field(default_factory=list)
    capability: Literal["placeholder"] = "placeholder"


def build_catalog(settings: RuntimeSettings) -> AgentCatalog:
    """Return the model-free catalog for the current implementation phase."""
    return AgentCatalog(capability=settings.capability)
