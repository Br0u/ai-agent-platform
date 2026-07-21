"""Immutable skill artifact storage with digest verification on every read."""

from __future__ import annotations

import hashlib
import inspect
from collections.abc import Awaitable, Callable
from typing import Any, Protocol
from uuid import UUID

from skill_core.types import CanonicalSkillPackage


class ArtifactStoreError(RuntimeError):
    """Stable artifact failure safe to expose across service boundaries."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


class SkillArtifactStore(Protocol):
    async def put(self, revision_id: UUID, artifact: CanonicalSkillPackage) -> None: ...

    async def get(self, revision_id: UUID, expected_sha256: str) -> bytes: ...


class ArtifactCursor(Protocol):
    async def __aenter__(self) -> ArtifactCursor: ...

    async def __aexit__(self, *args: object) -> None: ...

    async def execute(self, query: str, parameters: tuple[object, ...] = ()) -> Any: ...

    async def fetchone(self) -> tuple[Any, ...] | None: ...


class ArtifactConnection(Protocol):
    async def __aenter__(self) -> ArtifactConnection: ...

    async def __aexit__(self, *args: object) -> None: ...

    def cursor(self) -> ArtifactCursor: ...


ArtifactConnectionFactory = Callable[[], ArtifactConnection | Awaitable[ArtifactConnection]]


class PostgresSkillArtifactStore:
    """PostgreSQL-backed canonical ZIP store."""

    def __init__(self, connection_factory: ArtifactConnectionFactory) -> None:
        self._connection_factory = connection_factory

    async def _connect(self) -> ArtifactConnection:
        connection = self._connection_factory()
        if inspect.isawaitable(connection):
            return await connection
        return connection

    async def put(self, revision_id: UUID, artifact: CanonicalSkillPackage) -> None:
        try:
            connection = await self._connect()
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """INSERT INTO skill_registry.skill_revision_artifacts (
                          revision_id, skill_id, artifact_sha256, compressed_size,
                          extracted_size, file_count, archive_bytes
                        ) VALUES (
                          %s,
                          (SELECT skill_id FROM skill_registry.skill_revisions WHERE id = %s),
                          %s, %s, %s, %s, %s
                        )""",
                        (
                            revision_id,
                            revision_id,
                            artifact.sha256,
                            artifact.compressed_size,
                            artifact.extracted_size,
                            len(artifact.files),
                            artifact.archive,
                        ),
                    )
        except Exception as error:
            raise ArtifactStoreError(
                "ARTIFACT_STORAGE_ERROR", "Skill artifact storage failed"
            ) from error

    async def get(self, revision_id: UUID, expected_sha256: str) -> bytes:
        try:
            connection = await self._connect()
            async with connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """SELECT archive_bytes, artifact_sha256
                        FROM skill_registry.skill_revision_artifacts
                        WHERE revision_id = %s""",
                        (revision_id,),
                    )
                    row = await cursor.fetchone()
            if row is None:
                raise ArtifactStoreError("ARTIFACT_NOT_FOUND", "Skill artifact is unavailable")
            artifact = bytes(row[0])
            stored_sha256 = str(row[1])
            actual_sha256 = hashlib.sha256(artifact).hexdigest()
            if stored_sha256 != expected_sha256 or actual_sha256 != expected_sha256:
                raise ArtifactStoreError(
                    "ARTIFACT_DIGEST_MISMATCH",
                    "Skill artifact digest verification failed",
                )
            return artifact
        except ArtifactStoreError:
            raise
        except Exception as error:
            raise ArtifactStoreError(
                "ARTIFACT_STORAGE_ERROR", "Skill artifact storage failed"
            ) from error
