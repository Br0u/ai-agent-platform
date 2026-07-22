"""One-shot migration entrypoint for the skill registry schema."""

import asyncio
from collections.abc import Awaitable, Callable
import sys
from typing import Any, Protocol, cast

import psycopg

from skill_registry.config import MigrationSettings
from skill_registry.schema import (
    EXPECTED_BACKUP_GRANTS,
    EXPECTED_CONTROL_EVENT_TRANSACTION_COLUMN,
    EXPECTED_FUNCTION_BOUNDARY,
    EXPECTED_MANAGER_COLUMN_GRANTS,
    EXPECTED_MANAGER_FUNCTION_GRANTS,
    EXPECTED_MANAGER_TABLE_GRANTS,
    EXPECTED_REVIEW_CONSTRAINTS,
    EXPECTED_REVIEW_STORAGE_COLUMNS,
    EXPECTED_REVIEW_TRIGGER_GUARDS,
    EXPECTED_RUNTIME_VIEW_GRANTS,
    EXPECTED_RUNTIME_FUNCTION_GRANTS,
    EXPECTED_SCHEMA_GRANTS,
    EXPECTED_SECURITY_TRIGGERS,
    EXPECTED_TABLE_OWNERS,
    EXPECTED_VIEW_OWNERS,
    LOCK_SCHEMA_VERSION_SQL,
    PREPARE_SCHEMA_SQL,
    SCHEMA_VERSION_1_SQL,
    SCHEMA_VERSION_2_SQL,
    SCHEMA_VERSION_3_SQL,
    SELECT_SCHEMA_VERSION_SQL,
    VERIFY_BACKUP_GRANTS_SQL,
    VERIFY_CONTROL_EVENT_TRANSACTION_COLUMN_SQL,
    VERIFY_FORBIDDEN_GRANTS_SQL,
    VERIFY_FUNCTION_BOUNDARY_SQL,
    VERIFY_MANAGER_COLUMN_GRANTS_SQL,
    VERIFY_MANAGER_FUNCTION_GRANTS_SQL,
    VERIFY_MANAGER_TABLE_GRANTS_SQL,
    VERIFY_REGISTRY_ROLE_MEMBERSHIPS_SQL,
    VERIFY_REGISTRY_ROLE_SETTINGS_SQL,
    VERIFY_REPLICATION_PARAMETER_PRIVILEGES_SQL,
    VERIFY_REVIEW_CONSTRAINTS_SQL,
    VERIFY_REVIEW_STORAGE_COLUMNS_SQL,
    VERIFY_REVIEW_TRIGGER_GUARDS_SQL,
    VERIFY_RUNTIME_VIEW_GRANTS_SQL,
    VERIFY_RUNTIME_FUNCTION_GRANTS_SQL,
    VERIFY_SCHEMA_GRANTS_SQL,
    VERIFY_SCHEMA_OWNER_SQL,
    VERIFY_SECURITY_TRIGGERS_SQL,
    VERIFY_TABLES_SQL,
    VERIFY_VIEWS_SQL,
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

_ORIGINAL_REVIEW_EVENT_CAST = (
    "ARRAY['revision_published'::character varying, 'revision_rejected'::character varying]::text[]"
)
_RESTORED_REVIEW_EVENT_CAST = (
    "ARRAY['revision_published'::character varying::text, "
    "'revision_rejected'::character varying::text]"
)


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


def _canonicalize_restored_review_constraint(
    row: tuple[object, ...],
) -> tuple[object, ...]:
    expected_identity = (
        "skill_control_events_review_evidence",
        "skill_control_events",
        "c",
        True,
    )
    if row[:4] != expected_identity or len(row) != 5 or not isinstance(row[4], str):
        return row
    return (
        *row[:4],
        row[4].replace(_RESTORED_REVIEW_EVENT_CAST, _ORIGINAL_REVIEW_EVENT_CAST),
    )


async def _verify_review_constraints(cursor: MigrationCursor) -> None:
    await cursor.execute(VERIFY_REVIEW_CONSTRAINTS_SQL)
    actual = {
        _canonicalize_restored_review_constraint(tuple(row)) for row in await cursor.fetchall()
    }
    if actual != EXPECTED_REVIEW_CONSTRAINTS:
        raise RuntimeError("Skill registry migration verification failed")


async def _verify_migration(cursor: MigrationCursor) -> None:
    await _verify_rows(cursor, VERIFY_TABLES_SQL, EXPECTED_TABLE_OWNERS)
    await _verify_rows(cursor, VERIFY_VIEWS_SQL, EXPECTED_VIEW_OWNERS)
    await _verify_rows(
        cursor,
        VERIFY_CONTROL_EVENT_TRANSACTION_COLUMN_SQL,
        EXPECTED_CONTROL_EVENT_TRANSACTION_COLUMN,
    )
    await _verify_rows(
        cursor,
        VERIFY_REVIEW_STORAGE_COLUMNS_SQL,
        EXPECTED_REVIEW_STORAGE_COLUMNS,
    )
    await _verify_review_constraints(cursor)
    await _verify_rows(
        cursor,
        VERIFY_REVIEW_TRIGGER_GUARDS_SQL,
        EXPECTED_REVIEW_TRIGGER_GUARDS,
    )
    await _verify_rows(cursor, VERIFY_FUNCTION_BOUNDARY_SQL, EXPECTED_FUNCTION_BOUNDARY)
    await _verify_rows(cursor, VERIFY_SECURITY_TRIGGERS_SQL, EXPECTED_SECURITY_TRIGGERS)
    for forbidden_query in (
        VERIFY_REGISTRY_ROLE_MEMBERSHIPS_SQL,
        VERIFY_REGISTRY_ROLE_SETTINGS_SQL,
        VERIFY_REPLICATION_PARAMETER_PRIVILEGES_SQL,
    ):
        await cursor.execute(forbidden_query)
        if await cursor.fetchall():
            raise RuntimeError("Skill registry migration verification failed")
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
    await _verify_rows(
        cursor,
        VERIFY_MANAGER_FUNCTION_GRANTS_SQL,
        EXPECTED_MANAGER_FUNCTION_GRANTS,
    )
    await _verify_rows(
        cursor,
        VERIFY_RUNTIME_VIEW_GRANTS_SQL,
        EXPECTED_RUNTIME_VIEW_GRANTS,
    )
    await _verify_rows(
        cursor,
        VERIFY_RUNTIME_FUNCTION_GRANTS_SQL,
        EXPECTED_RUNTIME_FUNCTION_GRANTS,
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
    """Upgrade through schema version three and verify the exact access boundary."""
    migration_settings = settings or MigrationSettings()  # type: ignore[call-arg]
    database_url = _psycopg_url(migration_settings.database_url.get_secret_value())
    connection = await connector(database_url)

    async with connection:
        async with connection.cursor() as cursor:
            await cursor.execute(VERIFY_SCHEMA_OWNER_SQL)
            if await cursor.fetchone() != ("ai_agent_skill_registry_migrator",):
                raise RuntimeError("Skill registry migration verification failed")
            await cursor.execute(PREPARE_SCHEMA_SQL)
            await cursor.execute(LOCK_SCHEMA_VERSION_SQL)
            await cursor.execute(SELECT_SCHEMA_VERSION_SQL)
            version_state = await cursor.fetchone()
            if version_state == (None, 0):
                await cursor.execute(SCHEMA_VERSION_1_SQL)
                await cursor.execute(SCHEMA_VERSION_2_SQL)
                await cursor.execute(SCHEMA_VERSION_3_SQL)
            elif version_state == (1, 1):
                await cursor.execute(SCHEMA_VERSION_2_SQL)
                await cursor.execute(SCHEMA_VERSION_3_SQL)
            elif version_state == (2, 2):
                await cursor.execute(SCHEMA_VERSION_3_SQL)
            elif version_state != (3, 3):
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
