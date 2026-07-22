"""PostgreSQL repository for immutable Agent Skill sets."""

from __future__ import annotations

import inspect
from typing import Any, NoReturn, cast
from uuid import UUID

from skill_registry.repository import (
    RepositoryConnection,
    RepositoryConnectionFactory,
    RepositoryCursor,
)
from skill_registry.types import (
    AgentId,
    ClonePreviousSkillSet,
    CreateSkillSet,
    CreateSkillSetResult,
    DiscardSkillSet,
    PublishedRevisionOption,
    RegistryError,
    SkillRuntimeStatus,
    SkillSetState,
    StoredSkillSet,
)


_SET_COLUMNS = """skill_set.set_id, skill_set.agent_id, skill_set.state,
  skill_set.item_count, skill_set.total_extracted_size, skill_set.failure_code,
  CASE
    WHEN pointer.active_set_id = skill_set.set_id
      OR pointer.previous_set_id = skill_set.set_id
    THEN pointer.activation_version
    ELSE NULL
  END AS activation_version"""


class PostgresSkillSetRepository:
    """Call only reviewed manager functions and read only manager views."""

    def __init__(self, connection_factory: RepositoryConnectionFactory) -> None:
        self._connection_factory = connection_factory

    async def _connect(self) -> RepositoryConnection:
        connection = self._connection_factory()
        if inspect.isawaitable(connection):
            return await connection
        return connection

    async def resolve_published_revisions(
        self, revision_ids: tuple[UUID, ...]
    ) -> tuple[PublishedRevisionOption, ...]:
        if not revision_ids:
            return ()
        try:
            connection = await self._connect()
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """SELECT
                          revision.skill_id, revision.id, skill.slug,
                          revision.revision_no, artifact.artifact_sha256,
                          artifact.extracted_size
                        FROM skill_registry.skill_revisions AS revision
                        JOIN skill_registry.skills AS skill ON skill.id = revision.skill_id
                        JOIN skill_registry.skill_revision_artifacts AS artifact
                          ON artifact.revision_id = revision.id
                          AND artifact.skill_id = revision.skill_id
                        WHERE revision.id = ANY(%s)
                          AND revision.state = 'published'
                        ORDER BY revision.id""",
                        (list(revision_ids),),
                    )
                    rows = await cursor.fetchall()
            return tuple(_published_revision(row) for row in rows)
        except RegistryError:
            raise
        except Exception:
            raise RegistryError(
                "REGISTRY_STORAGE_ERROR", "Skill registry operation failed"
            ) from None

    async def create_skill_set(
        self, command: CreateSkillSet, request_fingerprint: str
    ) -> CreateSkillSetResult:
        return await self._mutate_and_load(
            """SELECT set_id, replayed, item_count, total_extracted_size
            FROM skill_registry.create_agent_skill_set(
              %s::text, %s::uuid[], %s::uuid, %s::uuid, %s::uuid, %s::char(64)
            )""",
            (
                command.agent_id,
                list(command.revision_ids),
                command.actor,
                command.request_id,
                command.assertion_nonce,
                request_fingerprint,
            ),
            replay_index=1,
        )

    async def discard_skill_set(
        self, command: DiscardSkillSet, request_fingerprint: str
    ) -> CreateSkillSetResult:
        return await self._mutate_and_load(
            """SELECT set_id, state, replayed
            FROM skill_registry.discard_agent_skill_set(
              %s::text, %s::uuid, %s::uuid, %s::uuid, %s::uuid, %s::char(64)
            )""",
            (
                command.agent_id,
                command.set_id,
                command.actor,
                command.request_id,
                command.assertion_nonce,
                request_fingerprint,
            ),
            replay_index=2,
        )

    async def clone_previous_skill_set(
        self, command: ClonePreviousSkillSet, request_fingerprint: str
    ) -> CreateSkillSetResult:
        return await self._mutate_and_load(
            """SELECT set_id, replayed, item_count, total_extracted_size
            FROM skill_registry.clone_previous_agent_skill_set(
              %s::text, %s::bigint, %s::uuid, %s::uuid, %s::uuid, %s::uuid,
              %s::char(64)
            )""",
            (
                command.agent_id,
                command.expected_activation_version,
                command.expected_previous_set_id,
                command.actor,
                command.request_id,
                command.assertion_nonce,
                request_fingerprint,
            ),
            replay_index=1,
        )

    async def _mutate_and_load(
        self,
        query: str,
        parameters: tuple[object, ...],
        *,
        replay_index: int,
    ) -> CreateSkillSetResult:
        try:
            connection = await self._connect()
            async with connection:
                async with connection.transaction():
                    async with connection.cursor() as cursor:
                        await cursor.execute(query, parameters)
                        row = await cursor.fetchone()
                        if row is None or type(row[replay_index]) is not bool:
                            _storage_error()
                        skill_set = await self._load_set(cursor, UUID(str(row[0])))
                        return CreateSkillSetResult(skill_set, cast(bool, row[replay_index]))
        except RegistryError:
            raise
        except Exception as error:
            raise RegistryError(*_mutation_failure(error)) from None

    async def get_runtime_status(self, agent_id: AgentId) -> SkillRuntimeStatus:
        try:
            connection = await self._connect()
            async with connection:
                async with connection.transaction():
                    async with connection.cursor() as cursor:
                        await cursor.execute(
                            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
                        )
                        await cursor.execute(
                            """SELECT active_set_id, previous_set_id, activation_version
                            FROM skill_registry.manager_active_skill_set
                            WHERE agent_id = %s""",
                            (agent_id,),
                        )
                        pointer = await cursor.fetchone()
                        active_id = None if pointer is None else UUID(str(pointer[0]))
                        previous_id = (
                            None if pointer is None or pointer[1] is None else UUID(str(pointer[1]))
                        )
                        activation_version = 0 if pointer is None else int(pointer[2])
                        active = (
                            None if active_id is None else await self._load_set(cursor, active_id)
                        )
                        previous = (
                            None
                            if previous_id is None
                            else await self._load_set(cursor, previous_id)
                        )
                        await cursor.execute(
                            """SELECT set_id
                            FROM skill_registry.manager_skill_sets
                            WHERE agent_id = %s AND state = 'candidate'
                            ORDER BY set_no
                            LIMIT 20""",
                            (agent_id,),
                        )
                        candidate_rows = await cursor.fetchall()
                        candidates = tuple(
                            [
                                await self._load_set(cursor, UUID(str(row[0])))
                                for row in candidate_rows
                            ]
                        )
            return SkillRuntimeStatus(active, previous, activation_version, candidates)
        except RegistryError:
            raise
        except Exception:
            raise RegistryError(
                "REGISTRY_STORAGE_ERROR", "Skill registry operation failed"
            ) from None

    async def list_available_revisions(
        self, *, limit: int, offset: int
    ) -> tuple[tuple[PublishedRevisionOption, ...], int]:
        try:
            connection = await self._connect()
            async with connection:
                async with connection.transaction():
                    async with connection.cursor() as cursor:
                        await cursor.execute(
                            "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
                        )
                        await cursor.execute(
                            """SELECT count(*)
                            FROM skill_registry.skill_revisions AS revision
                            WHERE revision.state = 'published'"""
                        )
                        count_row = await cursor.fetchone()
                        if count_row is None:
                            _storage_error()
                        await cursor.execute(
                            """SELECT
                              revision.skill_id, revision.id, skill.slug,
                              revision.revision_no, artifact.artifact_sha256,
                              artifact.extracted_size
                            FROM skill_registry.skill_revisions AS revision
                            JOIN skill_registry.skills AS skill ON skill.id = revision.skill_id
                            JOIN skill_registry.skill_revision_artifacts AS artifact
                              ON artifact.revision_id = revision.id
                              AND artifact.skill_id = revision.skill_id
                            WHERE revision.state = 'published'
                            ORDER BY skill.slug, revision.revision_no DESC, revision.id
                            LIMIT %s OFFSET %s""",
                            (limit, offset),
                        )
                        rows = await cursor.fetchall()
            return tuple(_published_revision(row) for row in rows), int(count_row[0])
        except RegistryError:
            raise
        except Exception:
            raise RegistryError(
                "REGISTRY_STORAGE_ERROR", "Skill registry operation failed"
            ) from None

    async def _load_set(self, cursor: RepositoryCursor, set_id: UUID) -> StoredSkillSet:
        await cursor.execute(
            f"""SELECT {_SET_COLUMNS}
            FROM skill_registry.manager_skill_sets AS skill_set
            LEFT JOIN skill_registry.manager_active_skill_set AS pointer
              ON pointer.agent_id = skill_set.agent_id
            WHERE skill_set.set_id = %s""",
            (set_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            raise RegistryError("SKILL_SET_NOT_FOUND", "Skill set does not exist")
        await cursor.execute(
            """SELECT revision_id
            FROM skill_registry.manager_skill_set_items
            WHERE set_id = %s
            ORDER BY ordinal""",
            (set_id,),
        )
        item_rows = await cursor.fetchall()
        try:
            return StoredSkillSet(
                id=UUID(str(row[0])),
                agent_id=cast(AgentId, str(row[1])),
                state=cast(SkillSetState, str(row[2])),
                revision_ids=tuple(UUID(str(item[0])) for item in item_rows),
                item_count=int(row[3]),
                total_extracted_size=int(row[4]),
                activation_version=None if row[6] is None else int(row[6]),
                failure_code=None if row[5] is None else str(row[5]),
            )
        except Exception:
            _storage_error()


def _published_revision(row: tuple[Any, ...]) -> PublishedRevisionOption:
    try:
        return PublishedRevisionOption(
            skill_id=UUID(str(row[0])),
            revision_id=UUID(str(row[1])),
            slug=str(row[2]),
            revision_no=int(row[3]),
            artifact_sha256=str(row[4]),
            extracted_size=int(row[5]),
        )
    except Exception:
        _storage_error()


def _mutation_failure(error: Exception) -> tuple[str, str]:
    sqlstate = getattr(error, "sqlstate", None)
    if sqlstate == "P0002":
        return "SKILL_SET_NOT_FOUND", "Skill set does not exist"
    if sqlstate == "23505":
        return "IDEMPOTENCY_CONFLICT", "Skill set request conflicts with prior use"
    if sqlstate == "40001":
        return "SKILL_SET_STATE_CONFLICT", "Skill set state changed"
    if sqlstate in {"22023", "23514", "54000"}:
        return "CANDIDATE_INVALID", "Skill set candidate is invalid"
    return "REGISTRY_STORAGE_ERROR", "Skill registry operation failed"


def _storage_error() -> NoReturn:
    raise RegistryError("REGISTRY_STORAGE_ERROR", "Skill registry operation failed") from None
