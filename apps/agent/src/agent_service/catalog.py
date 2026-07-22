"""Typed catalog for capabilities registered with AgentOS."""

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from functools import partial

from agno.agent import Agent, AgentFactory
from agno.db.postgres import AsyncPostgresDb

from agent_service.config import RuntimeSettings
from agent_service.model_runtime_slot import (
    ModelRuntimeSlot,
    RuntimeModelCapability,
    RuntimeModelStatus,
)
from agent_service.skill_agent_factory import build_skill_agent_factory


AgentCapability = RuntimeModelCapability
SlotBuilder = Callable[[], ModelRuntimeSlot]
AgentEntry = Agent | AgentFactory
AgentBuilder = Callable[[ModelRuntimeSlot, AsyncPostgresDb], AgentEntry]
RuntimeStatusProvider = Callable[[], RuntimeModelStatus]


def _fixed_status(capability: AgentCapability) -> RuntimeModelStatus:
    return RuntimeModelStatus(
        capability=capability,
        source=None,
        provider=None,
        model_id=None,
        config_revision=None,
        activation_version=None,
    )


@dataclass(frozen=True, slots=True, init=False)
class AgentCatalog:
    """Only capabilities that are actually registered by this service."""

    agents: list[AgentEntry] = field(default_factory=list)
    slot: ModelRuntimeSlot | None = None
    runtime_status_provider: RuntimeStatusProvider = field(
        default=lambda: _fixed_status("placeholder"),
        repr=False,
        compare=False,
    )

    def __init__(
        self,
        agents: Sequence[AgentEntry] | None = None,
        *,
        slot: ModelRuntimeSlot | None = None,
        runtime_status_provider: RuntimeStatusProvider | None = None,
        capability: AgentCapability | None = None,
    ) -> None:
        """Create a dynamic production catalog or a fixed compatibility catalog."""
        if runtime_status_provider is not None and capability is not None:
            raise ValueError("catalog status is ambiguous")
        if runtime_status_provider is None:
            fixed = capability or "placeholder"
            runtime_status_provider = partial(_fixed_status, fixed)
        object.__setattr__(self, "agents", [] if agents is None else list(agents))
        object.__setattr__(self, "slot", slot)
        object.__setattr__(
            self,
            "runtime_status_provider",
            runtime_status_provider,
        )

    @property
    def capability(self) -> AgentCapability:
        """Read current slot capability instead of caching startup state."""
        return self.runtime_status_provider().capability


def build_catalog(
    settings: RuntimeSettings,
    database: AsyncPostgresDb,
    *,
    slot_builder: SlotBuilder = ModelRuntimeSlot,
    agent_builder: AgentBuilder = build_skill_agent_factory,
) -> AgentCatalog:
    """Build the disabled placeholder or one stable Agent around a dormant slot."""
    if not settings.agent_enabled:
        return AgentCatalog()

    slot = slot_builder()
    agent = agent_builder(slot, database)
    return AgentCatalog(
        agents=[agent],
        slot=slot,
        runtime_status_provider=slot.runtime_status,
    )
