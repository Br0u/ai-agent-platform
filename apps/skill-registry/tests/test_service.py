from __future__ import annotations

import hashlib
import io
import stat
import zipfile
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from skill_core.archive import canonicalize_skill_archive
from skill_core.types import MAX_FILE_BYTES, CanonicalSkillPackage
from skill_registry.service import SkillRegistryService
from skill_registry.types import (
    CreateUploadRevision,
    RegistryError,
    ReviewAttestations,
    ReviewRevision,
    ScanPolicy,
    SkillSummary,
    StoredFile,
    StoredRevision,
)


ACTOR = UUID("00000000-0000-4000-8000-000000000001")
REVIEWER = UUID("00000000-0000-4000-8000-000000000002")
SKILL_ID = UUID("10000000-0000-4000-8000-000000000001")
NOW = datetime(2026, 7, 21, tzinfo=UTC)


def build_zip(
    *,
    instructions: str = "# Demo\n",
    script: bytes = b"#!/usr/bin/env python3\nimport third_party\nimport pathlib\n",
    reference: bytes = b"# Guide\n",
) -> bytes:
    skill_md = (
        f"---\nname: demo-skill\ndescription: A demo skill.\nlicense: MIT\n---\n{instructions}"
    ).encode()
    files = {
        "demo-skill/SKILL.md": skill_md,
        "demo-skill/scripts/run.py": script,
        "demo-skill/references/guide.md": reference,
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            info = zipfile.ZipInfo(path, (2026, 7, 20, 12, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
    return output.getvalue()


class MemoryArtifactStore:
    def __init__(self) -> None:
        self.artifacts: dict[UUID, bytes] = {}
        self.expected_reads: list[tuple[UUID, str, int | None]] = []

    async def put(self, revision_id: UUID, artifact: CanonicalSkillPackage) -> None:
        self.artifacts[revision_id] = artifact.archive

    async def get(
        self,
        revision_id: UUID,
        expected_sha256: str,
        expected_compressed_size: int | None = None,
    ) -> bytes:
        self.expected_reads.append((revision_id, expected_sha256, expected_compressed_size))
        artifact = self.artifacts[revision_id]
        if hashlib.sha256(artifact).hexdigest() != expected_sha256:
            raise RegistryError("ARTIFACT_DIGEST_MISMATCH", "Artifact verification failed")
        return artifact


class MemoryRepository:
    def __init__(self, store: MemoryArtifactStore) -> None:
        self.store = store
        self.revisions: list[StoredRevision] = []
        self.files: dict[UUID, tuple[StoredFile, ...]] = {}
        self.uploads: list[CreateUploadRevision] = []
        self.reviews: list[ReviewRevision] = []

    async def create_upload_revision(self, command: CreateUploadRevision) -> StoredRevision:
        self.uploads.append(command)
        revision_id = uuid4()
        revision = StoredRevision(
            id=revision_id,
            skill_id=command.target_skill_id or SKILL_ID,
            skill_slug=command.package.manifest.name,
            revision_no=len(self.revisions) + 1,
            state="pending_review",
            source_type="upload",
            manifest=command.package.manifest,
            findings=command.package.findings,
            created_by=command.actor,
            created_at=NOW,
            reviewed_by=None,
            reviewed_at=None,
            artifact_sha256=command.package.sha256,
            compressed_size=command.package.compressed_size,
            extracted_size=command.package.extracted_size,
            file_count=len(command.package.files),
        )
        self.revisions.append(revision)
        self.files[revision_id] = tuple(
            StoredFile(file.path, file.sha256, file.size, "text/plain")
            for file in command.package.files
        )
        await self.store.put(revision_id, command.package)
        return revision

    async def review_revision(self, command: ReviewRevision) -> StoredRevision:
        self.reviews.append(command)
        revision = next(item for item in self.revisions if item.id == command.revision_id)
        updated = replace(
            revision,
            state="published" if command.decision == "approve" else "rejected",
            reviewed_by=command.reviewer,
            reviewed_at=NOW,
        )
        self.revisions[self.revisions.index(revision)] = updated
        return updated

    async def list_skills(self, *, limit: int = 50, offset: int = 0) -> tuple[SkillSummary, ...]:
        assert 1 <= limit <= 100
        assert offset >= 0
        latest = self.revisions[-1] if self.revisions else None
        return (
            SkillSummary(
                SKILL_ID,
                "demo-skill",
                None if latest is None else latest.revision_no,
                None if latest is None else latest.id,
                None if latest is None else latest.state,
                NOW,
            ),
        )

    async def get_revision(self, skill_id: UUID, revision_id: UUID) -> StoredRevision:
        for revision in self.revisions:
            if revision.skill_id == skill_id and revision.id == revision_id:
                return revision
        raise RegistryError("REVISION_NOT_FOUND", "Revision does not exist")

    async def list_revision_files(self, revision_id: UUID) -> tuple[StoredFile, ...]:
        return self.files[revision_id]

    async def find_previous_published(self, revision: StoredRevision) -> StoredRevision | None:
        candidates = [
            item
            for item in self.revisions
            if item.skill_id == revision.skill_id
            and item.revision_no < revision.revision_no
            and item.state == "published"
        ]
        return max(candidates, key=lambda item: item.revision_no, default=None)


def service(
    allowed: frozenset[str] = frozenset(),
) -> tuple[SkillRegistryService, MemoryRepository, MemoryArtifactStore]:
    store = MemoryArtifactStore()
    repository = MemoryRepository(store)
    return SkillRegistryService(repository, store, ScanPolicy(allowed)), repository, store


def assert_exception_is_scrubbed(error: BaseException, secret: bytes) -> None:
    seen: set[int] = set()
    pending: list[BaseException] = [error]
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        assert secret not in repr(current.args).encode("utf-8", errors="replace")
        error_object = getattr(current, "object", None)
        if isinstance(error_object, bytes):
            assert secret not in error_object
        if current.__cause__ is not None:
            pending.append(current.__cause__)
        if current.__context__ is not None:
            pending.append(current.__context__)
    assert error.__cause__ is None
    assert error.__context__ is None


@pytest.mark.asyncio
async def test_upload_uses_explicit_frozen_allowlist_and_stores_canonical_only() -> None:
    registry, repository, store = service()

    detail = await registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(),
        target_skill_id=None,
    )

    package = repository.uploads[0].package
    assert detail.revision.state == "pending_review"
    assert [item.code for item in package.findings].count("unsupported_import") == 1
    assert package.findings[0].path == "scripts/run.py"
    assert store.artifacts[detail.revision.id] == package.archive
    assert store.artifacts[detail.revision.id] != build_zip()

    allowed_registry, allowed_repository, _ = service(frozenset({"third_party"}))
    await allowed_registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(),
        target_skill_id=None,
    )
    assert not any(
        finding.code == "unsupported_import"
        for finding in allowed_repository.uploads[0].package.findings
    )


def test_scan_policy_rejects_mutable_or_implicit_allowlist() -> None:
    with pytest.raises(TypeError):
        ScanPolicy({"third_party"})  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "field",
    [
        "content_reviewed",
        "usage_rights_confirmed",
        "execution_risk_accepted",
        "reviewer_authorization_confirmed",
    ],
)
@pytest.mark.parametrize("invalid", [False, 1, "true", object(), [True]])
def test_attestations_require_all_four_values_to_be_exact_boolean_true(
    field: str, invalid: object
) -> None:
    values: dict[str, object] = {
        "content_reviewed": True,
        "usage_rights_confirmed": True,
        "execution_risk_accepted": True,
        "reviewer_authorization_confirmed": True,
    }
    values[field] = invalid
    attestations = ReviewAttestations(**values)  # type: ignore[arg-type]

    assert attestations.complete is False


@pytest.mark.asyncio
async def test_detail_verifies_artifact_and_returns_review_bundle_and_previous_diff() -> None:
    registry, repository, store = service()
    first = await registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(instructions="# Version one\n"),
        target_skill_id=None,
    )
    repository.revisions[0] = replace(
        repository.revisions[0],
        state="published",
        reviewed_by=REVIEWER,
        reviewed_at=NOW,
    )
    second = await registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(instructions="# Version two\n"),
        target_skill_id=SKILL_ID,
    )

    detail = await registry.get_revision_detail(SKILL_ID, second.revision.id)

    assert detail.revision.manifest.license == "MIT"
    assert [file.path for file in detail.scripts] == ["scripts/run.py"]
    assert [file.path for file in detail.references] == ["references/guide.md"]
    assert detail.python_imports.modules == ("pathlib", "third_party")
    assert detail.python_imports.unavailable_modules == ("third_party",)
    assert detail.previous_published_revision_id == first.revision.id
    assert detail.diff is not None
    assert detail.diff.truncated is False
    assert "Version one" in detail.diff.files[0].diff
    assert "Version two" in detail.diff.files[0].diff
    assert store.expected_reads[-2:] == [
        (
            second.revision.id,
            second.revision.artifact_sha256,
            second.revision.compressed_size,
        ),
        (
            first.revision.id,
            first.revision.artifact_sha256,
            first.revision.compressed_size,
        ),
    ]


@pytest.mark.asyncio
async def test_file_read_allows_only_verified_indexed_utf8_content() -> None:
    registry, repository, store = service()
    detail = await registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(),
        target_skill_id=None,
    )

    text = await registry.get_file_text(SKILL_ID, detail.revision.id, "references/guide.md")
    assert text == "# Guide\n"

    with pytest.raises(RegistryError) as caught:
        await registry.get_file_text(SKILL_ID, detail.revision.id, "../SKILL.md")
    assert caught.value.code == "FILE_NOT_FOUND"

    indexed = repository.files[detail.revision.id]
    repository.files[detail.revision.id] = tuple(
        replace(file, sha256="0" * 64) if file.path == "references/guide.md" else file
        for file in indexed
    )
    with pytest.raises(RegistryError) as caught:
        await registry.get_file_text(SKILL_ID, detail.revision.id, "references/guide.md")
    assert caught.value.code == "ARTIFACT_DIGEST_MISMATCH"

    binary_archive = canonicalize_skill_archive(build_zip(reference=b"\xff\xfe"))
    binary_package = CanonicalSkillPackage(
        slug=binary_archive.slug,
        archive=binary_archive.archive,
        sha256=binary_archive.sha256,
        compressed_size=binary_archive.compressed_size,
        extracted_size=binary_archive.extracted_size,
        files=binary_archive.files,
        manifest=detail.revision.manifest,
        findings=(),
    )
    binary_revision = replace(
        detail.revision,
        id=uuid4(),
        artifact_sha256=binary_package.sha256,
        compressed_size=binary_package.compressed_size,
        extracted_size=binary_package.extracted_size,
        file_count=len(binary_package.files),
    )
    repository.revisions.append(binary_revision)
    repository.files[binary_revision.id] = tuple(
        StoredFile(file.path, file.sha256, file.size, "text/plain") for file in binary_package.files
    )
    await store.put(binary_revision.id, binary_package)
    with pytest.raises(RegistryError) as caught:
        await registry.get_file_text(SKILL_ID, binary_revision.id, "references/guide.md")
    assert caught.value.code == "SKILL_FILE_NOT_UTF8"
    assert_exception_is_scrubbed(caught.value, b"\xff\xfe")


@pytest.mark.asyncio
async def test_file_read_rejects_oversized_index_before_artifact_read() -> None:
    registry, repository, store = service()
    detail = await registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(),
        target_skill_id=None,
    )
    previous_read_count = len(store.expected_reads)
    repository.files[detail.revision.id] = tuple(
        replace(file, size=MAX_FILE_BYTES + 1) if file.path == "references/guide.md" else file
        for file in repository.files[detail.revision.id]
    )

    with pytest.raises(RegistryError) as caught:
        await registry.get_file_text(SKILL_ID, detail.revision.id, "references/guide.md")

    assert caught.value.code == "SKILL_FILE_TOO_LARGE"
    assert len(store.expected_reads) == previous_read_count


@pytest.mark.asyncio
async def test_revision_uploader_can_approve_with_complete_attestations() -> None:
    registry, repository, _ = service(frozenset({"third_party"}))
    detail = await registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(),
        target_skill_id=None,
    )
    command = ReviewRevision(
        revision_id=detail.revision.id,
        reviewer=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        decision="approve",
        expected_state="pending_review",
        reason=None,
        attestations=ReviewAttestations(
            content_reviewed=True,
            usage_rights_confirmed=True,
            execution_risk_accepted=True,
            reviewer_authorization_confirmed=True,
        ),
        skill_id=SKILL_ID,
    )

    reviewed = await registry.review_revision(command)

    assert reviewed.state == "published"
    assert reviewed.reviewed_by == ACTOR
    assert repository.reviews == [command]


@pytest.mark.asyncio
async def test_review_service_rejects_truthy_non_boolean_attestation() -> None:
    registry, repository, _ = service(frozenset({"third_party"}))
    detail = await registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(),
        target_skill_id=None,
    )
    command = ReviewRevision(
        revision_id=detail.revision.id,
        reviewer=REVIEWER,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        decision="approve",
        expected_state="pending_review",
        reason=None,
        attestations=ReviewAttestations(
            content_reviewed=1,  # type: ignore[arg-type]
            usage_rights_confirmed=True,
            execution_risk_accepted=True,
            reviewer_authorization_confirmed=True,
        ),
        skill_id=SKILL_ID,
    )

    with pytest.raises(RegistryError) as caught:
        await registry.review_revision(command)

    assert caught.value.code == "VALIDATION_ERROR"
    assert repository.reviews == []


@pytest.mark.asyncio
async def test_detail_rejects_file_index_that_does_not_exactly_match_artifact() -> None:
    registry, repository, _ = service(frozenset({"third_party"}))
    detail = await registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(),
        target_skill_id=None,
    )
    repository.files[detail.revision.id] = repository.files[detail.revision.id][:-1]

    with pytest.raises(RegistryError) as caught:
        await registry.get_revision_detail(SKILL_ID, detail.revision.id)

    assert caught.value.code == "ARTIFACT_DIGEST_MISMATCH"


@pytest.mark.asyncio
async def test_upload_scrubs_archive_bytes_from_validation_exception_chain() -> None:
    registry, _, _ = service()
    secret = b"secret-archive-body"

    with pytest.raises(RegistryError) as caught:
        await registry.upload_zip(
            actor=ACTOR,
            request_id=uuid4(),
            assertion_nonce=uuid4(),
            archive=build_zip(reference=b"\xff" + secret),
            target_skill_id=None,
        )

    assert caught.value.code == "SKILL_FILE_NOT_UTF8"
    assert_exception_is_scrubbed(caught.value, secret)


@pytest.mark.asyncio
async def test_detail_scrubs_invalid_stored_archive_from_exception_chain() -> None:
    registry, repository, store = service(frozenset({"third_party"}))
    detail = await registry.upload_zip(
        actor=ACTOR,
        request_id=uuid4(),
        assertion_nonce=uuid4(),
        archive=build_zip(),
        target_skill_id=None,
    )
    secret = b"secret-stored-archive"
    invalid = b"not-a-zip:" + secret
    repository.revisions[0] = replace(
        repository.revisions[0],
        artifact_sha256=hashlib.sha256(invalid).hexdigest(),
        compressed_size=len(invalid),
    )
    store.artifacts[detail.revision.id] = invalid

    with pytest.raises(RegistryError) as caught:
        await registry.get_revision_detail(SKILL_ID, detail.revision.id)

    assert caught.value.code == "ARTIFACT_DIGEST_MISMATCH"
    assert_exception_is_scrubbed(caught.value, secret)
