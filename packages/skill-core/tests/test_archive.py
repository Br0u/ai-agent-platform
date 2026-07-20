from __future__ import annotations

import io
import stat
import struct
import zipfile

import pytest

from conftest import (
    DEFAULT_SKILL_MD,
    corrupt_first_member_data,
    mark_first_entry_encrypted,
    mark_first_local_entry_encrypted,
    replace_zip_name_byte,
    replace_zip_name_occurrence,
)
from skill_core.archive import SkillPackageError, canonicalize_skill_archive
from skill_core.types import (
    MAX_ARCHIVE_BYTES,
    MAX_FILE_BYTES,
    MAX_FILES,
    MAX_PATH_BYTES,
    MAX_PATH_DEPTH,
)


def assert_archive_error(archive: bytes, code: str) -> SkillPackageError:
    with pytest.raises(SkillPackageError) as caught:
        canonicalize_skill_archive(archive)
    assert caught.value.code == code
    return caught.value


@pytest.mark.parametrize(
    "unsafe_path",
    [
        "/absolute/SKILL.md",
        "C:/absolute/SKILL.md",
        "../escape/SKILL.md",
        "demo-skill/../../escape",
        "demo-skill\\SKILL.md",
    ],
)
def test_rejects_absolute_traversal_and_non_posix_paths(zip_builder, unsafe_path: str) -> None:
    archive = zip_builder({unsafe_path: DEFAULT_SKILL_MD})
    assert_archive_error(archive, "ARCHIVE_UNSAFE_PATH")


def test_rejects_nul_in_raw_zip_path(zip_builder) -> None:
    archive = zip_builder({"demo-skill/SKILLXmd": DEFAULT_SKILL_MD})
    archive = replace_zip_name_byte(archive, b"SKILLXmd", b"SKILL\x00md")
    assert_archive_error(archive, "ARCHIVE_UNSAFE_PATH")


def test_rejects_nul_in_central_directory_path(zip_builder) -> None:
    archive = zip_builder({"demo-skill/SKILLXmd": DEFAULT_SKILL_MD})
    archive = replace_zip_name_occurrence(archive, b"SKILLXmd", b"SKILL\x00md", 1)
    assert_archive_error(archive, "ARCHIVE_UNSAFE_PATH")


@pytest.mark.parametrize(
    "paths",
    [
        ("demo-skill/caf\N{LATIN SMALL LETTER E WITH ACUTE}.txt", "demo-skill/cafe\u0301.txt"),
        ("demo-skill/README.md", "demo-skill/readme.md"),
    ],
)
def test_rejects_unicode_normalization_duplicates_and_case_collisions(
    zip_builder, paths: tuple[str, str]
) -> None:
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            paths[0]: b"one",
            paths[1]: b"two",
        }
    )
    assert_archive_error(archive, "ARCHIVE_PATH_CONFLICT")


def test_rejects_file_and_descendant_path_conflicts(zip_builder) -> None:
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            "demo-skill/conflict": b"file",
            "demo-skill/conflict/child.txt": b"child",
        }
    )
    assert_archive_error(archive, "ARCHIVE_PATH_CONFLICT")


@pytest.mark.parametrize(
    ("mode", "extra"),
    [
        (stat.S_IFLNK | 0o777, b""),
        (
            stat.S_IFREG | 0o644,
            struct.pack("<HHIIHH", 0x000D, 18, 0, 0, 0, 0) + b"target",
        ),
        (stat.S_IFCHR | 0o600, b""),
        (stat.S_IFBLK | 0o600, b""),
        (stat.S_IFIFO | 0o600, b""),
        (stat.S_IFSOCK | 0o600, b""),
    ],
    ids=["symlink", "hardlink", "character-device", "block-device", "fifo", "socket"],
)
def test_rejects_links_and_special_files(zip_builder, mode: int, extra: bytes) -> None:
    path = "demo-skill/unsafe"
    archive = zip_builder(
        {"demo-skill/SKILL.md": DEFAULT_SKILL_MD, path: b"target"},
        modes={path: mode},
        extras={path: extra},
    )
    assert_archive_error(archive, "ARCHIVE_UNSUPPORTED_FILE")


def test_rejects_encrypted_zip(zip_builder) -> None:
    archive = mark_first_entry_encrypted(zip_builder())
    assert_archive_error(archive, "ARCHIVE_ENCRYPTED")


def test_rejects_encryption_flag_present_only_in_local_header(zip_builder) -> None:
    archive = mark_first_local_entry_encrypted(zip_builder())
    assert_archive_error(archive, "ARCHIVE_ENCRYPTED")


def test_rejects_nested_archive_by_content_not_only_suffix(zip_builder) -> None:
    nested = zip_builder()
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            "demo-skill/reference.bin": nested,
        }
    )
    assert_archive_error(archive, "ARCHIVE_NESTED")


def test_rejects_archive_larger_than_five_mib(zip_builder) -> None:
    archive = zip_builder() + b"padding" * ((MAX_ARCHIVE_BYTES // 7) + 1)
    assert len(archive) > MAX_ARCHIVE_BYTES
    assert_archive_error(archive, "ARCHIVE_TOO_LARGE")


def test_streaming_rejects_actual_extracted_bytes_over_twenty_mib(zip_builder) -> None:
    chunk = b"x" * MAX_FILE_BYTES
    files = {"demo-skill/SKILL.md": DEFAULT_SKILL_MD}
    files.update({f"demo-skill/references/{index:02}.txt": chunk for index in range(10)})
    files["demo-skill/references/overflow.txt"] = b"x"
    archive = zip_builder(files)
    assert len(archive) < MAX_ARCHIVE_BYTES
    assert_archive_error(archive, "ARCHIVE_EXTRACTED_TOO_LARGE")


def test_rejects_more_than_128_files(zip_builder) -> None:
    files = {"demo-skill/SKILL.md": DEFAULT_SKILL_MD}
    files.update({f"demo-skill/references/{index:03}.txt": b"x" for index in range(MAX_FILES)})
    archive = zip_builder(files)
    assert_archive_error(archive, "ARCHIVE_TOO_MANY_FILES")


def test_directory_entries_cannot_bypass_the_128_member_limit(zip_builder) -> None:
    files = {"demo-skill/SKILL.md": DEFAULT_SKILL_MD}
    directories = {f"demo-skill/directory-{index:03}/": b"" for index in range(MAX_FILES)}
    files.update(directories)
    modes = {path: stat.S_IFDIR | 0o755 for path in directories}
    archive = zip_builder(files, modes=modes)
    assert_archive_error(archive, "ARCHIVE_TOO_MANY_FILES")


def test_streaming_rejects_single_file_over_two_mib(zip_builder) -> None:
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            "demo-skill/reference.txt": b"x" * (MAX_FILE_BYTES + 1),
        }
    )
    assert_archive_error(archive, "ARCHIVE_FILE_TOO_LARGE")


def test_rejects_paths_deeper_than_eight_components(zip_builder) -> None:
    relative = "/".join(["level"] * MAX_PATH_DEPTH + ["file.txt"])
    archive = zip_builder({"demo-skill/SKILL.md": DEFAULT_SKILL_MD, f"demo-skill/{relative}": b"x"})
    assert_archive_error(archive, "ARCHIVE_PATH_TOO_DEEP")


def test_rejects_paths_over_160_utf8_bytes(zip_builder) -> None:
    prefix = "demo-skill/references/"
    name = "x" * (MAX_PATH_BYTES - len(prefix.encode()) + 1)
    archive = zip_builder({"demo-skill/SKILL.md": DEFAULT_SKILL_MD, f"{prefix}{name}": b"x"})
    assert_archive_error(archive, "ARCHIVE_PATH_TOO_LONG")


def test_rejects_multiple_skill_roots(zip_builder) -> None:
    archive = zip_builder(
        {
            "one/SKILL.md": b"---\nname: one\ndescription: One.\n---\n",
            "two/SKILL.md": b"---\nname: two\ndescription: Two.\n---\n",
        }
    )
    assert_archive_error(archive, "ARCHIVE_MULTIPLE_SKILL_ROOTS")


def test_rejects_archive_without_skill_manifest(zip_builder) -> None:
    archive = zip_builder({"demo-skill/README.md": b"missing"})
    assert_archive_error(archive, "ARCHIVE_SKILL_ROOT_REQUIRED")


def test_canonical_zip_is_reproducible_sorted_and_has_fixed_metadata(zip_builder) -> None:
    files = {
        "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
        "demo-skill/scripts/run.py": b"#!/usr/bin/env python3\nprint('ok')\n",
        "demo-skill/references/z.txt": b"z",
    }
    first = zip_builder(files, order=list(reversed(files)), timestamp=(2026, 7, 20, 12, 0, 0))
    second = zip_builder(files, order=list(files), timestamp=(2020, 1, 2, 3, 4, 6))

    canonical_first = canonicalize_skill_archive(first)
    canonical_second = canonicalize_skill_archive(second)

    assert canonical_first == canonical_second
    assert canonical_first.slug == "demo-skill"
    assert canonical_first.sha256 == canonical_second.sha256
    assert canonical_first.files == tuple(
        sorted(canonical_first.files, key=lambda f: f.path.encode())
    )

    with zipfile.ZipFile(io.BytesIO(canonical_first.archive)) as archive:
        infos = archive.infolist()
        assert [info.filename for info in infos] == sorted(
            [info.filename for info in infos], key=str.encode
        )
        assert all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in infos)
        assert [info.external_attr >> 16 for info in infos] == [0o100644, 0o100644, 0o100755]


def test_rejects_bad_zip_bytes() -> None:
    assert_archive_error(b"not a zip", "ARCHIVE_INVALID")


def test_wraps_corrupt_deflate_stream_as_stable_archive_error(zip_builder) -> None:
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD + b"repeated text\n" * 100,
        }
    )
    corrupted = corrupt_first_member_data(archive)
    assert_archive_error(corrupted, "ARCHIVE_INVALID")


def test_rejects_metadata_that_lies_about_uncompressed_size(zip_builder) -> None:
    archive = bytearray(
        zip_builder(
            {
                "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
                "demo-skill/reference.txt": b"x" * 1024,
            },
            compression=zipfile.ZIP_STORED,
        )
    )
    central = archive.find(b"PK\x01\x02", archive.find(b"PK\x01\x02") + 1)
    assert central >= 0
    struct.pack_into("<I", archive, central + 24, 1)
    error = assert_archive_error(bytes(archive), "ARCHIVE_INVALID")
    assert "x" * 20 not in str(error)
