"""Materialize one immutable Skill set and verify Agno loaded it exactly."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Sequence
from dataclasses import dataclass
import json
import logging
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import time
from typing import NoReturn, Protocol, cast
from uuid import UUID

from agno.skills import Skills
from agno.skills.errors import SkillValidationError
from agno.skills.loaders import LocalSkills
from agno.skills.utils import ensure_executable, get_interpreter_command, parse_shebang
from agno.exceptions import PathSecurityError
from agno.utils.path_safety import safe_join_relative_path

from agent_service.skill_runtime_types import RuntimeSetSnapshot
from skill_core import SkillMaterializationError, materialize_canonical_skill


_DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
_TOOL_RESULT_PAGE_CHARS = 12_000
_SCRIPT_MAX_SECONDS = 30
_SCRIPT_MAX_ARGUMENTS = 16
_SCRIPT_ARGUMENT_MAX_CHARS = 1_024
_SCRIPT_OUTPUT_MAX_BYTES = 48_000
_LOGGER = logging.getLogger(__name__)


class LoadedSkills(Protocol):
    def get_all_skills(self) -> Sequence[object]: ...


SkillsFactory = Callable[[str], LoadedSkills]


@dataclass(frozen=True, slots=True)
class _BoundedScriptResult:
    stdout: str
    stderr: str
    returncode: int
    output_truncated: bool


def _terminate_script(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        if os.name == "nt":
            process.kill()
        else:
            os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    finally:
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def _run_script_bounded(
    *,
    script_path: Path,
    args: list[str] | None,
    timeout: int,
    cwd: Path,
) -> _BoundedScriptResult:
    """Drain both pipes while retaining only a fixed combined output budget."""
    if os.name == "nt":
        interpreter = parse_shebang(script_path)
        command = [
            *(get_interpreter_command(interpreter) if interpreter else []),
            str(script_path),
            *(args or []),
        ]
    else:
        ensure_executable(script_path)
        command = [str(script_path), *(args or [])]

    process = subprocess.Popen(
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        start_new_session=os.name != "nt",
    )
    assert process.stdout is not None
    assert process.stderr is not None
    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ, "stdout")
    selector.register(process.stderr, selectors.EVENT_READ, "stderr")
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    retained = 0
    output_truncated = False
    deadline = time.monotonic() + timeout
    try:
        while selector.get_map():
            remaining_time = deadline - time.monotonic()
            if remaining_time <= 0:
                _terminate_script(process)
                raise subprocess.TimeoutExpired(command, timeout)
            for key, _ in selector.select(remaining_time):
                chunk = os.read(key.fd, 8_192)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                remaining_output = max(0, _SCRIPT_OUTPUT_MAX_BYTES - retained)
                kept = chunk[:remaining_output]
                buffers[key.data].extend(kept)
                retained += len(kept)
                if len(kept) < len(chunk):
                    output_truncated = True
        returncode = process.wait(timeout=max(0.01, deadline - time.monotonic()))
    except subprocess.TimeoutExpired:
        _terminate_script(process)
        raise
    finally:
        selector.close()
        process.stdout.close()
        process.stderr.close()

    return _BoundedScriptResult(
        stdout=buffers["stdout"].decode("utf-8", errors="replace"),
        stderr=buffers["stderr"].decode("utf-8", errors="replace"),
        returncode=returncode,
        output_truncated=output_truncated,
    )


class PagedSkills(Skills):
    """Keep every Skill tool result within a bounded model-context page."""

    def get_tools(self):
        tools = super().get_tools()
        descriptions = {
            "get_skill_instructions": (
                "Load one bounded instructions page. If next_offset is not null, "
                "call again with offset=next_offset."
            ),
            "get_skill_reference": (
                "Load one bounded reference page. If next_offset is not null, "
                "call again with offset=next_offset."
            ),
            "get_skill_script": (
                "Read one bounded script page, or execute the reviewed script with "
                "bounded timeout and output. For reads, continue with offset=next_offset."
            ),
        }
        for tool in tools:
            tool.description = descriptions.get(tool.name, tool.description)
        return tools

    def get_system_prompt_snippet(self) -> str:
        snippet = super().get_system_prompt_snippet()
        return (
            snippet.replace(
                "Load the full instructions for a skill",
                "Load one bounded instructions page for a skill",
            )
            + "\n\n"
            + "## Bounded Skill Results\n"
            + "Instruction, reference, and script reads return bounded pages. "
            + "When next_offset is not null, continue with offset=next_offset only "
            + "while the additional content is necessary. Script execution output "
            + "is bounded and cannot be paged."
        )

    @staticmethod
    def _page_result(result: dict[str, object], field: str, offset: int) -> str:
        if type(offset) is not int or offset < 0:
            return json.dumps({"error": "Invalid content offset"})
        content = result.get(field)
        if type(content) is not str:
            return json.dumps(result, ensure_ascii=False)
        if offset > len(content):
            return json.dumps({"error": "Content offset exceeds content length"})
        end = min(len(content), offset + _TOOL_RESULT_PAGE_CHARS)
        return json.dumps(
            {
                **result,
                field: content[offset:end],
                "offset": offset,
                "next_offset": end if end < len(content) else None,
                "complete": end == len(content),
            },
            ensure_ascii=False,
        )

    def _get_skill_instructions(self, skill_name: str, offset: int = 0) -> str:
        result = json.loads(super()._get_skill_instructions(skill_name))
        return self._page_result(result, "instructions", offset)

    def _get_skill_reference(
        self,
        skill_name: str,
        reference_path: str,
        offset: int = 0,
    ) -> str:
        result = json.loads(super()._get_skill_reference(skill_name, reference_path))
        return self._page_result(result, "content", offset)

    async def _get_skill_script(  # type: ignore[override]
        self,
        skill_name: str,
        script_path: str,
        execute: bool = False,
        args: list[str] | None = None,
        timeout: int = _SCRIPT_MAX_SECONDS,
        offset: int = 0,
    ) -> str:
        if type(execute) is not bool:
            return json.dumps({"error": "Invalid execute flag"})
        if args is not None and (
            type(args) is not list
            or len(args) > _SCRIPT_MAX_ARGUMENTS
            or any(
                type(argument) is not str
                or len(argument) > _SCRIPT_ARGUMENT_MAX_CHARS
                for argument in args
            )
        ):
            return json.dumps({"error": "Invalid script arguments"})
        if type(timeout) is not int or timeout <= 0:
            return json.dumps({"error": "Invalid script timeout"})

        if not execute:
            parent_get_script = super()._get_skill_script
            result = json.loads(
                await asyncio.to_thread(
                    parent_get_script,
                    skill_name,
                    script_path,
                    execute=False,
                    args=args,
                    timeout=min(timeout, _SCRIPT_MAX_SECONDS),
                )
            )
            return self._page_result(result, "content", offset)
        if offset != 0:
            return json.dumps({"error": "Execution output does not support offset"})

        skill = self.get_skill(skill_name)
        if skill is None:
            return json.dumps(
                {
                    "error": f"Skill '{skill_name}' not found",
                    "available_skills": ", ".join(self.get_skill_names()),
                }
            )
        if script_path not in skill.scripts:
            return json.dumps(
                {
                    "error": f"Script '{script_path}' not found in skill '{skill_name}'",
                    "available_scripts": skill.scripts,
                }
            )
        try:
            script_file = safe_join_relative_path(
                Path(skill.source_path) / "scripts",
                script_path,
            )
        except (PathSecurityError, OSError):
            return json.dumps(
                {"error": "Invalid script path", "skill_name": skill_name}
            )
        bounded_timeout = min(timeout, _SCRIPT_MAX_SECONDS)
        try:
            script_result = await asyncio.to_thread(
                _run_script_bounded,
                script_path=script_file,
                args=args,
                timeout=bounded_timeout,
                cwd=Path(skill.source_path),
            )
        except subprocess.TimeoutExpired:
            return json.dumps(
                {
                    "error": (
                        f"Script execution timed out after {bounded_timeout} seconds"
                    ),
                    "skill_name": skill_name,
                    "script_path": script_path,
                }
            )
        except FileNotFoundError:
            return json.dumps(
                {
                    "error": "Interpreter or script not found",
                    "skill_name": skill_name,
                    "script_path": script_path,
                }
            )
        except Exception:
            return json.dumps(
                {
                    "error": "Script execution failed",
                    "skill_name": skill_name,
                    "script_path": script_path,
                }
            )

        stdout = script_result.stdout
        stderr = script_result.stderr
        bounded_stdout = stdout[:_TOOL_RESULT_PAGE_CHARS]
        remaining = _TOOL_RESULT_PAGE_CHARS - len(bounded_stdout)
        bounded_stderr = stderr[:remaining]
        return json.dumps(
            {
                "skill_name": skill_name,
                "script_path": script_path,
                "stdout": bounded_stdout,
                "stderr": bounded_stderr,
                "returncode": script_result.returncode,
                "output_truncated": (
                    getattr(script_result, "output_truncated", False)
                    or len(bounded_stdout) < len(stdout)
                    or len(bounded_stderr) < len(stderr)
                ),
            },
            ensure_ascii=False,
        )


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
    return PagedSkills(loaders=[LocalSkills(path=path, validate=True)])


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
