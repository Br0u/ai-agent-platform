from __future__ import annotations

from dataclasses import replace
import os
from pathlib import Path
import stat
from typing import Any

import pytest

from skill_core import canonicalize_skill_zip
from skill_core.materialize import SkillMaterializationError, materialize_canonical_skill
from skill_core.types import CanonicalSkillPackage


def package(zip_builder: Any) -> CanonicalSkillPackage:
    return canonicalize_skill_zip(
        zip_builder(
            {
                "demo-skill/SKILL.md": (
                    b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n"
                ),
                "demo-skill/references/guide.md": b"# Guide\n",
                "demo-skill/scripts/run.py": b"#!/usr/bin/env python3\nprint('ok')\n",
            }
        )
    )


def open_root(path: Path) -> int:
    return os.open(path, os.O_RDONLY | os.O_DIRECTORY)


def assert_materialize_error(code: str, build) -> SkillMaterializationError:
    with pytest.raises(SkillMaterializationError) as caught:
        build()
    assert caught.value.code == code
    return caught.value


def test_materializes_exact_tree_with_restrictive_permissions(tmp_path: Path, zip_builder) -> None:
    root_fd = open_root(tmp_path)
    try:
        materialize_canonical_skill(package(zip_builder), root_fd=root_fd, directory_name="gen")
    finally:
        os.close(root_fd)

    assert (tmp_path / "gen" / "SKILL.md").read_text().startswith("---\nname:")
    assert (tmp_path / "gen" / "references" / "guide.md").read_text() == "# Guide\n"
    assert stat.S_IMODE((tmp_path / "gen").stat().st_mode) == 0o700
    assert stat.S_IMODE((tmp_path / "gen" / "scripts").stat().st_mode) == 0o700
    assert stat.S_IMODE((tmp_path / "gen" / "SKILL.md").stat().st_mode) == 0o600
    assert stat.S_IMODE((tmp_path / "gen" / "scripts" / "run.py").stat().st_mode) == 0o700


@pytest.mark.parametrize("directory_name", ["", ".", "..", "../escape", "a/b", "x\x00y"])
def test_rejects_root_escape_before_filesystem_write(
    tmp_path: Path, zip_builder, directory_name: str
) -> None:
    root_fd = open_root(tmp_path)
    try:
        assert_materialize_error(
            "TARGET_INVALID",
            lambda: materialize_canonical_skill(
                package(zip_builder), root_fd=root_fd, directory_name=directory_name
            ),
        )
    finally:
        os.close(root_fd)
    assert list(tmp_path.iterdir()) == []


def test_refuses_cross_generation_overwrite(tmp_path: Path, zip_builder) -> None:
    existing = tmp_path / "generation"
    existing.mkdir()
    marker = existing / "marker"
    marker.write_text("keep")
    root_fd = open_root(tmp_path)
    try:
        assert_materialize_error(
            "TARGET_EXISTS",
            lambda: materialize_canonical_skill(
                package(zip_builder), root_fd=root_fd, directory_name="generation"
            ),
        )
    finally:
        os.close(root_fd)
    assert marker.read_text() == "keep"


@pytest.mark.parametrize(
    "forge",
    [
        lambda value: replace(value, sha256="0" * 64),
        lambda value: replace(value, extracted_size=value.extracted_size + 1),
        lambda value: replace(value, files=(value.files[0], value.files[0])),
        lambda value: replace(
            value,
            files=(replace(value.files[0], path="../escape"), *value.files[1:]),
        ),
        lambda value: replace(
            value,
            files=(replace(value.files[0], size=value.files[0].size + 1), *value.files[1:]),
        ),
    ],
    ids=["digest", "total-size", "duplicate-path", "unsafe-path", "file-index"],
)
def test_rejects_forged_package_before_filesystem_write(tmp_path: Path, zip_builder, forge) -> None:
    root_fd = open_root(tmp_path)
    try:
        assert_materialize_error(
            "PACKAGE_INVALID",
            lambda: materialize_canonical_skill(
                forge(package(zip_builder)), root_fd=root_fd, directory_name="gen"
            ),
        )
    finally:
        os.close(root_fd)
    assert list(tmp_path.iterdir()) == []


def test_symlink_swap_cannot_redirect_generation(tmp_path: Path, zip_builder, monkeypatch) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    marker = outside / "marker"
    marker.write_text("keep")
    root_fd = open_root(tmp_path)
    real_open = os.open
    swapped = False

    def swapping_open(path, flags, mode=0o777, *, dir_fd=None):
        nonlocal swapped
        if path == "gen" and dir_fd == root_fd and not swapped:
            swapped = True
            os.rmdir("gen", dir_fd=root_fd)
            os.symlink(outside, "gen", dir_fd=root_fd)
        return real_open(path, flags, mode, dir_fd=dir_fd)

    monkeypatch.setattr(os, "open", swapping_open)
    try:
        assert_materialize_error(
            "MATERIALIZE_FAILED",
            lambda: materialize_canonical_skill(
                package(zip_builder), root_fd=root_fd, directory_name="gen"
            ),
        )
    finally:
        os.close(root_fd)

    assert marker.read_text() == "keep"
    assert not (tmp_path / "gen").exists()


def test_parent_replacement_never_writes_through_symlink(
    tmp_path: Path, zip_builder, monkeypatch
) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    root_fd = open_root(tmp_path)
    real_open = os.open
    swapped = False

    def swapping_open(path, flags, mode=0o777, *, dir_fd=None):
        nonlocal swapped
        if path == "guide.md" and not swapped:
            swapped = True
            generation_fd = real_open(
                "gen", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd
            )
            try:
                os.rename("references", "moved", src_dir_fd=generation_fd, dst_dir_fd=generation_fd)
                os.symlink(outside, "references", dir_fd=generation_fd)
            finally:
                os.close(generation_fd)
        return real_open(path, flags, mode, dir_fd=dir_fd)

    monkeypatch.setattr(os, "open", swapping_open)
    try:
        assert_materialize_error(
            "MATERIALIZE_FAILED",
            lambda: materialize_canonical_skill(
                package(zip_builder), root_fd=root_fd, directory_name="gen"
            ),
        )
    finally:
        os.close(root_fd)

    assert list(outside.iterdir()) == []
    assert not (tmp_path / "gen").exists()


def test_partial_write_and_special_mode_are_cleaned(
    tmp_path: Path, zip_builder, monkeypatch
) -> None:
    root_fd = open_root(tmp_path)
    real_write = os.write
    calls = 0

    def interrupted_write(fd: int, content: bytes) -> int:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("cancelled during write")
        return real_write(fd, content)

    monkeypatch.setattr(os, "write", interrupted_write)
    try:
        assert_materialize_error(
            "MATERIALIZE_FAILED",
            lambda: materialize_canonical_skill(
                package(zip_builder), root_fd=root_fd, directory_name="partial"
            ),
        )
    finally:
        os.close(root_fd)
    assert not (tmp_path / "partial").exists()

    root_fd = open_root(tmp_path)
    real_fchmod = os.fchmod

    def unsafe_fchmod(fd: int, mode: int) -> None:
        real_fchmod(fd, mode | 0o077)

    monkeypatch.setattr(os, "write", real_write)
    monkeypatch.setattr(os, "fchmod", unsafe_fchmod)
    try:
        assert_materialize_error(
            "MATERIALIZE_FAILED",
            lambda: materialize_canonical_skill(
                package(zip_builder), root_fd=root_fd, directory_name="special"
            ),
        )
    finally:
        os.close(root_fd)
    assert not (tmp_path / "special").exists()
