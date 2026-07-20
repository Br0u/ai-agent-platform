import asyncio
import os
import re
from urllib.parse import unquote, urlsplit
from uuid import UUID, uuid4

import psycopg
import pytest

from skill_registry.config import MigrationSettings
from skill_registry.migrate import run_migration


ENVIRONMENT_URLS = {
    "test": os.getenv("SKILL_REGISTRY_TEST_DATABASE_URL"),
    "migrator": os.getenv("SKILL_REGISTRY_MIGRATOR_DATABASE_URL"),
    "manager": os.getenv("SKILL_REGISTRY_DATABASE_URL"),
    "runtime": os.getenv("SKILL_REGISTRY_RUNTIME_DATABASE_URL"),
}
ENVIRONMENT_NAMES = {
    "test": "SKILL_REGISTRY_TEST_DATABASE_URL",
    "migrator": "SKILL_REGISTRY_MIGRATOR_DATABASE_URL",
    "manager": "SKILL_REGISTRY_DATABASE_URL",
    "runtime": "SKILL_REGISTRY_RUNTIME_DATABASE_URL",
}
MISSING_ENVIRONMENT = [
    ENVIRONMENT_NAMES[name] for name, value in ENVIRONMENT_URLS.items() if not value
]
DEDICATED_TEST_DATABASE = re.compile(
    r"ai_agent_platform_identity_test(?:_[a-z0-9][a-z0-9-]{0,63})?"
)
FOREIGN_ROLES = (
    "ai_agent_migrator",
    "ai_agent_runtime",
    "ai_agent_agno_migrator",
    "ai_agent_agno",
    "ai_agent_control_migrator",
    "ai_agent_control",
)


def _assert_safe_url(database_url: str, *, require_async: bool) -> str:
    async_prefix = "postgresql+psycopg_async://"
    postgres_prefix = "postgresql://"
    if require_async and not database_url.startswith(async_prefix):
        raise ValueError("registry role URLs must use psycopg async")
    if not database_url.startswith((async_prefix, postgres_prefix)):
        raise ValueError("skill registry integration URL is invalid")
    parsed = urlsplit(_psycopg_url(database_url))
    if parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("skill registry integration database must use loopback")
    if parsed.query or parsed.fragment:
        raise ValueError("skill registry integration URLs must not use parameters")
    database_name = unquote(parsed.path.removeprefix("/"))
    if DEDICATED_TEST_DATABASE.fullmatch(database_name) is None:
        raise ValueError("dedicated skill registry integration database is required")
    return database_url


def _psycopg_url(database_url: str) -> str:
    return database_url.replace("postgresql+psycopg_async://", "postgresql://", 1)


def _validated_urls() -> dict[str, str]:
    urls = {
        name: _assert_safe_url(value or "", require_async=name != "test")
        for name, value in ENVIRONMENT_URLS.items()
    }
    targets = {
        (
            urlsplit(_psycopg_url(value)).hostname,
            urlsplit(_psycopg_url(value)).port or 5432,
            urlsplit(_psycopg_url(value)).path,
        )
        for value in urls.values()
    }
    if len(targets) != 1:
        raise ValueError("all skill registry roles must target the same test database")
    return urls


async def _connect(database_url: str) -> psycopg.AsyncConnection[tuple[object, ...]]:
    return await psycopg.AsyncConnection.connect(
        _psycopg_url(database_url),
        autocommit=True,
    )


async def _expect_database_error(
    connection: psycopg.AsyncConnection[tuple[object, ...]],
    error_type: type[psycopg.Error],
    query: str,
    parameters: tuple[object, ...] = (),
) -> None:
    with pytest.raises(error_type):
        async with connection.transaction():
            await connection.execute(query, parameters)


async def _insert_skill_revision(
    connection: psycopg.AsyncConnection[tuple[object, ...]],
    *,
    skill_id: UUID,
    revision_id: UUID,
    actor_id: UUID,
    slug: str,
    nonce: UUID,
) -> None:
    await connection.execute(
        "INSERT INTO skill_registry.skills (id, slug, created_by) VALUES (%s, %s, %s)",
        (skill_id, slug, actor_id),
    )
    await connection.execute(
        """INSERT INTO skill_registry.skill_revisions (
          id, skill_id, revision_no, state, source_type, manifest, created_by
        ) VALUES (%s, %s, 1, 'pending_review', 'upload', '{}'::jsonb, %s)""",
        (revision_id, skill_id, actor_id),
    )
    await connection.execute(
        """INSERT INTO skill_registry.skill_revision_artifacts (
          revision_id, skill_id, artifact_sha256, compressed_size,
          extracted_size, file_count, archive_bytes
        ) VALUES (%s, %s, %s, 1, 1, 1, %s)""",
        (revision_id, skill_id, "a" * 64, b"x"),
    )
    await connection.execute(
        """INSERT INTO skill_registry.skill_revision_files (
          revision_id, path, file_sha256, size, media_type
        ) VALUES (%s, 'SKILL.md', %s, 1, 'text/markdown')""",
        (revision_id, "b" * 64),
    )
    await connection.execute(
        """INSERT INTO skill_registry.skill_control_events (
          id, request_id, assertion_nonce, actor, event_type,
          target_id, result_code
        ) VALUES (%s, %s, %s, %s, 'revision_created', %s, 'ok')""",
        (uuid4(), uuid4(), nonce, str(actor_id), revision_id),
    )


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_real_registry_migration_and_role_boundary() -> None:
    urls = _validated_urls()
    owner = await _connect(urls["test"])
    manager = await _connect(urls["manager"])
    runtime = await _connect(urls["runtime"])
    try:
        expected_roles = {
            "ai_agent_skill_registry_migrator",
            "ai_agent_skill_registry_manager",
            "ai_agent_skill_registry_runtime",
            "ai_agent_backup",
            *FOREIGN_ROLES,
        }
        rows = await owner.execute(
            "SELECT rolname FROM pg_roles WHERE rolname = ANY(%s)",
            (list(expected_roles),),
        )
        assert {str(row[0]) for row in await rows.fetchall()} == expected_roles
        role_boundaries = await owner.execute(
            """SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit,
              rolreplication, rolbypassrls
            FROM pg_roles
            WHERE rolname = ANY(%s)
            ORDER BY rolname""",
            (
                [
                    "ai_agent_skill_registry_migrator",
                    "ai_agent_skill_registry_manager",
                    "ai_agent_skill_registry_runtime",
                ],
            ),
        )
        assert await role_boundaries.fetchall() == [
            ("ai_agent_skill_registry_manager", True, False, False, False, False, False, False),
            ("ai_agent_skill_registry_migrator", True, False, False, False, False, False, False),
            ("ai_agent_skill_registry_runtime", True, False, False, False, False, False, False),
        ]

        await owner.execute("DROP SCHEMA IF EXISTS skill_registry CASCADE")
        await owner.execute(
            "CREATE SCHEMA skill_registry AUTHORIZATION ai_agent_skill_registry_migrator"
        )
        settings = MigrationSettings.model_validate({"database_url": urls["migrator"]})
        await run_migration(settings)
        await run_migration(settings)
        version_rows = await owner.execute(
            "SELECT version FROM skill_registry.schema_versions ORDER BY version"
        )
        assert await version_rows.fetchall() == [(1,)]

        actor_id = uuid4()
        skill_id = uuid4()
        revision_id = uuid4()
        async with manager.transaction():
            await _insert_skill_revision(
                manager,
                skill_id=skill_id,
                revision_id=revision_id,
                actor_id=actor_id,
                slug=f"manager-{uuid4()}",
                nonce=uuid4(),
            )
        async with manager.transaction():
            await manager.execute(
                """UPDATE skill_registry.skill_revisions
                SET state = 'published', reviewed_by = %s, reviewed_at = now()
                WHERE id = %s""",
                (actor_id, revision_id),
            )
            await manager.execute(
                """INSERT INTO skill_registry.skill_control_events (
                  id, request_id, assertion_nonce, actor, event_type,
                  target_id, result_code
                ) VALUES (%s, %s, %s, %s, 'revision_published', %s, 'ok')""",
                (uuid4(), uuid4(), uuid4(), str(actor_id), revision_id),
            )

        await _expect_database_error(
            manager,
            psycopg.errors.InsufficientPrivilege,
            "UPDATE skill_registry.skill_revisions SET manifest = '{}' WHERE id = %s",
            (revision_id,),
        )
        await _expect_database_error(
            manager,
            psycopg.errors.InsufficientPrivilege,
            "UPDATE skill_registry.skill_revision_artifacts SET compressed_size = 1",
        )
        await _expect_database_error(
            manager,
            psycopg.errors.InsufficientPrivilege,
            "DELETE FROM skill_registry.skill_revision_artifacts WHERE revision_id = %s",
            (revision_id,),
        )
        await _expect_database_error(
            manager,
            psycopg.errors.InsufficientPrivilege,
            "UPDATE skill_registry.skill_revision_files SET size = 1 WHERE revision_id = %s",
            (revision_id,),
        )
        await _expect_database_error(
            manager,
            psycopg.errors.InsufficientPrivilege,
            "DELETE FROM skill_registry.skill_revision_files WHERE revision_id = %s",
            (revision_id,),
        )
        await _expect_database_error(
            manager,
            psycopg.errors.InsufficientPrivilege,
            "DELETE FROM skill_registry.skill_revisions WHERE id = %s",
            (revision_id,),
        )
        await _expect_database_error(
            manager,
            psycopg.errors.CheckViolation,
            "UPDATE skill_registry.skill_revisions SET state = 'pending_review' WHERE id = %s",
            (revision_id,),
        )
        await _expect_database_error(
            manager,
            psycopg.errors.InsufficientPrivilege,
            "CREATE TABLE skill_registry.forbidden(id integer)",
        )
        await _expect_database_error(
            manager,
            psycopg.errors.InsufficientPrivilege,
            "CREATE TEMPORARY TABLE forbidden_registry_temp(id integer)",
        )
        async with manager.transaction():
            await manager.execute(
                """INSERT INTO skill_registry.skill_control_events (
                  id, request_id, actor, event_type, target_id, result_code
                ) VALUES (%s, %s, %s, 'skill_read', %s, 'ok')""",
                (uuid4(), uuid4(), str(actor_id), skill_id),
            )
        await _expect_database_error(
            manager,
            psycopg.errors.CheckViolation,
            """INSERT INTO skill_registry.skill_control_events (
              id, request_id, actor, event_type, target_id, result_code
            ) VALUES (%s, %s, %s, 'skill_created', %s, 'ok')""",
            (uuid4(), uuid4(), str(actor_id), uuid4()),
        )

        shared_slug = f"concurrent-{uuid4()}"
        winner_id = uuid4()
        loser_id = uuid4()
        second_manager = await _connect(urls["manager"])
        try:

            async def insert_loser() -> None:
                async with second_manager.transaction():
                    await second_manager.execute(
                        """INSERT INTO skill_registry.skills (id, slug, created_by)
                        VALUES (%s, %s, %s)""",
                        (loser_id, shared_slug, actor_id),
                    )

            async with manager.transaction():
                await manager.execute(
                    """INSERT INTO skill_registry.skills (id, slug, created_by)
                    VALUES (%s, %s, %s)""",
                    (winner_id, shared_slug, actor_id),
                )
                loser_task = asyncio.create_task(insert_loser())
                await asyncio.sleep(0.05)
                await manager.execute(
                    """INSERT INTO skill_registry.skill_control_events (
                      id, request_id, assertion_nonce, actor, event_type,
                      target_id, result_code
                    ) VALUES (%s, %s, %s, %s, 'skill_created', %s, 'ok')""",
                    (uuid4(), uuid4(), uuid4(), str(actor_id), winner_id),
                )
            with pytest.raises(psycopg.errors.UniqueViolation):
                await loser_task
        finally:
            await second_manager.close()
        slug_rows = await manager.execute(
            "SELECT id FROM skill_registry.skills WHERE slug = %s",
            (shared_slug,),
        )
        assert len(await slug_rows.fetchall()) == 1

        shared_nonce = uuid4()
        first_nonce_skill = uuid4()
        async with manager.transaction():
            await manager.execute(
                "INSERT INTO skill_registry.skills (id, slug, created_by) VALUES (%s, %s, %s)",
                (first_nonce_skill, f"nonce-first-{uuid4()}", actor_id),
            )
            await manager.execute(
                """INSERT INTO skill_registry.skill_control_events (
                  id, request_id, assertion_nonce, actor, event_type,
                  target_id, result_code
                ) VALUES (%s, %s, %s, %s, 'skill_created', %s, 'ok')""",
                (uuid4(), uuid4(), shared_nonce, str(actor_id), first_nonce_skill),
            )

        rolled_back_skill = uuid4()

        async def replaying_transaction() -> None:
            async with manager.transaction():
                await manager.execute(
                    """INSERT INTO skill_registry.skills (id, slug, created_by)
                    VALUES (%s, %s, %s)""",
                    (rolled_back_skill, f"nonce-replay-{uuid4()}", actor_id),
                )
                await manager.execute(
                    """INSERT INTO skill_registry.skill_control_events (
                      id, request_id, assertion_nonce, actor, event_type,
                      target_id, result_code
                    ) VALUES (%s, %s, %s, %s, 'skill_created', %s, 'ok')""",
                    (uuid4(), uuid4(), shared_nonce, str(actor_id), rolled_back_skill),
                )

        with pytest.raises(psycopg.errors.UniqueViolation):
            await replaying_transaction()
        residue = await manager.execute(
            "SELECT id FROM skill_registry.skills WHERE id = %s",
            (rolled_back_skill,),
        )
        assert await residue.fetchone() is None

        await _expect_database_error(
            runtime,
            psycopg.errors.InsufficientPrivilege,
            "SELECT * FROM skill_registry.skills LIMIT 0",
        )

        async with owner.transaction():
            await owner.execute("SET LOCAL ROLE ai_agent_backup")
            backup_rows = await owner.execute(
                "SELECT id FROM skill_registry.skills WHERE id = %s", (skill_id,)
            )
            assert await backup_rows.fetchone() == (skill_id,)
        backup_writer = await _connect(urls["test"])
        try:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                async with backup_writer.transaction():
                    await backup_writer.execute("SET LOCAL ROLE ai_agent_backup")
                    await backup_writer.execute(
                        """INSERT INTO skill_registry.skills (id, slug, created_by)
                        VALUES (%s, %s, %s)""",
                        (uuid4(), f"backup-{uuid4()}", actor_id),
                    )
        finally:
            await backup_writer.close()
        for role_name in FOREIGN_ROLES:
            role_connection = await _connect(urls["test"])
            try:
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    async with role_connection.transaction():
                        await role_connection.execute(f"SET LOCAL ROLE {role_name}")
                        await role_connection.execute("SELECT * FROM skill_registry.skills LIMIT 0")
            finally:
                await role_connection.close()
    finally:
        await runtime.close()
        await manager.close()
        await owner.close()
