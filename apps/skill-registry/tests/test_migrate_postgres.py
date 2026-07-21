import asyncio
import os
from pathlib import Path
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
REPO_ROOT = Path(__file__).resolve().parents[3]


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
    findings: str = "[]",
) -> None:
    await connection.execute(
        "INSERT INTO skill_registry.skills (id, slug, created_by) VALUES (%s, %s, %s)",
        (skill_id, slug, actor_id),
    )
    await connection.execute(
        """INSERT INTO skill_registry.skill_revisions (
          id, skill_id, revision_no, state, source_type, manifest, findings, created_by
        ) VALUES (%s, %s, 1, 'pending_review', 'upload', '{}'::jsonb, %s::jsonb, %s)""",
        (revision_id, skill_id, findings, actor_id),
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


async def _insert_review_event(
    connection: psycopg.AsyncConnection[tuple[object, ...]],
    *,
    revision_id: UUID,
    reviewer_id: UUID,
    event_type: str,
    result_code: str = "ok",
    error_code: str | None = None,
    review_reason: str | None = None,
    attestations: tuple[bool | None, bool | None, bool | None, bool | None] = (
        True,
        True,
        True,
        True,
    ),
) -> UUID:
    event_id = uuid4()
    if event_type == "revision_rejected" and review_reason is None:
        review_reason = "Rejected by the integration test reviewer."
    await connection.execute(
        """INSERT INTO skill_registry.skill_control_events (
          id, request_id, assertion_nonce, actor, event_type,
          target_id, result_code, error_code, review_reason,
          content_reviewed, usage_rights_confirmed,
          execution_risk_accepted, independent_reviewer_confirmed
        ) VALUES (
          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )""",
        (
            event_id,
            uuid4(),
            uuid4(),
            str(reviewer_id),
            event_type,
            revision_id,
            result_code,
            error_code,
            review_reason,
            *attestations,
        ),
    )
    return event_id


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

        role_sql = (REPO_ROOT / "infra/postgres/05-skill-registry-roles.sql").read_text()
        membership_blocks = re.findall(r"DO \$\$.*?\$\$;", role_sql, flags=re.DOTALL)
        assert len(membership_blocks) >= 2
        await owner.execute(
            "GRANT ai_agent_skill_registry_manager TO ai_agent_skill_registry_runtime"
        )
        try:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                await owner.execute(membership_blocks[1])
        finally:
            await owner.execute(
                "REVOKE ai_agent_skill_registry_manager FROM ai_agent_skill_registry_runtime"
            )

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

        await owner.execute(
            "GRANT ai_agent_skill_registry_manager TO ai_agent_skill_registry_migrator"
        )
        try:
            with pytest.raises(RuntimeError, match="verification failed"):
                await run_migration(settings)
        finally:
            await owner.execute(
                "REVOKE ai_agent_skill_registry_manager FROM ai_agent_skill_registry_migrator"
            )

        await owner.execute("ALTER ROLE ai_agent_skill_registry_manager SET search_path = evil")
        try:
            with pytest.raises(RuntimeError, match="verification failed"):
                await run_migration(settings)
        finally:
            await owner.execute("ALTER ROLE ai_agent_skill_registry_manager RESET ALL")

        await owner.execute(
            "GRANT SET ON PARAMETER session_replication_role TO ai_agent_skill_registry_manager"
        )
        try:
            with pytest.raises(RuntimeError, match="verification failed"):
                await run_migration(settings)
        finally:
            await owner.execute(
                "REVOKE SET ON PARAMETER session_replication_role "
                "FROM ai_agent_skill_registry_manager"
            )
        await run_migration(settings)

        actor_id = uuid4()
        reviewer_id = uuid4()
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

        await _expect_database_error(
            manager,
            psycopg.errors.CheckViolation,
            """INSERT INTO skill_registry.skill_control_events (
              id, request_id, assertion_nonce, actor, event_type,
              target_id, result_code
            ) VALUES (%s, %s, %s, %s, 'revision_published', %s, 'ok')""",
            (uuid4(), uuid4(), uuid4(), str(reviewer_id), revision_id),
        )
        for false_index in range(4):
            evidence = [True, True, True, True]
            evidence[false_index] = False
            with pytest.raises(psycopg.errors.CheckViolation):
                async with manager.transaction():
                    await _insert_review_event(
                        manager,
                        revision_id=revision_id,
                        reviewer_id=reviewer_id,
                        event_type="revision_published",
                        attestations=(
                            evidence[0],
                            evidence[1],
                            evidence[2],
                            evidence[3],
                        ),
                    )

        for invalid_reason in (None, "", "   "):
            await _expect_database_error(
                manager,
                psycopg.errors.CheckViolation,
                """INSERT INTO skill_registry.skill_control_events (
                  id, request_id, assertion_nonce, actor, event_type,
                  target_id, result_code, review_reason,
                  content_reviewed, usage_rights_confirmed,
                  execution_risk_accepted, independent_reviewer_confirmed
                ) VALUES (
                  %s, %s, %s, %s, 'revision_rejected', %s, 'ok', %s,
                  true, true, true, true
                )""",
                (
                    uuid4(),
                    uuid4(),
                    uuid4(),
                    str(reviewer_id),
                    revision_id,
                    invalid_reason,
                ),
            )

        await _expect_database_error(
            manager,
            psycopg.errors.CheckViolation,
            """INSERT INTO skill_registry.skill_control_events (
              id, request_id, assertion_nonce, actor, event_type,
              target_id, result_code, review_reason
            ) VALUES (%s, %s, %s, %s, 'revision_created', %s, 'ok', %s)""",
            (
                uuid4(),
                uuid4(),
                uuid4(),
                str(actor_id),
                revision_id,
                "Review-only reason",
            ),
        )
        await _expect_database_error(
            manager,
            psycopg.errors.CheckViolation,
            """INSERT INTO skill_registry.skill_control_events (
              id, request_id, assertion_nonce, actor, event_type,
              target_id, result_code, content_reviewed
            ) VALUES (%s, %s, %s, %s, 'revision_created', %s, 'ok', true)""",
            (uuid4(), uuid4(), uuid4(), str(actor_id), revision_id),
        )

        for blocking_code in ("unsupported_import", "private_key"):
            blocked_skill_id = uuid4()
            blocked_revision_id = uuid4()
            async with manager.transaction():
                await _insert_skill_revision(
                    manager,
                    skill_id=blocked_skill_id,
                    revision_id=blocked_revision_id,
                    actor_id=actor_id,
                    slug=f"blocked-{blocking_code.replace('_', '-')}-{uuid4().hex[:12]}",
                    nonce=uuid4(),
                    findings=(
                        '[{"path":"SKILL.md","line":1,"code":"'
                        + blocking_code
                        + '","message":"blocked","blocking":true}]'
                    ),
                )
            with pytest.raises(psycopg.errors.CheckViolation):
                async with manager.transaction():
                    await _insert_review_event(
                        manager,
                        revision_id=blocked_revision_id,
                        reviewer_id=reviewer_id,
                        event_type="revision_published",
                    )
                    await manager.execute(
                        """UPDATE skill_registry.skill_revisions
                        SET state = 'published', reviewed_by = %s, reviewed_at = now()
                        WHERE id = %s""",
                        (reviewer_id, blocked_revision_id),
                    )
            blocked_state = await manager.execute(
                "SELECT state FROM skill_registry.skill_revisions WHERE id = %s",
                (blocked_revision_id,),
            )
            assert await blocked_state.fetchone() == ("pending_review",)

        for forbidden_initial_state in ("published", "rejected", "archived"):
            await _expect_database_error(
                manager,
                psycopg.errors.CheckViolation,
                """INSERT INTO skill_registry.skill_revisions (
                  id, skill_id, revision_no, state, source_type, manifest,
                  created_by, reviewed_by, reviewed_at
                ) VALUES (%s, %s, 2, %s, 'upload', '{}'::jsonb, %s, %s, now())""",
                (
                    uuid4(),
                    skill_id,
                    forbidden_initial_state,
                    actor_id,
                    actor_id,
                ),
            )
        await _expect_database_error(
            manager,
            psycopg.errors.CheckViolation,
            """INSERT INTO skill_registry.skill_revisions (
              id, skill_id, revision_no, state, source_type, manifest,
              created_by, reviewed_by, reviewed_at
            ) VALUES (%s, %s, 2, 'pending_review', 'upload', '{}'::jsonb, %s, %s, now())""",
            (uuid4(), skill_id, actor_id, actor_id),
        )

        for self_review_state, self_review_event in (
            ("published", "revision_published"),
            ("rejected", "revision_rejected"),
        ):
            with pytest.raises(psycopg.errors.CheckViolation):
                async with manager.transaction():
                    await _insert_review_event(
                        manager,
                        revision_id=revision_id,
                        reviewer_id=actor_id,
                        event_type=self_review_event,
                    )
                    await manager.execute(
                        """UPDATE skill_registry.skill_revisions
                        SET state = %s, reviewed_by = %s, reviewed_at = now()
                        WHERE id = %s""",
                        (self_review_state, actor_id, revision_id),
                    )

        with pytest.raises(psycopg.errors.CheckViolation):
            async with manager.transaction():
                await manager.execute(
                    """UPDATE skill_registry.skill_revisions
                    SET state = 'published', reviewed_by = %s, reviewed_at = now()
                    WHERE id = %s""",
                    (reviewer_id, revision_id),
                )

        async with manager.transaction():
            historical_event_id = await _insert_review_event(
                manager,
                revision_id=revision_id,
                reviewer_id=reviewer_id,
                event_type="revision_published",
            )
        historical_transaction = await manager.execute(
            """SELECT transaction_id
            FROM skill_registry.skill_control_events
            WHERE id = %s""",
            (historical_event_id,),
        )
        historical_transaction_row = await historical_transaction.fetchone()
        assert historical_transaction_row is not None
        historical_transaction_id = historical_transaction_row[0]
        assert isinstance(historical_transaction_id, int)
        await owner.execute("DROP SCHEMA IF EXISTS evil CASCADE")
        await owner.execute("CREATE SCHEMA evil")
        await owner.execute("GRANT USAGE ON SCHEMA evil TO ai_agent_skill_registry_manager")
        await owner.execute(
            """CREATE FUNCTION evil.txid_current()
            RETURNS bigint
            LANGUAGE sql
            IMMUTABLE
            AS $$ SELECT %s::bigint $$"""
            % historical_transaction_id
        )
        await manager.execute("SET search_path = evil, pg_catalog")
        with pytest.raises(psycopg.errors.CheckViolation):
            async with manager.transaction():
                await manager.execute(
                    """UPDATE skill_registry.skill_revisions
                    SET state = 'published', reviewed_by = %s, reviewed_at = now()
                    WHERE id = %s""",
                    (reviewer_id, revision_id),
                )

        for wrong_target, wrong_type, wrong_actor, wrong_result, error_code in (
            (uuid4(), "revision_published", reviewer_id, "ok", None),
            (revision_id, "revision_rejected", reviewer_id, "ok", None),
            (revision_id, "revision_published", actor_id, "ok", None),
            (revision_id, "revision_published", reviewer_id, "error", "review_failed"),
        ):
            with pytest.raises(psycopg.errors.CheckViolation):
                async with manager.transaction():
                    await _insert_review_event(
                        manager,
                        revision_id=wrong_target,
                        reviewer_id=wrong_actor,
                        event_type=wrong_type,
                        result_code=wrong_result,
                        error_code=error_code,
                    )
                    await manager.execute(
                        """UPDATE skill_registry.skill_revisions
                        SET state = 'published', reviewed_by = %s, reviewed_at = now()
                        WHERE id = %s""",
                        (reviewer_id, revision_id),
                    )

        async with manager.transaction():
            await manager.execute(
                """UPDATE skill_registry.skill_revisions
                SET state = 'published', reviewed_by = %s, reviewed_at = now()
                WHERE id = %s""",
                (reviewer_id, revision_id),
            )
            await _insert_review_event(
                manager,
                revision_id=revision_id,
                reviewer_id=reviewer_id,
                event_type="revision_published",
            )

        before_event_revision_id = uuid4()
        async with manager.transaction():
            await manager.execute(
                """INSERT INTO skill_registry.skill_revisions (
                  id, skill_id, revision_no, state, source_type, manifest, created_by
                ) VALUES (%s, %s, 2, 'pending_review', 'upload', '{}'::jsonb, %s)""",
                (before_event_revision_id, skill_id, actor_id),
            )
        async with manager.transaction():
            await _insert_review_event(
                manager,
                revision_id=before_event_revision_id,
                reviewer_id=reviewer_id,
                event_type="revision_rejected",
            )
            await manager.execute(
                """UPDATE skill_registry.skill_revisions
                SET state = 'rejected', reviewed_by = %s, reviewed_at = now()
                WHERE id = %s""",
                (reviewer_id, before_event_revision_id),
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
        await _expect_database_error(
            manager,
            psycopg.errors.InsufficientPrivilege,
            "SET session_replication_role = replica",
        )
        await manager.execute("RESET search_path")
        await owner.execute("DROP SCHEMA evil CASCADE")

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


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_real_registry_rejects_noncanonical_findings_from_manager_sql() -> None:
    urls = _validated_urls()
    manager = await _connect(urls["manager"])
    actor_id = uuid4()
    try:
        invalid_findings = (
            '["unsupported_import"]',
            '[{"path":"SKILL.md","line":1,"code":["unsupported_import"],'
            '"message":"bad","blocking":true}]',
            '[{"path":"SKILL.md","line":1,"message":"missing code","blocking":true}]',
            '[{"path":"SKILL.md","line":1,"code":"unknown_code","message":"bad","blocking":true}]',
            "[null]",
            '[{"path":"SKILL.md","line":1,"code":"possible_secret",'
            '"message":"bad","blocking":false,"extra":true}]',
            '[{"path":"SKILL.md","line":0,"code":"possible_secret",'
            '"message":"bad","blocking":false}]',
            '[{"path":null,"line":1,"code":"possible_secret","message":"bad","blocking":false}]',
            '[{"path":"SKILL.md","line":1,"code":"possible_secret",'
            '"message":"bad","blocking":"false"}]',
        )
        for index, findings in enumerate(invalid_findings):
            with pytest.raises(psycopg.errors.CheckViolation):
                async with manager.transaction():
                    await _insert_skill_revision(
                        manager,
                        skill_id=uuid4(),
                        revision_id=uuid4(),
                        actor_id=actor_id,
                        slug=f"invalid-findings-{index}-{uuid4().hex[:8]}",
                        nonce=uuid4(),
                        findings=findings,
                    )

        valid_skill_id = uuid4()
        valid_revision_id = uuid4()
        reviewer_id = uuid4()
        async with manager.transaction():
            await _insert_skill_revision(
                manager,
                skill_id=valid_skill_id,
                revision_id=valid_revision_id,
                actor_id=actor_id,
                slug=f"valid-findings-{uuid4().hex[:12]}",
                nonce=uuid4(),
                findings=(
                    '[{"path":"SKILL.md","line":1,"code":"possible_secret",'
                    '"message":"reviewed","blocking":false}]'
                ),
            )
        async with manager.transaction():
            await _insert_review_event(
                manager,
                revision_id=valid_revision_id,
                reviewer_id=reviewer_id,
                event_type="revision_published",
            )
            await manager.execute(
                """UPDATE skill_registry.skill_revisions
                SET state = 'published', reviewed_by = %s, reviewed_at = now()
                WHERE id = %s""",
                (reviewer_id, valid_revision_id),
            )
        valid_state = await manager.execute(
            "SELECT state FROM skill_registry.skill_revisions WHERE id = %s",
            (valid_revision_id,),
        )
        assert await valid_state.fetchone() == ("published",)
    finally:
        await manager.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_real_registry_publish_trigger_fails_closed_for_seeded_invalid_findings() -> None:
    urls = _validated_urls()
    owner = await _connect(urls["test"])
    manager = await _connect(urls["manager"])
    settings = MigrationSettings.model_validate({"database_url": urls["migrator"]})
    revision_id = uuid4()
    reviewer_id = uuid4()
    try:
        await owner.execute(
            """ALTER TABLE skill_registry.skill_revisions
            DROP CONSTRAINT skill_revisions_findings_array"""
        )
        async with manager.transaction():
            await _insert_skill_revision(
                manager,
                skill_id=uuid4(),
                revision_id=revision_id,
                actor_id=uuid4(),
                slug=f"seeded-invalid-{uuid4().hex[:12]}",
                nonce=uuid4(),
                findings='["unsupported_import"]',
            )
        with pytest.raises(psycopg.errors.CheckViolation) as caught:
            async with manager.transaction():
                await _insert_review_event(
                    manager,
                    revision_id=revision_id,
                    reviewer_id=reviewer_id,
                    event_type="revision_published",
                )
                await manager.execute(
                    """UPDATE skill_registry.skill_revisions
                    SET state = 'published', reviewed_by = %s, reviewed_at = now()
                    WHERE id = %s""",
                    (reviewer_id, revision_id),
                )
        assert caught.value.diag.message_primary == "skill findings schema is invalid"
    finally:
        await owner.execute(
            """TRUNCATE TABLE
              skill_registry.skill_control_events,
              skill_registry.skill_revision_files,
              skill_registry.skill_revision_artifacts,
              skill_registry.skill_revisions,
              skill_registry.skills"""
        )
        await owner.execute(
            """ALTER TABLE skill_registry.skill_revisions
            DROP CONSTRAINT IF EXISTS skill_revisions_findings_array"""
        )
        await owner.execute(
            """ALTER TABLE skill_registry.skill_revisions
            ADD CONSTRAINT skill_revisions_findings_array
            CHECK (skill_registry.validate_skill_findings(findings))"""
        )
        await manager.close()
        await owner.close()
    await run_migration(settings)


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_real_registry_migration_rejects_same_name_true_constraint_drift() -> None:
    urls = _validated_urls()
    owner = await _connect(urls["test"])
    settings = MigrationSettings.model_validate({"database_url": urls["migrator"]})
    try:
        await run_migration(settings)
        await owner.execute(
            """ALTER TABLE skill_registry.skill_control_events
            DROP CONSTRAINT skill_control_events_review_evidence"""
        )
        await owner.execute(
            """ALTER TABLE skill_registry.skill_control_events
            ADD CONSTRAINT skill_control_events_review_evidence CHECK (true)"""
        )
        with pytest.raises(RuntimeError, match="verification failed"):
            await run_migration(settings)
    finally:
        await owner.execute(
            """ALTER TABLE skill_registry.skill_control_events
            DROP CONSTRAINT IF EXISTS skill_control_events_review_evidence"""
        )
        await owner.execute(
            """ALTER TABLE skill_registry.skill_control_events
            ADD CONSTRAINT skill_control_events_review_evidence CHECK (
              (
                event_type IN ('revision_published', 'revision_rejected')
                AND content_reviewed IS TRUE
                AND usage_rights_confirmed IS TRUE
                AND execution_risk_accepted IS TRUE
                AND independent_reviewer_confirmed IS TRUE
              )
              OR (
                event_type NOT IN ('revision_published', 'revision_rejected')
                AND content_reviewed IS NULL
                AND usage_rights_confirmed IS NULL
                AND execution_risk_accepted IS NULL
                AND independent_reviewer_confirmed IS NULL
              )
            )"""
        )
        await owner.close()
    await run_migration(settings)


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_real_registry_migration_rejects_keyword_only_review_function_drift() -> None:
    urls = _validated_urls()
    owner = await _connect(urls["test"])
    settings = MigrationSettings.model_validate({"database_url": urls["migrator"]})
    definition_cursor = await owner.execute(
        """SELECT pg_get_functiondef(function.oid)
        FROM pg_proc AS function
        JOIN pg_namespace AS function_schema ON function_schema.oid = function.pronamespace
        WHERE function_schema.nspname = 'skill_registry'
          AND function.proname = 'require_revision_review_event'"""
    )
    definition_row = await definition_cursor.fetchone()
    assert definition_row is not None
    correct_definition = str(definition_row[0])
    try:
        await run_migration(settings)
        await owner.execute(
            """CREATE OR REPLACE FUNCTION skill_registry.require_revision_review_event()
            RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = pg_catalog, skill_registry
            AS $function$
            BEGIN
              /* jsonb_array_elements(OLD.findings) unsupported_import private_key */
              RETURN NEW;
            END;
            $function$"""
        )
        with pytest.raises(RuntimeError, match="verification failed"):
            await run_migration(settings)
    finally:
        await owner.execute(correct_definition)
        await owner.close()
    await run_migration(settings)
