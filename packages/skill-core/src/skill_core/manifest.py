"""Agno-backed manifest validation with immutable output."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from tempfile import TemporaryDirectory

from agno.skills import LocalSkills, validate_skill_directory

from .archive import SkillPackageError
from .types import (
    CanonicalSkillPackage,
    FrozenJson,
    FrozenJsonArray,
    FrozenJsonObject,
    SkillManifest,
)

_ALLOWED_SCRIPT_SHEBANGS = frozenset(
    {
        "#!/bin/sh",
        "#!/usr/bin/env python3",
        "#!/usr/bin/env sh",
        "#!/usr/bin/python3",
    }
)


def parse_skill_manifest(package: CanonicalSkillPackage) -> SkillManifest:
    """Validate one canonical package with Agno and return a frozen DTO."""

    decoded_files = _validate_text_files(package)
    try:
        with TemporaryDirectory(prefix="skill-core-") as temporary_directory:
            skill_root = Path(temporary_directory) / package.slug
            skill_root.mkdir()
            for file in package.files:
                destination = skill_root / file.path
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_text(decoded_files[file.path], encoding="utf-8", newline="")

            validation_errors = validate_skill_directory(skill_root)
            if validation_errors:
                raise SkillPackageError("MANIFEST_INVALID", "Skill manifest failed Agno validation")

            loaded = LocalSkills(str(skill_root), validate=True).load()
            if len(loaded) != 1:
                raise SkillPackageError("MANIFEST_INVALID", "Agno did not load exactly one skill")
            skill = loaded[0]
            return SkillManifest(
                name=skill.name,
                description=skill.description,
                instructions=skill.instructions,
                scripts=tuple(skill.scripts),
                references=tuple(skill.references),
                metadata=_freeze_json(skill.metadata) if skill.metadata is not None else None,
                license=skill.license,
                compatibility=skill.compatibility,
                allowed_tools=tuple(skill.allowed_tools or ()),
            )
    except SkillPackageError:
        raise
    except Exception as error:
        raise SkillPackageError("MANIFEST_INVALID", "Skill manifest processing failed") from error


def _validate_text_files(package: CanonicalSkillPackage) -> dict[str, str]:
    decoded: dict[str, str] = {}
    for file in package.files:
        if b"\x00" in file.content:
            raise SkillPackageError(
                "SKILL_BINARY_FILE", "Binary skill files are not allowed", path=file.path
            )
        try:
            text = file.content.decode("utf-8")
        except UnicodeDecodeError as error:
            raise SkillPackageError(
                "SKILL_FILE_NOT_UTF8", "Skill files must be UTF-8", path=file.path
            ) from error
        if file.path.startswith("scripts/"):
            shebang = text.splitlines()[0] if text.splitlines() else ""
            if shebang not in _ALLOWED_SCRIPT_SHEBANGS:
                raise SkillPackageError(
                    "SKILL_SCRIPT_SHEBANG_UNSUPPORTED",
                    "Scripts must use Python 3 or POSIX sh",
                    path=file.path,
                )
        decoded[file.path] = text
    return decoded


def _freeze_json(value: object) -> FrozenJson:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Mapping):
        items: list[tuple[str, FrozenJson]] = []
        for key, item in value.items():
            if not isinstance(key, str):
                raise SkillPackageError("MANIFEST_INVALID", "Metadata keys must be strings")
            items.append((key, _freeze_json(item)))
        return FrozenJsonObject(tuple(sorted(items, key=lambda pair: pair[0].encode("utf-8"))))
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return FrozenJsonArray(tuple(_freeze_json(item) for item in value))
    raise SkillPackageError("MANIFEST_INVALID", "Metadata contains an unsupported value")
