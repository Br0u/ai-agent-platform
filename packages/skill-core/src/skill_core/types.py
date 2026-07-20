"""Immutable, shared data contracts for skill packages."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias

MAX_ARCHIVE_BYTES = 5 * 1024 * 1024
MAX_EXTRACTED_BYTES = 20 * 1024 * 1024
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_FILES = 128
MAX_PATH_DEPTH = 8
MAX_PATH_BYTES = 160

FrozenJsonScalar: TypeAlias = str | int | float | bool | None


@dataclass(frozen=True, slots=True)
class FrozenJsonObject:
    """An immutable JSON object that preserves object shape."""

    items: tuple[tuple[str, "FrozenJson"], ...]


@dataclass(frozen=True, slots=True)
class FrozenJsonArray:
    """An immutable JSON array that preserves array shape."""

    items: tuple["FrozenJson", ...]


FrozenJson: TypeAlias = FrozenJsonScalar | FrozenJsonObject | FrozenJsonArray


@dataclass(frozen=True, slots=True)
class SkillFile:
    """A canonical file path and its immutable bytes."""

    path: str
    content: bytes
    sha256: str
    size: int


@dataclass(frozen=True, slots=True)
class SkillManifest:
    """A stable copy of the Agno skill metadata contract."""

    name: str
    description: str
    instructions: str
    scripts: tuple[str, ...]
    references: tuple[str, ...]
    metadata: FrozenJson | None = None
    license: str | None = None
    compatibility: str | None = None
    allowed_tools: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SkillFinding:
    """A deterministic, non-authoritative static review hint."""

    path: str
    line: int
    code: str
    message: str
    blocking: bool = False


@dataclass(frozen=True, slots=True)
class CanonicalSkillPackage:
    """Canonical bytes plus immutable data derived from one skill ZIP."""

    slug: str
    archive: bytes
    sha256: str
    compressed_size: int
    extracted_size: int
    files: tuple[SkillFile, ...]
    manifest: SkillManifest | None
    findings: tuple[SkillFinding, ...]


@dataclass(frozen=True, slots=True)
class SkillFileDiff:
    """Review-only change summary for one canonical path."""

    path: str
    status: str
    diff: str


@dataclass(frozen=True, slots=True)
class SkillPackageDiff:
    """Bounded, review-only diff between two immutable packages."""

    files: tuple[SkillFileDiff, ...]
    truncated: bool
