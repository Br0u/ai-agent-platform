from __future__ import annotations

import hashlib
from dataclasses import FrozenInstanceError, replace

import pytest

from skill_core.archive import SkillPackageError, canonicalize_skill_archive
from skill_core.manifest import parse_skill_manifest
from skill_core.types import FrozenJsonArray, FrozenJsonObject, SkillFile


def package_from(zip_builder, files: dict[str, bytes]):
    return canonicalize_skill_archive(zip_builder(files))


def assert_manifest_error(package, code: str) -> SkillPackageError:
    with pytest.raises(SkillPackageError) as caught:
        parse_skill_manifest(package)
    assert caught.value.code == code
    return caught.value


def test_parses_valid_agno_skill_into_frozen_dto(zip_builder) -> None:
    skill_md = b"""---
name: demo-skill
description: A useful deterministic skill.
license: MIT
compatibility: Python 3.13
allowed-tools:
  - Read
metadata:
  version: "1.0"
  stable: true
---

# Instructions

Use the references.
"""
    package = package_from(
        zip_builder,
        {
            "demo-skill/SKILL.md": skill_md,
            "demo-skill/references/guide.md": b"# Guide\n",
            "demo-skill/scripts/run.py": b"#!/usr/bin/env python3\nprint('ok')\n",
        },
    )

    manifest = parse_skill_manifest(package)

    assert manifest.name == "demo-skill"
    assert manifest.description == "A useful deterministic skill."
    assert manifest.instructions.startswith("# Instructions")
    assert manifest.scripts == ("run.py",)
    assert manifest.references == ("guide.md",)
    assert manifest.allowed_tools == ("Read",)
    assert manifest.metadata == FrozenJsonObject((("stable", True), ("version", "1.0")))
    with pytest.raises(FrozenInstanceError):
        manifest.name = "changed"  # type: ignore[misc]


def test_frozen_metadata_preserves_empty_object_and_array_shapes(zip_builder) -> None:
    package = package_from(
        zip_builder,
        {
            "demo-skill/SKILL.md": b"""---
name: demo-skill
description: Demo.
metadata:
  empty-object: {}
  empty-array: []
---
# Demo
"""
        },
    )

    manifest = parse_skill_manifest(package)

    assert manifest.metadata == FrozenJsonObject(
        (
            ("empty-array", FrozenJsonArray(())),
            ("empty-object", FrozenJsonObject(())),
        )
    )


def test_rejects_directory_and_manifest_name_mismatch(zip_builder) -> None:
    package = package_from(
        zip_builder,
        {"demo-skill/SKILL.md": (b"---\nname: another-skill\ndescription: Mismatch.\n---\n")},
    )
    assert_manifest_error(package, "MANIFEST_INVALID")


def test_rejects_extra_frontmatter_fields_via_agno_validation(zip_builder) -> None:
    package = package_from(
        zip_builder,
        {
            "demo-skill/SKILL.md": (
                b"---\nname: demo-skill\ndescription: Demo.\nunexpected: true\n---\n"
            )
        },
    )
    assert_manifest_error(package, "MANIFEST_INVALID")


def test_rejects_empty_description_via_agno_validation(zip_builder) -> None:
    package = package_from(
        zip_builder,
        {"demo-skill/SKILL.md": b'---\nname: demo-skill\ndescription: ""\n---\n'},
    )
    assert_manifest_error(package, "MANIFEST_INVALID")


@pytest.mark.parametrize(
    "path",
    ["demo-skill/references/bad.md", "demo-skill/scripts/bad.py"],
)
def test_rejects_non_utf8_reference_and_script(zip_builder, path: str) -> None:
    files = {
        "demo-skill/SKILL.md": (b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n"),
        path: b"\xff\xfe\xfa",
    }
    package = package_from(zip_builder, files)
    assert_manifest_error(package, "SKILL_FILE_NOT_UTF8")


@pytest.mark.parametrize(
    "shebang",
    [
        b"#!/usr/bin/env python",
        b"#!/usr/bin/python2",
        b"#!/usr/bin/env bash",
        b"#!/usr/bin/env node",
        b"print('missing shebang')",
    ],
)
def test_rejects_non_python3_or_non_posix_sh_shebang(zip_builder, shebang: bytes) -> None:
    package = package_from(
        zip_builder,
        {
            "demo-skill/SKILL.md": (b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n"),
            "demo-skill/scripts/run": shebang + b"\n",
        },
    )
    assert_manifest_error(package, "SKILL_SCRIPT_SHEBANG_UNSUPPORTED")


@pytest.mark.parametrize(
    "shebang",
    [
        b"#!/usr/bin/env python3",
        b"#!/usr/bin/python3",
        b"#!/bin/sh",
        b"#!/usr/bin/env sh",
    ],
)
def test_accepts_python3_and_posix_sh_shebangs(zip_builder, shebang: bytes) -> None:
    package = package_from(
        zip_builder,
        {
            "demo-skill/SKILL.md": (b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n"),
            "demo-skill/scripts/run": shebang + b"\nexit 0\n",
        },
    )
    assert parse_skill_manifest(package).scripts == ("run",)


def test_rejects_binary_files_even_when_bytes_are_utf8_decodable(zip_builder) -> None:
    package = package_from(
        zip_builder,
        {
            "demo-skill/SKILL.md": (b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n"),
            "demo-skill/references/binary.dat": b"prefix\x00suffix",
        },
    )
    error = assert_manifest_error(package, "SKILL_BINARY_FILE")
    assert "prefix" not in str(error)


def test_wraps_temporary_tree_io_failures_as_stable_manifest_error(zip_builder) -> None:
    package = package_from(
        zip_builder,
        {"demo-skill/SKILL.md": (b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n")},
    )
    parent_content = b"file blocks child directory"
    child_content = b"child"
    invalid_files = package.files + (
        SkillFile(
            path="conflict",
            content=parent_content,
            sha256=hashlib.sha256(parent_content).hexdigest(),
            size=len(parent_content),
        ),
        SkillFile(
            path="conflict/child.txt",
            content=child_content,
            sha256=hashlib.sha256(child_content).hexdigest(),
            size=len(child_content),
        ),
    )

    error = assert_manifest_error(
        replace(package, files=invalid_files),
        "MANIFEST_INVALID",
    )
    assert "FileExistsError" not in str(error)
