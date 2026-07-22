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
AgentId = Literal["maduoduo"]
SkillSetState = Literal["candidate", "active", "superseded", "failed", "discarded"]


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


@dataclass(frozen=True, slots=True)
class CreateSkillSet:
    actor: UUID
    request_id: UUID
    assertion_nonce: UUID
    agent_id: AgentId
    revision_ids: tuple[UUID, ...]


@dataclass(frozen=True, slots=True)
class DiscardSkillSet:
    actor: UUID
    request_id: UUID
    assertion_nonce: UUID
    agent_id: AgentId
    set_id: UUID


@dataclass(frozen=True, slots=True)
class ClonePreviousSkillSet:
    actor: UUID
    request_id: UUID
    assertion_nonce: UUID
    agent_id: AgentId
    expected_activation_version: int
    expected_previous_set_id: UUID


@dataclass(frozen=True, slots=True)
class StoredSkillSet:
    id: UUID
    agent_id: AgentId
    state: SkillSetState
    revision_ids: tuple[UUID, ...]
    item_count: int
    total_extracted_size: int
    activation_version: int | None
    failure_code: str | None


@dataclass(frozen=True, slots=True)
class CreateSkillSetResult:
    skill_set: StoredSkillSet
    replayed: bool


@dataclass(frozen=True, slots=True)
class SkillRuntimeStatus:
    active: StoredSkillSet | None
    previous: StoredSkillSet | None
    activation_version: int
    candidates: tuple[StoredSkillSet, ...]

    @property
    def candidate_count(self) -> int:
        return len(self.candidates)


@dataclass(frozen=True, slots=True)
class PublishedRevisionOption:
    skill_id: UUID
    revision_id: UUID
    slug: str
    revision_no: int
    artifact_sha256: str
    extracted_size: int


@dataclass(frozen=True, slots=True)
class PublishedRevisionPage:
    items: tuple[PublishedRevisionOption, ...]
    limit: int
    offset: int
    total: int


class SkillRegistryRepository(Protocol):
    async def create_upload_revision(self, command: CreateUploadRevision) -> StoredRevision: ...

    async def review_revision(self, command: ReviewRevision) -> StoredRevision: ...

    async def list_skills(
        self, *, limit: int = 50, offset: int = 0
    ) -> tuple[SkillSummary, ...]: ...

    async def get_revision(self, skill_id: UUID, revision_id: UUID) -> StoredRevision: ...

    async def list_revision_files(self, revision_id: UUID) -> tuple[StoredFile, ...]: ...

    async def find_previous_published(self, revision: StoredRevision) -> StoredRevision | None: ...


class SkillSetRepository(Protocol):
    async def resolve_published_revisions(
        self, revision_ids: tuple[UUID, ...]
    ) -> tuple[PublishedRevisionOption, ...]: ...

    async def create_skill_set(
        self, command: CreateSkillSet, request_fingerprint: str
    ) -> CreateSkillSetResult: ...

    async def discard_skill_set(
        self, command: DiscardSkillSet, request_fingerprint: str
    ) -> CreateSkillSetResult: ...

    async def clone_previous_skill_set(
        self, command: ClonePreviousSkillSet, request_fingerprint: str
    ) -> CreateSkillSetResult: ...

    async def get_runtime_status(self, agent_id: AgentId) -> SkillRuntimeStatus: ...

    async def list_available_revisions(
        self, *, limit: int, offset: int
    ) -> tuple[tuple[PublishedRevisionOption, ...], int]: ...
