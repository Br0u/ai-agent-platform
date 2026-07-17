from pathlib import Path
import os
import re
import subprocess
from typing import Any

import pytest

from agent_service.config import ControlMigrationSettings
from agent_service.model_config_migrate import main, run_migration
from agent_service.model_config_schema import (
    AGENT_CONTROL_SCHEMA_VERSION,
    EXPECTED_RUNTIME_GRANTS,
    PREPARE_SCHEMA_SQL,
    REQUIRED_TABLE_NAMES,
    SCHEMA_VERSION_1_SQL,
    SELECT_SCHEMA_VERSION_SQL,
    VERIFY_RUNTIME_GRANTS_SQL,
    VERIFY_SCHEMA_PRIVILEGES_SQL,
    VERIFY_TABLES_SQL,
)


MIGRATOR_URL = (
    "postgresql+psycopg_async://ai_agent_control_migrator:private-password@"
    "db:5432/platform"
)
PSYCOPG_URL = MIGRATOR_URL.replace(
    "postgresql+psycopg_async://",
    "postgresql://",
)
REPO_ROOT = Path(__file__).resolve().parents[3]


def normalize_sql(value: str) -> str:
    return " ".join(value.split())


def test_schema_version_one_contains_the_exact_model_control_tables() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    expected_definitions = (
        """CREATE TABLE agent_control.model_configs (
          id uuid PRIMARY KEY,
          provider varchar(16) NOT NULL
            CHECK (provider IN ('openai','anthropic','google','dashscope','deepseek','minimax')),
          model_id varchar(128) NOT NULL,
          endpoint_id varchar(64) NOT NULL,
          api_key_ciphertext bytea NOT NULL,
          api_key_nonce bytea NOT NULL CHECK (octet_length(api_key_nonce) = 12),
          api_key_last_four varchar(4) NOT NULL CHECK (char_length(api_key_last_four) = 4),
          encryption_key_version smallint NOT NULL CHECK (encryption_key_version = 1),
          revision bigint NOT NULL CHECK (revision >= 1),
          is_current boolean NOT NULL,
          test_status varchar(16) NOT NULL CHECK (test_status IN ('untested','passed','failed')),
          last_tested_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (provider, revision)
        );""",
        """CREATE UNIQUE INDEX model_configs_one_current_per_provider
          ON agent_control.model_configs(provider) WHERE is_current;""",
        """CREATE TABLE agent_control.active_model_config (
          singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
          model_config_id uuid NOT NULL REFERENCES agent_control.model_configs(id) ON DELETE RESTRICT,
          config_revision bigint NOT NULL CHECK (config_revision >= 1),
          activation_version bigint NOT NULL CHECK (activation_version >= 1),
          activated_at timestamptz NOT NULL DEFAULT now()
        );""",
        """CREATE TABLE agent_control.control_events (
          id uuid PRIMARY KEY,
          request_id uuid NOT NULL,
          assertion_nonce uuid NOT NULL UNIQUE,
          actor_user_id uuid NOT NULL,
          action varchar(48) NOT NULL,
          provider varchar(16) NOT NULL,
          model_id varchar(128) NOT NULL,
          endpoint_id varchar(64) NOT NULL,
          config_revision bigint NOT NULL CHECK (config_revision >= 0),
          result varchar(24) NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );""",
    )
    for definition in expected_definitions:
        assert normalize_sql(definition) in sql

    assert AGENT_CONTROL_SCHEMA_VERSION == 1
    assert REQUIRED_TABLE_NAMES == frozenset(
        {"model_configs", "active_model_config", "control_events"}
    )


def test_schema_versioning_is_literal_idempotent_and_marks_version_one() -> None:
    prepare = normalize_sql(PREPARE_SCHEMA_SQL)
    version_one = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert "ALTER SCHEMA agent_control OWNER TO ai_agent_control_migrator" in prepare
    assert "CREATE TABLE IF NOT EXISTS agent_control.schema_versions" in prepare
    assert "PRIMARY KEY" in prepare
    assert "INSERT INTO agent_control.schema_versions (version) VALUES (1)" in version_one
    assert "ON CONFLICT (version) DO NOTHING" in version_one
    assert "{" not in PREPARE_SCHEMA_SQL + SCHEMA_VERSION_1_SQL
    assert "%s" not in PREPARE_SCHEMA_SQL + SCHEMA_VERSION_1_SQL


def test_model_config_update_trigger_enforces_append_only_revisions() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)

    assert "CREATE OR REPLACE FUNCTION agent_control.guard_model_config_update()" in sql
    assert "BEFORE UPDATE ON agent_control.model_configs" in sql
    for immutable_column in (
        "id",
        "provider",
        "model_id",
        "endpoint_id",
        "api_key_ciphertext",
        "api_key_nonce",
        "api_key_last_four",
        "encryption_key_version",
        "revision",
        "created_at",
    ):
        assert f"NEW.{immutable_column} IS DISTINCT FROM OLD.{immutable_column}" in sql
    assert "OLD.is_current = false AND NEW.is_current = true" in sql
    assert "ERRCODE = '42501'" in sql


def test_schema_sql_has_exact_runtime_grants_and_no_broad_privileges() -> None:
    sql = normalize_sql(SCHEMA_VERSION_1_SQL)
    grants = {
        normalize_sql(statement)
        for statement in re.findall(
            r"GRANT\s+[^;]+\s+TO\s+ai_agent_control;",
            SCHEMA_VERSION_1_SQL,
            flags=re.IGNORECASE,
        )
    }

    assert grants == {
        "GRANT USAGE ON SCHEMA agent_control TO ai_agent_control;",
        "GRANT SELECT, INSERT, UPDATE ON agent_control.model_configs TO ai_agent_control;",
        "GRANT SELECT, INSERT, UPDATE ON agent_control.active_model_config TO ai_agent_control;",
        "GRANT SELECT, INSERT ON agent_control.control_events TO ai_agent_control;",
    }
    assert EXPECTED_RUNTIME_GRANTS == frozenset(
        {
            ("active_model_config", "INSERT"),
            ("active_model_config", "SELECT"),
            ("active_model_config", "UPDATE"),
            ("control_events", "INSERT"),
            ("control_events", "SELECT"),
            ("model_configs", "INSERT"),
            ("model_configs", "SELECT"),
            ("model_configs", "UPDATE"),
        }
    )
    assert "REVOKE ALL ON SCHEMA agent_control FROM PUBLIC;" in sql
    assert "REVOKE ALL ON ALL TABLES IN SCHEMA agent_control FROM PUBLIC;" in sql
    assert "ALTER DEFAULT PRIVILEGES" not in sql
    assert not re.search(r"GRANT\s+DELETE", sql, flags=re.IGNORECASE)
    assert not re.search(
        r"GRANT\s+[^;]*UPDATE\s+ON\s+agent_control\.control_events",
        sql,
        flags=re.IGNORECASE,
    )
    for excluded_role in (
        "ai_agent_migrator",
        "ai_agent_runtime",
        "ai_agent_backup",
        "ai_agent_agno_migrator",
        "ai_agent_agno",
    ):
        assert not re.search(
            rf"GRANT\s+[^;]+\s+TO\s+{excluded_role}",
            SCHEMA_VERSION_1_SQL,
            flags=re.IGNORECASE,
        )


def test_schema_objects_are_explicitly_owned_by_the_control_migrator() -> None:
    sql = normalize_sql(PREPARE_SCHEMA_SQL + SCHEMA_VERSION_1_SQL)

    assert "ALTER SCHEMA agent_control OWNER TO ai_agent_control_migrator" in sql
    for table_name in (
        "schema_versions",
        "model_configs",
        "active_model_config",
        "control_events",
    ):
        assert (
            f"ALTER TABLE agent_control.{table_name} OWNER TO "
            "ai_agent_control_migrator"
        ) in sql
    assert (
        "ALTER FUNCTION agent_control.guard_model_config_update() OWNER TO "
        "ai_agent_control_migrator"
    ) in sql


def test_role_bootstrap_creates_only_control_roles_and_rotates_both_passwords() -> None:
    role_sql = (REPO_ROOT / "infra/postgres/04-agent-control-roles.sql").read_text()

    created_roles = set(re.findall(r"CREATE ROLE\s+(ai_agent_[a-z_]+)", role_sql))
    assert created_roles == {"ai_agent_control_migrator", "ai_agent_control"}
    assert (
        "\\getenv control_migrator_password "
        "AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD"
    ) in role_sql
    assert "\\getenv control_runtime_password AGENT_CONTROL_DATABASE_PASSWORD" in role_sql
    for role in ("ai_agent_control_migrator", "ai_agent_control"):
        assert f"ALTER ROLE {role}" in role_sql
    assert 'GRANT CONNECT ON DATABASE :"DBNAME"' in role_sql
    assert 'REVOKE CREATE ON DATABASE :"DBNAME"' in role_sql
    assert (
        "CREATE SCHEMA IF NOT EXISTS agent_control AUTHORIZATION "
        "ai_agent_control_migrator"
    ) in normalize_sql(role_sql)
    assert "GRANT USAGE ON SCHEMA" not in role_sql
    assert "GRANT SELECT" not in role_sql


def test_role_bootstrap_wrapper_keeps_secrets_out_of_psql_argv(
    tmp_path: Path,
) -> None:
    fake_psql = tmp_path / "psql"
    fake_psql.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
    fake_psql.chmod(0o700)
    wrapper = REPO_ROOT / "infra/postgres/04-agent-control-roles.sh"
    secrets = {
        "POSTGRES_PASSWORD": "owner-private-secret",
        "AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD": "migrator-private-secret",
        "AGENT_CONTROL_DATABASE_PASSWORD": "runtime-private-secret",
    }
    environment = {
        **os.environ,
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "POSTGRES_HOST": "127.0.0.1",
        "POSTGRES_PORT": "5432",
        "POSTGRES_USER": "owner",
        "POSTGRES_DB": "platform",
        "AGENT_CONTROL_ROLE_SQL_FILE": str(
            REPO_ROOT / "infra/postgres/04-agent-control-roles.sql"
        ),
        **secrets,
    }

    completed = subprocess.run(
        ["sh", str(wrapper)],
        check=False,
        capture_output=True,
        text=True,
        env=environment,
    )

    assert completed.returncode == 0
    output = completed.stdout + completed.stderr
    assert "-v\nON_ERROR_STOP=1" in output
    assert "--single-transaction" in output
    for secret in secrets.values():
        assert secret not in output


class FakeCursor:
    def __init__(self, *, version_applied: bool = False) -> None:
        self.version_applied = version_applied
        self.queries: list[str] = []
        self.current_query = ""

    async def __aenter__(self) -> "FakeCursor":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def execute(self, query: str) -> None:
        self.current_query = query
        self.queries.append(query)

    async def fetchone(self) -> tuple[Any, ...] | None:
        if self.current_query == SELECT_SCHEMA_VERSION_SQL:
            return (1,) if self.version_applied else None
        if self.current_query == VERIFY_SCHEMA_PRIVILEGES_SQL:
            return (True, False)
        raise AssertionError(f"unexpected fetchone query: {self.current_query}")

    async def fetchall(self) -> list[tuple[str, ...]]:
        if self.current_query == VERIFY_TABLES_SQL:
            return [(name,) for name in sorted(REQUIRED_TABLE_NAMES)]
        if self.current_query == VERIFY_RUNTIME_GRANTS_SQL:
            return [tuple(value) for value in sorted(EXPECTED_RUNTIME_GRANTS)]
        raise AssertionError(f"unexpected fetchall query: {self.current_query}")


class FakeConnection:
    def __init__(self, cursor: FakeCursor, events: list[str]) -> None:
        self.fake_cursor = cursor
        self.events = events

    async def __aenter__(self) -> "FakeConnection":
        self.events.append("transaction:begin")
        return self

    async def __aexit__(self, *_args: object) -> None:
        self.events.append("transaction:commit")
        return None

    def cursor(self) -> FakeCursor:
        return self.fake_cursor


@pytest.mark.asyncio
async def test_run_migration_applies_version_one_and_verifies_boundary_in_one_transaction() -> (
    None
):
    settings = ControlMigrationSettings.model_validate(
        {"AGENT_CONTROL_MIGRATOR_DATABASE_URL": MIGRATOR_URL}
    )
    events: list[str] = []
    cursor = FakeCursor()

    async def connector(database_url: str) -> FakeConnection:
        assert database_url == PSYCOPG_URL
        events.append("connect")
        return FakeConnection(cursor, events)

    await run_migration(settings, connector=connector)

    assert events == ["connect", "transaction:begin", "transaction:commit"]
    assert cursor.queries == [
        PREPARE_SCHEMA_SQL,
        SELECT_SCHEMA_VERSION_SQL,
        SCHEMA_VERSION_1_SQL,
        VERIFY_TABLES_SQL,
        VERIFY_RUNTIME_GRANTS_SQL,
        VERIFY_SCHEMA_PRIVILEGES_SQL,
    ]


@pytest.mark.asyncio
async def test_run_migration_skips_applied_version_but_reverifies_boundary() -> None:
    settings = ControlMigrationSettings.model_validate(
        {"AGENT_CONTROL_MIGRATOR_DATABASE_URL": MIGRATOR_URL}
    )
    events: list[str] = []
    cursor = FakeCursor(version_applied=True)

    async def connector(database_url: str) -> FakeConnection:
        return FakeConnection(cursor, events)

    await run_migration(settings, connector=connector)

    assert SCHEMA_VERSION_1_SQL not in cursor.queries
    assert cursor.queries[-3:] == [
        VERIFY_TABLES_SQL,
        VERIFY_RUNTIME_GRANTS_SQL,
        VERIFY_SCHEMA_PRIVILEGES_SQL,
    ]


def test_main_prints_only_fixed_success_message(
    capsys: pytest.CaptureFixture[str],
) -> None:
    calls = 0

    async def successful_migration() -> None:
        nonlocal calls
        calls += 1

    assert main(migration=successful_migration) == 0
    output = capsys.readouterr()
    assert calls == 1
    assert output.out == "Agent control migration complete.\n"
    assert output.err == ""


def test_main_prints_only_fixed_value_free_failure_message(
    capsys: pytest.CaptureFixture[str],
) -> None:
    async def failing_migration() -> None:
        raise RuntimeError("private-password must never be printed")

    assert main(migration=failing_migration) == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "Agent control migration failed.\n"
    assert "private-password" not in output.err
