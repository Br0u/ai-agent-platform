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
    EXPECTED_FUNCTION_BOUNDARY,
    EXPECTED_RUNTIME_GRANTS,
    EXPECTED_TABLE_OWNERS,
    EXPECTED_TRIGGER_BOUNDARY,
    PREPARE_SCHEMA_SQL,
    REQUIRED_TABLE_NAMES,
    SCHEMA_VERSION_1_SQL,
    SELECT_SCHEMA_VERSION_SQL,
    VERIFY_FORBIDDEN_TABLE_GRANTS_SQL,
    VERIFY_FUNCTION_BOUNDARY_SQL,
    VERIFY_PUBLIC_FUNCTION_GRANTS_SQL,
    VERIFY_RUNTIME_GRANTS_SQL,
    VERIFY_SCHEMA_PRIVILEGES_SQL,
    VERIFY_TABLES_SQL,
    VERIFY_TRIGGER_BOUNDARY_SQL,
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
EXPECTED_VERIFY_SCHEMA_OWNER_SQL = """SELECT pg_get_userbyid(n.nspowner)::text
FROM pg_namespace AS n
WHERE n.nspname = 'agent_control'
"""
EXPECTED_RUNTIME_GRANTS_WITH_OPTIONS = frozenset(
    {
        ("active_model_config", "INSERT", False),
        ("active_model_config", "SELECT", False),
        ("active_model_config", "UPDATE", False),
        ("control_events", "INSERT", False),
        ("control_events", "SELECT", False),
        ("model_configs", "INSERT", False),
        ("model_configs", "SELECT", False),
        ("model_configs", "UPDATE", False),
    }
)
EXPECTED_FUNCTION_SOURCE = (
    "BEGIN IF NEW.id IS DISTINCT FROM OLD.id "
    "OR NEW.provider IS DISTINCT FROM OLD.provider "
    "OR NEW.model_id IS DISTINCT FROM OLD.model_id "
    "OR NEW.endpoint_id IS DISTINCT FROM OLD.endpoint_id "
    "OR NEW.api_key_ciphertext IS DISTINCT FROM OLD.api_key_ciphertext "
    "OR NEW.api_key_nonce IS DISTINCT FROM OLD.api_key_nonce "
    "OR NEW.api_key_last_four IS DISTINCT FROM OLD.api_key_last_four "
    "OR NEW.encryption_key_version IS DISTINCT FROM OLD.encryption_key_version "
    "OR NEW.revision IS DISTINCT FROM OLD.revision "
    "OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN "
    "RAISE EXCEPTION 'model config revision fields are immutable' "
    "USING ERRCODE = '42501'; END IF; "
    "IF OLD.is_current = false AND NEW.is_current = true THEN "
    "RAISE EXCEPTION 'retired model config revisions cannot become current' "
    "USING ERRCODE = '42501'; END IF; RETURN NEW; END;"
)
EXPECTED_FUNCTION_DEFINITION = frozenset(
    {
        (
            "guard_model_config_update",
            0,
            "ai_agent_control_migrator",
            "trigger",
            "plpgsql",
            "f",
            False,
            False,
            True,
            EXPECTED_FUNCTION_SOURCE,
        )
    }
)
EXPECTED_TRIGGER_DEFINITION = frozenset(
    {
        (
            "model_configs_guard_update",
            "model_configs",
            "agent_control",
            "guard_model_config_update",
            "ai_agent_control_migrator",
            "ai_agent_control_migrator",
            "O",
            19,
            0,
            "",
            True,
        )
    }
)
EXPECTED_SCHEMA_GRANTS = frozenset(
    {
        ("ai_agent_control", "USAGE", False),
        ("ai_agent_control_migrator", "CREATE", False),
        ("ai_agent_control_migrator", "USAGE", False),
    }
)
EXPECTED_SCHEMA_VERSION_COLUMNS = [
    ("version", "smallint", True, ""),
    ("applied_at", "timestamp with time zone", True, "now()"),
]
EXPECTED_SCHEMA_VERSION_CONSTRAINTS = [
    ("c", "CHECK (version >= 1)", False, False, True),
    ("p", "PRIMARY KEY (version)", False, False, True),
]
EXPECTED_VERIFY_FUNCTION_DEFINITION_SQL = """SELECT
  p.proname::text,
  p.pronargs::integer,
  pg_get_userbyid(p.proowner)::text,
  p.prorettype::regtype::text,
  l.lanname::text,
  p.prokind::text,
  p.prosecdef,
  p.proretset,
  p.proconfig IS NULL,
  btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g'))
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_language AS l ON l.oid = p.prolang
WHERE n.nspname = 'agent_control'
ORDER BY p.proname, p.pronargs
"""
EXPECTED_VERIFY_TRIGGER_DEFINITION_SQL = """SELECT
  t.tgname::text,
  table_class.relname::text,
  function_schema.nspname::text,
  trigger_function.proname::text,
  pg_get_userbyid(table_class.relowner)::text,
  pg_get_userbyid(trigger_function.proowner)::text,
  t.tgenabled::text,
  t.tgtype::integer,
  t.tgnargs::integer,
  t.tgattr::text,
  t.tgqual IS NULL
FROM pg_trigger AS t
JOIN pg_class AS table_class ON table_class.oid = t.tgrelid
JOIN pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
JOIN pg_proc AS trigger_function ON trigger_function.oid = t.tgfoid
JOIN pg_namespace AS function_schema
  ON function_schema.oid = trigger_function.pronamespace
WHERE table_schema.nspname = 'agent_control'
  AND NOT t.tgisinternal
ORDER BY t.tgname
"""
EXPECTED_VERIFY_COLUMN_GRANTS_SQL = """SELECT
  c.relname::text,
  a.attname::text,
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE pg_get_userbyid(acl.grantee)::text
  END,
  acl.privilege_type::text,
  acl.is_grantable
FROM pg_attribute AS a
JOIN pg_class AS c ON c.oid = a.attrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
WHERE n.nspname = 'agent_control'
  AND c.relkind IN ('r', 'p')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY c.relname, a.attnum, 3, acl.privilege_type
"""
EXPECTED_VERIFY_SCHEMA_ACL_SQL = """SELECT
  CASE
    WHEN acl.grantee = 0 THEN 'PUBLIC'
    ELSE pg_get_userbyid(acl.grantee)::text
  END,
  acl.privilege_type::text,
  acl.is_grantable
FROM pg_namespace AS n
CROSS JOIN LATERAL aclexplode(
  COALESCE(n.nspacl, acldefault('n', n.nspowner))
) AS acl
WHERE n.nspname = 'agent_control'
ORDER BY 1, acl.privilege_type
"""
EXPECTED_VERIFY_SCHEMA_VERSION_COLUMNS_SQL = """SELECT
  a.attname::text,
  format_type(a.atttypid, a.atttypmod)::text,
  a.attnotnull,
  COALESCE(pg_get_expr(d.adbin, d.adrelid), '')::text
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_attribute AS a ON a.attrelid = c.oid
LEFT JOIN pg_attrdef AS d
  ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname = 'agent_control'
  AND c.relname = 'schema_versions'
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY a.attnum
"""
EXPECTED_VERIFY_SCHEMA_VERSION_CONSTRAINTS_SQL = """SELECT
  con.contype::text,
  pg_get_constraintdef(con.oid, true)::text,
  con.condeferrable,
  con.condeferred,
  con.convalidated
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'agent_control'
  AND c.relname = 'schema_versions'
  AND con.contype IN ('c', 'p')
ORDER BY con.contype, pg_get_constraintdef(con.oid, true)
"""


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

    assert "CREATE SCHEMA" not in prepare
    assert "ALTER SCHEMA" not in prepare
    assert "ALTER TABLE agent_control.schema_versions" not in prepare
    assert "REVOKE ALL ON TABLE agent_control.schema_versions" not in prepare
    assert "REVOKE ALL ON SCHEMA" not in prepare
    assert "CREATE TABLE IF NOT EXISTS agent_control.schema_versions" in prepare
    assert "PRIMARY KEY" in prepare
    assert (
        "INSERT INTO agent_control.schema_versions (version) VALUES (1)" in version_one
    )
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
    assert "RETURN NEW; END; $$;" in sql


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
    assert EXPECTED_RUNTIME_GRANTS == EXPECTED_RUNTIME_GRANTS_WITH_OPTIONS
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


def test_security_verification_queries_use_exact_catalog_acl_boundaries() -> None:
    table_owners = normalize_sql(VERIFY_TABLES_SQL)
    function_definition = normalize_sql(VERIFY_FUNCTION_BOUNDARY_SQL)
    runtime_grants = normalize_sql(VERIFY_RUNTIME_GRANTS_SQL)
    forbidden_grants = normalize_sql(VERIFY_FORBIDDEN_TABLE_GRANTS_SQL)
    public_function_grants = normalize_sql(VERIFY_PUBLIC_FUNCTION_GRANTS_SQL)

    assert "FROM pg_class AS c JOIN pg_namespace AS n" in table_owners
    assert "pg_get_userbyid(c.relowner)::text" in table_owners
    assert (
        "btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g'))"
        in function_definition
    )
    assert "regexp_replace(btrim(p.prosrc)" not in function_definition
    assert "aclexplode( COALESCE(c.relacl, acldefault('r', c.relowner)) )" in (
        runtime_grants
    )
    assert "acl.is_grantable" in runtime_grants
    assert "information_schema.role_table_grants" not in runtime_grants
    assert "WHEN acl.grantee = 0 THEN 'PUBLIC'" in forbidden_grants
    for excluded_role in (
        "ai_agent_migrator",
        "ai_agent_runtime",
        "ai_agent_backup",
        "ai_agent_agno_migrator",
        "ai_agent_agno",
    ):
        assert f"'{excluded_role}'" in forbidden_grants
    assert "acldefault('f', p.proowner)" in public_function_grants
    assert "acl.grantee = 0" in public_function_grants


def test_schema_objects_are_explicitly_owned_by_the_control_migrator() -> None:
    sql = normalize_sql(PREPARE_SCHEMA_SQL + SCHEMA_VERSION_1_SQL)

    for table_name in (
        "model_configs",
        "active_model_config",
        "control_events",
    ):
        assert (
            f"ALTER TABLE agent_control.{table_name} OWNER TO ai_agent_control_migrator"
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
        "\\getenv control_migrator_password AGENT_CONTROL_MIGRATOR_DATABASE_PASSWORD"
    ) in role_sql
    assert (
        "\\getenv control_runtime_password AGENT_CONTROL_DATABASE_PASSWORD" in role_sql
    )
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


def test_role_bootstrap_removes_public_temporary_and_preserves_existing_roles() -> None:
    role_sql = normalize_sql(
        (REPO_ROOT / "infra/postgres/04-agent-control-roles.sql").read_text()
    )

    assert 'REVOKE TEMPORARY ON DATABASE :"DBNAME" FROM PUBLIC;' in role_sql
    assert (
        'GRANT TEMPORARY ON DATABASE :"DBNAME" TO '
        "ai_agent_migrator, ai_agent_runtime, ai_agent_backup, "
        "ai_agent_agno_migrator, ai_agent_agno;"
    ) in role_sql
    assert (
        'REVOKE TEMPORARY ON DATABASE :"DBNAME" FROM '
        "ai_agent_control_migrator, ai_agent_control;"
    ) in role_sql
    assert not re.search(
        r'GRANT\s+TEMPORARY\s+ON\s+DATABASE\s+:"DBNAME"\s+TO\s+'
        r"[^;]*ai_agent_control(?:_migrator)?",
        role_sql,
    )


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
    def __init__(
        self,
        *,
        version_applied: bool = False,
        schema_owner: str | None = "ai_agent_control_migrator",
        security_drift: str | None = None,
    ) -> None:
        self.version_applied = version_applied
        self.schema_owner = schema_owner
        self.security_drift = security_drift
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
        if self.current_query == EXPECTED_VERIFY_SCHEMA_OWNER_SQL:
            return (self.schema_owner,) if self.schema_owner is not None else None
        if self.current_query == SELECT_SCHEMA_VERSION_SQL:
            return (1,) if self.version_applied else None
        if self.current_query == VERIFY_SCHEMA_PRIVILEGES_SQL:
            return (True, False)
        raise AssertionError(f"unexpected fetchone query: {self.current_query}")

    async def fetchall(self) -> list[tuple[Any, ...]]:
        if self.current_query == VERIFY_TABLES_SQL:
            rows = set(EXPECTED_TABLE_OWNERS)
            if self.security_drift == "table_owner":
                rows.remove(("model_configs", "ai_agent_control_migrator"))
                rows.add(("model_configs", "postgres"))
            return sorted(rows)
        if self.current_query == EXPECTED_VERIFY_SCHEMA_VERSION_COLUMNS_SQL:
            if self.security_drift == "schema_version_columns":
                return [("version", "smallint", True, "")]
            return list(EXPECTED_SCHEMA_VERSION_COLUMNS)
        if self.current_query == EXPECTED_VERIFY_SCHEMA_VERSION_CONSTRAINTS_SQL:
            rows = list(EXPECTED_SCHEMA_VERSION_CONSTRAINTS)
            if self.security_drift == "schema_version_constraint_missing":
                return rows[1:]
            if self.security_drift == "schema_version_constraint_duplicate":
                return [rows[0], rows[0], rows[1]]
            return rows
        if self.current_query == EXPECTED_VERIFY_FUNCTION_DEFINITION_SQL:
            rows = set(EXPECTED_FUNCTION_DEFINITION)
            if self.security_drift == "function_owner":
                row = next(iter(rows))
                rows = {(*row[:2], "postgres", *row[3:])}
            if self.security_drift == "function_body":
                row = next(iter(rows))
                rows = {(*row[:-1], "BEGIN RETURN NEW; END;")}
            if self.security_drift == "function_security_definer":
                row = next(iter(rows))
                rows = {(*row[:6], True, *row[7:])}
            return sorted(rows)
        if self.current_query == VERIFY_FUNCTION_BOUNDARY_SQL:
            rows = set(EXPECTED_FUNCTION_BOUNDARY)
            if self.security_drift == "function_owner":
                rows = {("guard_model_config_update", 0, "postgres", "trigger")}
            return sorted(rows)
        if self.current_query == EXPECTED_VERIFY_TRIGGER_DEFINITION_SQL:
            rows = set(EXPECTED_TRIGGER_DEFINITION)
            row = next(iter(rows))
            if self.security_drift == "trigger_binding":
                rows = {(row[0], "control_events", *row[2:])}
            if self.security_drift == "trigger_disabled":
                rows = {(*row[:6], "D", *row[7:])}
            if self.security_drift == "trigger_shape":
                rows = {(*row[:7], 17, *row[8:])}
            return sorted(rows)
        if self.current_query == VERIFY_TRIGGER_BOUNDARY_SQL:
            rows = set(EXPECTED_TRIGGER_BOUNDARY)
            if self.security_drift == "trigger_binding":
                rows = {
                    (
                        "model_configs_guard_update",
                        "control_events",
                        "agent_control",
                        "guard_model_config_update",
                        "ai_agent_control_migrator",
                        "ai_agent_control_migrator",
                    )
                }
            return sorted(rows)
        if self.current_query == VERIFY_RUNTIME_GRANTS_SQL:
            rows = set(EXPECTED_RUNTIME_GRANTS_WITH_OPTIONS)
            if self.security_drift == "runtime_grant_option":
                rows.remove(("model_configs", "SELECT", False))
                rows.add(("model_configs", "SELECT", True))
            return sorted(rows)
        if self.current_query == VERIFY_FORBIDDEN_TABLE_GRANTS_SQL:
            if self.security_drift == "forbidden_table_grant":
                return [("model_configs", "PUBLIC", "SELECT", False)]
            return []
        if self.current_query == EXPECTED_VERIFY_COLUMN_GRANTS_SQL:
            if self.security_drift == "column_grant":
                return [
                    (
                        "control_events",
                        "result",
                        "ai_agent_control",
                        "UPDATE",
                        False,
                    )
                ]
            return []
        if self.current_query == VERIFY_PUBLIC_FUNCTION_GRANTS_SQL:
            if self.security_drift == "public_function_execute":
                return [("guard_model_config_update", "EXECUTE", False)]
            return []
        if self.current_query == EXPECTED_VERIFY_SCHEMA_ACL_SQL:
            rows = set(EXPECTED_SCHEMA_GRANTS)
            if self.security_drift == "schema_public_grant":
                rows.add(("PUBLIC", "USAGE", False))
            if self.security_drift == "schema_grant_option":
                rows.remove(("ai_agent_control", "USAGE", False))
                rows.add(("ai_agent_control", "USAGE", True))
            return sorted(rows)
        raise AssertionError(f"unexpected fetchall query: {self.current_query}")


class FakeConnection:
    def __init__(self, cursor: FakeCursor, events: list[str]) -> None:
        self.fake_cursor = cursor
        self.events = events

    async def __aenter__(self) -> "FakeConnection":
        self.events.append("transaction:begin")
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        *_args: object,
    ) -> None:
        self.events.append(
            "transaction:rollback" if exc_type is not None else "transaction:commit"
        )
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
        EXPECTED_VERIFY_SCHEMA_OWNER_SQL,
        PREPARE_SCHEMA_SQL,
        SELECT_SCHEMA_VERSION_SQL,
        SCHEMA_VERSION_1_SQL,
        VERIFY_TABLES_SQL,
        EXPECTED_VERIFY_SCHEMA_VERSION_COLUMNS_SQL,
        EXPECTED_VERIFY_SCHEMA_VERSION_CONSTRAINTS_SQL,
        EXPECTED_VERIFY_FUNCTION_DEFINITION_SQL,
        EXPECTED_VERIFY_TRIGGER_DEFINITION_SQL,
        VERIFY_RUNTIME_GRANTS_SQL,
        VERIFY_FORBIDDEN_TABLE_GRANTS_SQL,
        EXPECTED_VERIFY_COLUMN_GRANTS_SQL,
        VERIFY_PUBLIC_FUNCTION_GRANTS_SQL,
        EXPECTED_VERIFY_SCHEMA_ACL_SQL,
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
    assert cursor.queries[-10:] == [
        VERIFY_TABLES_SQL,
        EXPECTED_VERIFY_SCHEMA_VERSION_COLUMNS_SQL,
        EXPECTED_VERIFY_SCHEMA_VERSION_CONSTRAINTS_SQL,
        EXPECTED_VERIFY_FUNCTION_DEFINITION_SQL,
        EXPECTED_VERIFY_TRIGGER_DEFINITION_SQL,
        VERIFY_RUNTIME_GRANTS_SQL,
        VERIFY_FORBIDDEN_TABLE_GRANTS_SQL,
        EXPECTED_VERIFY_COLUMN_GRANTS_SQL,
        VERIFY_PUBLIC_FUNCTION_GRANTS_SQL,
        EXPECTED_VERIFY_SCHEMA_ACL_SQL,
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "security_drift",
    [
        "table_owner",
        "function_owner",
        "trigger_binding",
        "runtime_grant_option",
        "forbidden_table_grant",
        "public_function_execute",
        "function_body",
        "function_security_definer",
        "trigger_disabled",
        "trigger_shape",
        "column_grant",
        "schema_public_grant",
        "schema_grant_option",
        "schema_version_columns",
        "schema_version_constraint_missing",
        "schema_version_constraint_duplicate",
    ],
)
async def test_applied_migration_fails_closed_on_security_boundary_drift(
    security_drift: str,
) -> None:
    settings = ControlMigrationSettings.model_validate(
        {"AGENT_CONTROL_MIGRATOR_DATABASE_URL": MIGRATOR_URL}
    )
    events: list[str] = []
    cursor = FakeCursor(version_applied=True, security_drift=security_drift)

    async def connector(database_url: str) -> FakeConnection:
        return FakeConnection(cursor, events)

    with pytest.raises(
        RuntimeError,
        match="^Agent control migration verification failed$",
    ):
        await run_migration(settings, connector=connector)

    assert SCHEMA_VERSION_1_SQL not in cursor.queries
    assert events == ["transaction:begin", "transaction:rollback"]


@pytest.mark.asyncio
async def test_version_one_ddl_rolls_back_when_post_verification_fails() -> None:
    settings = ControlMigrationSettings.model_validate(
        {"AGENT_CONTROL_MIGRATOR_DATABASE_URL": MIGRATOR_URL}
    )
    events: list[str] = []
    cursor = FakeCursor(security_drift="table_owner")

    async def connector(database_url: str) -> FakeConnection:
        return FakeConnection(cursor, events)

    with pytest.raises(
        RuntimeError,
        match="^Agent control migration verification failed$",
    ):
        await run_migration(settings, connector=connector)

    assert SCHEMA_VERSION_1_SQL in cursor.queries
    assert events == ["transaction:begin", "transaction:rollback"]


@pytest.mark.asyncio
@pytest.mark.parametrize("schema_owner", [None, "postgres"])
async def test_run_migration_rejects_invalid_schema_owner_before_prepare(
    schema_owner: str | None,
) -> None:
    settings = ControlMigrationSettings.model_validate(
        {"AGENT_CONTROL_MIGRATOR_DATABASE_URL": MIGRATOR_URL}
    )
    events: list[str] = []
    cursor = FakeCursor(schema_owner=schema_owner)

    async def connector(database_url: str) -> FakeConnection:
        return FakeConnection(cursor, events)

    with pytest.raises(
        RuntimeError,
        match="^Agent control migration verification failed$",
    ):
        await run_migration(settings, connector=connector)

    assert cursor.queries == [EXPECTED_VERIFY_SCHEMA_OWNER_SQL]
    assert PREPARE_SCHEMA_SQL not in cursor.queries


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
