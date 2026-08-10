import asyncio
import os
from pathlib import Path
import re
from types import TracebackType
from typing import Any, cast
from urllib.parse import unquote, urlsplit
from uuid import UUID, uuid4

import psycopg
import pytest

from skill_registry.config import MigrationSettings
from skill_registry.migrate import run_migration
from skill_registry.repository import PostgresSkillRegistryRepository, RepositoryConnection
from skill_registry.schema import PREPARE_SCHEMA_SQL, SCHEMA_VERSION_1_SQL
from skill_registry.types import ArchiveSkill, RegistryError


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


class _ArchiveLockGateCursor:
    def __init__(
        self,
        cursor: Any,
        locked: asyncio.Event,
        release: asyncio.Event,
    ) -> None:
        self._cursor = cursor
        self._locked = locked
        self._release = release

    async def __aenter__(self) -> "_ArchiveLockGateCursor":
        await self._cursor.__aenter__()
        return self

    async def __aexit__(self, *args: object) -> None:
        await self._cursor.__aexit__(*args)

    async def execute(self, query: str, parameters: tuple[object, ...] = ()) -> Any:
        result = await self._cursor.execute(query, parameters)
        if "FOR UPDATE OF skill" in query:
            self._locked.set()
            await self._release.wait()
        return result

    async def fetchone(self) -> tuple[Any, ...] | None:
        return cast(tuple[Any, ...] | None, await self._cursor.fetchone())

    async def fetchall(self) -> list[tuple[Any, ...]]:
        return cast(list[tuple[Any, ...]], await self._cursor.fetchall())


class _ArchiveLockGateConnection:
    def __init__(
        self,
        connection: psycopg.AsyncConnection[tuple[object, ...]],
        locked: asyncio.Event,
        release: asyncio.Event,
    ) -> None:
        self._connection = connection
        self._locked = locked
        self._release = release

    async def __aenter__(self) -> "_ArchiveLockGateConnection":
        await self._connection.__aenter__()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self._connection.__aexit__(exc_type, exc, traceback)

    def transaction(self) -> Any:
        return self._connection.transaction()

    def cursor(self) -> _ArchiveLockGateCursor:
        return _ArchiveLockGateCursor(
            self._connection.cursor(),
            self._locked,
            self._release,
        )


def _archive_repository(
    connection: RepositoryConnection,
) -> PostgresSkillRegistryRepository:
    async def connector() -> RepositoryConnection:
        return connection

    return PostgresSkillRegistryRepository(connector)


def _archive_command(skill_id: UUID, actor_id: UUID) -> ArchiveSkill:
    return ArchiveSkill(
        actor=actor_id,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        skill_id=skill_id,
        expected_artifact_sha256="a" * 64,
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
    state: str = "published",
    historical_v1: bool = False,
) -> None:
    manifest = (
        f'{{"name":"{slug}","description":"Integration test skill.",'
        '"instructions":"","scripts":[],"references":[]}'
    )
    if historical_v1:
        await connection.execute(
            "INSERT INTO skill_registry.skills (id, slug, created_by) VALUES (%s, %s, %s)",
            (skill_id, slug, actor_id),
        )
    else:
        await connection.execute(
            """INSERT INTO skill_registry.skills (
              id, slug, created_by, current_revision_id
            ) VALUES (%s, %s, %s, %s)""",
            (skill_id, slug, actor_id, revision_id),
        )
    await connection.execute(
        """INSERT INTO skill_registry.skill_revisions (
          id, skill_id, revision_no, state, source_type, manifest, findings, created_by
        ) VALUES (%s, %s, 1, %s, 'upload', %s::jsonb, %s::jsonb, %s)""",
        (revision_id, skill_id, state, manifest, findings, actor_id),
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
    historical_v1: bool = False,
) -> UUID:
    event_id = uuid4()
    authorization_column = (
        "independent_reviewer_confirmed" if historical_v1 else "reviewer_authorization_confirmed"
    )
    if event_type == "revision_rejected" and review_reason is None:
        review_reason = "Rejected by the integration test reviewer."
    await connection.execute(
        f"""INSERT INTO skill_registry.skill_control_events (
          id, request_id, assertion_nonce, actor, event_type,
          target_id, result_code, error_code, review_reason,
          content_reviewed, usage_rights_confirmed,
          execution_risk_accepted, {authorization_column}
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


async def _reset_registry_schema(urls: dict[str, str]) -> None:
    owner = await _connect(urls["test"])
    try:
        await owner.execute("DROP SCHEMA IF EXISTS skill_registry CASCADE")
        await owner.execute(
            "CREATE SCHEMA skill_registry AUTHORIZATION ai_agent_skill_registry_migrator"
        )
    finally:
        await owner.close()
    await run_migration(MigrationSettings.model_validate({"database_url": urls["migrator"]}))


async def _create_published_revision(
    manager: psycopg.AsyncConnection[tuple[object, ...]],
    *,
    actor_id: UUID,
) -> tuple[UUID, UUID]:
    skill_id = uuid4()
    revision_id = uuid4()
    async with manager.transaction():
        await _insert_skill_revision(
            manager,
            skill_id=skill_id,
            revision_id=revision_id,
            actor_id=actor_id,
            slug=f"skill-set-{uuid4().hex[:16]}",
            nonce=uuid4(),
        )
    return skill_id, revision_id


async def _seed_candidate_set(
    owner: psycopg.AsyncConnection[tuple[object, ...]],
    *,
    actor_id: UUID,
    revisions: tuple[tuple[UUID, UUID], ...],
) -> UUID:
    set_id = uuid4()
    set_no_cursor = await owner.execute(
        "SELECT COALESCE(MAX(set_no), 0) + 1 FROM skill_registry.agent_skill_sets"
    )
    set_no_row = await set_no_cursor.fetchone()
    assert set_no_row is not None
    await owner.execute(
        """INSERT INTO skill_registry.agent_skill_sets (
          id, agent_id, set_no, state, created_by, request_id, request_fingerprint
        ) VALUES (%s, 'maduoduo', %s, 'candidate', %s, %s, %s)""",
        (set_id, set_no_row[0], actor_id, uuid4(), "c" * 64),
    )
    for ordinal, (skill_id, revision_id) in enumerate(revisions):
        await owner.execute(
            """INSERT INTO skill_registry.agent_skill_set_items (
              set_id, agent_id, ordinal, skill_id, skill_revision_id
            ) VALUES (%s, 'maduoduo', %s, %s, %s)""",
            (set_id, ordinal, skill_id, revision_id),
        )
    return set_id


def _activate_sql() -> str:
    return """SELECT skill_registry.activate_agent_skill_set(
      %s::text, %s::uuid, %s::bigint, %s::uuid, %s::uuid, %s::uuid, %s::char(64)
    )"""


def _fail_sql() -> str:
    return """SELECT skill_registry.mark_agent_skill_set_failed(
      %s::text, %s::uuid, %s::bigint, %s::uuid, %s::uuid, %s::uuid,
      %s::char(64), %s::text
    )"""


def _create_set_sql() -> str:
    return """SELECT * FROM skill_registry.create_agent_skill_set(
      %s::text, %s::uuid[], %s::uuid, %s::uuid, %s::uuid, %s::char(64)
    )"""


def _discard_set_sql() -> str:
    return """SELECT * FROM skill_registry.discard_agent_skill_set(
      %s::text, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::char(64)
    )"""


def _clone_set_sql() -> str:
    return """SELECT * FROM skill_registry.clone_previous_agent_skill_set(
      %s::text, %s::bigint, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::char(64)
    )"""


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
        assert await version_rows.fetchall() == [
            (1,),
            (2,),
            (3,),
            (4,),
            (5,),
            (6,),
            (7,),
            (8,),
            (9,),
        ]

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
                    await _insert_skill_revision(
                        second_manager,
                        skill_id=loser_id,
                        revision_id=uuid4(),
                        actor_id=actor_id,
                        slug=shared_slug,
                        nonce=uuid4(),
                    )

            async with manager.transaction():
                await _insert_skill_revision(
                    manager,
                    skill_id=winner_id,
                    revision_id=uuid4(),
                    actor_id=actor_id,
                    slug=shared_slug,
                    nonce=uuid4(),
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
            await _insert_skill_revision(
                manager,
                skill_id=first_nonce_skill,
                revision_id=uuid4(),
                actor_id=actor_id,
                slug=f"nonce-first-{uuid4()}",
                nonce=uuid4(),
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
                await _insert_skill_revision(
                    manager,
                    skill_id=rolled_back_skill,
                    revision_id=uuid4(),
                    actor_id=actor_id,
                    slug=f"nonce-replay-{uuid4()}",
                    nonce=uuid4(),
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
async def test_activation_function_replays_and_reconcile_function_reports_truth() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    manager = await _connect(urls["manager"])
    runtime = await _connect(urls["runtime"])
    actor_id = uuid4()
    try:
        revision = await _create_published_revision(manager, actor_id=actor_id)
        candidate_id = await _seed_candidate_set(owner, actor_id=actor_id, revisions=(revision,))
        request_id = uuid4()
        nonce = uuid4()
        fingerprint = "1" * 64
        activated = await runtime.execute(
            _activate_sql(),
            ("maduoduo", candidate_id, 0, actor_id, request_id, nonce, fingerprint),
        )
        assert await activated.fetchone() == (1,)
        replay = await runtime.execute(
            _activate_sql(),
            ("maduoduo", candidate_id, 0, actor_id, request_id, nonce, fingerprint),
        )
        assert await replay.fetchone() == (1,)

        reconciled = await runtime.execute(
            """SELECT * FROM skill_registry.reconcile_agent_skill_activation(
              %s::text, %s::uuid
            )""",
            ("maduoduo", candidate_id),
        )
        assert await reconciled.fetchone() == (candidate_id, None, 1, "active")

        with pytest.raises(psycopg.errors.UniqueViolation):
            await runtime.execute(
                _activate_sql(),
                (
                    "maduoduo",
                    candidate_id,
                    0,
                    actor_id,
                    request_id,
                    uuid4(),
                    fingerprint,
                ),
            )
        with pytest.raises(psycopg.errors.UniqueViolation):
            await runtime.execute(
                _fail_sql(),
                (
                    "maduoduo",
                    candidate_id,
                    1,
                    actor_id,
                    uuid4(),
                    nonce,
                    "2" * 64,
                    "agent_build_failed",
                ),
            )
    finally:
        await runtime.close()
        await manager.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_failed_replacement_keeps_authoritative_revision_until_activation_succeeds() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    manager = await _connect(urls["manager"])
    runtime = await _connect(urls["runtime"])
    actor_id = uuid4()
    try:
        skill_id, current_revision_id = await _create_published_revision(manager, actor_id=actor_id)
        initial_set = await _seed_candidate_set(
            owner,
            actor_id=actor_id,
            revisions=((skill_id, current_revision_id),),
        )
        await runtime.execute(
            _activate_sql(),
            (
                "maduoduo",
                initial_set,
                0,
                actor_id,
                uuid4(),
                uuid4(),
                "1" * 64,
            ),
        )

        replacement_revision_id = uuid4()
        async with manager.transaction():
            await manager.execute(
                """INSERT INTO skill_registry.skill_revisions (
                  id, skill_id, revision_no, state, source_type, manifest,
                  findings, created_by
                ) VALUES (
                  %s, %s, 2, 'published', 'upload',
                  (SELECT manifest FROM skill_registry.skill_revisions WHERE id = %s),
                  '[]'::jsonb, %s
                )""",
                (
                    replacement_revision_id,
                    skill_id,
                    current_revision_id,
                    actor_id,
                ),
            )
            await manager.execute(
                """INSERT INTO skill_registry.skill_revision_artifacts (
                  revision_id, skill_id, artifact_sha256, compressed_size,
                  extracted_size, file_count, archive_bytes
                ) VALUES (%s, %s, %s, 1, 1, 1, %s)""",
                (replacement_revision_id, skill_id, "c" * 64, b"x"),
            )

        failed_set = await _seed_candidate_set(
            owner,
            actor_id=actor_id,
            revisions=((skill_id, replacement_revision_id),),
        )
        failed = await runtime.execute(
            _fail_sql(),
            (
                "maduoduo",
                failed_set,
                1,
                actor_id,
                uuid4(),
                uuid4(),
                "2" * 64,
                "agent_build_failed",
            ),
        )
        assert await failed.fetchone() == (True,)

        async def repository_connection() -> RepositoryConnection:
            return cast(RepositoryConnection, await _connect(urls["manager"]))

        repository = PostgresSkillRegistryRepository(repository_connection)
        assert (await repository.list_skills())[0].revision_id == current_revision_id

        replacement_set = await _seed_candidate_set(
            owner,
            actor_id=actor_id,
            revisions=((skill_id, replacement_revision_id),),
        )
        await runtime.execute(
            _activate_sql(),
            (
                "maduoduo",
                replacement_set,
                1,
                actor_id,
                uuid4(),
                uuid4(),
                "3" * 64,
            ),
        )
        assert (await repository.list_skills())[0].revision_id == replacement_revision_id
    finally:
        await runtime.close()
        await manager.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_failure_function_marks_only_unchanged_candidate_and_replays() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    runtime = await _connect(urls["runtime"])
    actor_id = uuid4()
    try:
        candidate_id = await _seed_candidate_set(owner, actor_id=actor_id, revisions=())
        request_id = uuid4()
        nonce = uuid4()
        parameters = (
            "maduoduo",
            candidate_id,
            0,
            actor_id,
            request_id,
            nonce,
            "3" * 64,
            "skill_validation_failed",
        )
        failed = await runtime.execute(_fail_sql(), parameters)
        assert await failed.fetchone() == (True,)
        replay = await runtime.execute(_fail_sql(), parameters)
        assert await replay.fetchone() == (True,)
        state = await owner.execute(
            "SELECT state, failure_code FROM skill_registry.agent_skill_sets WHERE id = %s",
            (candidate_id,),
        )
        assert await state.fetchone() == ("failed", "skill_validation_failed")
    finally:
        await runtime.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_activation_function_serializes_concurrent_cas() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    first_runtime = await _connect(urls["runtime"])
    second_runtime = await _connect(urls["runtime"])
    actor_id = uuid4()
    try:
        first_set = await _seed_candidate_set(owner, actor_id=actor_id, revisions=())
        second_set = await _seed_candidate_set(owner, actor_id=actor_id, revisions=())

        async def activate(
            connection: psycopg.AsyncConnection[tuple[object, ...]], set_id: UUID
        ) -> int:
            row_cursor = await connection.execute(
                _activate_sql(),
                (
                    "maduoduo",
                    set_id,
                    0,
                    actor_id,
                    uuid4(),
                    uuid4(),
                    uuid4().hex * 2,
                ),
            )
            row = await row_cursor.fetchone()
            assert row is not None
            assert isinstance(row[0], int)
            return row[0]

        results = await asyncio.gather(
            activate(first_runtime, first_set),
            activate(second_runtime, second_set),
            return_exceptions=True,
        )
        assert sum(result == 1 for result in results) == 1
        assert (
            sum(isinstance(result, psycopg.errors.SerializationFailure) for result in results) == 1
        )
    finally:
        await second_runtime.close()
        await first_runtime.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_repository_archive_serializes_candidate_creation_and_both_activation_orders() -> (
    None
):
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    manager = await _connect(urls["manager"])
    runtime = await _connect(urls["runtime"])
    actor_id = uuid4()
    try:
        archive_first_skill_id, archive_first_revision_id = await _create_published_revision(
            manager, actor_id=actor_id
        )
        archive_first_candidate_id = await _seed_candidate_set(
            owner,
            actor_id=actor_id,
            revisions=((archive_first_skill_id, archive_first_revision_id),),
        )
        lock_acquired = asyncio.Event()
        release_archive = asyncio.Event()
        archive_connection = await _connect(urls["manager"])
        gated_connection = _ArchiveLockGateConnection(
            archive_connection,
            lock_acquired,
            release_archive,
        )
        archive_task = asyncio.create_task(
            _archive_repository(cast(RepositoryConnection, gated_connection)).archive_skill(
                _archive_command(archive_first_skill_id, actor_id)
            )
        )
        await asyncio.wait_for(lock_acquired.wait(), timeout=1)
        create_task = asyncio.create_task(
            manager.execute(
                _create_set_sql(),
                (
                    "maduoduo",
                    [archive_first_revision_id],
                    actor_id,
                    uuid4(),
                    uuid4(),
                    "a" * 64,
                ),
            )
        )
        activate_task = asyncio.create_task(
            runtime.execute(
                _activate_sql(),
                (
                    "maduoduo",
                    archive_first_candidate_id,
                    0,
                    actor_id,
                    uuid4(),
                    uuid4(),
                    "b" * 64,
                ),
            )
        )
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(asyncio.shield(create_task), timeout=0.1)
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(asyncio.shield(activate_task), timeout=0.1)
        release_archive.set()
        await archive_task
        with pytest.raises(psycopg.errors.CheckViolation):
            await create_task
        with pytest.raises(psycopg.errors.CheckViolation):
            await activate_task

        activation_first_skill_id, activation_first_revision_id = await _create_published_revision(
            manager, actor_id=actor_id
        )
        activation_first_candidate_id = await _seed_candidate_set(
            owner,
            actor_id=actor_id,
            revisions=((activation_first_skill_id, activation_first_revision_id),),
        )
        activation_first_archive = _archive_repository(
            cast(RepositoryConnection, await _connect(urls["manager"]))
        )
        async with runtime.transaction():
            activated = await runtime.execute(
                _activate_sql(),
                (
                    "maduoduo",
                    activation_first_candidate_id,
                    0,
                    actor_id,
                    uuid4(),
                    uuid4(),
                    "c" * 64,
                ),
            )
            assert await activated.fetchone() == (1,)
            activation_first_archive_task = asyncio.create_task(
                activation_first_archive.archive_skill(
                    _archive_command(activation_first_skill_id, actor_id)
                )
            )
            with pytest.raises(TimeoutError):
                await asyncio.wait_for(asyncio.shield(activation_first_archive_task), timeout=0.1)
        with pytest.raises(RegistryError, match="Active Skill cannot be archived") as caught:
            await activation_first_archive_task
        assert caught.value.code == "SKILL_ACTIVE"
        archived = await owner.execute(
            "SELECT archived_at FROM skill_registry.skills WHERE id = %s",
            (activation_first_skill_id,),
        )
        assert await archived.fetchone() == (None,)
    finally:
        await runtime.close()
        await manager.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_set_replay_concurrent_activation_returns_saved_result() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    first_runtime = await _connect(urls["runtime"])
    second_runtime = await _connect(urls["runtime"])
    actor_id = uuid4()
    request_id = uuid4()
    nonce = uuid4()
    try:
        candidate_id = await _seed_candidate_set(owner, actor_id=actor_id, revisions=())

        async def activate(
            connection: psycopg.AsyncConnection[tuple[object, ...]],
        ) -> tuple[object, ...] | None:
            result = await connection.execute(
                _activate_sql(),
                (
                    "maduoduo",
                    candidate_id,
                    0,
                    actor_id,
                    request_id,
                    nonce,
                    "e" * 64,
                ),
            )
            return await result.fetchone()

        assert list(await asyncio.gather(activate(first_runtime), activate(second_runtime))) == [
            (1,),
            (1,),
        ]
    finally:
        await second_runtime.close()
        await first_runtime.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_active_archive_guard_protects_active_and_immediate_previous() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    manager = await _connect(urls["manager"])
    runtime = await _connect(urls["runtime"])
    actor_id = uuid4()
    try:
        first_revision = await _create_published_revision(manager, actor_id=actor_id)
        second_revision = await _create_published_revision(manager, actor_id=actor_id)
        first_set = await _seed_candidate_set(owner, actor_id=actor_id, revisions=(first_revision,))
        second_set = await _seed_candidate_set(
            owner, actor_id=actor_id, revisions=(second_revision,)
        )
        for expected_version, candidate_id in ((0, first_set), (1, second_set)):
            await runtime.execute(
                _activate_sql(),
                (
                    "maduoduo",
                    candidate_id,
                    expected_version,
                    actor_id,
                    uuid4(),
                    uuid4(),
                    uuid4().hex * 2,
                ),
            )
        for _, revision_id in (first_revision, second_revision):
            with pytest.raises(psycopg.errors.CheckViolation):
                await manager.execute(
                    "UPDATE skill_registry.skill_revisions SET state = 'archived' WHERE id = %s",
                    (revision_id,),
                )
    finally:
        await runtime.close()
        await manager.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_active_archive_waits_for_activation_revision_lock_and_then_fails() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    manager = await _connect(urls["manager"])
    runtime = await _connect(urls["runtime"])
    actor_id = uuid4()
    archive_task: asyncio.Task[object] | None = None
    try:
        revision = await _create_published_revision(manager, actor_id=actor_id)
        candidate_id = await _seed_candidate_set(owner, actor_id=actor_id, revisions=(revision,))
        async with runtime.transaction():
            await runtime.execute(
                _activate_sql(),
                (
                    "maduoduo",
                    candidate_id,
                    0,
                    actor_id,
                    uuid4(),
                    uuid4(),
                    "2" * 64,
                ),
            )
            archive_task = asyncio.create_task(
                manager.execute(
                    "UPDATE skill_registry.skill_revisions SET state = 'archived' WHERE id = %s",
                    (revision[1],),
                )
            )
            await asyncio.sleep(0.05)
            assert not archive_task.done()
        assert archive_task is not None
        with pytest.raises(psycopg.errors.CheckViolation):
            await archive_task
    finally:
        if archive_task is not None and not archive_task.done():
            archive_task.cancel()
        await runtime.close()
        await manager.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_set_replay_events_and_runtime_functions_are_not_forgeable() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    manager = await _connect(urls["manager"])
    runtime = await _connect(urls["runtime"])
    try:
        for connection in (manager, runtime):
            await _expect_database_error(
                connection,
                psycopg.errors.InsufficientPrivilege,
                """INSERT INTO skill_registry.skill_set_control_events (
                  id, actor, action, event_type, target, request_id, assertion_nonce,
                  request_fingerprint, result_set_id, result_set_state
                ) VALUES (
                  %s, %s, 'skill_set_create', 'skill_set_created', 'maduoduo',
                  %s, %s, %s, %s, 'candidate'
                )""",
                (uuid4(), uuid4(), uuid4(), uuid4(), "4" * 64, uuid4()),
            )
        function_privilege = await owner.execute(
            """SELECT
              EXISTS (
                SELECT 1
                FROM pg_proc AS function
                JOIN pg_namespace AS function_schema
                  ON function_schema.oid = function.pronamespace
                CROSS JOIN LATERAL aclexplode(COALESCE(
                  function.proacl, acldefault('f', function.proowner)
                )) AS acl
                WHERE function_schema.nspname = 'skill_registry'
                  AND function.proname = 'activate_agent_skill_set'
                  AND acl.grantee = 0
                  AND acl.privilege_type = 'EXECUTE'
              ),
              has_function_privilege('ai_agent_skill_registry_manager',
                'skill_registry.activate_agent_skill_set(text,uuid,bigint,uuid,uuid,uuid,character)',
                'EXECUTE')"""
        )
        assert await function_privilege.fetchone() == (False, False)
    finally:
        await runtime.close()
        await manager.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_manager_create_preserves_order_replays_and_enforces_candidate_quota() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    manager = await _connect(urls["manager"])
    actor_id = uuid4()
    try:
        first = await _create_published_revision(manager, actor_id=actor_id)
        second = await _create_published_revision(manager, actor_id=actor_id)
        request_id = uuid4()
        nonce = uuid4()
        parameters = (
            "maduoduo",
            [second[1], first[1]],
            actor_id,
            request_id,
            nonce,
            "5" * 64,
        )
        created_cursor = await manager.execute(_create_set_sql(), parameters)
        created = await created_cursor.fetchone()
        assert created is not None
        assert created[1:] == (False, 2, 2)
        set_id = created[0]
        replay_cursor = await manager.execute(_create_set_sql(), parameters)
        assert await replay_cursor.fetchone() == (set_id, True, 2, 2)
        ordered_items = await manager.execute(
            """SELECT revision_id
            FROM skill_registry.manager_skill_set_items
            WHERE set_id = %s ORDER BY ordinal""",
            (set_id,),
        )
        assert await ordered_items.fetchall() == [(second[1],), (first[1],)]

        with pytest.raises(psycopg.errors.UniqueViolation):
            await manager.execute(
                _create_set_sql(),
                (
                    "maduoduo",
                    [second[1], first[1]],
                    actor_id,
                    request_id,
                    uuid4(),
                    "5" * 64,
                ),
            )
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            await manager.execute(
                _create_set_sql(),
                ("maduoduo", [first[1], first[1]], actor_id, uuid4(), uuid4(), "6" * 64),
            )

        for _ in range(19):
            await manager.execute(
                _create_set_sql(),
                ("maduoduo", [], actor_id, uuid4(), uuid4(), uuid4().hex * 2),
            )
        with pytest.raises(psycopg.errors.ProgramLimitExceeded):
            await manager.execute(
                _create_set_sql(),
                ("maduoduo", [], actor_id, uuid4(), uuid4(), "7" * 64),
            )
    finally:
        await manager.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_manager_create_concurrent_replay_returns_one_candidate() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    first_manager = await _connect(urls["manager"])
    second_manager = await _connect(urls["manager"])
    actor_id = uuid4()
    parameters: tuple[object, ...] = (
        "maduoduo",
        [],
        actor_id,
        uuid4(),
        uuid4(),
        "f" * 64,
    )
    try:

        async def create(
            connection: psycopg.AsyncConnection[tuple[object, ...]],
        ) -> tuple[object, ...] | None:
            result = await connection.execute(_create_set_sql(), parameters)
            return await result.fetchone()

        results = await asyncio.gather(create(first_manager), create(second_manager))
        assert results[0] is not None
        assert results[1] is not None
        assert results[0][0] == results[1][0]
        assert {results[0][1], results[1][1]} == {False, True}
    finally:
        await second_manager.close()
        await first_manager.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_manager_discard_is_audited_and_replayed_without_deleting_items() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    manager = await _connect(urls["manager"])
    actor_id = uuid4()
    try:
        revision = await _create_published_revision(manager, actor_id=actor_id)
        created_cursor = await manager.execute(
            _create_set_sql(),
            ("maduoduo", [revision[1]], actor_id, uuid4(), uuid4(), "8" * 64),
        )
        created = await created_cursor.fetchone()
        assert created is not None
        set_id = created[0]
        request_id = uuid4()
        nonce = uuid4()
        parameters = ("maduoduo", set_id, actor_id, request_id, nonce, "9" * 64)
        discarded_cursor = await manager.execute(_discard_set_sql(), parameters)
        assert await discarded_cursor.fetchone() == (set_id, "discarded", False)
        replay_cursor = await manager.execute(_discard_set_sql(), parameters)
        assert await replay_cursor.fetchone() == (set_id, "discarded", True)
        items = await manager.execute(
            "SELECT count(*) FROM skill_registry.manager_skill_set_items WHERE set_id = %s",
            (set_id,),
        )
        assert await items.fetchone() == (1,)
    finally:
        await manager.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_manager_clone_locks_expected_previous_and_preserves_item_order() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    manager = await _connect(urls["manager"])
    runtime = await _connect(urls["runtime"])
    actor_id = uuid4()
    try:
        first = await _create_published_revision(manager, actor_id=actor_id)
        second = await _create_published_revision(manager, actor_id=actor_id)
        previous_set = await _seed_candidate_set(
            owner, actor_id=actor_id, revisions=(second, first)
        )
        active_set = await _seed_candidate_set(owner, actor_id=actor_id, revisions=())
        for expected_version, set_id in ((0, previous_set), (1, active_set)):
            await runtime.execute(
                _activate_sql(),
                (
                    "maduoduo",
                    set_id,
                    expected_version,
                    actor_id,
                    uuid4(),
                    uuid4(),
                    uuid4().hex * 2,
                ),
            )

        parameters = (
            "maduoduo",
            2,
            previous_set,
            actor_id,
            uuid4(),
            uuid4(),
            "a" * 64,
        )
        cloned_cursor = await manager.execute(_clone_set_sql(), parameters)
        cloned = await cloned_cursor.fetchone()
        assert cloned is not None
        assert cloned[1:] == (False, 2, 2)
        cloned_items = await manager.execute(
            """SELECT revision_id FROM skill_registry.manager_skill_set_items
            WHERE set_id = %s ORDER BY ordinal""",
            (cloned[0],),
        )
        assert await cloned_items.fetchall() == [(second[1],), (first[1],)]
        replay_cursor = await manager.execute(_clone_set_sql(), parameters)
        assert await replay_cursor.fetchone() == (cloned[0], True, 2, 2)

        with pytest.raises(psycopg.errors.SerializationFailure):
            await manager.execute(
                _clone_set_sql(),
                (
                    "maduoduo",
                    1,
                    previous_set,
                    actor_id,
                    uuid4(),
                    uuid4(),
                    "b" * 64,
                ),
            )
    finally:
        await runtime.close()
        await manager.close()
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_backup_skill_set_access_is_read_only_and_cannot_execute_functions() -> None:
    urls = _validated_urls()
    await _reset_registry_schema(urls)
    owner = await _connect(urls["test"])
    actor_id = uuid4()
    try:
        candidate_id = await _seed_candidate_set(owner, actor_id=actor_id, revisions=())
        async with owner.transaction():
            await owner.execute("SET LOCAL ROLE ai_agent_backup")
            selected = await owner.execute(
                "SELECT id FROM skill_registry.agent_skill_sets WHERE id = %s",
                (candidate_id,),
            )
            assert await selected.fetchone() == (candidate_id,)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            async with owner.transaction():
                await owner.execute("SET LOCAL ROLE ai_agent_backup")
                await owner.execute(
                    "UPDATE skill_registry.agent_skill_sets SET state = 'discarded' WHERE id = %s",
                    (candidate_id,),
                )
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            async with owner.transaction():
                await owner.execute("SET LOCAL ROLE ai_agent_backup")
                await owner.execute(
                    _create_set_sql(),
                    ("maduoduo", [], actor_id, uuid4(), uuid4(), "d" * 64),
                )
    finally:
        await owner.close()


@pytest.mark.asyncio
@pytest.mark.skipif(
    bool(MISSING_ENVIRONMENT),
    reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING_ENVIRONMENT)}",
)
async def test_real_registry_migrates_v1_history_to_v9_without_review_storage() -> None:
    urls = _validated_urls()
    owner = await _connect(urls["test"])
    migrator = await _connect(urls["migrator"])
    manager = await _connect(urls["manager"])
    try:
        await owner.execute("DROP SCHEMA IF EXISTS skill_registry CASCADE")
        await owner.execute(
            "CREATE SCHEMA skill_registry AUTHORIZATION ai_agent_skill_registry_migrator"
        )
        await migrator.execute(PREPARE_SCHEMA_SQL)
        await migrator.execute(SCHEMA_VERSION_1_SQL)

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
                slug=f"v1-history-{uuid4().hex[:12]}",
                nonce=uuid4(),
                state="pending_review",
                historical_v1=True,
            )
        async with manager.transaction():
            historical_event_id = await _insert_review_event(
                manager,
                revision_id=revision_id,
                reviewer_id=reviewer_id,
                event_type="revision_published",
                historical_v1=True,
            )
            await manager.execute(
                """UPDATE skill_registry.skill_revisions
                SET state = 'published', reviewed_by = %s, reviewed_at = now()
                WHERE id = %s""",
                (reviewer_id, revision_id),
            )

        settings = MigrationSettings.model_validate({"database_url": urls["migrator"]})
        await run_migration(settings)

        versions = await owner.execute(
            "SELECT version FROM skill_registry.schema_versions ORDER BY version"
        )
        assert await versions.fetchall() == [
            (1,),
            (2,),
            (3,),
            (4,),
            (5,),
            (6,),
            (7,),
            (8,),
            (9,),
        ]
        columns = await owner.execute(
            """SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'skill_registry'
              AND table_name = 'skill_control_events'
              AND column_name IN (
                'independent_reviewer_confirmed',
                'reviewer_authorization_confirmed'
              )
            ORDER BY column_name"""
        )
        assert await columns.fetchall() == []
        evidence = await owner.execute(
            "SELECT id FROM skill_registry.skill_control_events WHERE id = %s",
            (historical_event_id,),
        )
        assert await evidence.fetchone() is None
    finally:
        await manager.close()
        await migrator.close()
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
        valid_state = await manager.execute(
            "SELECT state FROM skill_registry.skill_revisions WHERE id = %s",
            (valid_revision_id,),
        )
        assert await valid_state.fetchone() == ("published",)
    finally:
        await manager.close()
