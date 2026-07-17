"""One-shot migration entrypoint for the isolated Agent control schema."""

import asyncio
from collections.abc import Awaitable, Callable
import sys
from typing import Any, Protocol, cast

import psycopg

from agent_service.config import ControlMigrationSettings
from agent_service.model_config_schema import (
    EXPECTED_RUNTIME_GRANTS,
    PREPARE_SCHEMA_SQL,
    REQUIRED_TABLE_NAMES,
    SCHEMA_VERSION_1_SQL,
    SELECT_SCHEMA_VERSION_SQL,
    VERIFY_RUNTIME_GRANTS_SQL,
    VERIFY_SCHEMA_PRIVILEGES_SQL,
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
    return database_url.replace(
        "postgresql+psycopg_async://",
        "postgresql://",
        1,
    )


async def connect_database(database_url: str) -> MigrationConnection:
    connection = await psycopg.AsyncConnection.connect(database_url)
    return cast(MigrationConnection, connection)


async def _verify_migration(cursor: MigrationCursor) -> None:
    await cursor.execute(VERIFY_TABLES_SQL)
    table_rows = await cursor.fetchall()
    actual_tables = {str(row[0]) for row in table_rows}
    if actual_tables != REQUIRED_TABLE_NAMES:
        raise RuntimeError("Agent control migration verification failed")

    await cursor.execute(VERIFY_RUNTIME_GRANTS_SQL)
    grant_rows = await cursor.fetchall()
    actual_grants = {(str(row[0]), str(row[1])) for row in grant_rows}
    if actual_grants != EXPECTED_RUNTIME_GRANTS:
        raise RuntimeError("Agent control migration verification failed")

    await cursor.execute(VERIFY_SCHEMA_PRIVILEGES_SQL)
    schema_privileges = await cursor.fetchone()
    if schema_privileges != (True, False):
        raise RuntimeError("Agent control migration verification failed")


async def run_migration(
    settings: ControlMigrationSettings | None = None,
    *,
    connector: ConnectionFactory = connect_database,
) -> None:
    """Apply schema version 1 and verify its exact runtime boundary."""
    migration_settings = settings or ControlMigrationSettings()
    database_url = _psycopg_url(
        migration_settings.database_url.get_secret_value()
    )
    connection = await connector(database_url)

    async with connection:
        async with connection.cursor() as cursor:
            await cursor.execute(PREPARE_SCHEMA_SQL)
            await cursor.execute(SELECT_SCHEMA_VERSION_SQL)
            applied_version = await cursor.fetchone()
            if applied_version is None:
                await cursor.execute(SCHEMA_VERSION_1_SQL)
            elif applied_version != (1,):
                raise RuntimeError("Agent control migration verification failed")
            await _verify_migration(cursor)


def main(*, migration: MigrationCommand = run_migration) -> int:
    """Run the control migration without exposing database details."""

    async def execute() -> None:
        await migration()

    try:
        asyncio.run(execute())
    except Exception:
        print("Agent control migration failed.", file=sys.stderr)
        return 1

    print("Agent control migration complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
