"""fd-relative materialization for previously canonicalized Skill packages."""

from __future__ import annotations

import hashlib
import os
import stat
import unicodedata
from dataclasses import dataclass
from typing import Final, NoReturn

from .archive import SkillPackageError, canonicalize_skill_zip
from .types import CanonicalSkillPackage, SkillFile


_DIRECTORY_MODE: Final = 0o700
_FILE_MODE: Final = 0o600
_SCRIPT_MODE: Final = 0o700
_DIRECTORY_FLAGS: Final = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_WRITE_FLAGS: Final = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC
_FILE_READ_FLAGS: Final = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC
_DIRECTORY_NAME_MAX_BYTES: Final = 160


class SkillMaterializationError(RuntimeError):
    """Stable local failure without filesystem or package details."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class _NodeIdentity:
    device: int
    inode: int


def _fail(code: str) -> NoReturn:
    raise SkillMaterializationError(code) from None


def _validate_directory_name(value: str) -> None:
    if (
        type(value) is not str
        or value in {"", ".", ".."}
        or not value.isascii()
        or len(value.encode("ascii")) > _DIRECTORY_NAME_MAX_BYTES
        or any(
            character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
            for character in value
        )
        or unicodedata.normalize("NFC", value) != value
    ):
        _fail("TARGET_INVALID")


def _validate_package(package: CanonicalSkillPackage) -> CanonicalSkillPackage:
    if type(package) is not CanonicalSkillPackage:
        _fail("PACKAGE_INVALID")
    try:
        canonical = canonicalize_skill_zip(package.archive)
    except (SkillPackageError, TypeError, ValueError):
        _fail("PACKAGE_INVALID")
    if (
        package.slug != canonical.slug
        or package.archive != canonical.archive
        or package.sha256 != canonical.sha256
        or package.compressed_size != canonical.compressed_size
        or package.extracted_size != canonical.extracted_size
        or package.files != canonical.files
        or package.manifest != canonical.manifest
    ):
        _fail("PACKAGE_INVALID")
    return canonical


def _identity(metadata: os.stat_result) -> _NodeIdentity:
    return _NodeIdentity(metadata.st_dev, metadata.st_ino)


def _validate_directory_fd(fd: int, expected: _NodeIdentity | None = None) -> _NodeIdentity:
    metadata = os.fstat(fd)
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or stat.S_IMODE(metadata.st_mode) != _DIRECTORY_MODE
        or metadata.st_nlink < 1
    ):
        _fail("MATERIALIZE_FAILED")
    actual = _identity(metadata)
    if expected is not None and actual != expected:
        _fail("MATERIALIZE_FAILED")
    return actual


def _open_directory_chain(
    root_fd: int,
    parts: tuple[str, ...],
    identities: dict[tuple[str, ...], _NodeIdentity],
) -> int:
    current = os.dup(root_fd)
    try:
        _validate_directory_fd(current, identities[()])
        walked: tuple[str, ...] = ()
        for part in parts:
            child = os.open(part, _DIRECTORY_FLAGS, dir_fd=current)
            os.close(current)
            current = child
            walked = (*walked, part)
            expected = identities.get(walked)
            if expected is None:
                _fail("MATERIALIZE_FAILED")
            _validate_directory_fd(current, expected)
        result = current
        current = -1
        return result
    finally:
        if current >= 0:
            os.close(current)


def _create_directories(
    generation_fd: int,
    files: tuple[SkillFile, ...],
) -> dict[tuple[str, ...], _NodeIdentity]:
    identities: dict[tuple[str, ...], _NodeIdentity] = {(): _validate_directory_fd(generation_fd)}
    directories = {
        tuple(file.path.split("/")[:depth])
        for file in files
        for depth in range(1, len(file.path.split("/")))
    }
    for parts in sorted(directories, key=lambda value: (len(value), value)):
        parent_fd = _open_directory_chain(generation_fd, parts[:-1], identities)
        try:
            os.mkdir(parts[-1], _DIRECTORY_MODE, dir_fd=parent_fd)
            directory_fd = os.open(parts[-1], _DIRECTORY_FLAGS, dir_fd=parent_fd)
            try:
                os.fchmod(directory_fd, _DIRECTORY_MODE)
                identities[parts] = _validate_directory_fd(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            os.close(parent_fd)
    return identities


def _write_all(fd: int, content: bytes) -> None:
    pending = memoryview(content)
    while pending:
        written = os.write(fd, pending)
        if written <= 0:
            _fail("MATERIALIZE_FAILED")
        pending = pending[written:]


def _file_mode(file: SkillFile) -> int:
    return _SCRIPT_MODE if file.path.startswith("scripts/") else _FILE_MODE


def _write_file(
    generation_fd: int,
    file: SkillFile,
    identities: dict[tuple[str, ...], _NodeIdentity],
) -> None:
    parts = tuple(file.path.split("/"))
    expected_mode = _file_mode(file)
    parent_fd = _open_directory_chain(generation_fd, parts[:-1], identities)
    try:
        file_fd = os.open(parts[-1], _FILE_WRITE_FLAGS, expected_mode, dir_fd=parent_fd)
        try:
            os.fchmod(file_fd, expected_mode)
            metadata = os.fstat(file_fd)
            if (
                not stat.S_ISREG(metadata.st_mode)
                or stat.S_IMODE(metadata.st_mode) != expected_mode
                or metadata.st_nlink != 1
            ):
                _fail("MATERIALIZE_FAILED")
            _write_all(file_fd, file.content)
            os.fsync(file_fd)
            metadata = os.fstat(file_fd)
            if metadata.st_size != file.size:
                _fail("MATERIALIZE_FAILED")
        finally:
            os.close(file_fd)
    finally:
        os.close(parent_fd)


def _read_exact(fd: int, expected_size: int) -> bytes:
    content = bytearray()
    while len(content) <= expected_size:
        chunk = os.read(fd, min(64 * 1024, expected_size + 1 - len(content)))
        if not chunk:
            return bytes(content)
        content.extend(chunk)
    return bytes(content)


def _verify_file(
    generation_fd: int,
    file: SkillFile,
    identities: dict[tuple[str, ...], _NodeIdentity],
) -> None:
    parts = tuple(file.path.split("/"))
    expected_mode = _file_mode(file)
    parent_fd = _open_directory_chain(generation_fd, parts[:-1], identities)
    try:
        file_fd = os.open(parts[-1], _FILE_READ_FLAGS, dir_fd=parent_fd)
        try:
            metadata = os.fstat(file_fd)
            if (
                not stat.S_ISREG(metadata.st_mode)
                or stat.S_IMODE(metadata.st_mode) != expected_mode
                or metadata.st_nlink != 1
                or metadata.st_size != file.size
            ):
                _fail("MATERIALIZE_FAILED")
            content = _read_exact(file_fd, file.size)
            if content != file.content or hashlib.sha256(content).hexdigest() != file.sha256:
                _fail("MATERIALIZE_FAILED")
        finally:
            os.close(file_fd)
    finally:
        os.close(parent_fd)


def _collect_tree(directory_fd: int, prefix: tuple[str, ...] = ()) -> set[str]:
    entries: set[str] = set()
    for name in os.listdir(directory_fd):
        metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        path = "/".join((*prefix, name))
        if stat.S_ISDIR(metadata.st_mode):
            if stat.S_IMODE(metadata.st_mode) != _DIRECTORY_MODE:
                _fail("MATERIALIZE_FAILED")
            child_fd = os.open(name, _DIRECTORY_FLAGS, dir_fd=directory_fd)
            try:
                entries.update(_collect_tree(child_fd, (*prefix, name)))
            finally:
                os.close(child_fd)
        elif stat.S_ISREG(metadata.st_mode):
            entries.add(path)
        else:
            _fail("MATERIALIZE_FAILED")
    return entries


def _verify_tree(
    root_fd: int,
    directory_name: str,
    generation_fd: int,
    canonical: CanonicalSkillPackage,
    identities: dict[tuple[str, ...], _NodeIdentity],
) -> None:
    reopened = os.open(directory_name, _DIRECTORY_FLAGS, dir_fd=root_fd)
    try:
        _validate_directory_fd(reopened, identities[()])
    finally:
        os.close(reopened)
    for file in canonical.files:
        _verify_file(generation_fd, file, identities)
    if _collect_tree(generation_fd) != {file.path for file in canonical.files}:
        _fail("MATERIALIZE_FAILED")


def _remove_contents(directory_fd: int) -> None:
    for name in os.listdir(directory_fd):
        metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if stat.S_ISDIR(metadata.st_mode):
            child_fd = os.open(name, _DIRECTORY_FLAGS, dir_fd=directory_fd)
            try:
                _remove_contents(child_fd)
            finally:
                os.close(child_fd)
            os.rmdir(name, dir_fd=directory_fd)
        else:
            os.unlink(name, dir_fd=directory_fd)


def _cleanup(root_fd: int, directory_name: str) -> None:
    try:
        metadata = os.stat(directory_name, dir_fd=root_fd, follow_symlinks=False)
        if stat.S_ISDIR(metadata.st_mode):
            directory_fd = os.open(directory_name, _DIRECTORY_FLAGS, dir_fd=root_fd)
            try:
                _remove_contents(directory_fd)
            finally:
                os.close(directory_fd)
            os.rmdir(directory_name, dir_fd=root_fd)
        else:
            os.unlink(directory_name, dir_fd=root_fd)
    except FileNotFoundError:
        pass
    except OSError:
        pass


def materialize_canonical_skill(
    package: CanonicalSkillPackage,
    *,
    root_fd: int,
    directory_name: str,
) -> None:
    """Write one verified package under a new directory relative to ``root_fd``."""

    _validate_directory_name(directory_name)
    canonical = _validate_package(package)
    try:
        root_metadata = os.fstat(root_fd)
    except OSError:
        _fail("TARGET_INVALID")
    if not stat.S_ISDIR(root_metadata.st_mode):
        _fail("TARGET_INVALID")

    created = False
    generation_fd = -1
    try:
        try:
            os.mkdir(directory_name, _DIRECTORY_MODE, dir_fd=root_fd)
        except FileExistsError:
            _fail("TARGET_EXISTS")
        created = True
        generation_fd = os.open(directory_name, _DIRECTORY_FLAGS, dir_fd=root_fd)
        os.fchmod(generation_fd, _DIRECTORY_MODE)
        identities = _create_directories(generation_fd, canonical.files)
        for file in canonical.files:
            _write_file(generation_fd, file, identities)
        _verify_tree(root_fd, directory_name, generation_fd, canonical, identities)
    except SkillMaterializationError:
        if created:
            _cleanup(root_fd, directory_name)
        raise
    except BaseException as error:
        if created:
            _cleanup(root_fd, directory_name)
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        _fail("MATERIALIZE_FAILED")
    finally:
        if generation_fd >= 0:
            os.close(generation_fd)
