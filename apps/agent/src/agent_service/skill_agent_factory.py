"""Fixed AgentFactory bound to one middleware-captured Skill generation."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from collections.abc import Iterator

from agno.agent import Agent, AgentFactory
from agno.db.postgres import AsyncPostgresDb
from agno.factory import FactoryContextRequired, RequestContext

from agent_service.default_agent import build_default_agent
from agent_service.model_runtime_slot import ModelRuntimeSlot
from agent_service.skill_generation_slot import RuntimeGeneration


_CURRENT_GENERATION: ContextVar[RuntimeGeneration | None] = ContextVar(
    "maduoduo_runtime_generation",
    default=None,
)


class NonPersistingSkillAgentFactory(AgentFactory):
    def _post_resolve(self, component: Agent) -> None:
        if component.id is not None and component.id != self.id:
            raise RuntimeError("assistant agent id does not match factory id")
        component.id = self.id
        component.db = None
        component.store_events = False
        component.initialize_agent()
        if component.db is not None or component.store_events or component.id != self.id:
            raise RuntimeError("assistant agent persistence must remain disabled")


def current_runtime_generation() -> RuntimeGeneration | None:
    return _CURRENT_GENERATION.get()


def set_runtime_generation(
    generation: RuntimeGeneration,
) -> Token[RuntimeGeneration | None]:
    if type(generation) is not RuntimeGeneration:
        raise ValueError("invalid runtime generation")
    return _CURRENT_GENERATION.set(generation)


def reset_runtime_generation(token: Token[RuntimeGeneration | None]) -> None:
    _CURRENT_GENERATION.reset(token)


@contextmanager
def runtime_generation_context(generation: RuntimeGeneration) -> Iterator[None]:
    token = set_runtime_generation(generation)
    try:
        yield
    finally:
        reset_runtime_generation(token)


def build_skill_agent_factory(
    model: ModelRuntimeSlot,
    database: AsyncPostgresDb,
) -> AgentFactory:
    """Register one stable ID while constructing a fresh generation-bound Agent."""

    def build(_: RequestContext) -> Agent:
        generation = current_runtime_generation()
        if generation is None:
            raise FactoryContextRequired("runtime generation context is required")
        return build_default_agent(model, skills=generation.skills)

    return NonPersistingSkillAgentFactory(
        id="maduoduo",
        name="码多多",
        db=database,
        factory=build,
    )
