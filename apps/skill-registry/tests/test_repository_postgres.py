from __future__ import annotations

import asyncio
import hashlib
import io
import os
import stat
import zipfile
from collections.abc import Awaitable
from dataclasses import replace
from typing import cast
from uuid import UUID, uuid4

import psycopg
import pytest

from skill_core import canonicalize_skill_zip
from skill_core.types import CanonicalSkillPackage
from skill_registry.artifact_store import (
    ArtifactConnection,
    ArtifactStoreError,
    PostgresSkillArtifactStore,
)
from skill_registry.repository import PostgresSkillRegistryRepository, RepositoryConnection
from skill_registry.service import SkillSetService
from skill_registry.skill_set_repository import PostgresSkillSetRepository
from skill_registry.types import (
    CreateSkillSet,
    CreateUploadRevision,
    DiscardSkillSet,
    RegistryError,
    ReviewAttestations,
    ReviewRevision,
    StoredRevision,
)


OWNER_URL = os.getenv("SKILL_REGISTRY_TEST_DATABASE_URL")
MANAGER_URL = os.getenv("SKILL_REGISTRY_DATABASE_URL")
MISSING = [
    name
    for name, value in (
        ("SKILL_REGISTRY_TEST_DATABASE_URL", OWNER_URL),
        ("SKILL_REGISTRY_DATABASE_URL", MANAGER_URL),
    )
    if not value
]
pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        bool(MISSING),
        reason=f"missing required registry PostgreSQL DSNs: {', '.join(MISSING)}",
    ),
]


def psycopg_url(value: str) -> str:
    return value.replace("postgresql+psycopg_async://", "postgresql://", 1)


async def connect(value: str) -> psycopg.AsyncConnection[tuple[object, ...]]:
    return await psycopg.AsyncConnection.connect(psycopg_url(value))


def manager_repository_connection() -> Awaitable[RepositoryConnection]:
    assert MANAGER_URL is not None
    return cast(Awaitable[RepositoryConnection], connect(MANAGER_URL))


def manager_artifact_connection() -> Awaitable[ArtifactConnection]:
    assert MANAGER_URL is not None
    return cast(Awaitable[ArtifactConnection], connect(MANAGER_URL))


def build_zip(slug: str, *, instructions: str = "# Demo\n") -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        info = zipfile.ZipInfo(f"{slug}/SKILL.md", (2026, 7, 21, 12, 0, 0))
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | 0o600) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(
            info,
            (
                f"---\nname: {slug}\ndescription: PostgreSQL integration.\n"
                f"license: MIT\n---\n{instructions}"
            ).encode(),
        )
    return output.getvalue()


def create_command(
    package: CanonicalSkillPackage,
    *,
    actor: UUID,
    target_skill_id: UUID | None = None,
    assertion_nonce: UUID | None = None,
) -> CreateUploadRevision:
    return CreateUploadRevision(
        actor=actor,
        request_id=uuid4(),
        assertion_nonce=assertion_nonce or uuid4(),
        package=package,
        target_skill_id=target_skill_id,
    )


async def table_counts_for_slug(slug: str) -> tuple[int, int, int, int, int]:
    assert OWNER_URL is not None
    async with await connect(OWNER_URL) as connection:
        row = await connection.execute(
            """SELECT
              (SELECT count(*) FROM skill_registry.skills WHERE slug = %s),
              (SELECT count(*) FROM skill_registry.skill_revisions AS r
                JOIN skill_registry.skills AS s ON s.id = r.skill_id WHERE s.slug = %s),
              (SELECT count(*) FROM skill_registry.skill_revision_artifacts AS a
                JOIN skill_registry.skills AS s ON s.id = a.skill_id WHERE s.slug = %s),
              (SELECT count(*) FROM skill_registry.skill_revision_files AS f
                JOIN skill_registry.skill_revisions AS r ON r.id = f.revision_id
                JOIN skill_registry.skills AS s ON s.id = r.skill_id WHERE s.slug = %s),
              (SELECT count(*) FROM skill_registry.skill_control_events AS e
                JOIN skill_registry.skill_revisions AS r ON r.id = e.target_id
                JOIN skill_registry.skills AS s ON s.id = r.skill_id WHERE s.slug = %s)""",
            (slug, slug, slug, slug, slug),
        )
        result = await row.fetchone()
        assert result is not None
        counts = cast(tuple[int, int, int, int, int], result)
        return counts


async def test_real_postgres_upload_is_atomic_canonical_and_idempotent() -> None:
    slug = f"pg-skill-{uuid4().hex[:12]}"
    actor = uuid4()
    raw_archive = build_zip(slug)
    package = canonicalize_skill_zip(raw_archive)
    repository = PostgresSkillRegistryRepository(manager_repository_connection)

    created = await repository.create_upload_revision(create_command(package, actor=actor))

    assert created.state == "pending_review"
    assert await table_counts_for_slug(slug) == (1, 1, 1, 1, 1)
    assert raw_archive != package.archive
    assert MANAGER_URL is not None
    async with await connect(MANAGER_URL) as connection:
        cursor = await connection.execute(
            """SELECT archive_bytes, artifact_sha256
            FROM skill_registry.skill_revision_artifacts WHERE revision_id = %s""",
            (created.id,),
        )
        stored = await cursor.fetchone()
        assert stored is not None
        stored_bytes = cast(bytes, stored[0])
        assert stored_bytes == package.archive
        assert hashlib.sha256(stored_bytes).hexdigest() == stored[1] == package.sha256

    repeated = await repository.create_upload_revision(create_command(package, actor=actor))
    assert repeated.id == created.id
    assert await table_counts_for_slug(slug) == (1, 1, 1, 1, 2)

    assert OWNER_URL is not None
    async with await connect(OWNER_URL) as connection:
        events = await connection.execute(
            """SELECT result_code FROM skill_registry.skill_control_events
            WHERE target_id = %s AND event_type = 'revision_created'
            ORDER BY created_at, id""",
            (created.id,),
        )
        assert [row[0] for row in await events.fetchall()] == ["ok", "replay"]

    different = canonicalize_skill_zip(build_zip(slug, instructions="# Changed\n"))
    with pytest.raises(RegistryError) as caught:
        await repository.create_upload_revision(create_command(different, actor=actor))
    assert caught.value.code == "SKILL_NAME_CONFLICT"
    assert await table_counts_for_slug(slug) == (1, 1, 1, 1, 2)


async def test_real_postgres_rejects_forged_package_before_any_database_write() -> None:
    slug = f"pg-rollback-{uuid4().hex[:12]}"
    package = canonicalize_skill_zip(build_zip(slug))
    invalid_file = replace(package.files[0], sha256="not-a-digest")
    invalid_package = replace(package, files=(invalid_file,))
    repository = PostgresSkillRegistryRepository(manager_repository_connection)

    with pytest.raises(RegistryError) as caught:
        await repository.create_upload_revision(create_command(invalid_package, actor=uuid4()))

    assert caught.value.code == "ARTIFACT_DIGEST_MISMATCH"
    assert await table_counts_for_slug(slug) == (0, 0, 0, 0, 0)


async def test_real_postgres_nonce_replay_precedes_business_logic_across_mutations() -> None:
    slug = f"pg-nonce-{uuid4().hex[:12]}"
    actor = uuid4()
    package = canonicalize_skill_zip(build_zip(slug))
    repository = PostgresSkillRegistryRepository(manager_repository_connection)
    upload_nonce = uuid4()

    created = await repository.create_upload_revision(
        create_command(package, actor=actor, assertion_nonce=upload_nonce)
    )

    for replay_package in (
        package,
        canonicalize_skill_zip(build_zip(slug, instructions="# Different\n")),
    ):
        with pytest.raises(RegistryError) as caught:
            await repository.create_upload_revision(
                create_command(
                    replay_package,
                    actor=actor,
                    assertion_nonce=upload_nonce,
                )
            )
        assert caught.value.code == "ASSERTION_REPLAY"

    fresh_replay = await repository.create_upload_revision(
        create_command(package, actor=actor, assertion_nonce=uuid4())
    )
    assert fresh_replay.id == created.id

    with pytest.raises(RegistryError) as caught:
        await repository.review_revision(
            ReviewRevision(
                revision_id=created.id,
                reviewer=uuid4(),
                request_id=uuid4(),
                assertion_nonce=upload_nonce,
                decision="approve",
                expected_state="pending_review",
                reason=None,
                attestations=ReviewAttestations(True, True, True, True),
            )
        )
    assert caught.value.code == "ASSERTION_REPLAY"

    review_nonce = uuid4()
    reviewed = await repository.review_revision(
        ReviewRevision(
            revision_id=created.id,
            reviewer=uuid4(),
            request_id=uuid4(),
            assertion_nonce=review_nonce,
            decision="approve",
            expected_state="pending_review",
            reason=None,
            attestations=ReviewAttestations(True, True, True, True),
        )
    )
    assert reviewed.state == "published"

    other_slug = f"pg-cross-nonce-{uuid4().hex[:12]}"
    with pytest.raises(RegistryError) as caught:
        await repository.create_upload_revision(
            create_command(
                canonicalize_skill_zip(build_zip(other_slug)),
                actor=actor,
                assertion_nonce=review_nonce,
            )
        )
    assert caught.value.code == "ASSERTION_REPLAY"
    assert await table_counts_for_slug(other_slug) == (0, 0, 0, 0, 0)
    assert await table_counts_for_slug(slug) == (1, 1, 1, 1, 3)


async def test_real_postgres_concurrent_nonce_replay_rolls_back_loser() -> None:
    slug = f"pg-concurrent-nonce-{uuid4().hex[:12]}"
    actor = uuid4()
    package = canonicalize_skill_zip(build_zip(slug))
    shared_nonce = uuid4()

    async def upload() -> StoredRevision:
        repository = PostgresSkillRegistryRepository(manager_repository_connection)
        return await repository.create_upload_revision(
            create_command(package, actor=actor, assertion_nonce=shared_nonce)
        )

    results = await asyncio.gather(upload(), upload(), return_exceptions=True)
    successes = [result for result in results if isinstance(result, StoredRevision)]
    failures = [result for result in results if isinstance(result, RegistryError)]

    assert len(successes) == 1
    assert len(failures) == 1
    assert failures[0].code == "ASSERTION_REPLAY"
    assert await table_counts_for_slug(slug) == (1, 1, 1, 1, 1)


async def test_real_postgres_artifact_store_put_and_digest_verification() -> None:
    slug = f"pg-artifact-{uuid4().hex[:12]}"
    package = canonicalize_skill_zip(build_zip(slug))
    actor = uuid4()
    skill_id = uuid4()
    revision_id = uuid4()
    assert MANAGER_URL is not None
    async with await connect(MANAGER_URL) as connection:
        async with connection.transaction():
            await connection.execute(
                "INSERT INTO skill_registry.skills (id, slug, created_by) VALUES (%s, %s, %s)",
                (skill_id, slug, actor),
            )
            await connection.execute(
                """INSERT INTO skill_registry.skill_revisions (
                  id, skill_id, revision_no, state, source_type, manifest, findings, created_by
                ) VALUES (%s, %s, 1, 'pending_review', 'upload', '{}'::jsonb, '[]'::jsonb, %s)""",
                (revision_id, skill_id, actor),
            )
    store = PostgresSkillArtifactStore(manager_artifact_connection)

    await store.put(revision_id, package)
    assert await store.get(revision_id, package.sha256) == package.archive
    with pytest.raises(ArtifactStoreError) as caught:
        await store.get(revision_id, "0" * 64)
    assert caught.value.code == "ARTIFACT_DIGEST_MISMATCH"


async def test_real_postgres_allows_self_review_and_is_concurrency_safe() -> None:
    slug = f"pg-review-{uuid4().hex[:12]}"
    actor = uuid4()
    package = canonicalize_skill_zip(build_zip(slug))
    repository = PostgresSkillRegistryRepository(manager_repository_connection)
    created = await repository.create_upload_revision(create_command(package, actor=actor))

    attestations = ReviewAttestations(True, True, True, True)
    reviewed = await repository.review_revision(
        ReviewRevision(
            revision_id=created.id,
            reviewer=actor,
            request_id=uuid4(),
            assertion_nonce=uuid4(),
            decision="approve",
            expected_state="pending_review",
            reason=None,
            attestations=attestations,
        )
    )
    assert reviewed.state == "published"
    assert reviewed.created_by == actor
    assert reviewed.reviewed_by == actor

    assert OWNER_URL is not None
    async with await connect(OWNER_URL) as connection:
        cursor = await connection.execute(
            """SELECT event.actor, revision.reviewed_by
            FROM skill_registry.skill_control_events AS event
            JOIN skill_registry.skill_revisions AS revision ON revision.id = event.target_id
            WHERE event.target_id = %s AND event.event_type = 'revision_published'""",
            (created.id,),
        )
        assert await cursor.fetchone() == (str(actor), actor)

    concurrent_package = canonicalize_skill_zip(build_zip(slug, instructions="# Changed\n"))
    concurrent = await repository.create_upload_revision(
        create_command(concurrent_package, actor=actor, target_skill_id=created.skill_id)
    )

    async def approve(reviewer: UUID) -> StoredRevision:
        contender = PostgresSkillRegistryRepository(manager_repository_connection)
        return await contender.review_revision(
            ReviewRevision(
                revision_id=concurrent.id,
                reviewer=reviewer,
                request_id=uuid4(),
                assertion_nonce=uuid4(),
                decision="approve",
                expected_state="pending_review",
                reason=None,
                attestations=attestations,
            )
        )

    results = await asyncio.gather(approve(uuid4()), approve(uuid4()), return_exceptions=True)
    successes = [result for result in results if isinstance(result, StoredRevision)]
    failures = [result for result in results if isinstance(result, RegistryError)]
    assert len(successes) == 1
    assert len(failures) == 1
    assert failures[0].code == "REVISION_STATE_CONFLICT"
    assert successes[0].state == "published"

    async with await connect(OWNER_URL) as connection:
        cursor = await connection.execute(
            """SELECT count(*) FROM skill_registry.skill_control_events
            WHERE target_id = %s AND event_type = 'revision_published'""",
            (concurrent.id,),
        )
        row = await cursor.fetchone()
        assert row == (1,)


async def test_real_postgres_queries_previous_published_revision_and_files() -> None:
    slug = f"pg-query-{uuid4().hex[:12]}"
    actor = uuid4()
    reviewer = uuid4()
    repository = PostgresSkillRegistryRepository(manager_repository_connection)
    first_package = canonicalize_skill_zip(build_zip(slug, instructions="# First\n"))
    first = await repository.create_upload_revision(create_command(first_package, actor=actor))
    await repository.review_revision(
        ReviewRevision(
            revision_id=first.id,
            reviewer=reviewer,
            request_id=uuid4(),
            assertion_nonce=uuid4(),
            decision="approve",
            expected_state="pending_review",
            reason=None,
            attestations=ReviewAttestations(True, True, True, True),
        )
    )
    second_package = canonicalize_skill_zip(build_zip(slug, instructions="# Second\n"))
    second = await repository.create_upload_revision(
        create_command(second_package, actor=actor, target_skill_id=first.skill_id)
    )

    summaries = await repository.list_skills()
    loaded = await repository.get_revision(first.skill_id, second.id)
    files = await repository.list_revision_files(second.id)
    previous = await repository.find_previous_published(loaded)

    assert any(summary.id == first.skill_id for summary in summaries)
    assert loaded.id == second.id
    assert [file.path for file in files] == ["SKILL.md"]
    assert previous is not None and previous.id == first.id


async def test_real_postgres_rejection_persists_reason_in_append_only_event() -> None:
    slug = f"pg-reject-{uuid4().hex[:12]}"
    repository = PostgresSkillRegistryRepository(manager_repository_connection)
    created = await repository.create_upload_revision(
        create_command(canonicalize_skill_zip(build_zip(slug)), actor=uuid4())
    )
    reason = "Usage rights were not demonstrated."

    rejected = await repository.review_revision(
        ReviewRevision(
            revision_id=created.id,
            reviewer=uuid4(),
            request_id=uuid4(),
            assertion_nonce=uuid4(),
            decision="reject",
            expected_state="pending_review",
            reason=reason,
            attestations=ReviewAttestations(True, True, True, True),
        )
    )

    assert rejected.state == "rejected"
    assert OWNER_URL is not None
    async with await connect(OWNER_URL) as connection:
        cursor = await connection.execute(
            """SELECT review_reason, content_reviewed, usage_rights_confirmed,
              execution_risk_accepted, reviewer_authorization_confirmed
            FROM skill_registry.skill_control_events
            WHERE target_id = %s AND event_type = 'revision_rejected'""",
            (created.id,),
        )
        assert await cursor.fetchone() == (reason, True, True, True, True)


async def test_real_postgres_skill_set_repository_preserves_order_and_replays() -> None:
    actor = uuid4()
    reviewer = uuid4()
    registry = PostgresSkillRegistryRepository(manager_repository_connection)
    published: list[StoredRevision] = []
    for position in (1, 2):
        package = canonicalize_skill_zip(build_zip(f"pg-set-{position}-{uuid4().hex[:12]}"))
        uploaded = await registry.create_upload_revision(create_command(package, actor=actor))
        published.append(
            await registry.review_revision(
                ReviewRevision(
                    revision_id=uploaded.id,
                    reviewer=reviewer,
                    request_id=uuid4(),
                    assertion_nonce=uuid4(),
                    decision="approve",
                    expected_state="pending_review",
                    reason=None,
                    attestations=ReviewAttestations(True, True, True, True),
                )
            )
        )

    service = SkillSetService(PostgresSkillSetRepository(manager_repository_connection))
    request_id = uuid4()
    ordered_revision_ids = (published[1].id, published[0].id)
    command = CreateSkillSet(
        actor,
        request_id,
        request_id,
        "maduoduo",
        ordered_revision_ids,
    )
    created = await service.create_skill_set(command)
    replayed = await service.create_skill_set(command)

    assert created.replayed is False
    assert created.skill_set.state == "candidate"
    assert created.skill_set.revision_ids == ordered_revision_ids
    assert replayed.replayed is True
    assert replayed.skill_set.id == created.skill_set.id

    status = await service.get_runtime_status("maduoduo")
    loaded = next(item for item in status.candidates if item.id == created.skill_set.id)
    assert loaded.revision_ids == ordered_revision_ids
    available = await service.list_available_revisions(limit=100, offset=0)
    available_ids = {item.revision_id for item in available.items}
    assert set(ordered_revision_ids) <= available_ids
    assert available.total >= 2

    discard_request_id = uuid4()
    discard = DiscardSkillSet(
        actor,
        discard_request_id,
        discard_request_id,
        "maduoduo",
        created.skill_set.id,
    )
    discarded = await service.discard_skill_set(discard)
    discard_replay = await service.discard_skill_set(discard)
    assert discarded.replayed is False
    assert discarded.skill_set.state == "discarded"
    assert discard_replay.replayed is True
    assert discard_replay.skill_set.id == created.skill_set.id

    missing_request_id = uuid4()
    with pytest.raises(RegistryError) as caught:
        await service.discard_skill_set(
            DiscardSkillSet(
                actor,
                missing_request_id,
                missing_request_id,
                "maduoduo",
                uuid4(),
            )
        )
    assert caught.value.code == "SKILL_SET_NOT_FOUND"
