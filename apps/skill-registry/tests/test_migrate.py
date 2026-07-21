from typing import Any

import pytest

from skill_registry.config import MigrationSettings
from skill_registry.migrate import MigrationConnection, main, run_migration
from skill_registry.schema import (
    EXPECTED_REVIEW_CONSTRAINTS,
    EXPECTED_REVIEW_TRIGGER_GUARDS,
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
    VERIFY_REVIEW_CONSTRAINTS_SQL,
    VERIFY_REVIEW_STORAGE_COLUMNS_SQL,
    VERIFY_REVIEW_TRIGGER_GUARDS_SQL,
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
            VERIFY_REVIEW_STORAGE_COLUMNS_SQL: [
                ("skill_control_events", "content_reviewed", "boolean", False, ""),
                ("skill_control_events", "execution_risk_accepted", "boolean", False, ""),
                (
                    "skill_control_events",
                    "independent_reviewer_confirmed",
                    "boolean",
                    False,
                    "",
                ),
                (
                    "skill_control_events",
                    "review_reason",
                    "character varying(500)",
                    False,
                    "",
                ),
                ("skill_control_events", "usage_rights_confirmed", "boolean", False, ""),
                ("skill_revisions", "findings", "jsonb", True, "'[]'::jsonb"),
            ],
            VERIFY_REVIEW_CONSTRAINTS_SQL: sorted(EXPECTED_REVIEW_CONSTRAINTS),
            VERIFY_REVIEW_TRIGGER_GUARDS_SQL: sorted(EXPECTED_REVIEW_TRIGGER_GUARDS),
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
                    False,
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
                    False,
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
                    False,
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
                    False,
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
                    False,
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
                    False,
                ),
                (
                    "validate_skill_findings",
                    "ai_agent_skill_registry_migrator",
                    1,
                    "boolean",
                    "sql",
                    False,
                    "search_path=pg_catalog, skill_registry",
                    True,
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
    assert cursor.executed.count(VERIFY_REVIEW_STORAGE_COLUMNS_SQL) == 2
    assert cursor.executed.count(VERIFY_REVIEW_CONSTRAINTS_SQL) == 2
    assert cursor.executed.count(VERIFY_REVIEW_TRIGGER_GUARDS_SQL) == 2
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
async def test_migration_rejects_version_one_missing_review_storage_contract() -> None:
    class DriftedCursor(FakeCursor):
        async def fetchall(self) -> list[tuple[Any, ...]]:
            rows = await super().fetchall()
            if self._query == VERIFY_REVIEW_STORAGE_COLUMNS_SQL:
                return [row for row in rows if row[1] != "findings"]
            return rows

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(DriftedCursor(versions=(1,)))

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    with pytest.raises(RuntimeError, match="verification failed"):
        await run_migration(settings, connector=connector)


_ORIGINAL_REVIEW_EVENT_CAST = (
    "ARRAY['revision_published'::character varying, 'revision_rejected'::character varying]::text[]"
)
_RESTORED_REVIEW_EVENT_CAST = (
    "ARRAY['revision_published'::character varying::text, "
    "'revision_rejected'::character varying::text]"
)


def _restored_review_constraint_rows() -> list[tuple[Any, ...]]:
    return [
        (*row[:4], row[4].replace(_ORIGINAL_REVIEW_EVENT_CAST, _RESTORED_REVIEW_EVENT_CAST))
        for row in sorted(EXPECTED_REVIEW_CONSTRAINTS)
    ]


@pytest.mark.asyncio
async def test_migration_accepts_only_the_known_pg_restore_review_cast_deparse() -> None:
    class RestoredCursor(FakeCursor):
        async def fetchall(self) -> list[tuple[Any, ...]]:
            if self._query == VERIFY_REVIEW_CONSTRAINTS_SQL:
                return _restored_review_constraint_rows()
            return await super().fetchall()

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(RestoredCursor(versions=(1,)))

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    await run_migration(settings, connector=connector)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "mutate",
    [
        lambda row: ("renamed_constraint", *row[1:]),
        lambda row: (row[0], "skills", *row[2:]),
        lambda row: (*row[:3], False, row[4]),
        lambda row: (*row[:4], row[4].replace("revision_rejected", "revision_deleted")),
        lambda row: (
            *row[:4],
            row[4].replace(
                _RESTORED_REVIEW_EVENT_CAST,
                "ARRAY['revision_rejected'::character varying::text, "
                "'revision_published'::character varying::text]",
            ),
        ),
        lambda row: (
            *row[:4],
            row[4].replace("content_reviewed IS TRUE", "content_reviewed IS FALSE"),
        ),
    ],
)
async def test_migration_rejects_other_restored_review_constraint_drift(
    mutate: Any,
) -> None:
    class DriftedRestoredCursor(FakeCursor):
        async def fetchall(self) -> list[tuple[Any, ...]]:
            if self._query == VERIFY_REVIEW_CONSTRAINTS_SQL:
                rows = _restored_review_constraint_rows()
                rows[0] = mutate(rows[0])
                return rows
            return await super().fetchall()

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(DriftedRestoredCursor(versions=(1,)))

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    with pytest.raises(RuntimeError, match="verification failed"):
        await run_migration(settings, connector=connector)


def test_review_drift_verifiers_compare_normalized_complete_definitions() -> None:
    normalized_constraint_query = " ".join(VERIFY_REVIEW_CONSTRAINTS_SQL.split())
    normalized_function_query = " ".join(VERIFY_REVIEW_TRIGGER_GUARDS_SQL.split())

    assert "pg_get_constraintdef(constraint_row.oid, true)" in normalized_constraint_query
    assert "regexp_replace" in normalized_constraint_query
    assert all(
        len(row) == 5 and isinstance(row[4], str) and row[4].startswith("CHECK (")
        for row in EXPECTED_REVIEW_CONSTRAINTS
    )
    assert "pg_get_functiondef(function.oid)" in normalized_function_query
    assert "regexp_replace" in normalized_function_query
    assert len(EXPECTED_REVIEW_TRIGGER_GUARDS) == 2
    function_definition = dict(EXPECTED_REVIEW_TRIGGER_GUARDS)["require_revision_review_event"]
    assert isinstance(function_definition, str)
    assert function_definition.startswith(
        "CREATE OR REPLACE FUNCTION skill_registry.require_revision_review_event()"
    )
    assert "blocking skill findings prevent publication" in function_definition
    findings_definition = dict(EXPECTED_REVIEW_TRIGGER_GUARDS)["validate_skill_findings"]
    assert findings_definition.startswith(
        "CREATE OR REPLACE FUNCTION skill_registry.validate_skill_findings(candidate jsonb)"
    )


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
