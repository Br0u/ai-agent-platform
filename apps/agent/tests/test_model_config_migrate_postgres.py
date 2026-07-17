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
                """SELECT p.proname::text, pg_get_userbyid(p.proowner)::text
                FROM pg_proc AS p
                JOIN pg_namespace AS n ON n.oid = p.pronamespace
                WHERE n.nspname = 'agent_control'
                  AND p.proname = 'guard_model_config_update'"""
            )
            assert await cursor.fetchall() == [
                ("guard_model_config_update", "ai_agent_control_migrator")
            ]

            await cursor.execute(
                """SELECT t.tgname::text, pg_get_userbyid(c.relowner)::text
                FROM pg_trigger AS t
                JOIN pg_class AS c ON c.oid = t.tgrelid
                WHERE t.tgrelid = 'agent_control.model_configs'::regclass
                  AND NOT t.tgisinternal"""
            )
            assert await cursor.fetchall() == [
                ("model_configs_guard_update", "ai_agent_control_migrator")
            ]

            await cursor.execute(
                """SELECT table_name::text, privilege_type::text
                FROM information_schema.role_table_grants
                WHERE table_schema = 'agent_control'
                  AND grantee = 'ai_agent_control'
                ORDER BY table_name, privilege_type"""
            )
            assert set(await cursor.fetchall()) == EXPECTED_RUNTIME_GRANTS

            await cursor.execute(
                """SELECT
                  has_schema_privilege('ai_agent_control', 'agent_control', 'USAGE'),
                  has_schema_privilege('ai_agent_control', 'agent_control', 'CREATE')"""
            )
            assert await cursor.fetchone() == (True, False)

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
