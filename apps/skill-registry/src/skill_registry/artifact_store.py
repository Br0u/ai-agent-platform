"""Immutable skill artifact storage with digest verification on every read."""

from __future__ import annotations

import hashlib
import inspect
from collections.abc import Awaitable, Callable
from typing import Any, Protocol
from uuid import UUID

from skill_core import canonicalize_skill_zip
from skill_core.types import MAX_ARCHIVE_BYTES, CanonicalSkillPackage


class ArtifactStoreError(RuntimeError):
    """Stable artifact failure safe to expose across service boundaries."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


class SkillArtifactStore(Protocol):
    async def put(self, revision_id: UUID, artifact: CanonicalSkillPackage) -> None: ...

    async def get(
        self,
        revision_id: UUID,
        expected_sha256: str,
        expected_compressed_size: int | None = None,
    ) -> bytes: ...


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
        validate_artifact_for_storage(artifact)
        storage_failed = False
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
        except Exception:
            storage_failed = True
        if storage_failed:
            raise ArtifactStoreError(
                "ARTIFACT_STORAGE_ERROR", "Skill artifact storage failed"
            ) from None

    async def get(
        self,
        revision_id: UUID,
        expected_sha256: str,
        expected_compressed_size: int | None = None,
    ) -> bytes:
        storage_failed = False
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
        except Exception:
            storage_failed = True
            row = None
        if storage_failed:
            raise ArtifactStoreError(
                "ARTIFACT_STORAGE_ERROR", "Skill artifact storage failed"
            ) from None
        if row is None:
            raise ArtifactStoreError("ARTIFACT_NOT_FOUND", "Skill artifact is unavailable")
        conversion_failed = False
        try:
            artifact = bytes(row[0])
            stored_sha256 = str(row[1])
        except Exception:
            conversion_failed = True
            artifact = b""
            stored_sha256 = ""
        if conversion_failed:
            raise ArtifactStoreError(
                "ARTIFACT_STORAGE_ERROR", "Skill artifact storage failed"
            ) from None
        actual_sha256 = hashlib.sha256(artifact).hexdigest()
        if (
            stored_sha256 != expected_sha256
            or actual_sha256 != expected_sha256
            or len(artifact) > MAX_ARCHIVE_BYTES
            or (
                expected_compressed_size is not None
                and (
                    type(expected_compressed_size) is not int
                    or expected_compressed_size != len(artifact)
                )
            )
        ):
            raise ArtifactStoreError(
                "ARTIFACT_DIGEST_MISMATCH",
                "Skill artifact digest verification failed",
            )
        return artifact


def validate_artifact_for_storage(artifact: CanonicalSkillPackage) -> None:
    """Reject forged package DTOs before opening a database transaction."""

    validation_failed = False
    canonical = None
    try:
        invalid = (
            hashlib.sha256(artifact.archive).hexdigest() != artifact.sha256
            or len(artifact.archive) != artifact.compressed_size
            or sum(file.size for file in artifact.files) != artifact.extracted_size
            or len(artifact.files) == 0
            or artifact.manifest.name != artifact.slug
            or any(
                file.size != len(file.content)
                or hashlib.sha256(file.content).hexdigest() != file.sha256
                for file in artifact.files
            )
        )
        if not invalid:
            canonical = canonicalize_skill_zip(artifact.archive)
    except Exception:
        validation_failed = True
        invalid = True
    if canonical is not None:
        invalid = invalid or (
            canonical.archive != artifact.archive
            or canonical.slug != artifact.slug
            or canonical.sha256 != artifact.sha256
            or canonical.compressed_size != artifact.compressed_size
            or canonical.extracted_size != artifact.extracted_size
            or canonical.files != artifact.files
            or canonical.manifest != artifact.manifest
        )
    if validation_failed or invalid:
        raise ArtifactStoreError(
            "ARTIFACT_DIGEST_MISMATCH", "Skill artifact package verification failed"
        ) from None
