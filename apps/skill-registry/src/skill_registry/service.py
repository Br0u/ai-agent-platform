"""Application service for upload, review material, and two-person review."""

from __future__ import annotations

import ast
import hashlib
import json
import sys
from dataclasses import replace
from uuid import UUID

from skill_core import canonicalize_skill_zip
from skill_core.archive import SkillPackageError, canonicalize_skill_archive
from skill_core.diff import diff_packages
from skill_core.scanner import scan
from skill_core.types import MAX_FILE_BYTES, CanonicalSkillPackage, SkillFile
from skill_registry.artifact_store import ArtifactStoreError, SkillArtifactStore
from skill_registry.types import (
    AgentId,
    ClonePreviousSkillSet,
    CreateSkillSet,
    CreateSkillSetResult,
    CreateUploadRevision,
    DiscardSkillSet,
    PublishedRevisionPage,
    PythonImportSummary,
    RegistryError,
    ReviewRevision,
    RevisionDetail,
    ScanPolicy,
    SkillRegistryRepository,
    SkillRuntimeStatus,
    SkillSetRepository,
    SkillSummary,
    StoredFile,
    StoredRevision,
)


_POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807


def _request_fingerprint(content: dict[str, object]) -> str:
    encoded = json.dumps(
        content,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("ascii")
    return hashlib.sha256(encoded).hexdigest()


class SkillSetService:
    """Validate fixed-Agent candidate commands before the database state machine."""

    def __init__(self, repository: SkillSetRepository) -> None:
        self._repository = repository

    @staticmethod
    def _validate_mutation(*, agent_id: str, request_id: UUID, assertion_nonce: UUID) -> AgentId:
        if agent_id != "maduoduo" or assertion_nonce != request_id:
            raise RegistryError("CANDIDATE_INVALID", "Skill set mutation is invalid")
        return "maduoduo"

    async def create_skill_set(self, command: CreateSkillSet) -> CreateSkillSetResult:
        self._validate_mutation(
            agent_id=command.agent_id,
            request_id=command.request_id,
            assertion_nonce=command.assertion_nonce,
        )
        revision_ids = command.revision_ids
        if (
            type(revision_ids) is not tuple
            or len(revision_ids) > 16
            or len(set(revision_ids)) != len(revision_ids)
        ):
            raise RegistryError("CANDIDATE_INVALID", "Skill set revisions are invalid")
        options = await self._repository.resolve_published_revisions(revision_ids)
        indexed = {option.revision_id: option for option in options}
        if len(indexed) != len(options) or indexed.keys() != set(revision_ids):
            raise RegistryError("CANDIDATE_INVALID", "Published revisions are unavailable")
        ordered = tuple(indexed[revision_id] for revision_id in revision_ids)
        if len({option.skill_id for option in ordered}) != len(ordered):
            raise RegistryError("CANDIDATE_INVALID", "A Skill may appear only once")
        fingerprint = _request_fingerprint(
            {
                "action": "skill_set_create",
                "agentId": command.agent_id,
                "revisionIds": [str(revision_id) for revision_id in revision_ids],
            }
        )
        return await self._repository.create_skill_set(command, fingerprint)

    async def discard_skill_set(self, command: DiscardSkillSet) -> CreateSkillSetResult:
        self._validate_mutation(
            agent_id=command.agent_id,
            request_id=command.request_id,
            assertion_nonce=command.assertion_nonce,
        )
        fingerprint = _request_fingerprint(
            {
                "action": "skill_set_discard",
                "agentId": command.agent_id,
                "setId": str(command.set_id),
            }
        )
        return await self._repository.discard_skill_set(command, fingerprint)

    async def clone_previous_skill_set(
        self, command: ClonePreviousSkillSet
    ) -> CreateSkillSetResult:
        self._validate_mutation(
            agent_id=command.agent_id,
            request_id=command.request_id,
            assertion_nonce=command.assertion_nonce,
        )
        if type(command.expected_activation_version) is not int or not (
            1 <= command.expected_activation_version <= _POSTGRES_BIGINT_MAX
        ):
            raise RegistryError("CANDIDATE_INVALID", "Rollback pointer is invalid")
        fingerprint = _request_fingerprint(
            {
                "action": "skill_set_clone",
                "agentId": command.agent_id,
                "expectedActivationVersion": command.expected_activation_version,
                "expectedPreviousSetId": str(command.expected_previous_set_id),
            }
        )
        return await self._repository.clone_previous_skill_set(command, fingerprint)

    async def get_runtime_status(self, agent_id: str) -> SkillRuntimeStatus:
        if agent_id != "maduoduo":
            raise RegistryError("CANDIDATE_INVALID", "Agent id is invalid")
        return await self._repository.get_runtime_status("maduoduo")

    async def list_available_revisions(self, *, limit: int, offset: int) -> PublishedRevisionPage:
        if type(limit) is not int or not 1 <= limit <= 100:
            raise RegistryError("CANDIDATE_INVALID", "Pagination bounds are invalid")
        if type(offset) is not int or offset < 0:
            raise RegistryError("CANDIDATE_INVALID", "Pagination bounds are invalid")
        items, total = await self._repository.list_available_revisions(limit=limit, offset=offset)
        return PublishedRevisionPage(items, limit, offset, total)


class SkillRegistryService:
    """Narrow orchestration boundary with an explicitly injected scan policy."""

    def __init__(
        self,
        repository: SkillRegistryRepository,
        artifact_store: SkillArtifactStore,
        scan_policy: ScanPolicy,
    ) -> None:
        self._repository = repository
        self._artifact_store = artifact_store
        self._scan_policy = scan_policy

    async def upload_zip(
        self,
        *,
        actor: UUID,
        request_id: UUID,
        assertion_nonce: UUID,
        archive: bytes,
        target_skill_id: UUID | None,
    ) -> RevisionDetail:
        package_error_code: str | None = None
        package = None
        try:
            package = canonicalize_skill_zip(archive)
        except SkillPackageError as error:
            package_error_code = error.code
        except Exception:
            package_error_code = "ARCHIVE_INVALID"
        if package_error_code is not None or package is None:
            raise RegistryError(
                package_error_code or "ARCHIVE_INVALID",
                "Skill package validation failed",
            ) from None
        scan_failed = False
        try:
            findings = scan(
                package,
                allowed_python_modules=self._scan_policy.allowed_python_modules,
            )
        except Exception:
            scan_failed = True
            findings = ()
        if scan_failed:
            raise RegistryError("SKILL_SCAN_FAILED", "Skill package scan failed") from None
        package = replace(package, findings=findings)
        revision = await self._repository.create_upload_revision(
            CreateUploadRevision(
                actor=actor,
                request_id=request_id,
                assertion_nonce=assertion_nonce,
                package=package,
                target_skill_id=target_skill_id,
            )
        )
        return await self.get_revision_detail(revision.skill_id, revision.id)

    async def list_skills(self, *, limit: int = 50, offset: int = 0) -> tuple[SkillSummary, ...]:
        if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or offset < 0:
            raise RegistryError("VALIDATION_ERROR", "Pagination bounds are invalid")
        return await self._repository.list_skills(limit=limit, offset=offset)

    async def get_revision_detail(self, skill_id: UUID, revision_id: UUID) -> RevisionDetail:
        revision = await self._repository.get_revision(skill_id, revision_id)
        files = await self._repository.list_revision_files(revision_id)
        package = await self._load_verified_package(revision, files)
        previous = await self._repository.find_previous_published(revision)
        package_diff = None
        if previous is not None:
            previous_files = await self._repository.list_revision_files(previous.id)
            previous_package = await self._load_verified_package(previous, previous_files)
            package_diff = diff_packages(previous_package, package)
        return RevisionDetail(
            revision=revision,
            files=files,
            scripts=tuple(file for file in files if file.path.startswith("scripts/")),
            references=tuple(file for file in files if file.path.startswith("references/")),
            python_imports=self._summarize_python_imports(package.files),
            previous_published_revision_id=None if previous is None else previous.id,
            diff=package_diff,
        )

    async def get_file_text(self, skill_id: UUID, revision_id: UUID, path: str) -> str:
        revision = await self._repository.get_revision(skill_id, revision_id)
        files = await self._repository.list_revision_files(revision_id)
        indexed = next((file for file in files if file.path == path), None)
        if indexed is None:
            raise RegistryError("FILE_NOT_FOUND", "Skill file is not available")
        if indexed.size > MAX_FILE_BYTES:
            raise RegistryError("SKILL_FILE_TOO_LARGE", "Skill file is too large")
        package = await self._load_verified_package(revision, files)
        file = next(item for item in package.files if item.path == indexed.path)
        decode_failed = False
        try:
            text = file.content.decode("utf-8")
        except UnicodeDecodeError:
            decode_failed = True
            text = ""
        if decode_failed:
            raise RegistryError(
                "SKILL_FILE_NOT_UTF8", "Skill file is not valid UTF-8 text"
            ) from None
        return text

    async def review_revision(self, command: ReviewRevision) -> StoredRevision:
        if command.skill_id is None or not command.attestations.complete:
            raise RegistryError("VALIDATION_ERROR", "All review attestations are required")
        return await self._repository.review_revision(command)

    async def _load_verified_package(
        self, revision: StoredRevision, files: tuple[StoredFile, ...]
    ) -> CanonicalSkillPackage:
        artifact_error: tuple[str, str] | None = None
        artifact = b""
        try:
            artifact = await self._artifact_store.get(
                revision.id,
                revision.artifact_sha256,
                revision.compressed_size,
            )
        except ArtifactStoreError as error:
            artifact_error = (error.code, "Skill artifact retrieval failed")
        except Exception:
            artifact_error = ("ARTIFACT_STORAGE_ERROR", "Skill artifact retrieval failed")
        if artifact_error is not None:
            raise RegistryError(*artifact_error) from None
        canonicalization_failed = False
        try:
            canonical = canonicalize_skill_archive(artifact)
        except Exception:
            canonicalization_failed = True
            canonical = None
        if canonicalization_failed or canonical is None:
            raise RegistryError(
                "ARTIFACT_DIGEST_MISMATCH", "Stored skill artifact is invalid"
            ) from None
        if (
            canonical.sha256 != revision.artifact_sha256
            or canonical.compressed_size != revision.compressed_size
            or canonical.extracted_size != revision.extracted_size
            or len(canonical.files) != revision.file_count
            or canonical.slug != revision.skill_slug
            or revision.manifest.name != revision.skill_slug
        ):
            raise RegistryError(
                "ARTIFACT_DIGEST_MISMATCH", "Stored skill artifact metadata does not match"
            )
        canonical_files = {file.path: file for file in canonical.files}
        indexed_files = {file.path: file for file in files}
        if len(indexed_files) != len(files) or canonical_files.keys() != indexed_files.keys():
            raise RegistryError(
                "ARTIFACT_DIGEST_MISMATCH", "Stored skill file index does not match"
            )
        for path, canonical_file in canonical_files.items():
            indexed_file = indexed_files[path]
            if (
                canonical_file.sha256 != indexed_file.sha256
                or canonical_file.size != indexed_file.size
            ):
                raise RegistryError(
                    "ARTIFACT_DIGEST_MISMATCH", "Stored skill file digest does not match"
                )
        return CanonicalSkillPackage(
            slug=canonical.slug,
            archive=canonical.archive,
            sha256=canonical.sha256,
            compressed_size=canonical.compressed_size,
            extracted_size=canonical.extracted_size,
            files=canonical.files,
            manifest=revision.manifest,
            findings=revision.findings,
        )

    def _summarize_python_imports(self, files: tuple[SkillFile, ...]) -> PythonImportSummary:
        modules: set[str] = set()
        for file in files:
            if not file.path.endswith(".py"):
                continue
            try:
                tree = ast.parse(file.content.decode("utf-8"), filename=file.path)
            except (SyntaxError, UnicodeDecodeError):
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules.update(alias.name.split(".", 1)[0] for alias in node.names)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    modules.add(node.module.split(".", 1)[0])
        ordered = tuple(sorted(modules, key=str.encode))
        available = sys.stdlib_module_names | self._scan_policy.allowed_python_modules
        unavailable = tuple(module for module in ordered if module not in available)
        return PythonImportSummary(ordered, unavailable)
