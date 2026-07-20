from __future__ import annotations

import io
import stat
import struct
import zipfile
from collections.abc import Mapping

import pytest


DEFAULT_SKILL_MD = b"---\nname: demo-skill\ndescription: A demo skill.\n---\n\n# Demo\n"


def build_zip(
    files: Mapping[str, bytes] | None = None,
    *,
    compression: int = zipfile.ZIP_DEFLATED,
    modes: Mapping[str, int] | None = None,
    extras: Mapping[str, bytes] | None = None,
    order: list[str] | None = None,
    timestamp: tuple[int, int, int, int, int, int] = (2026, 7, 20, 12, 0, 0),
) -> bytes:
    entries = dict(files or {"demo-skill/SKILL.md": DEFAULT_SKILL_MD})
    names = order or list(entries)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=compression) as archive:
        for name in names:
            info = zipfile.ZipInfo(name, date_time=timestamp)
            info.create_system = 3
            mode = (modes or {}).get(name, stat.S_IFREG | 0o600)
            info.external_attr = mode << 16
            info.extra = (extras or {}).get(name, b"")
            info.compress_type = compression
            archive.writestr(info, entries[name])
    return output.getvalue()


def replace_zip_name_byte(archive: bytes, old: bytes, new: bytes) -> bytes:
    assert len(old) == len(new)
    assert archive.count(old) == 2
    return archive.replace(old, new)


def replace_zip_name_occurrence(archive: bytes, old: bytes, new: bytes, occurrence: int) -> bytes:
    assert len(old) == len(new)
    offset = -1
    for _ in range(occurrence + 1):
        offset = archive.find(old, offset + 1)
        assert offset >= 0
    return archive[:offset] + new + archive[offset + len(old) :]


def mark_first_entry_encrypted(archive: bytes) -> bytes:
    patched = bytearray(archive)
    local = patched.find(b"PK\x03\x04")
    central = patched.find(b"PK\x01\x02")
    assert local >= 0 and central >= 0
    local_flags = struct.unpack_from("<H", patched, local + 6)[0] | 1
    central_flags = struct.unpack_from("<H", patched, central + 8)[0] | 1
    struct.pack_into("<H", patched, local + 6, local_flags)
    struct.pack_into("<H", patched, central + 8, central_flags)
    return bytes(patched)


def mark_first_local_entry_encrypted(archive: bytes) -> bytes:
    patched = bytearray(archive)
    local = patched.find(b"PK\x03\x04")
    assert local >= 0
    local_flags = struct.unpack_from("<H", patched, local + 6)[0] | 1
    struct.pack_into("<H", patched, local + 6, local_flags)
    return bytes(patched)


def corrupt_first_member_data(archive: bytes) -> bytes:
    patched = bytearray(archive)
    local = patched.find(b"PK\x03\x04")
    assert local >= 0
    name_length, extra_length = struct.unpack_from("<HH", patched, local + 26)
    data_offset = local + 30 + name_length + extra_length
    patched[data_offset] ^= 0xFF
    return bytes(patched)


def forge_member_uncompressed_metadata(
    archive: bytes, member_name: str, *, uncompressed_size: int, crc: int
) -> bytes:
    encoded_name = member_name.encode("utf-8")
    positions: list[int] = []
    offset = -1
    while True:
        offset = archive.find(encoded_name, offset + 1)
        if offset < 0:
            break
        positions.append(offset)
    assert len(positions) == 2

    patched = bytearray(archive)
    local = archive.rfind(b"PK\x03\x04", 0, positions[0])
    central = archive.rfind(b"PK\x01\x02", 0, positions[1])
    assert local >= 0 and central >= 0
    struct.pack_into("<I", patched, local + 14, crc)
    struct.pack_into("<I", patched, local + 22, uncompressed_size)
    struct.pack_into("<I", patched, central + 16, crc)
    struct.pack_into("<I", patched, central + 24, uncompressed_size)
    return bytes(patched)


def forge_member_compressed_size(archive: bytes, member_name: str, compressed_size: int) -> bytes:
    encoded_name = member_name.encode("utf-8")
    first = archive.find(encoded_name)
    second = archive.find(encoded_name, first + 1)
    assert first >= 0 and second >= 0
    patched = bytearray(archive)
    local = archive.rfind(b"PK\x03\x04", 0, first)
    central = archive.rfind(b"PK\x01\x02", 0, second)
    struct.pack_into("<I", patched, local + 18, compressed_size)
    struct.pack_into("<I", patched, central + 20, compressed_size)
    return bytes(patched)


def zero_local_member_metadata(archive: bytes, member_name: str) -> bytes:
    encoded_name = member_name.encode("utf-8")
    name_offset = archive.find(encoded_name)
    local = archive.rfind(b"PK\x03\x04", 0, name_offset)
    assert local >= 0
    patched = bytearray(archive)
    struct.pack_into("<III", patched, local + 14, 0, 0, 0)
    return bytes(patched)


@pytest.fixture
def zip_builder():
    return build_zip
