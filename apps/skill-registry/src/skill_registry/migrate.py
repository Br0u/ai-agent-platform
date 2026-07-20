"""One-shot migration entrypoint for the skill registry schema."""

import asyncio
from collections.abc import Awaitable, Callable
import sys
from typing import Any, Protocol, cast

import psycopg

from skill_registry.config import MigrationSettings
from skill_registry.schema import (
    EXPECTED_BACKUP_GRANTS,
    EXPECTED_MANAGER_COLUMN_GRANTS,
    EXPECTED_MANAGER_TABLE_GRANTS,
    EXPECTED_SCHEMA_GRANTS,
    EXPECTED_TABLE_OWNERS,
    PREPARE_SCHEMA_SQL,
    SCHEMA_VERSION_1_SQL,
    SELECT_SCHEMA_VERSION_SQL,
    VERIFY_BACKUP_GRANTS_SQL,
    VERIFY_FORBIDDEN_GRANTS_SQL,
    VERIFY_MANAGER_COLUMN_GRANTS_SQL,
    VERIFY_MANAGER_TABLE_GRANTS_SQL,
    VERIFY_SCHEMA_GRANTS_SQL,
    VERIFY_SCHEMA_OWNER_SQL,
    VERIFY_TABLES_SQL,
)


class MigrationCursor(Protocol):
    async def __aenter__(self) -> "MigrationCursor": ...

    async def __aexit__(self, *args: object) -> None: ...

    async def execute(self, query: str) -> Any: ...

    async def fetchone(self) -> tuple[Any, ...] | None: ...

    async def fetchall(self) -> list[tuple[Any, ...]]: ...


class MigrationConnection(Protocol):
    async def __aenter__(self) -> "MigrationConnection": ...

    async def __aexit__(self, *args: object) -> None: ...

    def cursor(self) -> MigrationCursor: ...


ConnectionFactory = Callable[[str], Awaitable[MigrationConnection]]
MigrationCommand = Callable[[], Awaitable[None]]


def _psycopg_url(database_url: str) -> str:
    return database_url.replace("postgresql+psycopg_async://", "postgresql://", 1)


async def connect_database(database_url: str) -> MigrationConnection:
    connection = await psycopg.AsyncConnection.connect(database_url)
    return cast(MigrationConnection, connection)


async def _verify_rows(
    cursor: MigrationCursor,
    query: str,
    expected: frozenset[tuple[object, ...]],
) -> None:
    await cursor.execute(query)
    actual = {tuple(row) for row in await cursor.fetchall()}
    if actual != expected:
        raise RuntimeError("Skill registry migration verification failed")


async def _verify_migration(cursor: MigrationCursor) -> None:
    await _verify_rows(cursor, VERIFY_TABLES_SQL, EXPECTED_TABLE_OWNERS)
    await _verify_rows(
        cursor,
        VERIFY_MANAGER_TABLE_GRANTS_SQL,
        EXPECTED_MANAGER_TABLE_GRANTS,
    )
    await _verify_rows(
        cursor,
        VERIFY_MANAGER_COLUMN_GRANTS_SQL,
        EXPECTED_MANAGER_COLUMN_GRANTS,
    )
    await _verify_rows(cursor, VERIFY_BACKUP_GRANTS_SQL, EXPECTED_BACKUP_GRANTS)
    await cursor.execute(VERIFY_FORBIDDEN_GRANTS_SQL)
    if await cursor.fetchall():
        raise RuntimeError("Skill registry migration verification failed")
    await _verify_rows(cursor, VERIFY_SCHEMA_GRANTS_SQL, EXPECTED_SCHEMA_GRANTS)


async def run_migration(
    settings: MigrationSettings | None = None,
    *,
    connector: ConnectionFactory = connect_database,
) -> None:
    """Apply schema version one once and verify the exact access boundary."""
    migration_settings = settings or MigrationSettings()  # type: ignore[call-arg]
    database_url = _psycopg_url(migration_settings.database_url.get_secret_value())
    connection = await connector(database_url)

    async with connection:
        async with connection.cursor() as cursor:
            await cursor.execute(VERIFY_SCHEMA_OWNER_SQL)
            if await cursor.fetchone() != ("ai_agent_skill_registry_migrator",):
                raise RuntimeError("Skill registry migration verification failed")
            await cursor.execute(PREPARE_SCHEMA_SQL)
            await cursor.execute(SELECT_SCHEMA_VERSION_SQL)
            applied_version = await cursor.fetchone()
            if applied_version is None:
                await cursor.execute(SCHEMA_VERSION_1_SQL)
            elif applied_version != (1,):
                raise RuntimeError("Skill registry migration verification failed")
            await _verify_migration(cursor)


def main(*, migration: MigrationCommand = run_migration) -> int:
    """Run the migration without exposing connection details."""

    async def execute() -> None:
        await migration()

    try:
        asyncio.run(execute())
    except Exception:
        print("Skill registry migration failed.", file=sys.stderr)
        return 1
    print("Skill registry migration complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
