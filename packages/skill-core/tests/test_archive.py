from __future__ import annotations

import io
import random
import stat
import struct
import tarfile
import zipfile
import zlib

import pytest

from conftest import (
    DEFAULT_SKILL_MD,
    corrupt_first_member_data,
    forge_member_compressed_size,
    forge_member_uncompressed_metadata,
    mark_first_entry_encrypted,
    mark_first_local_entry_encrypted,
    replace_zip_name_byte,
    replace_zip_name_occurrence,
    set_unsupported_extract_version,
    zero_local_member_metadata,
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
    "path",
    ["demo-skill/control-\x1f.txt", "demo-skill/control-\u202e.txt"],
)
def test_rejects_ascii_and_unicode_control_characters_in_paths(zip_builder, path: str) -> None:
    archive = zip_builder({"demo-skill/SKILL.md": DEFAULT_SKILL_MD, path: b"x"})
    assert_archive_error(archive, "ARCHIVE_UNSAFE_PATH")


@pytest.mark.parametrize(
    "path",
    ["demo-skill/.git/config", "demo-skill/vendor/nested/.GIT/hooks/pre-commit"],
)
def test_rejects_git_metadata_path_components(zip_builder, path: str) -> None:
    archive = zip_builder({"demo-skill/SKILL.md": DEFAULT_SKILL_MD, path: b"x"})
    assert_archive_error(archive, "ARCHIVE_GIT_METADATA")


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


def test_rejects_file_and_directory_with_same_canonical_path(zip_builder) -> None:
    directory = "demo-skill/conflict/"
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            "demo-skill/conflict": b"file",
            directory: b"",
        },
        modes={directory: stat.S_IFDIR | 0o755},
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


@pytest.mark.parametrize("permission", [stat.S_ISUID, stat.S_ISGID, stat.S_ISVTX])
def test_rejects_setuid_setgid_and_sticky_permission_bits(zip_builder, permission: int) -> None:
    path = "demo-skill/script.py"
    archive = zip_builder(
        {"demo-skill/SKILL.md": DEFAULT_SKILL_MD, path: b"print('x')\n"},
        modes={path: stat.S_IFREG | 0o644 | permission},
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


def test_rejects_git_lfs_pointer_files(zip_builder) -> None:
    pointer = b"""version https://git-lfs.github.com/spec/v1
oid sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
size 1234
"""
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            "demo-skill/references/model.bin": pointer,
        }
    )
    assert_archive_error(archive, "ARCHIVE_GIT_LFS_POINTER")


def test_rejects_valid_tar_renamed_without_archive_suffix(zip_builder) -> None:
    nested = io.BytesIO()
    with tarfile.open(fileobj=nested, mode="w") as archive:
        info = tarfile.TarInfo("inside.txt")
        content = b"nested tar content"
        info.size = len(content)
        archive.addfile(info, io.BytesIO(content))
    outer = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            "demo-skill/reference.bin": nested.getvalue(),
        }
    )
    assert_archive_error(outer, "ARCHIVE_NESTED")


def test_does_not_treat_plain_bytes_with_ustar_text_as_tar(zip_builder) -> None:
    ordinary = bytearray(b"x" * 512)
    ordinary[257:263] = b"ustar\x00"
    package = canonicalize_skill_archive(
        zip_builder(
            {
                "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
                "demo-skill/reference.bin": bytes(ordinary),
            }
        )
    )
    assert next(file for file in package.files if file.path == "reference.bin").size == 512


def test_rejects_valid_v7_tar_without_ustar_magic(zip_builder) -> None:
    nested = io.BytesIO()
    with tarfile.open(fileobj=nested, mode="w") as archive:
        content = b"v7 tar content"
        info = tarfile.TarInfo("inside.txt")
        info.size = len(content)
        archive.addfile(info, io.BytesIO(content))
    v7 = bytearray(nested.getvalue())
    v7[257:265] = b"\x00" * 8
    v7[148:156] = b" " * 8
    checksum = sum(v7[:512])
    v7[148:156] = f"{checksum:06o}\0 ".encode()
    outer = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            "demo-skill/reference.bin": bytes(v7),
        }
    )
    assert_archive_error(outer, "ARCHIVE_NESTED")


def test_does_not_treat_truncated_tar_like_header_as_tar(zip_builder) -> None:
    header = bytearray(512)
    header[:10] = b"inside.txt"
    header[100:108] = b"0000644\0"
    header[108:116] = b"0000000\0"
    header[116:124] = b"0000000\0"
    header[124:136] = b"00000004000\0"
    header[136:148] = b"00000000000\0"
    header[156:157] = b"0"
    header[257:263] = b"ustar\x00"
    header[148:156] = b" " * 8
    checksum = sum(header)
    header[148:156] = f"{checksum:06o}\0 ".encode()
    package = canonicalize_skill_archive(
        zip_builder(
            {
                "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
                "demo-skill/reference.bin": bytes(header),
            }
        )
    )
    assert next(file for file in package.files if file.path == "reference.bin").size == 512


def test_rejects_archive_larger_than_five_mib(zip_builder) -> None:
    archive = zip_builder() + b"padding" * ((MAX_ARCHIVE_BYTES // 7) + 1)
    assert len(archive) > MAX_ARCHIVE_BYTES
    assert_archive_error(archive, "ARCHIVE_TOO_LARGE")


def test_rejects_when_canonical_recompression_exceeds_five_mib(zip_builder) -> None:
    total_payload_bytes = MAX_ARCHIVE_BYTES - 2100
    payload = random.Random(42).randbytes(total_payload_bytes)
    first_size = 2 * 1024 * 1024
    second_size = 2 * 1024 * 1024
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            "demo-skill/references/0.bin": payload[:first_size],
            "demo-skill/references/1.bin": payload[first_size : first_size + second_size],
            "demo-skill/references/2.bin": payload[first_size + second_size :],
        },
        compression=zipfile.ZIP_STORED,
    )
    assert len(archive) < MAX_ARCHIVE_BYTES
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


def test_streams_past_forged_uncompressed_size_and_crc_until_real_eof(zip_builder) -> None:
    member_name = "demo-skill/references/bomb.txt"
    actual_content = b"x" * (MAX_FILE_BYTES + 1024 * 1024)
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            member_name: actual_content,
        }
    )
    forged = forge_member_uncompressed_metadata(
        archive,
        member_name,
        uncompressed_size=1,
        crc=zlib.crc32(actual_content[:1]),
    )
    assert len(forged) < MAX_ARCHIVE_BYTES
    assert_archive_error(forged, "ARCHIVE_FILE_TOO_LARGE")


def test_streams_deflate_to_eof_when_compressed_size_is_forged_small(zip_builder) -> None:
    member_name = "demo-skill/references/bomb.txt"
    actual_content = b"x" * (MAX_FILE_BYTES + 1024 * 1024)
    archive = zip_builder({"demo-skill/SKILL.md": DEFAULT_SKILL_MD, member_name: actual_content})
    forged = forge_member_compressed_size(archive, member_name, 1)
    assert_archive_error(forged, "ARCHIVE_FILE_TOO_LARGE")


def test_streams_directory_members_so_they_cannot_hide_a_zip_bomb(zip_builder) -> None:
    member_name = "demo-skill/empty/"
    actual_content = b"x" * (MAX_FILE_BYTES + 1024 * 1024)
    archive = zip_builder(
        {
            "demo-skill/SKILL.md": DEFAULT_SKILL_MD,
            member_name: actual_content,
        },
        modes={member_name: stat.S_IFDIR | 0o755},
    )
    forged = forge_member_uncompressed_metadata(
        archive,
        member_name,
        uncompressed_size=0,
        crc=0,
    )
    assert_archive_error(forged, "ARCHIVE_FILE_TOO_LARGE")


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


def test_rejects_an_extra_top_level_empty_directory_as_another_root(zip_builder) -> None:
    directory = "other/"
    archive = zip_builder(
        {"demo-skill/SKILL.md": DEFAULT_SKILL_MD, directory: b""},
        modes={directory: stat.S_IFDIR | 0o755},
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


def test_wraps_unsupported_zip_extract_version_as_stable_archive_error(zip_builder) -> None:
    archive = set_unsupported_extract_version(zip_builder())
    assert_archive_error(archive, "ARCHIVE_INVALID")


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


def test_rejects_absolute_path_present_only_in_local_directory_header(zip_builder) -> None:
    central_name = "demo-skill/empty/"
    local_name = "/" + ("x" * (len(central_name) - 2)) + "/"
    archive = zip_builder(
        {"demo-skill/SKILL.md": DEFAULT_SKILL_MD, central_name: b""},
        modes={central_name: stat.S_IFDIR | 0o755},
    )
    forged = replace_zip_name_occurrence(
        archive,
        central_name.encode(),
        local_name.encode(),
        0,
    )
    assert_archive_error(forged, "ARCHIVE_UNSAFE_PATH")


def test_rejects_safe_but_different_local_and_central_names(zip_builder) -> None:
    central_name = "demo-skill/empty/"
    local_name = "demo-skill/other/"
    archive = zip_builder(
        {"demo-skill/SKILL.md": DEFAULT_SKILL_MD, central_name: b""},
        modes={central_name: stat.S_IFDIR | 0o755},
    )
    forged = replace_zip_name_occurrence(
        archive,
        central_name.encode(),
        local_name.encode(),
        0,
    )
    assert_archive_error(forged, "ARCHIVE_INVALID")


def test_rejects_local_metadata_mismatch_without_data_descriptor(zip_builder) -> None:
    member_name = "demo-skill/SKILL.md"
    forged = zero_local_member_metadata(zip_builder(), member_name)
    assert_archive_error(forged, "ARCHIVE_INVALID")
