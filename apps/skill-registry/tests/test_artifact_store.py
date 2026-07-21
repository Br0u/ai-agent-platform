from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import replace
from typing import Any
from uuid import uuid4

import pytest

from skill_core import canonicalize_skill_zip
from skill_core.types import CanonicalSkillPackage
from skill_registry.artifact_store import (
    ArtifactStoreError,
    PostgresSkillArtifactStore,
)


class FakeCursor:
    def __init__(
        self,
        row: tuple[Any, ...] | None = None,
        *,
        error: Exception | None = None,
    ) -> None:
        self.row = row
        self.error = error
        self.executions: list[tuple[str, tuple[object, ...]]] = []

    async def __aenter__(self) -> FakeCursor:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, query: str, parameters: tuple[object, ...] = ()) -> None:
        self.executions.append((query, parameters))
        if self.error is not None:
            raise self.error

    async def fetchone(self) -> tuple[Any, ...] | None:
        return self.row


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self._cursor = cursor

    async def __aenter__(self) -> FakeConnection:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self._cursor


def build_zip() -> bytes:
    import io
    import stat
    import zipfile

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        info = zipfile.ZipInfo("demo-skill/SKILL.md", (2026, 7, 20, 12, 0, 0))
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | 0o600) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(
            info,
            b"---\nname: demo-skill\ndescription: Demo.\nlicense: MIT\n---\n# Demo\n",
        )
    return output.getvalue()


@pytest.mark.asyncio
async def test_put_persists_only_canonical_artifact_metadata_and_bytes() -> None:
    package = canonicalize_skill_zip(build_zip())
    revision_id = uuid4()
    cursor = FakeCursor()
    store = PostgresSkillArtifactStore(lambda: FakeConnection(cursor))

    await store.put(revision_id, package)

    query, parameters = cursor.executions[0]
    assert "INSERT INTO skill_registry.skill_revision_artifacts" in query
    assert parameters == (
        revision_id,
        revision_id,
        package.sha256,
        package.compressed_size,
        package.extracted_size,
        len(package.files),
        package.archive,
    )


@pytest.mark.asyncio
async def test_get_recomputes_and_returns_matching_artifact() -> None:
    artifact = b"canonical artifact"
    digest = hashlib.sha256(artifact).hexdigest()
    cursor = FakeCursor((artifact, digest))
    store = PostgresSkillArtifactStore(lambda: FakeConnection(cursor))

    assert await store.get(uuid4(), digest) == artifact


@pytest.mark.asyncio
async def test_get_rejects_expected_stored_or_actual_digest_mismatch() -> None:
    artifact = b"canonical artifact"
    digest = hashlib.sha256(artifact).hexdigest()

    for row, expected in (
        ((artifact, digest), "0" * 64),
        ((artifact, "f" * 64), digest),
        ((b"corrupted", digest), digest),
    ):
        store = PostgresSkillArtifactStore(lambda: FakeConnection(FakeCursor(row)))
        with pytest.raises(ArtifactStoreError) as caught:
            await store.get(uuid4(), expected)
        assert caught.value.code == "ARTIFACT_DIGEST_MISMATCH"
        assert "canonical artifact" not in str(caught.value)


@pytest.mark.asyncio
async def test_get_reports_missing_artifact_without_leaking_identifiers() -> None:
    store = PostgresSkillArtifactStore(lambda: FakeConnection(FakeCursor(None)))

    with pytest.raises(ArtifactStoreError) as caught:
        await store.get(uuid4(), "a" * 64)

    assert caught.value.code == "ARTIFACT_NOT_FOUND"
    assert str(caught.value) == "Skill artifact is unavailable"


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["put", "get"])
async def test_store_sanitizes_database_failures(operation: str) -> None:
    cursor = FakeCursor(error=RuntimeError("database failure contains secret-source"))
    store = PostgresSkillArtifactStore(lambda: FakeConnection(cursor))

    with pytest.raises(ArtifactStoreError) as caught:
        if operation == "put":
            await store.put(uuid4(), canonicalize_skill_zip(build_zip()))
        else:
            await store.get(uuid4(), "a" * 64)

    assert caught.value.code == "ARTIFACT_STORAGE_ERROR"
    assert "secret-source" not in str(caught.value)
    assert caught.value.__cause__ is None
    assert caught.value.__context__ is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "mutation",
    [
        lambda package: replace(package, sha256="0" * 64),
        lambda package: replace(package, compressed_size=package.compressed_size + 1),
        lambda package: replace(
            package,
            files=(replace(package.files[0], sha256="f" * 64),),
        ),
        lambda package: replace(
            package,
            manifest=replace(package.manifest, description="Forged description."),
        ),
    ],
)
async def test_put_rejects_forged_canonical_package_before_database_write(
    mutation: Callable[[CanonicalSkillPackage], CanonicalSkillPackage],
) -> None:
    cursor = FakeCursor()
    store = PostgresSkillArtifactStore(lambda: FakeConnection(cursor))
    forged = mutation(canonicalize_skill_zip(build_zip()))

    with pytest.raises(ArtifactStoreError) as caught:
        await store.put(uuid4(), forged)

    assert caught.value.code == "ARTIFACT_DIGEST_MISMATCH"
    assert cursor.executions == []
