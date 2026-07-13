import os

import psycopg
import pytest

from agent_service.config import MigrationSettings
from agent_service.migrate import run_migration


MIGRATOR_URL = os.getenv("AGNO_MIGRATOR_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not MIGRATOR_URL,
    reason="AGNO_MIGRATOR_DATABASE_URL is required for PostgreSQL integration",
)


def psycopg_url(url: str) -> str:
    return url.replace("postgresql+psycopg_async://", "postgresql://")


@pytest.mark.asyncio
async def test_real_agno_migration_is_idempotent_and_preserves_required_tables() -> (
    None
):
    assert MIGRATOR_URL is not None
    settings = MigrationSettings.model_validate(
        {"AGNO_MIGRATOR_DATABASE_URL": MIGRATOR_URL}
    )

    await run_migration(settings=settings)
    await run_migration(settings=settings)

    async with await psycopg.AsyncConnection.connect(psycopg_url(MIGRATOR_URL)) as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(
                """SELECT
                  to_regclass('agno.agno_sessions')::text,
                  to_regclass('agno.agno_schema_versions')::text"""
            )
            assert await cursor.fetchone() == (
                "agno.agno_sessions",
                "agno.agno_schema_versions",
            )
