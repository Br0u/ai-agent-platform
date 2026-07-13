"""Runtime-only Agno database boundary."""

from agno.db.postgres import AsyncPostgresDb

from agent_service.config import RuntimeSettings


def build_database(settings: RuntimeSettings) -> AsyncPostgresDb:
    """Build the isolated Agno runtime database without exposing its secret URL."""
    return AsyncPostgresDb(
        db_url=settings.agno_database_url.get_secret_value(),
        db_schema="agno",
    )
