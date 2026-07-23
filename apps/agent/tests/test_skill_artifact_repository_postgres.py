from __future__ import annotations

import io
import mimetypes
import os
import stat
from uuid import UUID, uuid4
import zipfile

from pydantic import SecretStr
import psycopg
from psycopg.errors import InsufficientPrivilege
from psycopg.types.json import Jsonb
import pytest

from agent_service.skill_artifact_repository import PostgresSkillArtifactRepository
from agent_service.skill_runtime_types import ActivateSkillSet, FailSkillSet
from skill_core import CanonicalSkillPackage, canonicalize_skill_zip


OWNER_URL = os.getenv("SKILL_REGISTRY_TEST_DATABASE_URL")
MANAGER_URL = os.getenv("SKILL_REGISTRY_DATABASE_URL")
RUNTIME_URL = os.getenv("SKILL_REGISTRY_RUNTIME_DATABASE_URL")
MISSING = [
    name
    for name, value in (
        ("SKILL_REGISTRY_TEST_DATABASE_URL", OWNER_URL),
        ("SKILL_REGISTRY_DATABASE_URL", MANAGER_URL),
        ("SKILL_REGISTRY_RUNTIME_DATABASE_URL", RUNTIME_URL),
    )
    if not value
]
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        bool(MISSING),
        reason=f"missing required Skill Registry PostgreSQL DSNs: {', '.join(MISSING)}",
    ),
]


def psycopg_url(value: str) -> str:
    return value.replace("postgresql+psycopg_async://", "postgresql://", 1)


def package(slug: str) -> CanonicalSkillPackage:
    output = io.BytesIO()
    files = {
        f"{slug}/SKILL.md": (
            f"---\nname: {slug}\ndescription: Runtime integration.\n---\n# Demo\n".encode()
        ),
        f"{slug}/scripts/run.py": b"#!/usr/bin/env python3\nprint('runtime-ok')\n",
    }
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            info = zipfile.ZipInfo(path, (2026, 7, 22, 12, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
    return canonicalize_skill_zip(output.getvalue())


async def seed_published_revision(
    value: CanonicalSkillPackage | None = None,
) -> UUID:
    assert OWNER_URL is not None
    value = value or package(f"runtime-pg-{uuid4().hex[:12]}")
    skill_id, revision_id, actor = uuid4(), uuid4(), uuid4()
    review_request_id = uuid4()
    async with await psycopg.AsyncConnection.connect(
        psycopg_url(OWNER_URL)
    ) as connection:
        async with connection.transaction():
            await connection.execute(
                "INSERT INTO skill_registry.skills (id, slug, created_by) VALUES (%s, %s, %s)",
                (skill_id, value.slug, actor),
            )
            await connection.execute(
                """INSERT INTO skill_registry.skill_revisions (
                  id, skill_id, revision_no, state, source_type, manifest, findings,
                  created_by
                ) VALUES (
                  %s, %s, 1, 'pending_review', 'upload', %s, '[]'::jsonb, %s
                )""",
                (
                    revision_id,
                    skill_id,
                    Jsonb({"name": value.manifest.name}),
                    actor,
                ),
            )
            await connection.execute(
                """INSERT INTO skill_registry.skill_revision_artifacts (
                  revision_id, skill_id, artifact_sha256, compressed_size,
                  extracted_size, file_count, archive_bytes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (
                    revision_id,
                    skill_id,
                    value.sha256,
                    value.compressed_size,
                    value.extracted_size,
                    len(value.files),
                    value.archive,
                ),
            )
            for file in value.files:
                await connection.execute(
                    """INSERT INTO skill_registry.skill_revision_files (
                      revision_id, path, file_sha256, size, media_type
                    ) VALUES (%s, %s, %s, %s, %s)""",
                    (
                        revision_id,
                        file.path,
                        file.sha256,
                        file.size,
                        mimetypes.guess_type(file.path)[0],
                    ),
                )
            await connection.execute(
                """INSERT INTO skill_registry.skill_control_events (
                  id, request_id, assertion_nonce, actor, event_type,
                  target_id, result_code, content_reviewed,
                  usage_rights_confirmed, execution_risk_accepted,
                  reviewer_authorization_confirmed
                ) VALUES (
                  %s, %s, %s, %s, 'revision_published', %s, 'ok',
                  TRUE, TRUE, TRUE, TRUE
                )""",
                (
                    uuid4(),
                    review_request_id,
                    review_request_id,
                    str(actor),
                    revision_id,
                ),
            )
            await connection.execute(
                """UPDATE skill_registry.skill_revisions
                SET state = 'published', reviewed_by = %s, reviewed_at = now()
                WHERE id = %s""",
                (actor, revision_id),
            )
    return revision_id


async def current_activation_version() -> int:
    assert OWNER_URL is not None
    async with await psycopg.AsyncConnection.connect(
        psycopg_url(OWNER_URL)
    ) as connection:
        cursor = await connection.execute(
            """SELECT activation_version FROM skill_registry.active_agent_skill_sets
            WHERE agent_id = 'maduoduo'"""
        )
        row = await cursor.fetchone()
        return 0 if row is None else int(row[0])


async def create_candidate(revision_id: UUID) -> UUID:
    assert MANAGER_URL is not None
    request_id = uuid4()
    async with await psycopg.AsyncConnection.connect(
        psycopg_url(MANAGER_URL)
    ) as connection:
        cursor = await connection.execute(
            """SELECT set_id FROM skill_registry.create_agent_skill_set(
              'maduoduo', %s::uuid[], %s::uuid, %s::uuid, %s::uuid, %s::char(64)
            )""",
            ([revision_id], uuid4(), request_id, request_id, uuid4().hex * 2),
        )
        row = await cursor.fetchone()
        assert row is not None
        return UUID(str(row[0]))


async def test_runtime_file_index_uses_canonical_utf8_path_order() -> None:
    assert RUNTIME_URL is not None
    value = package(f"runtime-order-{uuid4().hex[:12]}")
    revision_id = await seed_published_revision(value)
    candidate_id = await create_candidate(revision_id)

    async with await psycopg.AsyncConnection.connect(
        psycopg_url(RUNTIME_URL)
    ) as connection:
        cursor = await connection.execute(
            """SELECT file_index FROM skill_registry.runtime_skill_set_items
            WHERE set_id = %s
            ORDER BY ordinal""",
            (candidate_id,),
        )
        row = await cursor.fetchone()

    assert row is not None and len(row) == 1
    assert type(row[0]) is list
    assert all(
        type(entry) is dict and type(entry.get("path")) is str for entry in row[0]
    )
    assert tuple(entry["path"] for entry in row[0]) == tuple(
        file.path for file in value.files
    )


async def test_real_runtime_role_loads_validates_activates_fails_and_reconciles() -> (
    None
):
    assert RUNTIME_URL is not None
    revision_id = await seed_published_revision()
    candidate_id = await create_candidate(revision_id)
    expected_version = await current_activation_version()
    repository = PostgresSkillArtifactRepository(database_url=SecretStr(RUNTIME_URL))
    await repository.open()
    try:
        candidate = await repository.load_candidate(candidate_id)
        request_id = uuid4()
        activated_version = await repository.activate(
            ActivateSkillSet(
                candidate_id,
                expected_version,
                uuid4(),
                request_id,
                request_id,
                uuid4().hex * 2,
            )
        )
        active = await repository.load_active()
        reconciled = await repository.reconcile(candidate_id)

        assert candidate.items[0].revision_id == revision_id
        assert active is not None and active.set_id == candidate_id
        assert active.activation_version == activated_version == expected_version + 1
        assert reconciled.active_set_id == candidate_id
        assert reconciled.target_state == "active"

        failed_candidate_id = await create_candidate(revision_id)
        failure_request_id = uuid4()
        assert await repository.mark_failed(
            FailSkillSet(
                failed_candidate_id,
                activated_version,
                uuid4(),
                failure_request_id,
                failure_request_id,
                uuid4().hex * 2,
                "artifact_invalid",
            )
        )
        failed = await repository.reconcile(failed_candidate_id)
        assert failed.target_state == "failed"
    finally:
        await repository.aclose()


async def test_runtime_role_has_no_base_table_read_privilege() -> None:
    assert RUNTIME_URL is not None
    connection = await psycopg.AsyncConnection.connect(psycopg_url(RUNTIME_URL))
    try:
        with pytest.raises(InsufficientPrivilege):
            await connection.execute("SELECT * FROM skill_registry.agent_skill_sets")
    finally:
        await connection.close()
