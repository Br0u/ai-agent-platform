"""Safe ZIP validation and deterministic canonicalization."""

from __future__ import annotations

import hashlib
import io
import ntpath
import stat
import struct
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


def canonicalize_skill_archive(archive: bytes) -> CanonicalSkillPackage:
    """Validate untrusted ZIP bytes and return one deterministic skill package.

    Member contents are streamed and counted. Nothing is extracted to the filesystem.
    """

    if len(archive) > MAX_ARCHIVE_BYTES:
        raise SkillPackageError("ARCHIVE_TOO_LARGE", "ZIP exceeds compressed size limit")

    try:
        source = zipfile.ZipFile(io.BytesIO(archive), "r")
    except (OSError, ValueError, zipfile.BadZipFile, zipfile.LargeZipFile) as error:
        raise SkillPackageError("ARCHIVE_INVALID", "Invalid ZIP archive") from error

    try:
        files, slug, extracted_size = _read_validated_files(source, archive)
    except SkillPackageError:
        raise
    except (
        EOFError,
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
    return CanonicalSkillPackage(
        slug=slug,
        archive=canonical_archive,
        sha256=hashlib.sha256(canonical_archive).hexdigest(),
        compressed_size=len(canonical_archive),
        extracted_size=extracted_size,
        files=files,
        manifest=None,
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
    file_infos: list[tuple[str, zipfile.ZipInfo]] = []
    _validate_raw_central_names(raw_archive, len(infos), source.start_dir)

    for info in infos:
        _validate_raw_local_name(raw_archive, info)
        normalized = _normalize_path(info.filename)
        folded = normalized.casefold()
        if normalized in normalized_paths or folded in folded_paths:
            raise SkillPackageError(
                "ARCHIVE_PATH_CONFLICT",
                "ZIP contains colliding canonical paths",
                path=normalized,
            )
        normalized_paths[normalized] = info.filename
        folded_paths[folded] = normalized

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
        if not is_directory:
            file_infos.append((normalized, info))

    _reject_ancestor_file_conflicts(path for path, _ in file_infos)
    slug = _find_skill_root(path for path, _ in file_infos)
    if any(path.split("/", 1)[0] != slug for path, _ in file_infos):
        raise SkillPackageError(
            "ARCHIVE_MULTIPLE_SKILL_ROOTS",
            "Every file must belong to the single skill root",
        )

    extracted_size = 0
    result: list[SkillFile] = []
    for full_path, info in file_infos:
        relative_path = full_path[len(slug) + 1 :]
        content, actual_size = _read_member(source, info, extracted_size)
        extracted_size += actual_size
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


def _validate_raw_local_name(raw_archive: bytes, info: zipfile.ZipInfo) -> None:
    offset = info.header_offset
    if raw_archive[offset : offset + 4] != b"PK\x03\x04" or offset + 30 > len(raw_archive):
        raise SkillPackageError("ARCHIVE_INVALID", "Malformed ZIP local header")
    local_flags = struct.unpack_from("<H", raw_archive, offset + 6)[0]
    if local_flags & 0x1:
        raise SkillPackageError("ARCHIVE_ENCRYPTED", "Encrypted ZIP members are not allowed")
    name_length = struct.unpack_from("<H", raw_archive, offset + 26)[0]
    name_start = offset + 30
    name_end = name_start + name_length
    if name_end > len(raw_archive):
        raise SkillPackageError("ARCHIVE_INVALID", "Malformed ZIP local header")
    if b"\x00" in raw_archive[name_start:name_end]:
        raise SkillPackageError("ARCHIVE_UNSAFE_PATH", "Unsafe ZIP member path")


def _validate_raw_central_names(raw_archive: bytes, count: int, offset: int) -> None:
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
        if b"\x00" in raw_archive[name_start:name_end]:
            raise SkillPackageError("ARCHIVE_UNSAFE_PATH", "Unsafe ZIP member path")
        offset = next_offset


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
    if (
        not normalized
        or normalized.startswith("/")
        or drive
        or any(part in ("", ".", "..") for part in parts)
        or path.is_absolute()
    ):
        raise SkillPackageError("ARCHIVE_UNSAFE_PATH", "Unsafe ZIP member path")
    if len(parts) > MAX_PATH_DEPTH:
        raise SkillPackageError("ARCHIVE_PATH_TOO_DEEP", "ZIP member path is too deep")
    if len(normalized.rstrip("/").encode("utf-8")) > MAX_PATH_BYTES:
        raise SkillPackageError("ARCHIVE_PATH_TOO_LONG", "ZIP member path is too long")
    return normalized.rstrip("/") + ("/" if raw_path.endswith("/") else "")


def _validate_member_type(info: zipfile.ZipInfo, is_directory: bool) -> None:
    mode = (info.external_attr >> 16) & 0xFFFF if info.create_system == 3 else 0
    file_type = stat.S_IFMT(mode)
    allowed_types = (0, stat.S_IFDIR) if is_directory else (0, stat.S_IFREG)
    if file_type not in allowed_types or (not is_directory and _has_unix_link_target(info.extra)):
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
    source: zipfile.ZipFile, info: zipfile.ZipInfo, extracted_before: int
) -> tuple[bytes, int]:
    if info.file_size > MAX_FILE_BYTES:
        raise SkillPackageError(
            "ARCHIVE_FILE_TOO_LARGE", "ZIP member exceeds file size limit", path=info.filename
        )
    if extracted_before + info.file_size > MAX_EXTRACTED_BYTES:
        raise SkillPackageError("ARCHIVE_EXTRACTED_TOO_LARGE", "ZIP exceeds extracted size limit")

    content = bytearray()
    actual_size = 0
    with source.open(info, "r") as member:
        while True:
            chunk = member.read(_READ_CHUNK_BYTES)
            if not chunk:
                break
            actual_size += len(chunk)
            if actual_size > MAX_FILE_BYTES:
                raise SkillPackageError(
                    "ARCHIVE_FILE_TOO_LARGE",
                    "ZIP member exceeds file size limit",
                    path=info.filename,
                )
            if extracted_before + actual_size > MAX_EXTRACTED_BYTES:
                raise SkillPackageError(
                    "ARCHIVE_EXTRACTED_TOO_LARGE", "ZIP exceeds extracted size limit"
                )
            content.extend(chunk)
    return bytes(content), actual_size


def _reject_nested_archive(path: str, content: bytes) -> None:
    lower_path = path.casefold()
    if lower_path.endswith(_NESTED_SUFFIXES) or any(
        content.startswith(signature) for signature in _NESTED_SIGNATURES
    ):
        raise SkillPackageError("ARCHIVE_NESTED", "Nested archives are not allowed", path=path)


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
