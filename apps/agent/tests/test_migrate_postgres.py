import os
import re
from collections.abc import Awaitable, Callable
from urllib.parse import unquote, urlsplit

import psycopg
import pytest

from agent_service.config import MigrationSettings
from agent_service.migrate import run_migration


MIGRATOR_URL = os.getenv("AGNO_MIGRATOR_DATABASE_URL")
DEDICATED_TEST_DATABASE = re.compile(
    r"ai_agent_platform_identity_test(?:_[a-z0-9][a-z0-9-]{0,63})?"
)


def assert_safe_postgres_test_url(database_url: str) -> str:
    prefix = "postgresql+psycopg_async://"
    if not database_url.startswith(prefix):
        raise ValueError("dedicated local test database must use psycopg async")
    try:
        parsed = urlsplit(f"postgresql://{database_url.removeprefix(prefix)}")
        hostname = parsed.hostname
    except ValueError as error:
        raise ValueError("dedicated local test database URL is invalid") from error

    if parsed.query or parsed.fragment:
        raise ValueError("dedicated local test database URL must not use parameters")
    if hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("dedicated local test database must use loopback")

    database_name = unquote(parsed.path.removeprefix("/"))
    if not DEDICATED_TEST_DATABASE.fullmatch(database_name):
        raise ValueError("dedicated local test database name is required")
    return database_url


Migration = Callable[[MigrationSettings], Awaitable[None]]


async def run_test_migrations_twice(
    database_url: str,
    *,
    migration: Migration = run_migration,
) -> None:
    safe_database_url = assert_safe_postgres_test_url(database_url)
    settings = MigrationSettings.model_validate(
        {"AGNO_MIGRATOR_DATABASE_URL": safe_database_url}
    )
    await migration(settings)
    await migration(settings)


def psycopg_url(url: str) -> str:
    return url.replace("postgresql+psycopg_async://", "postgresql://")


@pytest.mark.asyncio
@pytest.mark.skipif(
    not MIGRATOR_URL,
    reason="AGNO_MIGRATOR_DATABASE_URL is required for PostgreSQL integration",
)
async def test_real_agno_migration_is_idempotent_and_preserves_required_tables() -> (
    None
):
    assert MIGRATOR_URL is not None
    await run_test_migrations_twice(MIGRATOR_URL)

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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "unsafe_url",
    [
        "postgresql+psycopg_async://user:pass@db:5432/ai_agent_platform_identity_test",
        "postgresql+psycopg_async://user:pass@127.0.0.1:5432/ai_agent_platform",
        "postgresql+psycopg_async://user:pass@127.0.0.1:5432/",
        "postgresql+psycopg_async://user:pass@127.0.0.1:5432/%2E%2E",
        "postgresql+psycopg_async://user:pass@127.0.0.1:5432/ai_agent_platform_identity_test?host=db",
        "postgresql+psycopg_async://user:pass@127.0.0.1:5432/ai_agent_platform_identity_test?dbname=ai_agent_platform",
        "postgresql+psycopg_async://user:pass@127.0.0.1:5432/ai_agent_platform_identity_test?%68%6f%73%74=db",
        "postgresql+psycopg_async://user:pass@127.0.0.1:5432/ai_agent_platform_identity_test#host=db",
        "postgresql+psycopg_async://user:pass@127.0.0.1:5432/ai_agent_platform_identity_test#%64%62%6e%61%6d%65=ai_agent_platform",
    ],
)
async def test_unsafe_database_url_is_rejected_before_migration(
    unsafe_url: str,
) -> None:
    calls = 0

    async def migration(settings: MigrationSettings) -> None:
        nonlocal calls
        calls += 1

    with pytest.raises(ValueError, match="dedicated local test database"):
        await run_test_migrations_twice(unsafe_url, migration=migration)

    assert calls == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "safe_url",
    [
        "postgresql+psycopg_async://user:pass@localhost:5432/ai_agent_platform_identity_test",
        "postgresql+psycopg_async://user:pass@127.0.0.1:5432/ai_agent_platform_identity_test_agnotask4",
        "postgresql+psycopg_async://user:pass@[::1]:5432/ai_agent_platform_identity_test_ipv6",
    ],
)
async def test_dedicated_loopback_database_runs_migration_twice(safe_url: str) -> None:
    received: list[str] = []

    async def migration(settings: MigrationSettings) -> None:
        received.append(settings.agno_migrator_database_url.get_secret_value())

    await run_test_migrations_twice(safe_url, migration=migration)

    assert received == [safe_url, safe_url]
