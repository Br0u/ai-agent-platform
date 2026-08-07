"""Transactional PostgreSQL repository for immutable skill revisions."""

from __future__ import annotations

import inspect
import mimetypes
import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from datetime import datetime
from typing import Any, Protocol, TypeVar, cast
from uuid import UUID, uuid4

import psycopg
from psycopg.types.json import Jsonb

from skill_core.types import (
    FrozenJson,
    FrozenJsonArray,
    FrozenJsonObject,
    SkillFinding,
    SkillManifest,
)
from skill_registry.types import (
    ArchiveSkill,
    CreateUploadRevision,
    RegistryError,
    SkillLibraryItem,
    StoredFile,
    StoredRevision,
)
from skill_registry.artifact_store import ArtifactStoreError, validate_artifact_for_storage


_REVISION_COLUMNS = """revision.id, revision.skill_id, skill.slug,
  revision.revision_no, revision.state, revision.source_type, revision.manifest,
  revision.findings, revision.created_by, revision.created_at,
  artifact.artifact_sha256,
  artifact.compressed_size, artifact.extracted_size, artifact.file_count"""
_SHA256_PATTERN = re.compile(r"[0-9a-f]{64}\Z")


class RepositoryCursor(Protocol):
    async def __aenter__(self) -> RepositoryCursor: ...

    async def __aexit__(self, *args: object) -> None: ...

    async def execute(self, query: str, parameters: tuple[object, ...] = ()) -> Any: ...

    async def fetchone(self) -> tuple[Any, ...] | None: ...

    async def fetchall(self) -> list[tuple[Any, ...]]: ...


class RepositoryConnection(Protocol):
    async def __aenter__(self) -> RepositoryConnection: ...

    async def __aexit__(self, *args: object) -> None: ...

    def cursor(self) -> RepositoryCursor: ...

    def transaction(self) -> AbstractAsyncContextManager[object]: ...


RepositoryConnectionFactory = Callable[[], RepositoryConnection | Awaitable[RepositoryConnection]]
IdFactory = Callable[[], UUID]
MappedValue = TypeVar("MappedValue")


class PostgresSkillRegistryRepository:
    """Persist complete, validated revision bundles in one transaction."""

    def __init__(
        self,
        connection_factory: RepositoryConnectionFactory,
        *,
        id_factory: IdFactory = uuid4,
    ) -> None:
        self._connection_factory = connection_factory
        self._id_factory = id_factory

    async def _connect(self) -> RepositoryConnection:
        connection = self._connection_factory()
        if inspect.isawaitable(connection):
            return await connection
        return connection

    async def create_upload_revision(self, command: CreateUploadRevision) -> StoredRevision:
        artifact_error_code: str | None = None
        try:
            validate_artifact_for_storage(command.package)
        except ArtifactStoreError as error:
            artifact_error_code = error.code
        if artifact_error_code is not None:
            raise RegistryError(
                artifact_error_code, "Skill artifact package verification failed"
            ) from None
        failure: tuple[str, str] | None = None
        try:
            connection = await self._connect()
            async with connection:
                async with connection.transaction():
                    async with connection.cursor() as cursor:
                        await self._assert_nonce_unused(cursor, command.assertion_nonce)
                        skill_id, is_new = await self._resolve_upload_skill(cursor, command)
                        duplicate = await self._find_digest_revision(
                            cursor, skill_id, command.package.sha256
                        )
                        if duplicate is not None:
                            await self._insert_upload_event(
                                cursor,
                                command=command,
                                revision_id=duplicate.id,
                                result_code="replay",
                            )
                            return duplicate
                        if not is_new and command.target_skill_id is None:
                            replacement_token, enabled = await self._replacement_state(
                                cursor, skill_id
                            )
                            raise RegistryError(
                                "SKILL_NAME_CONFLICT",
                                "A different skill already uses this name",
                                conflicting_skill_id=skill_id,
                                replacement_token=replacement_token,
                                conflicting_skill_enabled=enabled,
                            )
                        revision_no = 1
                        if not is_new:
                            await cursor.execute(
                                """SELECT COALESCE(MAX(revision_no), 0) + 1
                                FROM skill_registry.skill_revisions
                                WHERE skill_id = %s""",
                                (skill_id,),
                            )
                            revision_row = await cursor.fetchone()
                            if revision_row is None:
                                raise RegistryError(
                                    "REGISTRY_STORAGE_ERROR", "Skill registry operation failed"
                                )
                            revision_no = int(revision_row[0])

                        revision_id = self._id_factory()
                        manifest_json = _manifest_to_json(command.package.manifest)
                        findings_json = [
                            _finding_to_json(item) for item in command.package.findings
                        ]
                        await cursor.execute(
                            """INSERT INTO skill_registry.skill_revisions (
                              id, skill_id, revision_no, state, source_type, manifest,
                              findings, created_by
                            ) VALUES (
                              %s, %s, %s, 'published', 'upload', %s, %s, %s
                            ) RETURNING created_at""",
                            (
                                revision_id,
                                skill_id,
                                revision_no,
                                Jsonb(manifest_json),
                                Jsonb(findings_json),
                                command.actor,
                            ),
                        )
                        created_row = await cursor.fetchone()
                        if created_row is None or not isinstance(created_row[0], datetime):
                            raise RegistryError(
                                "REGISTRY_STORAGE_ERROR", "Skill registry operation failed"
                            )
                        await cursor.execute(
                            """INSERT INTO skill_registry.skill_revision_artifacts (
                              revision_id, skill_id, artifact_sha256, compressed_size,
                              extracted_size, file_count, archive_bytes
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                            (
                                revision_id,
                                skill_id,
                                command.package.sha256,
                                command.package.compressed_size,
                                command.package.extracted_size,
                                len(command.package.files),
                                command.package.archive,
                            ),
                        )
                        for file in command.package.files:
                            media_type = mimetypes.guess_type(file.path)[0]
                            await cursor.execute(
                                """INSERT INTO skill_registry.skill_revision_files (
                                  revision_id, path, file_sha256, size, media_type
                                ) VALUES (%s, %s, %s, %s, %s)""",
                                (revision_id, file.path, file.sha256, file.size, media_type),
                            )
                        await self._insert_upload_event(
                            cursor,
                            command=command,
                            revision_id=revision_id,
                            result_code="ok",
                        )
                        return StoredRevision(
                            id=revision_id,
                            skill_id=skill_id,
                            skill_slug=command.package.manifest.name,
                            revision_no=revision_no,
                            state="published",
                            source_type="upload",
                            manifest=command.package.manifest,
                            findings=command.package.findings,
                            created_by=command.actor,
                            created_at=created_row[0],
                            artifact_sha256=command.package.sha256,
                            compressed_size=command.package.compressed_size,
                            extracted_size=command.package.extracted_size,
                            file_count=len(command.package.files),
                        )
        except RegistryError:
            raise
        except Exception as error:
            failure = _database_failure(error)
        assert failure is not None
        raise RegistryError(*failure) from None

    async def archive_skill(self, command: ArchiveSkill) -> None:
        try:
            connection = await self._connect()
            async with connection:
                async with connection.transaction():
                    async with connection.cursor() as cursor:
                        await self._assert_nonce_unused(cursor, command.assertion_nonce)
                        await cursor.execute(
                            """SELECT latest.artifact_sha256,
                              EXISTS (
                                SELECT 1
                                FROM skill_registry.manager_active_skill_set AS active_set
                                JOIN skill_registry.manager_skill_set_items AS active_item
                                  ON active_item.set_id = active_set.active_set_id
                                WHERE active_set.agent_id = 'maduoduo'
                                  AND active_item.skill_id = skill.id
                              )
                            FROM skill_registry.skills AS skill
                            JOIN LATERAL (
                              SELECT artifact.artifact_sha256
                              FROM skill_registry.skill_revisions AS revision
                              JOIN skill_registry.skill_revision_artifacts AS artifact
                                ON artifact.revision_id = revision.id
                              WHERE revision.skill_id = skill.id
                                AND revision.state = 'published'
                              ORDER BY revision.revision_no DESC
                              LIMIT 1
                            ) AS latest ON true
                            WHERE skill.id = %s AND skill.archived_at IS NULL
                            FOR UPDATE OF skill""",
                            (command.skill_id,),
                        )
                        row = await cursor.fetchone()
                        if row is None:
                            raise RegistryError("SKILL_NOT_FOUND", "Skill does not exist")
                        if str(row[0]) != command.expected_artifact_sha256:
                            raise RegistryError("SKILL_CHANGED", "Skill has changed")
                        if row[1] is not False:
                            raise RegistryError("SKILL_ACTIVE", "Active Skill cannot be archived")
                        await cursor.execute(
                            """UPDATE skill_registry.skills
                            SET archived_at = now()
                            WHERE id = %s AND archived_at IS NULL""",
                            (command.skill_id,),
                        )
                        await cursor.execute(
                            """INSERT INTO skill_registry.skill_control_events (
                              id, request_id, assertion_nonce, actor, event_type,
                              target_id, result_code
                            ) VALUES (%s, %s, %s, %s, 'skill_archived', %s, 'ok')""",
                            (
                                self._id_factory(),
                                command.request_id,
                                command.assertion_nonce,
                                str(command.actor),
                                command.skill_id,
                            ),
                        )
        except RegistryError:
            raise
        except Exception as error:
            raise RegistryError(*_database_failure(error)) from None

    async def _assert_nonce_unused(self, cursor: RepositoryCursor, assertion_nonce: UUID) -> None:
        await cursor.execute(
            """SELECT target_id FROM skill_registry.skill_control_events
            WHERE assertion_nonce = %s""",
            (assertion_nonce,),
        )
        if await cursor.fetchone() is not None:
            raise RegistryError("ASSERTION_REPLAY", "Mutation assertion was already used")

    async def _insert_upload_event(
        self,
        cursor: RepositoryCursor,
        *,
        command: CreateUploadRevision,
        revision_id: UUID,
        result_code: str,
    ) -> None:
        await cursor.execute(
            """INSERT INTO skill_registry.skill_control_events (
              id, request_id, assertion_nonce, actor, event_type,
              target_id, result_code
            ) VALUES (%s, %s, %s, %s, 'revision_created', %s, %s)""",
            (
                self._id_factory(),
                command.request_id,
                command.assertion_nonce,
                str(command.actor),
                revision_id,
                result_code,
            ),
        )

    async def _resolve_upload_skill(
        self, cursor: RepositoryCursor, command: CreateUploadRevision
    ) -> tuple[UUID, bool]:
        if command.target_skill_id is not None:
            if command.expected_artifact_sha256 is None:
                raise RegistryError("VALIDATION_ERROR", "Replacement token is required")
            await cursor.execute(
                """SELECT skill.slug, latest.artifact_sha256
                FROM skill_registry.skills AS skill
                JOIN LATERAL (
                  SELECT artifact.artifact_sha256
                  FROM skill_registry.skill_revisions AS revision
                  JOIN skill_registry.skill_revision_artifacts AS artifact
                    ON artifact.revision_id = revision.id
                  WHERE revision.skill_id = skill.id
                    AND revision.state = 'published'
                  ORDER BY revision.revision_no DESC
                  LIMIT 1
                ) AS latest ON true
                WHERE skill.id = %s AND skill.archived_at IS NULL
                FOR UPDATE OF skill""",
                (command.target_skill_id,),
            )
            row = await cursor.fetchone()
            if row is None:
                raise RegistryError("SKILL_NOT_FOUND", "Target skill does not exist")
            if str(row[0]) != command.package.manifest.name:
                raise RegistryError(
                    "SKILL_NAME_CONFLICT",
                    "Target skill name does not match the uploaded manifest",
                )
            if str(row[1]) != command.expected_artifact_sha256:
                raise RegistryError("SKILL_CHANGED", "Target skill changed")
            return command.target_skill_id, False

        candidate_skill_id = self._id_factory()
        await cursor.execute(
            """INSERT INTO skill_registry.skills (id, slug, created_by)
            VALUES (%s, %s, %s)
            ON CONFLICT (slug) WHERE archived_at IS NULL DO NOTHING
            RETURNING id""",
            (candidate_skill_id, command.package.manifest.name, command.actor),
        )
        inserted = await cursor.fetchone()
        if inserted is not None:
            return UUID(str(inserted[0])), True
        await cursor.execute(
            """SELECT id FROM skill_registry.skills
            WHERE slug = %s AND archived_at IS NULL""",
            (command.package.manifest.name,),
        )
        existing = await cursor.fetchone()
        if existing is None:
            raise RegistryError("REGISTRY_STORAGE_ERROR", "Skill registry operation failed")
        return UUID(str(existing[0])), False

    async def _replacement_state(
        self, cursor: RepositoryCursor, skill_id: UUID
    ) -> tuple[str, bool]:
        await cursor.execute(
            """SELECT artifact.artifact_sha256,
              EXISTS (
                SELECT 1
                FROM skill_registry.manager_active_skill_set AS active_set
                JOIN skill_registry.manager_skill_set_items AS active_item
                  ON active_item.set_id = active_set.active_set_id
                WHERE active_set.agent_id = 'maduoduo'
                  AND active_item.skill_id = revision.skill_id
              )
            FROM skill_registry.skill_revisions AS revision
            JOIN skill_registry.skill_revision_artifacts AS artifact
              ON artifact.revision_id = revision.id
            WHERE revision.skill_id = %s AND revision.state = 'published'
            ORDER BY revision.revision_no DESC
            LIMIT 1""",
            (skill_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            raise RegistryError("REGISTRY_STORAGE_ERROR", "Skill registry operation failed")
        return str(row[0]), bool(row[1])

    async def _find_digest_revision(
        self, cursor: RepositoryCursor, skill_id: UUID, artifact_sha256: str
    ) -> StoredRevision | None:
        await cursor.execute(
            f"""SELECT {_REVISION_COLUMNS}
            FROM skill_registry.skill_revisions AS revision
            JOIN skill_registry.skills AS skill ON skill.id = revision.skill_id
            JOIN skill_registry.skill_revision_artifacts AS artifact
              ON artifact.revision_id = revision.id
            WHERE revision.skill_id = %s AND artifact.artifact_sha256 = %s""",
            (skill_id, artifact_sha256),
        )
        row = await cursor.fetchone()
        return None if row is None else _stored_revision(row)

    async def list_skills(
        self, *, limit: int = 50, offset: int = 0
    ) -> tuple[SkillLibraryItem, ...]:
        if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or offset < 0:
            raise RegistryError("VALIDATION_ERROR", "Pagination bounds are invalid")
        rows = await self._query_all(
            """SELECT skill.id, skill.slug,
              current_revision.manifest ->> 'description',
              active_revision.revision_id IS NOT NULL,
              current_revision.created_at, current_revision.artifact_sha256,
              current_revision.id
            FROM skill_registry.skills AS skill
            LEFT JOIN LATERAL (
              SELECT active_item.revision_id
              FROM skill_registry.manager_active_skill_set AS active_set
              JOIN skill_registry.manager_skill_set_items AS active_item
                ON active_item.set_id = active_set.active_set_id
              WHERE active_set.agent_id = 'maduoduo'
                AND active_item.skill_id = skill.id
              LIMIT 1
            ) AS active_revision ON true
            JOIN LATERAL (
              SELECT revision.id, revision.manifest, artifact.artifact_sha256,
                revision.created_at
              FROM skill_registry.skill_revisions AS revision
              JOIN skill_registry.skill_revision_artifacts AS artifact
                ON artifact.revision_id = revision.id
              WHERE revision.id = COALESCE(
                active_revision.revision_id,
                (
                  SELECT latest_revision.id
                  FROM skill_registry.skill_revisions AS latest_revision
                  WHERE latest_revision.skill_id = skill.id
                    AND latest_revision.state = 'published'
                  ORDER BY latest_revision.revision_no DESC
                  LIMIT 1
                )
              )
            ) AS current_revision ON true
            WHERE skill.archived_at IS NULL
            ORDER BY skill.slug
            LIMIT %s OFFSET %s""",
            (limit, offset),
        )
        return _map_storage_value(lambda: tuple(_skill_library_item(row) for row in rows))

    async def get_revision(self, skill_id: UUID, revision_id: UUID) -> StoredRevision:
        row = await self._query_one(
            f"""SELECT {_REVISION_COLUMNS}
            FROM skill_registry.skill_revisions AS revision
            JOIN skill_registry.skills AS skill ON skill.id = revision.skill_id
            JOIN skill_registry.skill_revision_artifacts AS artifact
              ON artifact.revision_id = revision.id
            WHERE revision.skill_id = %s AND revision.id = %s""",
            (skill_id, revision_id),
        )
        if row is None:
            raise RegistryError("REVISION_NOT_FOUND", "Skill revision does not exist")
        return _map_storage_value(lambda: _stored_revision(row))

    async def list_revision_files(self, revision_id: UUID) -> tuple[StoredFile, ...]:
        rows = await self._query_all(
            """SELECT path, file_sha256, size, media_type
            FROM skill_registry.skill_revision_files
            WHERE revision_id = %s
            ORDER BY path""",
            (revision_id,),
        )
        return _map_storage_value(
            lambda: tuple(
                StoredFile(
                    path=str(row[0]),
                    sha256=str(row[1]),
                    size=int(row[2]),
                    media_type=None if row[3] is None else str(row[3]),
                )
                for row in rows
            )
        )

    async def find_previous_published(self, revision: StoredRevision) -> StoredRevision | None:
        row = await self._query_one(
            f"""SELECT {_REVISION_COLUMNS}
            FROM skill_registry.skill_revisions AS revision
            JOIN skill_registry.skills AS skill ON skill.id = revision.skill_id
            JOIN skill_registry.skill_revision_artifacts AS artifact
              ON artifact.revision_id = revision.id
            WHERE revision.skill_id = %s
              AND revision.revision_no < %s
              AND revision.state = 'published'
            ORDER BY revision.revision_no DESC
            LIMIT 1""",
            (revision.skill_id, revision.revision_no),
        )
        return None if row is None else _map_storage_value(lambda: _stored_revision(row))

    async def _query_one(
        self, query: str, parameters: tuple[object, ...]
    ) -> tuple[Any, ...] | None:
        failure = False
        try:
            connection = await self._connect()
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(query, parameters)
                    return await cursor.fetchone()
        except RegistryError:
            raise
        except Exception:
            failure = True
        if failure:
            raise RegistryError(
                "REGISTRY_STORAGE_ERROR", "Skill registry operation failed"
            ) from None
        raise AssertionError("unreachable")

    async def _query_all(
        self, query: str, parameters: tuple[object, ...] = ()
    ) -> list[tuple[Any, ...]]:
        failure = False
        try:
            connection = await self._connect()
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(query, parameters)
                    return await cursor.fetchall()
        except RegistryError:
            raise
        except Exception:
            failure = True
        if failure:
            raise RegistryError(
                "REGISTRY_STORAGE_ERROR", "Skill registry operation failed"
            ) from None
        raise AssertionError("unreachable")


def _database_failure(error: Exception) -> tuple[str, str]:
    if (
        isinstance(error, psycopg.errors.UniqueViolation)
        and error.diag.constraint_name == "skill_control_events_assertion_nonce_key"
    ):
        return "ASSERTION_REPLAY", "Mutation assertion was already used"
    return "REGISTRY_STORAGE_ERROR", "Skill registry operation failed"


def _map_storage_value(mapper: Callable[[], MappedValue]) -> MappedValue:
    mapping_failed = False
    value: MappedValue | None = None
    try:
        value = mapper()
    except Exception:
        mapping_failed = True
    if mapping_failed:
        raise RegistryError("REGISTRY_STORAGE_ERROR", "Skill registry operation failed") from None
    return cast(MappedValue, value)


def _stored_revision(row: tuple[Any, ...]) -> StoredRevision:
    return StoredRevision(
        id=UUID(str(row[0])),
        skill_id=UUID(str(row[1])),
        skill_slug=str(row[2]),
        revision_no=int(row[3]),
        state=cast(Any, row[4]),
        source_type=str(row[5]),
        manifest=_manifest_from_json(cast(Mapping[str, object], row[6])),
        findings=_findings_from_json(cast(Sequence[Mapping[str, object]], row[7])),
        created_by=UUID(str(row[8])),
        created_at=cast(datetime, row[9]),
        artifact_sha256=str(row[10]),
        compressed_size=int(row[11]),
        extracted_size=int(row[12]),
        file_count=int(row[13]),
    )


def _skill_library_item(row: tuple[Any, ...]) -> SkillLibraryItem:
    description = row[2]
    enabled = row[3]
    uploaded_at = row[4]
    digest = row[5]
    if (
        type(description) is not str
        or type(enabled) is not bool
        or not isinstance(uploaded_at, datetime)
        or type(digest) is not str
        or _SHA256_PATTERN.fullmatch(digest) is None
    ):
        raise ValueError("invalid skill library item")
    return SkillLibraryItem(
        id=UUID(str(row[0])),
        name=str(row[1]),
        description=description,
        enabled=enabled,
        uploaded_at=uploaded_at,
        replacement_token=digest,
        revision_id=UUID(str(row[6])),
    )


def _manifest_to_json(manifest: SkillManifest) -> dict[str, object]:
    return {
        "name": manifest.name,
        "description": manifest.description,
        "instructions": manifest.instructions,
        "scripts": list(manifest.scripts),
        "references": list(manifest.references),
        "metadata": _frozen_json_to_plain(manifest.metadata),
        "license": manifest.license,
        "compatibility": manifest.compatibility,
        "allowed_tools": list(manifest.allowed_tools),
    }


def _manifest_from_json(value: Mapping[str, object]) -> SkillManifest:
    return SkillManifest(
        name=str(value["name"]),
        description=str(value["description"]),
        instructions=str(value["instructions"]),
        scripts=tuple(str(item) for item in cast(Sequence[object], value["scripts"])),
        references=tuple(str(item) for item in cast(Sequence[object], value["references"])),
        metadata=_plain_to_frozen_json(value.get("metadata")),
        license=None if value.get("license") is None else str(value["license"]),
        compatibility=(None if value.get("compatibility") is None else str(value["compatibility"])),
        allowed_tools=tuple(
            str(item) for item in cast(Sequence[object], value.get("allowed_tools", ()))
        ),
    )


def _finding_to_json(finding: SkillFinding) -> dict[str, object]:
    return {
        "path": finding.path,
        "line": finding.line,
        "code": finding.code,
        "message": finding.message,
        "blocking": finding.blocking,
    }


def _findings_from_json(value: Sequence[Mapping[str, object]]) -> tuple[SkillFinding, ...]:
    return tuple(
        SkillFinding(
            path=str(item["path"]),
            line=int(cast(int, item["line"])),
            code=str(item["code"]),
            message=str(item["message"]),
            blocking=bool(item.get("blocking", False)),
        )
        for item in value
    )


def _frozen_json_to_plain(value: FrozenJson | None) -> object:
    if isinstance(value, FrozenJsonObject):
        return {key: _frozen_json_to_plain(item) for key, item in value.items}
    if isinstance(value, FrozenJsonArray):
        return [_frozen_json_to_plain(item) for item in value.items]
    return value


def _plain_to_frozen_json(value: object) -> FrozenJson:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Mapping):
        return FrozenJsonObject(
            tuple(
                sorted(
                    ((str(key), _plain_to_frozen_json(item)) for key, item in value.items()),
                    key=lambda pair: pair[0].encode("utf-8"),
                )
            )
        )
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return FrozenJsonArray(tuple(_plain_to_frozen_json(item) for item in value))
    raise RegistryError("REGISTRY_STORAGE_ERROR", "Stored manifest is invalid")
