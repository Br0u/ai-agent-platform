from typing import Any

import pytest

from skill_registry.config import MigrationSettings
from skill_registry.migrate import MigrationConnection, main, run_migration
from skill_registry.schema import (
    LOCK_SCHEMA_VERSION_SQL,
    PREPARE_SCHEMA_SQL,
    SCHEMA_VERSION_1_SQL,
    SELECT_SCHEMA_VERSION_SQL,
    VERIFY_BACKUP_GRANTS_SQL,
    VERIFY_CONTROL_EVENT_TRANSACTION_COLUMN_SQL,
    VERIFY_FORBIDDEN_GRANTS_SQL,
    VERIFY_FUNCTION_BOUNDARY_SQL,
    VERIFY_MANAGER_COLUMN_GRANTS_SQL,
    VERIFY_MANAGER_TABLE_GRANTS_SQL,
    VERIFY_REGISTRY_ROLE_MEMBERSHIPS_SQL,
    VERIFY_REGISTRY_ROLE_SETTINGS_SQL,
    VERIFY_REPLICATION_PARAMETER_PRIVILEGES_SQL,
    VERIFY_SCHEMA_GRANTS_SQL,
    VERIFY_SCHEMA_OWNER_SQL,
    VERIFY_SECURITY_TRIGGERS_SQL,
    VERIFY_TABLES_SQL,
)


MIGRATOR_URL = (
    "postgresql+psycopg_async://ai_agent_skill_registry_migrator:private-password@db:5432/platform"
)
PSYCOPG_URL = MIGRATOR_URL.replace("postgresql+psycopg_async://", "postgresql://")


class FakeCursor:
    def __init__(self, *, versions: tuple[int, ...] = ()) -> None:
        self.versions = versions
        self.executed: list[str] = []
        self._query = ""

    async def __aenter__(self) -> "FakeCursor":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, query: str) -> Any:
        self._query = query
        self.executed.append(query)
        if query == SCHEMA_VERSION_1_SQL:
            self.versions = (1,)

    async def fetchone(self) -> tuple[Any, ...] | None:
        if self._query == VERIFY_SCHEMA_OWNER_SQL:
            return ("ai_agent_skill_registry_migrator",)
        if self._query == SELECT_SCHEMA_VERSION_SQL:
            return (
                max(self.versions) if self.versions else None,
                len(self.versions),
            )
        raise AssertionError(f"unexpected fetchone for {self._query}")

    async def fetchall(self) -> list[tuple[Any, ...]]:
        rows: dict[str, list[tuple[Any, ...]]] = {
            VERIFY_TABLES_SQL: [
                ("schema_versions", "ai_agent_skill_registry_migrator"),
                ("skill_control_events", "ai_agent_skill_registry_migrator"),
                ("skill_revision_artifacts", "ai_agent_skill_registry_migrator"),
                ("skill_revision_files", "ai_agent_skill_registry_migrator"),
                ("skill_revisions", "ai_agent_skill_registry_migrator"),
                ("skills", "ai_agent_skill_registry_migrator"),
            ],
            VERIFY_MANAGER_TABLE_GRANTS_SQL: [
                ("skill_control_events", "INSERT", False),
                ("skill_control_events", "SELECT", False),
                ("skill_revision_artifacts", "INSERT", False),
                ("skill_revision_artifacts", "SELECT", False),
                ("skill_revision_files", "INSERT", False),
                ("skill_revision_files", "SELECT", False),
                ("skill_revisions", "INSERT", False),
                ("skill_revisions", "SELECT", False),
                ("skills", "INSERT", False),
                ("skills", "SELECT", False),
            ],
            VERIFY_MANAGER_COLUMN_GRANTS_SQL: [
                ("skill_revisions", "reviewed_at", "UPDATE", False),
                ("skill_revisions", "reviewed_by", "UPDATE", False),
                ("skill_revisions", "state", "UPDATE", False),
                ("skills", "archived_at", "UPDATE", False),
            ],
            VERIFY_BACKUP_GRANTS_SQL: [
                ("schema_versions", "SELECT", False),
                ("skill_control_events", "SELECT", False),
                ("skill_revision_artifacts", "SELECT", False),
                ("skill_revision_files", "SELECT", False),
                ("skill_revisions", "SELECT", False),
                ("skills", "SELECT", False),
            ],
            VERIFY_CONTROL_EVENT_TRANSACTION_COLUMN_SQL: [
                ("transaction_id", "bigint", True, ""),
            ],
            VERIFY_FUNCTION_BOUNDARY_SQL: [
                (
                    "deny_append_only_mutation",
                    "ai_agent_skill_registry_migrator",
                    0,
                    "trigger",
                    "plpgsql",
                    False,
                    "search_path=pg_catalog, skill_registry",
                    True,
                ),
                (
                    "guard_revision_insert",
                    "ai_agent_skill_registry_migrator",
                    0,
                    "trigger",
                    "plpgsql",
                    False,
                    "search_path=pg_catalog, skill_registry",
                    True,
                ),
                (
                    "guard_revision_update",
                    "ai_agent_skill_registry_migrator",
                    0,
                    "trigger",
                    "plpgsql",
                    False,
                    "search_path=pg_catalog, skill_registry",
                    True,
                ),
                (
                    "guard_skill_update",
                    "ai_agent_skill_registry_migrator",
                    0,
                    "trigger",
                    "plpgsql",
                    False,
                    "search_path=pg_catalog, skill_registry",
                    True,
                ),
                (
                    "require_revision_review_event",
                    "ai_agent_skill_registry_migrator",
                    0,
                    "trigger",
                    "plpgsql",
                    False,
                    "search_path=pg_catalog, skill_registry",
                    True,
                ),
                (
                    "stamp_control_event_transaction",
                    "ai_agent_skill_registry_migrator",
                    0,
                    "trigger",
                    "plpgsql",
                    False,
                    "search_path=pg_catalog, skill_registry",
                    True,
                ),
            ],
            VERIFY_SECURITY_TRIGGERS_SQL: [
                (
                    "skill_control_events_append_only",
                    "skill_control_events",
                    "deny_append_only_mutation",
                    27,
                    False,
                    False,
                    "A",
                ),
                (
                    "skill_control_events_stamp_transaction",
                    "skill_control_events",
                    "stamp_control_event_transaction",
                    7,
                    False,
                    False,
                    "A",
                ),
                (
                    "skill_revision_artifacts_append_only",
                    "skill_revision_artifacts",
                    "deny_append_only_mutation",
                    27,
                    False,
                    False,
                    "A",
                ),
                (
                    "skill_revision_files_append_only",
                    "skill_revision_files",
                    "deny_append_only_mutation",
                    27,
                    False,
                    False,
                    "A",
                ),
                (
                    "skill_revisions_guard_insert",
                    "skill_revisions",
                    "guard_revision_insert",
                    7,
                    False,
                    False,
                    "A",
                ),
                (
                    "skill_revisions_guard_update",
                    "skill_revisions",
                    "guard_revision_update",
                    19,
                    False,
                    False,
                    "A",
                ),
                (
                    "skill_revisions_require_review_event",
                    "skill_revisions",
                    "require_revision_review_event",
                    17,
                    True,
                    True,
                    "A",
                ),
                (
                    "skills_guard_update",
                    "skills",
                    "guard_skill_update",
                    19,
                    False,
                    False,
                    "A",
                ),
            ],
            VERIFY_FORBIDDEN_GRANTS_SQL: [],
            VERIFY_REGISTRY_ROLE_MEMBERSHIPS_SQL: [],
            VERIFY_REGISTRY_ROLE_SETTINGS_SQL: [],
            VERIFY_REPLICATION_PARAMETER_PRIVILEGES_SQL: [],
            VERIFY_SCHEMA_GRANTS_SQL: [
                ("ai_agent_backup", "USAGE", False),
                ("ai_agent_skill_registry_manager", "USAGE", False),
                ("ai_agent_skill_registry_migrator", "CREATE", False),
                ("ai_agent_skill_registry_migrator", "USAGE", False),
            ],
        }
        return rows[self._query]


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    async def __aenter__(self) -> "FakeConnection":
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self._cursor


@pytest.mark.asyncio
async def test_migration_applies_version_one_once_and_keeps_repeat_at_version_one() -> None:
    cursor = FakeCursor()
    connection = FakeConnection(cursor)
    urls: list[str] = []

    async def connector(database_url: str) -> MigrationConnection:
        urls.append(database_url)
        return connection

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    await run_migration(settings, connector=connector)
    await run_migration(settings, connector=connector)

    assert urls == [PSYCOPG_URL, PSYCOPG_URL]
    assert cursor.executed.count(PREPARE_SCHEMA_SQL) == 2
    assert cursor.executed.count(LOCK_SCHEMA_VERSION_SQL) == 2
    assert cursor.executed.count(SCHEMA_VERSION_1_SQL) == 1
    assert cursor.executed.count(SELECT_SCHEMA_VERSION_SQL) == 2
    assert cursor.executed.count(VERIFY_CONTROL_EVENT_TRANSACTION_COLUMN_SQL) == 2
    assert cursor.executed.count(VERIFY_FUNCTION_BOUNDARY_SQL) == 2
    assert cursor.executed.count(VERIFY_SECURITY_TRIGGERS_SQL) == 2
    assert cursor.executed.count(VERIFY_REGISTRY_ROLE_MEMBERSHIPS_SQL) == 2
    assert cursor.executed.count(VERIFY_REGISTRY_ROLE_SETTINGS_SQL) == 2
    assert cursor.executed.count(VERIFY_REPLICATION_PARAMETER_PRIVILEGES_SQL) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("versions", [(1, 2), (2,)])
async def test_migration_rejects_newer_or_anomalous_version_sets_without_reapplying_v1(
    versions: tuple[int, ...],
) -> None:
    cursor = FakeCursor(versions=versions)

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(cursor)

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    with pytest.raises(RuntimeError, match="verification failed"):
        await run_migration(settings, connector=connector)

    assert LOCK_SCHEMA_VERSION_SQL in cursor.executed
    assert SELECT_SCHEMA_VERSION_SQL in cursor.executed
    assert SCHEMA_VERSION_1_SQL not in cursor.executed


@pytest.mark.asyncio
async def test_migration_rejects_wrong_schema_owner() -> None:
    class WrongOwnerCursor(FakeCursor):
        async def fetchone(self) -> tuple[Any, ...] | None:
            if self._query == VERIFY_SCHEMA_OWNER_SQL:
                return ("postgres",)
            return await super().fetchone()

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(WrongOwnerCursor())

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    with pytest.raises(RuntimeError, match="verification failed"):
        await run_migration(settings, connector=connector)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("verification_query", "forbidden_row"),
    [
        (
            VERIFY_REGISTRY_ROLE_MEMBERSHIPS_SQL,
            ("ai_agent_skill_registry_manager", "ai_agent_skill_registry_migrator"),
        ),
        (
            VERIFY_REGISTRY_ROLE_SETTINGS_SQL,
            ("ai_agent_skill_registry_manager", 0, "search_path=evil"),
        ),
        (
            VERIFY_REPLICATION_PARAMETER_PRIVILEGES_SQL,
            ("ai_agent_skill_registry_manager",),
        ),
    ],
)
async def test_migration_rejects_registry_role_bypass_state(
    verification_query: str,
    forbidden_row: tuple[object, ...],
) -> None:
    class UnsafeRoleStateCursor(FakeCursor):
        async def fetchall(self) -> list[tuple[Any, ...]]:
            if self._query == verification_query:
                return [forbidden_row]
            return await super().fetchall()

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(UnsafeRoleStateCursor(versions=(1,)))

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    with pytest.raises(RuntimeError, match="verification failed"):
        await run_migration(settings, connector=connector)


def test_main_does_not_leak_migration_errors(capsys: pytest.CaptureFixture[str]) -> None:
    async def failing_migration() -> None:
        raise RuntimeError("private-password")

    assert main(migration=failing_migration) == 1
    output = capsys.readouterr()
    assert "private-password" not in output.err
    assert "complete" not in output.err


def test_main_runs_migration_once(capsys: pytest.CaptureFixture[str]) -> None:
    calls = 0

    async def successful_migration() -> None:
        nonlocal calls
        calls += 1

    assert main(migration=successful_migration) == 0
    assert calls == 1
    assert "complete" in capsys.readouterr().out.lower()
