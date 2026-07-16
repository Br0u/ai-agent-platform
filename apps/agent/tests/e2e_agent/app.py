"""Acceptance-only application factory with an offline deterministic model."""

from agno.db.postgres import AsyncPostgresDb
from fastapi import FastAPI

from agent_service.app import create_app
from agent_service.catalog import AgentCatalog
from agent_service.config import RuntimeSettings
from agent_service.default_agent import build_default_agent
from e2e_agent.deterministic_model import DeterministicModel


def build_acceptance_catalog(
    settings: RuntimeSettings,
    database: AsyncPostgresDb,
) -> AgentCatalog:
    """Build the normal placeholder or the single offline acceptance Agent."""
    active_model = settings.active_model
    if active_model is None:
        return AgentCatalog()

    model = DeterministicModel(id=active_model.model_id)
    agent = build_default_agent(model=model, database=database)
    return AgentCatalog(agents=[agent], capability="available")


def app_factory() -> FastAPI:
    """Uvicorn factory for deterministic container acceptance only."""
    return create_app(catalog_builder=build_acceptance_catalog)
