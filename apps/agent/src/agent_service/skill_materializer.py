"""Materialize one immutable Skill set and verify Agno loaded it exactly."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
import logging
import os
from pathlib import Path
import stat
from typing import NoReturn, Protocol, cast
from uuid import UUID

from agno.skills import Skills
from agno.skills.errors import SkillValidationError
from agno.skills.loaders import LocalSkills

from agent_service.skill_runtime_types import RuntimeSetSnapshot
from skill_core import SkillMaterializationError, materialize_canonical_skill


_DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_LOGGER = logging.getLogger(__name__)


class LoadedSkills(Protocol):
    def get_all_skills(self) -> Sequence[object]: ...


SkillsFactory = Callable[[str], LoadedSkills]


class SkillMaterializerError(RuntimeError):
    """Stable materializer failure safe for the activation coordinator."""

    def __init__(self, code: str, stage: str = "unknown") -> None:
        self.code = code
        self.stage = stage
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class PreparedGeneration:
    set_id: UUID
    skills: Skills | None
    root: Path


def _fail(code: str, stage: str) -> NoReturn:
    _LOGGER.warning("Skill materialization failed at %s", stage)
    raise SkillMaterializerError(code, stage) from None


def _default_skills_factory(path: str) -> LoadedSkills:
    return Skills(loaders=[LocalSkills(path=path, validate=True)])


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


def _remove_tree(root_fd: int, name: str) -> None:
    try:
        metadata = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
        if stat.S_ISDIR(metadata.st_mode):
            directory_fd = os.open(name, _DIRECTORY_FLAGS, dir_fd=root_fd)
            try:
                _remove_contents(directory_fd)
            finally:
                os.close(directory_fd)
            os.rmdir(name, dir_fd=root_fd)
        else:
            os.unlink(name, dir_fd=root_fd)
    except FileNotFoundError:
        pass
    except OSError:
        pass


def _exists(root_fd: int, name: str) -> bool:
    try:
        os.stat(name, dir_fd=root_fd, follow_symlinks=False)
        return True
    except FileNotFoundError:
        return False


class SkillGenerationMaterializer:
    """Build `.preparing-*`, atomically publish it, then verify Agno output."""

    def __init__(
        self,
        *,
        root_path: Path,
        root_fd: int,
        skills_factory: SkillsFactory = _default_skills_factory,
    ) -> None:
        self._root_path = root_path
        self._root_fd = root_fd
        self._skills_factory = skills_factory

    def _validate_root(self) -> None:
        if not self._root_path.is_absolute():
            _fail("artifact_invalid", "root_path")
        try:
            path_metadata = os.lstat(self._root_path)
            fd_metadata = os.fstat(self._root_fd)
        except OSError:
            _fail("artifact_invalid", "root_stat")
        if (
            not stat.S_ISDIR(path_metadata.st_mode)
            or not stat.S_ISDIR(fd_metadata.st_mode)
            or (path_metadata.st_dev, path_metadata.st_ino)
            != (fd_metadata.st_dev, fd_metadata.st_ino)
        ):
            _fail("artifact_invalid", "root_identity")

    @staticmethod
    def _validate_snapshot(snapshot: RuntimeSetSnapshot) -> None:
        if type(snapshot) is not RuntimeSetSnapshot:
            _fail("skill_validation_failed", "snapshot")
        names = [item.package.manifest.name for item in snapshot.items]
        if (
            type(snapshot.set_id) is not UUID
            or snapshot.state not in {"candidate", "active"}
            or snapshot.item_count != len(snapshot.items)
            or not 0 <= snapshot.item_count <= 16
            or [item.ordinal for item in snapshot.items]
            != list(range(snapshot.item_count))
            or snapshot.total_extracted_size
            != sum(item.extracted_size for item in snapshot.items)
            or snapshot.total_extracted_size > 24 * 1024 * 1024
            or len(names) != len(set(names))
        ):
            _fail("skill_validation_failed", "snapshot")

    def prepare(self, snapshot: RuntimeSetSnapshot) -> PreparedGeneration:
        self._validate_root()
        self._validate_snapshot(snapshot)
        preparing_name = f".preparing-{snapshot.set_id}"
        generation_name = f"generation-{snapshot.set_id}"
        if _exists(self._root_fd, preparing_name) or _exists(
            self._root_fd, generation_name
        ):
            _fail("artifact_invalid", "generation_exists")

        current_name = preparing_name
        created = False
        preparing_fd = -1
        loading = False
        try:
            os.mkdir(preparing_name, 0o700, dir_fd=self._root_fd)
            created = True
            preparing_fd = os.open(
                preparing_name, _DIRECTORY_FLAGS, dir_fd=self._root_fd
            )
            os.fchmod(preparing_fd, 0o700)
            metadata = os.fstat(preparing_fd)
            if (
                not stat.S_ISDIR(metadata.st_mode)
                or stat.S_IMODE(metadata.st_mode) != 0o700
            ):
                _fail("artifact_invalid", "preparing_mode")
            for item in snapshot.items:
                materialize_canonical_skill(
                    item.package,
                    root_fd=preparing_fd,
                    directory_name=item.slug,
                )
            os.close(preparing_fd)
            preparing_fd = -1
            if _exists(self._root_fd, generation_name):
                _fail("artifact_invalid", "generation_race")
            os.rename(
                preparing_name,
                generation_name,
                src_dir_fd=self._root_fd,
                dst_dir_fd=self._root_fd,
            )
            current_name = generation_name
            generation_root = self._root_path / generation_name
            if not snapshot.items:
                return PreparedGeneration(snapshot.set_id, None, generation_root)

            loading = True
            candidate_skills = self._skills_factory(str(generation_root))
            loaded = candidate_skills.get_all_skills()
            expected = {
                item.package.manifest.name: item.slug for item in snapshot.items
            }
            if len(loaded) != len(expected):
                _fail("skill_validation_failed", "loader_count")
            actual_names: set[str] = set()
            resolved_root = generation_root.resolve(strict=True)
            for skill in loaded:
                name = getattr(skill, "name", None)
                source_path = getattr(skill, "source_path", None)
                if (
                    type(name) is not str
                    or name not in expected
                    or name in actual_names
                    or type(source_path) is not str
                    or Path(source_path) != resolved_root / expected[name]
                ):
                    _fail("skill_validation_failed", "loader_identity")
                actual_names.add(name)
            if actual_names != set(expected):
                _fail("skill_validation_failed", "loader_names")
            return PreparedGeneration(
                snapshot.set_id,
                cast(Skills, candidate_skills),
                generation_root,
            )
        except SkillMaterializerError:
            if created:
                _remove_tree(self._root_fd, current_name)
            raise
        except SkillMaterializationError:
            if created:
                _remove_tree(self._root_fd, current_name)
            _fail("artifact_invalid", "archive_write")
        except SkillValidationError:
            if created:
                _remove_tree(self._root_fd, current_name)
            _fail("skill_validation_failed", "loader_validation")
        except Exception as error:
            if created:
                _remove_tree(self._root_fd, current_name)
            _LOGGER.warning(
                "Skill materialization filesystem failure %s errno=%s",
                type(error).__name__,
                getattr(error, "errno", None),
            )
            _fail(
                "skill_validation_failed" if loading else "artifact_invalid",
                "loader_runtime" if loading else "filesystem",
            )
        except BaseException:
            if created:
                _remove_tree(self._root_fd, current_name)
            raise
        finally:
            if preparing_fd >= 0:
                os.close(preparing_fd)
