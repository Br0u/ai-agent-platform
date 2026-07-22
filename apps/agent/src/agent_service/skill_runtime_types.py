"""Immutable contracts for the reviewed Skill runtime."""

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Literal
from uuid import UUID

from skill_core.types import CanonicalSkillPackage


SkillSetState = Literal["candidate", "active", "superseded", "failed", "discarded"]
_FINGERPRINT = re.compile(r"[0-9a-f]{64}\Z")
_FAILURE_CODE = re.compile(r"[a-z0-9][a-z0-9_]{0,63}\Z")
_BIGINT_MAX = 9_223_372_036_854_775_807


@dataclass(frozen=True, slots=True)
class RuntimeSkillFile:
    path: str
    sha256: str
    size: int
    media_type: str | None


@dataclass(frozen=True, slots=True)
class RuntimeSkillArtifact:
    ordinal: int
    skill_id: UUID
    revision_id: UUID
    slug: str
    artifact_sha256: str
    compressed_size: int
    extracted_size: int
    file_count: int
    file_index: tuple[RuntimeSkillFile, ...]
    package: CanonicalSkillPackage = field(repr=False)


@dataclass(frozen=True, slots=True)
class RuntimeSetSnapshot:
    set_id: UUID
    state: SkillSetState
    item_count: int
    total_extracted_size: int
    items: tuple[RuntimeSkillArtifact, ...]
    activation_version: int | None = None
    previous_set_id: UUID | None = None


def _validate_mutation(
    *,
    set_id: UUID,
    expected_activation_version: int,
    actor: UUID,
    request_id: UUID,
    assertion_nonce: UUID,
    request_fingerprint: str,
) -> None:
    if (
        type(set_id) is not UUID
        or type(actor) is not UUID
        or type(request_id) is not UUID
        or type(assertion_nonce) is not UUID
        or assertion_nonce != request_id
        or type(expected_activation_version) is not int
        or not 0 <= expected_activation_version <= _BIGINT_MAX
        or type(request_fingerprint) is not str
        or _FINGERPRINT.fullmatch(request_fingerprint) is None
    ):
        raise ValueError("invalid Skill runtime mutation")


@dataclass(frozen=True, slots=True)
class ActivateSkillSet:
    set_id: UUID
    expected_activation_version: int
    actor: UUID
    request_id: UUID
    assertion_nonce: UUID
    request_fingerprint: str

    def __post_init__(self) -> None:
        _validate_mutation(
            set_id=self.set_id,
            expected_activation_version=self.expected_activation_version,
            actor=self.actor,
            request_id=self.request_id,
            assertion_nonce=self.assertion_nonce,
            request_fingerprint=self.request_fingerprint,
        )


@dataclass(frozen=True, slots=True)
class FailSkillSet:
    set_id: UUID
    expected_activation_version: int
    actor: UUID
    request_id: UUID
    assertion_nonce: UUID
    request_fingerprint: str
    failure_code: str

    def __post_init__(self) -> None:
        _validate_mutation(
            set_id=self.set_id,
            expected_activation_version=self.expected_activation_version,
            actor=self.actor,
            request_id=self.request_id,
            assertion_nonce=self.assertion_nonce,
            request_fingerprint=self.request_fingerprint,
        )
        if (
            type(self.failure_code) is not str
            or _FAILURE_CODE.fullmatch(self.failure_code) is None
        ):
            raise ValueError("invalid Skill runtime failure code")


@dataclass(frozen=True, slots=True)
class ReconcileResult:
    active_set_id: UUID | None
    previous_set_id: UUID | None
    activation_version: int
    target_state: SkillSetState | None
