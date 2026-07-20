"""Safe ZIP validation and deterministic canonicalization."""

from __future__ import annotations

import hashlib
import io
import ntpath
import stat
import struct
import tarfile
import unicodedata
import zipfile
import zlib
from collections.abc import Iterable
from pathlib import PurePosixPath

from .types import (
    MAX_ARCHIVE_BYTES,
    MAX_EXTRACTED_BYTES,
    MAX_FILE_BYTES,
    MAX_FILES,
    MAX_PATH_BYTES,
    MAX_PATH_DEPTH,
    CanonicalSkillArchive,
    CanonicalSkillPackage,
    SkillFile,
)

_READ_CHUNK_BYTES = 64 * 1024
_CANONICAL_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
_UNIX_EXTRA_FIELD = 0x000D
_NESTED_SUFFIXES = (
    ".7z",
    ".bz2",
    ".gz",
    ".rar",
    ".tar",
    ".tar.bz2",
    ".tar.gz",
    ".tar.xz",
    ".tgz",
    ".txz",
    ".xz",
    ".zip",
)
_NESTED_SIGNATURES = (
    b"PK\x03\x04",
    b"PK\x05\x06",
    b"PK\x07\x08",
    b"7z\xbc\xaf\x27\x1c",
    b"Rar!\x1a\x07",
    b"\x1f\x8b",
    b"BZh",
    b"\xfd7zXZ\x00",
)


class SkillPackageError(ValueError):
    """Stable validation failure safe to cross process boundaries."""

    def __init__(self, code: str, message: str, *, path: str | None = None) -> None:
        self.code = code
        self.path = path
        super().__init__(message if path is None else f"{message}: {path}")


def canonicalize_skill_archive(archive: bytes) -> CanonicalSkillArchive:
    """Validate untrusted ZIP bytes and return one deterministic skill package.

    Member contents are streamed and counted. Nothing is extracted to the filesystem.
    """

    if len(archive) > MAX_ARCHIVE_BYTES:
        raise SkillPackageError("ARCHIVE_TOO_LARGE", "ZIP exceeds compressed size limit")

    try:
        source = zipfile.ZipFile(io.BytesIO(archive), "r")
    except (
        NotImplementedError,
        OSError,
        ValueError,
        zipfile.BadZipFile,
        zipfile.LargeZipFile,
    ) as error:
        raise SkillPackageError("ARCHIVE_INVALID", "Invalid ZIP archive") from error

    try:
        files, slug, extracted_size = _read_validated_files(source, archive)
    except SkillPackageError:
        raise
    except (
        EOFError,
        NotImplementedError,
        OSError,
        RuntimeError,
        ValueError,
        zipfile.BadZipFile,
        zlib.error,
    ) as error:
        raise SkillPackageError("ARCHIVE_INVALID", "Invalid ZIP archive") from error
    finally:
        source.close()

    canonical_archive = _write_canonical_zip(slug, files)
    if len(canonical_archive) > MAX_ARCHIVE_BYTES:
        raise SkillPackageError("ARCHIVE_TOO_LARGE", "Canonical ZIP exceeds compressed size limit")
    return CanonicalSkillArchive(
        slug=slug,
        archive=canonical_archive,
        sha256=hashlib.sha256(canonical_archive).hexdigest(),
        compressed_size=len(canonical_archive),
        extracted_size=extracted_size,
        files=files,
    )


def canonicalize_skill_zip(archive: bytes) -> CanonicalSkillPackage:
    """Canonicalize one ZIP and validate its Agno skill manifest."""

    from .manifest import parse_skill_manifest

    canonical = canonicalize_skill_archive(archive)
    manifest = parse_skill_manifest(canonical)
    return CanonicalSkillPackage(
        slug=canonical.slug,
        archive=canonical.archive,
        sha256=canonical.sha256,
        compressed_size=canonical.compressed_size,
        extracted_size=canonical.extracted_size,
        files=canonical.files,
        manifest=manifest,
        findings=(),
    )


def _read_validated_files(
    source: zipfile.ZipFile, raw_archive: bytes
) -> tuple[tuple[SkillFile, ...], str, int]:
    infos = source.infolist()
    if len(infos) > MAX_FILES:
        raise SkillPackageError("ARCHIVE_TOO_MANY_FILES", "ZIP contains too many members")
    normalized_paths: dict[str, str] = {}
    folded_paths: dict[str, str] = {}
    member_infos: list[tuple[str, zipfile.ZipInfo, int, int, bool]] = []
    central_names = _read_raw_central_names(raw_archive, len(infos), source.start_dir)
    entry_bounds = _entry_bounds(infos, source.start_dir)

    for info, central_name in zip(infos, central_names, strict=True):
        data_offset = _validate_raw_local_header(raw_archive, info, central_name)
        normalized = _normalize_path(info.filename)
        collision_path = normalized.rstrip("/")
        folded = collision_path.casefold()
        if collision_path in normalized_paths or folded in folded_paths:
            raise SkillPackageError(
                "ARCHIVE_PATH_CONFLICT",
                "ZIP contains colliding canonical paths",
                path=normalized,
            )
        normalized_paths[collision_path] = info.filename
        folded_paths[folded] = collision_path

        is_directory = info.is_dir()
        _validate_member_type(info, is_directory)
        if info.flag_bits & 0x1:
            raise SkillPackageError("ARCHIVE_ENCRYPTED", "Encrypted ZIP members are not allowed")
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise SkillPackageError(
                "ARCHIVE_UNSUPPORTED_FILE",
                "Unsupported ZIP compression method",
                path=normalized,
            )
        member_infos.append(
            (normalized, info, data_offset, entry_bounds[info.header_offset], is_directory)
        )

    file_paths = tuple(path for path, _, _, _, is_directory in member_infos if not is_directory)
    _reject_ancestor_file_conflicts(file_paths)
    slug = _find_skill_root(file_paths)
    member_roots = {path.rstrip("/").split("/", 1)[0] for path, *_ in member_infos}
    if member_roots != {slug}:
        raise SkillPackageError(
            "ARCHIVE_MULTIPLE_SKILL_ROOTS",
            "Every file must belong to the single skill root",
        )

    extracted_size = 0
    result: list[SkillFile] = []
    for full_path, info, data_offset, entry_bound, is_directory in member_infos:
        content, actual_size = _read_member(
            raw_archive,
            info,
            data_offset,
            entry_bound,
            extracted_size,
        )
        extracted_size += actual_size
        if is_directory:
            if content:
                raise SkillPackageError(
                    "ARCHIVE_INVALID", "ZIP directory members must have empty content"
                )
            continue
        relative_path = full_path[len(slug) + 1 :]
        _reject_git_lfs_pointer(relative_path, content)
        _reject_nested_archive(relative_path, content)
        result.append(
            SkillFile(
                path=relative_path,
                content=content,
                sha256=hashlib.sha256(content).hexdigest(),
                size=actual_size,
            )
        )

    result.sort(key=lambda file: file.path.encode("utf-8"))
    return tuple(result), slug, extracted_size


def _validate_raw_local_header(
    raw_archive: bytes, info: zipfile.ZipInfo, central_name: bytes
) -> int:
    offset = info.header_offset
    if raw_archive[offset : offset + 4] != b"PK\x03\x04" or offset + 30 > len(raw_archive):
        raise SkillPackageError("ARCHIVE_INVALID", "Malformed ZIP local header")
    local_flags = struct.unpack_from("<H", raw_archive, offset + 6)[0]
    if local_flags & 0x1:
        raise SkillPackageError("ARCHIVE_ENCRYPTED", "Encrypted ZIP members are not allowed")
    if local_flags != info.flag_bits:
        raise SkillPackageError("ARCHIVE_INVALID", "ZIP header flags do not match")
    local_compression = struct.unpack_from("<H", raw_archive, offset + 8)[0]
    if local_compression != info.compress_type:
        raise SkillPackageError("ARCHIVE_INVALID", "ZIP compression methods do not match")
    local_crc, local_compressed_size, local_file_size = struct.unpack_from(
        "<III", raw_archive, offset + 14
    )
    if not local_flags & 0x8 and (
        local_crc != info.CRC
        or local_compressed_size != info.compress_size
        or local_file_size != info.file_size
    ):
        raise SkillPackageError(
            "ARCHIVE_INVALID", "ZIP local metadata does not match central metadata"
        )
    name_length, extra_length = struct.unpack_from("<HH", raw_archive, offset + 26)
    name_start = offset + 30
    name_end = name_start + name_length
    data_offset = name_end + extra_length
    if data_offset > len(raw_archive):
        raise SkillPackageError("ARCHIVE_INVALID", "Malformed ZIP local header")
    local_name = raw_archive[name_start:name_end]
    if b"\x00" in local_name:
        raise SkillPackageError("ARCHIVE_UNSAFE_PATH", "Unsafe ZIP member path")
    decoded_local_name = _decode_zip_name(local_name, local_flags)
    _normalize_path(decoded_local_name)
    if local_name != central_name:
        raise SkillPackageError("ARCHIVE_INVALID", "ZIP local and central paths do not match")
    return int(data_offset)


def _read_raw_central_names(raw_archive: bytes, count: int, offset: int) -> tuple[bytes, ...]:
    names: list[bytes] = []
    for _ in range(count):
        if raw_archive[offset : offset + 4] != b"PK\x01\x02" or offset + 46 > len(raw_archive):
            raise SkillPackageError("ARCHIVE_INVALID", "Malformed ZIP central directory")
        name_length, extra_length, comment_length = struct.unpack_from(
            "<HHH", raw_archive, offset + 28
        )
        name_start = offset + 46
        name_end = name_start + name_length
        next_offset = name_end + extra_length + comment_length
        if next_offset > len(raw_archive):
            raise SkillPackageError("ARCHIVE_INVALID", "Malformed ZIP central directory")
        name = raw_archive[name_start:name_end]
        if b"\x00" in name:
            raise SkillPackageError("ARCHIVE_UNSAFE_PATH", "Unsafe ZIP member path")
        names.append(name)
        offset = next_offset
    return tuple(names)


def _decode_zip_name(raw_name: bytes, flags: int) -> str:
    encoding = "utf-8" if flags & 0x800 else "cp437"
    try:
        return raw_name.decode(encoding)
    except UnicodeDecodeError as error:
        raise SkillPackageError(
            "ARCHIVE_UNSAFE_PATH", "Invalid ZIP member path encoding"
        ) from error


def _entry_bounds(infos: list[zipfile.ZipInfo], central_offset: int) -> dict[int, int]:
    offsets = sorted(info.header_offset for info in infos)
    return {
        offset: offsets[index + 1] if index + 1 < len(offsets) else central_offset
        for index, offset in enumerate(offsets)
    }


def _reject_ancestor_file_conflicts(paths: Iterable[str]) -> None:
    canonical_files = {path.casefold(): path for path in paths}
    for folded_path, path in canonical_files.items():
        parts = folded_path.split("/")
        for depth in range(1, len(parts)):
            if "/".join(parts[:depth]) in canonical_files:
                raise SkillPackageError(
                    "ARCHIVE_PATH_CONFLICT",
                    "ZIP contains a file used as a parent directory",
                    path=path,
                )


def _normalize_path(raw_path: str) -> str:
    if "\x00" in raw_path or "\\" in raw_path:
        raise SkillPackageError("ARCHIVE_UNSAFE_PATH", "Unsafe ZIP member path")
    normalized = unicodedata.normalize("NFC", raw_path)
    drive, _ = ntpath.splitdrive(normalized)
    path = PurePosixPath(normalized)
    parts = normalized.rstrip("/").split("/")
    if any(unicodedata.category(character) in {"Cc", "Cf"} for character in normalized):
        raise SkillPackageError("ARCHIVE_UNSAFE_PATH", "Unsafe ZIP member path")
    if (
        not normalized
        or normalized.startswith("/")
        or drive
        or any(part in ("", ".", "..") for part in parts)
        or path.is_absolute()
    ):
        raise SkillPackageError("ARCHIVE_UNSAFE_PATH", "Unsafe ZIP member path")
    if any(part.casefold() in {".git", ".gitmodules"} for part in parts):
        raise SkillPackageError(
            "ARCHIVE_GIT_METADATA", "Git metadata paths are not allowed", path=normalized
        )
    if len(parts) > MAX_PATH_DEPTH:
        raise SkillPackageError("ARCHIVE_PATH_TOO_DEEP", "ZIP member path is too deep")
    if len(normalized.rstrip("/").encode("utf-8")) > MAX_PATH_BYTES:
        raise SkillPackageError("ARCHIVE_PATH_TOO_LONG", "ZIP member path is too long")
    return normalized.rstrip("/") + ("/" if raw_path.endswith("/") else "")


def _validate_member_type(info: zipfile.ZipInfo, is_directory: bool) -> None:
    mode = (info.external_attr >> 16) & 0xFFFF if info.create_system == 3 else 0
    file_type = stat.S_IFMT(mode)
    allowed_types = (0, stat.S_IFDIR) if is_directory else (0, stat.S_IFREG)
    unsafe_permissions = mode & (stat.S_ISUID | stat.S_ISGID | stat.S_ISVTX)
    if (
        file_type not in allowed_types
        or unsafe_permissions
        or (not is_directory and _has_unix_link_target(info.extra))
    ):
        raise SkillPackageError(
            "ARCHIVE_UNSUPPORTED_FILE",
            "Links and special files are not allowed",
            path=info.filename,
        )


def _has_unix_link_target(extra: bytes) -> bool:
    offset = 0
    while offset < len(extra):
        if len(extra) - offset < 4:
            raise SkillPackageError("ARCHIVE_INVALID", "Malformed ZIP extra field")
        field_id, size = struct.unpack_from("<HH", extra, offset)
        offset += 4
        if offset + size > len(extra):
            raise SkillPackageError("ARCHIVE_INVALID", "Malformed ZIP extra field")
        if field_id == _UNIX_EXTRA_FIELD and size > 12:
            return True
        offset += size
    return False


def _find_skill_root(paths: Iterable[str]) -> str:
    manifests: list[str] = []
    for path in paths:
        parts = path.split("/")
        if len(parts) == 2 and parts[1] == "SKILL.md":
            manifests.append(parts[0])
    roots = sorted(set(manifests), key=str.encode)
    if not roots:
        raise SkillPackageError(
            "ARCHIVE_SKILL_ROOT_REQUIRED", "ZIP must contain one root-level SKILL.md"
        )
    if len(roots) > 1:
        raise SkillPackageError("ARCHIVE_MULTIPLE_SKILL_ROOTS", "ZIP contains multiple skill roots")
    return roots[0]


def _read_member(
    raw_archive: bytes,
    info: zipfile.ZipInfo,
    data_offset: int,
    entry_bound: int,
    extracted_before: int,
) -> tuple[bytes, int]:
    if data_offset > entry_bound or entry_bound > len(raw_archive):
        raise SkillPackageError("ARCHIVE_INVALID", "Invalid ZIP compressed data bounds")

    content = bytearray()
    actual_size = 0
    if info.compress_type == zipfile.ZIP_STORED:
        data_end = data_offset + info.compress_size
        if info.compress_size < 0 or data_end > entry_bound:
            raise SkillPackageError("ARCHIVE_INVALID", "Invalid ZIP compressed data bounds")
        compressed = memoryview(raw_archive)[data_offset:data_end]
        for offset in range(0, len(compressed), _READ_CHUNK_BYTES):
            chunk = bytes(compressed[offset : offset + _READ_CHUNK_BYTES])
            actual_size = _append_extracted_chunk(
                content, chunk, actual_size, extracted_before, info.filename
            )
        _validate_data_descriptor(raw_archive[data_end:entry_bound], info)
    else:
        compressed = memoryview(raw_archive)[data_offset:entry_bound]
        decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
        cursor = 0
        actual_compressed_size: int | None = None
        trailing = b""
        while cursor < len(compressed) and not decompressor.eof:
            pending = bytes(compressed[cursor : cursor + _READ_CHUNK_BYTES])
            cursor += len(pending)
            while pending and not decompressor.eof:
                chunk = decompressor.decompress(pending, _READ_CHUNK_BYTES)
                actual_size = _append_extracted_chunk(
                    content, chunk, actual_size, extracted_before, info.filename
                )
                if decompressor.eof:
                    actual_compressed_size = cursor - len(decompressor.unused_data)
                    trailing = decompressor.unused_data + bytes(compressed[cursor:])
                    break
                pending = decompressor.unconsumed_tail
        while not decompressor.eof:
            chunk = decompressor.decompress(b"", _READ_CHUNK_BYTES)
            if not chunk:
                break
            actual_size = _append_extracted_chunk(
                content, chunk, actual_size, extracted_before, info.filename
            )
        if not decompressor.eof:
            raise SkillPackageError("ARCHIVE_INVALID", "Truncated DEFLATE member")
        if actual_compressed_size is None:
            actual_compressed_size = cursor
            trailing = bytes(compressed[cursor:])
        _validate_data_descriptor(trailing, info)
        if actual_compressed_size != info.compress_size:
            raise SkillPackageError("ARCHIVE_INVALID", "ZIP compressed size mismatch")

    if actual_size != info.file_size or zlib.crc32(content) != info.CRC:
        raise SkillPackageError("ARCHIVE_INVALID", "ZIP member size or checksum mismatch")
    return bytes(content), actual_size


def _validate_data_descriptor(trailing: bytes, info: zipfile.ZipInfo) -> None:
    if not info.flag_bits & 0x8:
        if trailing:
            raise SkillPackageError("ARCHIVE_INVALID", "Unexpected data after ZIP member")
        return
    descriptor = trailing[4:] if trailing.startswith(b"PK\x07\x08") else trailing
    if len(descriptor) != 12:
        raise SkillPackageError("ARCHIVE_INVALID", "Malformed ZIP data descriptor")
    crc, compressed_size, file_size = struct.unpack("<III", descriptor)
    if (crc, compressed_size, file_size) != (info.CRC, info.compress_size, info.file_size):
        raise SkillPackageError("ARCHIVE_INVALID", "ZIP data descriptor mismatch")


def _append_extracted_chunk(
    content: bytearray,
    chunk: bytes,
    actual_size: int,
    extracted_before: int,
    path: str,
) -> int:
    actual_size += len(chunk)
    if actual_size > MAX_FILE_BYTES:
        raise SkillPackageError(
            "ARCHIVE_FILE_TOO_LARGE", "ZIP member exceeds file size limit", path=path
        )
    if extracted_before + actual_size > MAX_EXTRACTED_BYTES:
        raise SkillPackageError("ARCHIVE_EXTRACTED_TOO_LARGE", "ZIP exceeds extracted size limit")
    content.extend(chunk)
    return actual_size


def _reject_nested_archive(path: str, content: bytes) -> None:
    lower_path = path.casefold()
    if (
        lower_path.endswith(_NESTED_SUFFIXES)
        or any(content.startswith(signature) for signature in _NESTED_SIGNATURES)
        or _is_tar_archive(content)
    ):
        raise SkillPackageError("ARCHIVE_NESTED", "Nested archives are not allowed", path=path)


def _reject_git_lfs_pointer(path: str, content: bytes) -> None:
    lines = content.replace(b"\r\n", b"\n").splitlines()
    if lines and lines[0] == b"version https://git-lfs.github.com/spec/v1":
        raise SkillPackageError(
            "ARCHIVE_GIT_LFS_POINTER", "Git LFS pointer files are not allowed", path=path
        )


def _is_tar_archive(content: bytes) -> bool:
    try:
        with tarfile.open(fileobj=io.BytesIO(content), mode="r:") as archive:
            archive.getmembers()
    except (EOFError, OSError, tarfile.TarError):
        return False
    return True


def _write_canonical_zip(slug: str, files: tuple[SkillFile, ...]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(
        output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9, strict_timestamps=True
    ) as archive:
        for file in files:
            full_path = f"{slug}/{file.path}"
            info = zipfile.ZipInfo(full_path, date_time=_CANONICAL_TIMESTAMP)
            info.create_system = 3
            permissions = 0o755 if file.path.startswith("scripts/") else 0o644
            info.external_attr = (stat.S_IFREG | permissions) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(
                info, file.content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9
            )
    return output.getvalue()
