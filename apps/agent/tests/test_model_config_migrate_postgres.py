import os
import re
from urllib.parse import unquote, urlsplit
from uuid import uuid4

import psycopg
import pytest

from agent_service.config import ControlMigrationSettings
from agent_service.model_config_migrate import run_migration
from agent_service.model_config_schema import EXPECTED_RUNTIME_GRANTS


MIGRATOR_URL = os.getenv("AGENT_CONTROL_MIGRATOR_DATABASE_URL")
DEDICATED_TEST_DATABASE = re.compile(
    r"ai_agent_platform_identity_test(?:_[a-z0-9][a-z0-9-]{0,63})?"
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


def assert_safe_control_test_url(database_url: str) -> str:
    prefix = "postgresql+psycopg_async://"
    if not database_url.startswith(prefix):
        raise ValueError("control migration test database must use psycopg async")
    try:
        parsed = urlsplit(f"postgresql://{database_url.removeprefix(prefix)}")
        hostname = parsed.hostname
    except ValueError as error:
        raise ValueError("control migration test database URL is invalid") from error
    if parsed.query or parsed.fragment:
        raise ValueError("control migration test database must not use parameters")
    if hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("control migration test database must use loopback")
    database_name = unquote(parsed.path.removeprefix("/"))
    if DEDICATED_TEST_DATABASE.fullmatch(database_name) is None:
        raise ValueError("dedicated control migration test database is required")
    return database_url


def psycopg_url(database_url: str) -> str:
    return database_url.replace(
        "postgresql+psycopg_async://",
        "postgresql://",
        1,
    )


@pytest.mark.asyncio
@pytest.mark.skipif(
    not MIGRATOR_URL,
    reason=(
        "AGENT_CONTROL_MIGRATOR_DATABASE_URL is required for PostgreSQL integration"
    ),
)
async def test_real_control_migration_is_idempotent_owned_and_enforces_boundaries() -> (
    None
):
    assert MIGRATOR_URL is not None
    safe_url = assert_safe_control_test_url(MIGRATOR_URL)
    settings = ControlMigrationSettings.model_validate(
        {"AGENT_CONTROL_MIGRATOR_DATABASE_URL": safe_url}
    )
    await run_migration(settings)
    await run_migration(settings)

    async with await psycopg.AsyncConnection.connect(psycopg_url(safe_url)) as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(
                """SELECT table_name::text
                FROM information_schema.tables
                WHERE table_schema = 'agent_control'
                ORDER BY table_name"""
            )
            assert {row[0] for row in await cursor.fetchall()} == {
                "active_model_config",
                "control_events",
                "model_configs",
                "schema_versions",
            }

            await cursor.execute(
                "SELECT version FROM agent_control.schema_versions ORDER BY version"
            )
            assert await cursor.fetchall() == [(1,)]

            await cursor.execute(
                """SELECT
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
                ORDER BY a.attnum"""
            )
            assert await cursor.fetchall() == [
                ("version", "smallint", True, ""),
                ("applied_at", "timestamp with time zone", True, "now()"),
            ]

            await cursor.execute(
                """SELECT
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
                ORDER BY con.contype, pg_get_constraintdef(con.oid, true)"""
            )
            assert await cursor.fetchall() == [
                ("c", "CHECK (version >= 1)", False, False, True),
                ("p", "PRIMARY KEY (version)", False, False, True),
            ]

            await cursor.execute(
                """SELECT n.nspname::text, pg_get_userbyid(n.nspowner)::text
                FROM pg_namespace AS n
                WHERE n.nspname = 'agent_control'"""
            )
            assert await cursor.fetchall() == [
                ("agent_control", "ai_agent_control_migrator")
            ]

            await cursor.execute(
                """SELECT
                  current_user::text,
                  has_database_privilege(current_user, current_database(), 'CREATE')"""
            )
            assert await cursor.fetchone() == (
                "ai_agent_control_migrator",
                False,
            )

            await cursor.execute(
                """SELECT c.relname::text, pg_get_userbyid(c.relowner)::text
                FROM pg_class AS c
                JOIN pg_namespace AS n ON n.oid = c.relnamespace
                WHERE n.nspname = 'agent_control'
                  AND c.relkind IN ('r', 'p')
                ORDER BY c.relname"""
            )
            assert await cursor.fetchall() == [
                ("active_model_config", "ai_agent_control_migrator"),
                ("control_events", "ai_agent_control_migrator"),
                ("model_configs", "ai_agent_control_migrator"),
                ("schema_versions", "ai_agent_control_migrator"),
            ]

            await cursor.execute(
                """SELECT
                  p.proname::text,
                  p.pronargs::integer,
                  pg_get_userbyid(p.proowner)::text,
                  p.prorettype::regtype::text,
                  l.lanname::text,
                  p.prokind::text,
                  p.prosecdef,
                  p.proretset,
                  p.proconfig IS NULL,
                  regexp_replace(btrim(p.prosrc), '[[:space:]]+', ' ', 'g')
                FROM pg_proc AS p
                JOIN pg_namespace AS n ON n.oid = p.pronamespace
                JOIN pg_language AS l ON l.oid = p.prolang
                WHERE n.nspname = 'agent_control'"""
            )
            assert await cursor.fetchall() == [
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
            ]

            await cursor.execute(
                """SELECT
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
                JOIN pg_namespace AS table_schema
                  ON table_schema.oid = table_class.relnamespace
                JOIN pg_proc AS trigger_function ON trigger_function.oid = t.tgfoid
                JOIN pg_namespace AS function_schema
                  ON function_schema.oid = trigger_function.pronamespace
                WHERE table_schema.nspname = 'agent_control'
                  AND NOT t.tgisinternal"""
            )
            assert await cursor.fetchall() == [
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
            ]

            await cursor.execute(
                """SELECT
                  table_name::text,
                  privilege_type::text,
                  is_grantable = 'YES'
                FROM information_schema.role_table_grants
                WHERE table_schema = 'agent_control'
                  AND grantee = 'ai_agent_control'
                ORDER BY table_name, privilege_type"""
            )
            assert set(await cursor.fetchall()) == EXPECTED_RUNTIME_GRANTS

            await cursor.execute(
                """SELECT
                  c.relname::text,
                  CASE
                    WHEN acl.grantee = 0 THEN 'PUBLIC'
                    ELSE pg_get_userbyid(acl.grantee)::text
                  END,
                  acl.privilege_type::text,
                  acl.is_grantable
                FROM pg_class AS c
                JOIN pg_namespace AS n ON n.oid = c.relnamespace
                CROSS JOIN LATERAL aclexplode(
                  COALESCE(c.relacl, acldefault('r', c.relowner))
                ) AS acl
                WHERE n.nspname = 'agent_control'
                  AND c.relkind IN ('r', 'p')
                  AND (
                    acl.grantee = 0
                    OR pg_get_userbyid(acl.grantee)::text IN (
                      'ai_agent_migrator',
                      'ai_agent_runtime',
                      'ai_agent_backup',
                      'ai_agent_agno_migrator',
                      'ai_agent_agno'
                    )
                  )"""
            )
            assert await cursor.fetchall() == []

            await cursor.execute(
                """SELECT c.relname::text, a.attname::text
                FROM pg_attribute AS a
                JOIN pg_class AS c ON c.oid = a.attrelid
                JOIN pg_namespace AS n ON n.oid = c.relnamespace
                CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
                WHERE n.nspname = 'agent_control'
                  AND c.relkind IN ('r', 'p')
                  AND a.attnum > 0
                  AND NOT a.attisdropped"""
            )
            assert await cursor.fetchall() == []

            await cursor.execute(
                """SELECT p.proname::text, acl.privilege_type::text
                FROM pg_proc AS p
                JOIN pg_namespace AS n ON n.oid = p.pronamespace
                CROSS JOIN LATERAL aclexplode(
                  COALESCE(p.proacl, acldefault('f', p.proowner))
                ) AS acl
                WHERE n.nspname = 'agent_control'
                  AND acl.grantee = 0"""
            )
            assert await cursor.fetchall() == []

            await cursor.execute(
                """SELECT
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
                ORDER BY 1, acl.privilege_type"""
            )
            assert await cursor.fetchall() == [
                ("ai_agent_control", "USAGE", False),
                ("ai_agent_control_migrator", "CREATE", False),
                ("ai_agent_control_migrator", "USAGE", False),
            ]

            config_id = uuid4()
            await cursor.execute(
                """INSERT INTO agent_control.model_configs (
                  id, provider, model_id, endpoint_id,
                  api_key_ciphertext, api_key_nonce, api_key_last_four,
                  encryption_key_version, revision, is_current, test_status
                ) VALUES (%s, 'minimax', 'migration-test', 'minimax-official',
                  %s, %s, 'test', 1, 9223372036854775000, false, 'untested')""",
                (config_id, b"ciphertext", b"123456789012"),
            )
            await cursor.execute(
                """UPDATE agent_control.model_configs
                SET test_status = 'passed', last_tested_at = now(), updated_at = now()
                WHERE id = %s""",
                (config_id,),
            )

            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                async with conn.transaction():
                    await cursor.execute(
                        """UPDATE agent_control.model_configs
                        SET model_id = 'forbidden' WHERE id = %s""",
                        (config_id,),
                    )
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                async with conn.transaction():
                    await cursor.execute(
                        """UPDATE agent_control.model_configs
                        SET is_current = true WHERE id = %s""",
                        (config_id,),
                    )

            await cursor.execute(
                "DELETE FROM agent_control.model_configs WHERE id = %s",
                (config_id,),
            )


@pytest.mark.asyncio
@pytest.mark.skipif(
    not MIGRATOR_URL,
    reason=(
        "AGENT_CONTROL_MIGRATOR_DATABASE_URL is required for PostgreSQL integration"
    ),
)
async def test_real_applied_migration_rejects_public_table_grant_drift() -> None:
    assert MIGRATOR_URL is not None
    safe_url = assert_safe_control_test_url(MIGRATOR_URL)
    settings = ControlMigrationSettings.model_validate(
        {"AGENT_CONTROL_MIGRATOR_DATABASE_URL": safe_url}
    )
    await run_migration(settings)

    async with await psycopg.AsyncConnection.connect(psycopg_url(safe_url)) as conn:
        await conn.execute("GRANT SELECT ON agent_control.model_configs TO PUBLIC")

    try:
        with pytest.raises(
            RuntimeError,
            match="^Agent control migration verification failed$",
        ):
            await run_migration(settings)
    finally:
        async with await psycopg.AsyncConnection.connect(psycopg_url(safe_url)) as conn:
            await conn.execute(
                "REVOKE SELECT ON agent_control.model_configs FROM PUBLIC"
            )

    await run_migration(settings)


@pytest.mark.asyncio
@pytest.mark.skipif(
    not MIGRATOR_URL,
    reason=(
        "AGENT_CONTROL_MIGRATOR_DATABASE_URL is required for PostgreSQL integration"
    ),
)
async def test_real_applied_migration_rejects_disabled_guard_trigger() -> None:
    assert MIGRATOR_URL is not None
    safe_url = assert_safe_control_test_url(MIGRATOR_URL)
    settings = ControlMigrationSettings.model_validate(
        {"AGENT_CONTROL_MIGRATOR_DATABASE_URL": safe_url}
    )
    await run_migration(settings)

    async with await psycopg.AsyncConnection.connect(psycopg_url(safe_url)) as conn:
        await conn.execute(
            """ALTER TABLE agent_control.model_configs
            DISABLE TRIGGER model_configs_guard_update"""
        )

    try:
        with pytest.raises(
            RuntimeError,
            match="^Agent control migration verification failed$",
        ):
            await run_migration(settings)
    finally:
        async with await psycopg.AsyncConnection.connect(psycopg_url(safe_url)) as conn:
            await conn.execute(
                """ALTER TABLE agent_control.model_configs
                ENABLE TRIGGER model_configs_guard_update"""
            )

    await run_migration(settings)
