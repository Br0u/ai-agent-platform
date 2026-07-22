"""Frozen service and persistence contracts for reviewed skill revisions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol
from uuid import UUID

from skill_core.types import (
    CanonicalSkillPackage,
    SkillFinding,
    SkillManifest,
    SkillPackageDiff,
)

RevisionState = Literal["pending_review", "published", "rejected", "archived"]
ReviewDecision = Literal["approve", "reject"]


class RegistryError(RuntimeError):
    """Stable registry error that never includes source or credential material."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True, slots=True)
class ScanPolicy:
    allowed_python_modules: frozenset[str]

    def __post_init__(self) -> None:
        if not isinstance(self.allowed_python_modules, frozenset):
            raise TypeError("allowed_python_modules must be a frozenset")


@dataclass(frozen=True, slots=True)
class CreateUploadRevision:
    actor: UUID
    request_id: UUID
    assertion_nonce: UUID
    package: CanonicalSkillPackage
    target_skill_id: UUID | None


@dataclass(frozen=True, slots=True)
class ReviewAttestations:
    content_reviewed: bool
    usage_rights_confirmed: bool
    execution_risk_accepted: bool
    reviewer_authorization_confirmed: bool

    @property
    def complete(self) -> bool:
        values = (
            self.content_reviewed,
            self.usage_rights_confirmed,
            self.execution_risk_accepted,
            self.reviewer_authorization_confirmed,
        )
        return all(type(value) is bool and value is True for value in values)


@dataclass(frozen=True, slots=True)
class ReviewRevision:
    revision_id: UUID
    reviewer: UUID
    request_id: UUID
    assertion_nonce: UUID
    decision: ReviewDecision
    expected_state: Literal["pending_review"]
    reason: str | None
    attestations: ReviewAttestations
    skill_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class StoredRevision:
    id: UUID
    skill_id: UUID
    skill_slug: str
    revision_no: int
    state: RevisionState
    source_type: str
    manifest: SkillManifest
    findings: tuple[SkillFinding, ...]
    created_by: UUID
    created_at: datetime
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    artifact_sha256: str
    compressed_size: int
    extracted_size: int
    file_count: int


@dataclass(frozen=True, slots=True)
class StoredFile:
    path: str
    sha256: str
    size: int
    media_type: str | None


@dataclass(frozen=True, slots=True)
class SkillSummary:
    id: UUID
    slug: str
    latest_revision_no: int | None
    latest_revision_id: UUID | None
    latest_state: RevisionState | None
    created_at: datetime
    latest_source_type: str | None = None
    latest_artifact_sha256: str | None = None
    latest_created_by: UUID | None = None
    latest_created_at: datetime | None = None
    latest_reviewed_by: UUID | None = None
    latest_reviewed_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class PythonImportSummary:
    modules: tuple[str, ...]
    unavailable_modules: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RevisionDetail:
    revision: StoredRevision
    files: tuple[StoredFile, ...]
    scripts: tuple[StoredFile, ...]
    references: tuple[StoredFile, ...]
    python_imports: PythonImportSummary
    previous_published_revision_id: UUID | None
    diff: SkillPackageDiff | None


class SkillRegistryRepository(Protocol):
    async def create_upload_revision(self, command: CreateUploadRevision) -> StoredRevision: ...

    async def review_revision(self, command: ReviewRevision) -> StoredRevision: ...

    async def list_skills(
        self, *, limit: int = 50, offset: int = 0
    ) -> tuple[SkillSummary, ...]: ...

    async def get_revision(self, skill_id: UUID, revision_id: UUID) -> StoredRevision: ...

    async def list_revision_files(self, revision_id: UUID) -> tuple[StoredFile, ...]: ...

    async def find_previous_published(self, revision: StoredRevision) -> StoredRevision | None: ...
