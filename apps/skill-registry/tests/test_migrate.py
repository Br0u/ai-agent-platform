from typing import Any

import pytest

import skill_registry.schema as registry_schema
from skill_registry.config import MigrationSettings
from skill_registry.migrate import MigrationConnection, main, run_migration
from skill_registry.schema import (
    EXPECTED_BACKUP_GRANTS,
    EXPECTED_FUNCTION_BOUNDARY,
    EXPECTED_MANAGER_TABLE_GRANTS,
    EXPECTED_MANAGER_FUNCTION_GRANTS,
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
    VERIFY_MANAGER_TABLE_GRANTS_SQL,
    VERIFY_MANAGER_FUNCTION_GRANTS_SQL,
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
        elif query == SCHEMA_VERSION_2_SQL:
            self.versions = (1, 2)
        elif query == SCHEMA_VERSION_3_SQL:
            self.versions = (1, 2, 3)

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
            VERIFY_TABLES_SQL: sorted(EXPECTED_TABLE_OWNERS),
            VERIFY_VIEWS_SQL: sorted(EXPECTED_VIEW_OWNERS),
            VERIFY_MANAGER_TABLE_GRANTS_SQL: sorted(EXPECTED_MANAGER_TABLE_GRANTS),
            VERIFY_MANAGER_FUNCTION_GRANTS_SQL: sorted(EXPECTED_MANAGER_FUNCTION_GRANTS),
            VERIFY_MANAGER_COLUMN_GRANTS_SQL: [
                ("skill_revisions", "reviewed_at", "UPDATE", False),
                ("skill_revisions", "reviewed_by", "UPDATE", False),
                ("skill_revisions", "state", "UPDATE", False),
                ("skills", "archived_at", "UPDATE", False),
            ],
            VERIFY_RUNTIME_VIEW_GRANTS_SQL: sorted(EXPECTED_RUNTIME_VIEW_GRANTS),
            VERIFY_RUNTIME_FUNCTION_GRANTS_SQL: sorted(EXPECTED_RUNTIME_FUNCTION_GRANTS),
            VERIFY_BACKUP_GRANTS_SQL: sorted(EXPECTED_BACKUP_GRANTS),
            VERIFY_CONTROL_EVENT_TRANSACTION_COLUMN_SQL: [
                ("transaction_id", "bigint", True, ""),
            ],
            VERIFY_REVIEW_STORAGE_COLUMNS_SQL: [
                ("skill_control_events", "content_reviewed", "boolean", False, ""),
                ("skill_control_events", "execution_risk_accepted", "boolean", False, ""),
                (
                    "skill_control_events",
                    "reviewer_authorization_confirmed",
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
            VERIFY_FUNCTION_BOUNDARY_SQL: sorted(EXPECTED_FUNCTION_BOUNDARY),
            VERIFY_SECURITY_TRIGGERS_SQL: sorted(EXPECTED_SECURITY_TRIGGERS),
            VERIFY_FORBIDDEN_GRANTS_SQL: [],
            VERIFY_REGISTRY_ROLE_MEMBERSHIPS_SQL: [],
            VERIFY_REGISTRY_ROLE_SETTINGS_SQL: [],
            VERIFY_REPLICATION_PARAMETER_PRIVILEGES_SQL: [],
            VERIFY_SCHEMA_GRANTS_SQL: sorted(EXPECTED_SCHEMA_GRANTS),
        }
        return rows[self._query]


def test_skill_set_tables_and_views_require_schema_v3_migration() -> None:
    assert registry_schema.SKILL_REGISTRY_SCHEMA_VERSION == 3
    assert getattr(registry_schema, "SCHEMA_VERSION_3_SQL", "")


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
async def test_migration_applies_v1_through_v3_once_and_keeps_repeat_at_exact_v3() -> None:
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
    assert cursor.executed.count(SCHEMA_VERSION_2_SQL) == 1
    assert cursor.executed.count(SCHEMA_VERSION_3_SQL) == 1
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
@pytest.mark.parametrize(
    "versions",
    [(2,), (3,), (1, 3), (1, 2, 4), (1, 1), (1, 1, 2), (1, 2, 3, 3)],
)
async def test_migration_rejects_drifted_version_sets_without_reapplying_schema(
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
    assert SCHEMA_VERSION_2_SQL not in cursor.executed
    assert SCHEMA_VERSION_3_SQL not in cursor.executed


@pytest.mark.asyncio
async def test_migration_upgrades_exact_v1_to_v3() -> None:
    cursor = FakeCursor(versions=(1,))

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(cursor)

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    await run_migration(settings, connector=connector)

    assert SCHEMA_VERSION_1_SQL not in cursor.executed
    assert cursor.executed.count(SCHEMA_VERSION_2_SQL) == 1
    assert cursor.executed.count(SCHEMA_VERSION_3_SQL) == 1
    assert cursor.versions == (1, 2, 3)


@pytest.mark.asyncio
async def test_migration_upgrades_exact_v2_to_v3() -> None:
    cursor = FakeCursor(versions=(1, 2))

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(cursor)

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    await run_migration(settings, connector=connector)

    assert SCHEMA_VERSION_1_SQL not in cursor.executed
    assert SCHEMA_VERSION_2_SQL not in cursor.executed
    assert cursor.executed.count(SCHEMA_VERSION_3_SQL) == 1
    assert cursor.versions == (1, 2, 3)


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
async def test_migration_rejects_current_schema_missing_review_storage_contract() -> None:
    class DriftedCursor(FakeCursor):
        async def fetchall(self) -> list[tuple[Any, ...]]:
            rows = await super().fetchall()
            if self._query == VERIFY_REVIEW_STORAGE_COLUMNS_SQL:
                return [row for row in rows if row[1] != "findings"]
            return rows

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(DriftedCursor(versions=(1, 2)))

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    with pytest.raises(RuntimeError, match="verification failed"):
        await run_migration(settings, connector=connector)


@pytest.mark.asyncio
async def test_migration_rejects_coexisting_old_review_authorization_column() -> None:
    class DriftedCursor(FakeCursor):
        async def fetchall(self) -> list[tuple[Any, ...]]:
            rows = await super().fetchall()
            if self._query == VERIFY_REVIEW_STORAGE_COLUMNS_SQL:
                return [
                    *rows,
                    (
                        "skill_control_events",
                        "independent_reviewer_confirmed",
                        "boolean",
                        False,
                        "",
                    ),
                ]
            return rows

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(DriftedCursor(versions=(1, 2)))

    settings = MigrationSettings.model_validate({"database_url": MIGRATOR_URL})
    with pytest.raises(RuntimeError, match="verification failed"):
        await run_migration(settings, connector=connector)


@pytest.mark.asyncio
async def test_migration_rejects_stale_second_actor_revision_guard() -> None:
    class DriftedCursor(FakeCursor):
        async def fetchall(self) -> list[tuple[Any, ...]]:
            rows = await super().fetchall()
            if self._query != VERIFY_REVIEW_TRIGGER_GUARDS_SQL:
                return rows
            return [
                (
                    function_name,
                    definition.replace(
                        "ELSIF OLD.state = 'published'",
                        "IF NEW.reviewed_by = OLD.created_by THEN RAISE EXCEPTION "
                        "'skill revision review requires a second actor' USING ERRCODE = "
                        "'23514'; END IF; ELSIF OLD.state = 'published'",
                    )
                    if function_name == "guard_revision_update"
                    else (function_name, definition),
                )
                for function_name, definition in rows
            ]

    async def connector(database_url: str) -> MigrationConnection:
        return FakeConnection(DriftedCursor(versions=(1, 2)))

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
    normalized_storage_query = " ".join(VERIFY_REVIEW_STORAGE_COLUMNS_SQL.split())
    normalized_constraint_query = " ".join(VERIFY_REVIEW_CONSTRAINTS_SQL.split())
    normalized_function_query = " ".join(VERIFY_REVIEW_TRIGGER_GUARDS_SQL.split())

    assert "'independent_reviewer_confirmed'" in normalized_storage_query
    assert "'reviewer_authorization_confirmed'" in normalized_storage_query
    assert "independent_reviewer_confirmed" not in {
        column_name for table_name, column_name, *_ in EXPECTED_REVIEW_STORAGE_COLUMNS
    }
    assert "pg_get_constraintdef(constraint_row.oid, true)" in normalized_constraint_query
    assert "regexp_replace" in normalized_constraint_query
    assert all(
        len(row) == 5 and isinstance(row[4], str) and row[4].startswith("CHECK (")
        for row in EXPECTED_REVIEW_CONSTRAINTS
    )
    assert "pg_get_functiondef(function.oid)" in normalized_function_query
    assert "regexp_replace" in normalized_function_query
    assert "'guard_revision_update'" in normalized_function_query
    assert len(EXPECTED_REVIEW_TRIGGER_GUARDS) == 3
    revision_guard_definition = dict(EXPECTED_REVIEW_TRIGGER_GUARDS)["guard_revision_update"]
    assert revision_guard_definition.startswith(
        "CREATE OR REPLACE FUNCTION skill_registry.guard_revision_update()"
    )
    assert "skill revision body is immutable" in revision_guard_definition
    assert "NEW.reviewed_by = OLD.created_by" not in revision_guard_definition
    assert "invalid skill revision state transition" in revision_guard_definition
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
