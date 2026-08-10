from __future__ import annotations

from dataclasses import replace
import inspect
import io
import json
import os
from pathlib import Path
import stat
from typing import Never
from uuid import UUID
import zipfile

from agno.skills.errors import SkillValidationError
import pytest

from agent_service.skill_materializer import (
    SkillGenerationMaterializer,
    SkillMaterializerError,
)
from agent_service.skill_runtime_types import RuntimeSetSnapshot, RuntimeSkillArtifact
from skill_core import canonicalize_skill_zip


SET_ID = UUID("10000000-0000-4000-8000-000000000001")


def skill_package(
    slug: str,
    *,
    instructions: str | None = None,
    reference: str | None = None,
    script: bytes | None = None,
):
    output = io.BytesIO()
    files = {
        f"{slug}/SKILL.md": (
            f"---\nname: {slug}\ndescription: {slug} skill.\n---\n"
            f"{instructions if instructions is not None else f'# {slug}\n'}"
        ).encode(),
    }
    if script is not None:
        files[f"{slug}/scripts/run.py"] = script
    if reference is not None:
        files[f"{slug}/references/large.md"] = reference.encode("utf-8")
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in files.items():
            info = zipfile.ZipInfo(path, (2026, 7, 22, 12, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
    return canonicalize_skill_zip(output.getvalue())


def artifact(
    slug: str,
    ordinal: int,
    *,
    instructions: str | None = None,
    reference: str | None = None,
    script: bytes | None = None,
) -> RuntimeSkillArtifact:
    package = skill_package(
        slug,
        instructions=instructions,
        reference=reference,
        script=script,
    )
    return RuntimeSkillArtifact(
        ordinal=ordinal,
        skill_id=UUID(f"20000000-0000-4000-8000-{ordinal + 1:012d}"),
        revision_id=UUID(f"30000000-0000-4000-8000-{ordinal + 1:012d}"),
        slug=slug,
        artifact_sha256=package.sha256,
        compressed_size=package.compressed_size,
        extracted_size=package.extracted_size,
        file_count=len(package.files),
        file_index=(),
        package=package,
    )


def snapshot(*items: RuntimeSkillArtifact) -> RuntimeSetSnapshot:
    return RuntimeSetSnapshot(
        set_id=SET_ID,
        state="candidate",
        item_count=len(items),
        total_extracted_size=sum(item.extracted_size for item in items),
        items=items,
    )


def materializer(root: Path) -> tuple[SkillGenerationMaterializer, int]:
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
    return SkillGenerationMaterializer(root_path=root, root_fd=root_fd), root_fd


def test_materializes_generation_and_verifies_exact_agno_skills(tmp_path: Path) -> None:
    builder, root_fd = materializer(tmp_path)
    try:
        prepared = builder.prepare(snapshot(artifact("alpha", 0), artifact("beta", 1)))
    finally:
        os.close(root_fd)

    assert prepared.set_id == SET_ID
    assert prepared.root == tmp_path / f"generation-{SET_ID}"
    assert prepared.skills is not None
    loaded = prepared.skills.get_all_skills()
    assert {skill.name for skill in loaded} == {"alpha", "beta"}
    assert {Path(skill.source_path).name for skill in loaded} == {"alpha", "beta"}
    assert not (tmp_path / f".preparing-{SET_ID}").exists()


def test_reference_tool_pages_large_documents_before_returning_them_to_model(
    tmp_path: Path,
) -> None:
    reference = "NPU 知识。" * 5_000
    builder, root_fd = materializer(tmp_path)
    try:
        prepared = builder.prepare(snapshot(artifact("alpha", 0, reference=reference)))
    finally:
        os.close(root_fd)

    assert prepared.skills is not None
    reference_tool = next(
        tool
        for tool in prepared.skills.get_tools()
        if tool.name == "get_skill_reference"
    )
    assert reference_tool.entrypoint is not None
    assert "next_offset" in (reference_tool.description or "")
    assert "next_offset" in prepared.skills.get_system_prompt_snippet()
    first = json.loads(reference_tool.entrypoint("alpha", "large.md"))

    assert first["content"] == reference[:12_000]
    assert first["offset"] == 0
    assert first["next_offset"] == 12_000
    assert first["complete"] is False

    second = json.loads(
        reference_tool.entrypoint(
            "alpha",
            "large.md",
            offset=first["next_offset"],
        )
    )
    assert second["content"] == reference[12_000:24_000]
    assert second["offset"] == 12_000


@pytest.mark.asyncio
async def test_instruction_and_script_read_tools_page_large_content(
    tmp_path: Path,
) -> None:
    instructions = "NPU 指令。" * 5_000
    script = ("#!/usr/bin/env python3\n# " + "x" * 30_000).encode()
    builder, root_fd = materializer(tmp_path)
    try:
        prepared = builder.prepare(
            snapshot(
                artifact(
                    "alpha",
                    0,
                    instructions=instructions,
                    script=script,
                )
            )
        )
    finally:
        os.close(root_fd)

    assert prepared.skills is not None
    tools = {tool.name: tool for tool in prepared.skills.get_tools()}
    instruction_tool = tools["get_skill_instructions"]
    script_tool = tools["get_skill_script"]
    assert instruction_tool.entrypoint is not None
    assert script_tool.entrypoint is not None

    first_instructions = json.loads(instruction_tool.entrypoint("alpha"))
    assert first_instructions["instructions"] == instructions[:12_000]
    assert first_instructions["offset"] == 0
    assert first_instructions["next_offset"] == 12_000
    assert first_instructions["complete"] is False

    first_script = json.loads(await script_tool.entrypoint("alpha", "run.py"))
    expected_script = script.decode()
    assert first_script["content"] == expected_script[:12_000]
    assert first_script["offset"] == 0
    assert first_script["next_offset"] == 12_000
    assert first_script["complete"] is False


@pytest.mark.asyncio
async def test_script_tool_is_read_only_even_for_historical_script_artifacts(
    tmp_path: Path,
) -> None:
    builder, root_fd = materializer(tmp_path)
    try:
        prepared = builder.prepare(
            snapshot(
                artifact(
                    "alpha",
                    0,
                    script=b"#!/usr/bin/env python3\nprint('never execute')\n",
                )
            )
        )
    finally:
        os.close(root_fd)

    assert prepared.skills is not None
    script_tool = next(
        tool for tool in prepared.skills.get_tools() if tool.name == "get_skill_script"
    )
    assert script_tool.entrypoint is not None
    assert inspect.iscoroutinefunction(script_tool.entrypoint)
    assert "execute" not in inspect.signature(script_tool.entrypoint).parameters
    assert "execute" not in (script_tool.description or "").casefold()
    with pytest.raises(TypeError):
        await script_tool.entrypoint("alpha", "run.py", execute=True)


def test_explicit_empty_set_has_no_skills_or_skill_tools(tmp_path: Path) -> None:
    builder, root_fd = materializer(tmp_path)
    try:
        prepared = builder.prepare(snapshot())
    finally:
        os.close(root_fd)

    assert prepared.skills is None
    assert prepared.root.is_dir()
    assert list(prepared.root.iterdir()) == []


def test_duplicate_manifest_name_is_rejected_before_filesystem_write(
    tmp_path: Path,
) -> None:
    first = artifact("alpha", 0)
    second = artifact("beta", 1)
    forged_manifest = replace(second.package.manifest, name="alpha")
    forged_package = replace(second.package, manifest=forged_manifest)
    second = replace(second, package=forged_package)
    builder, root_fd = materializer(tmp_path)
    try:
        with pytest.raises(SkillMaterializerError) as caught:
            builder.prepare(snapshot(first, second))
    finally:
        os.close(root_fd)

    assert caught.value.code == "skill_validation_failed"
    assert list(tmp_path.iterdir()) == []


def test_artifact_failure_cleans_preparing_directory(tmp_path: Path) -> None:
    item = artifact("alpha", 0)
    item = replace(item, package=replace(item.package, sha256="0" * 64))
    builder, root_fd = materializer(tmp_path)
    try:
        with pytest.raises(SkillMaterializerError) as caught:
            builder.prepare(snapshot(item))
    finally:
        os.close(root_fd)

    assert caught.value.code == "artifact_invalid"
    assert list(tmp_path.iterdir()) == []


def test_agno_validation_or_silent_omission_cleans_final_generation(
    tmp_path: Path,
) -> None:
    class MissingSkills:
        def get_all_skills(self):
            return []

    for factory in (
        lambda _: (_ for _ in ()).throw(SkillValidationError("invalid", errors=[])),
        lambda _: MissingSkills(),
    ):
        builder, root_fd = materializer(tmp_path)
        builder = SkillGenerationMaterializer(
            root_path=tmp_path,
            root_fd=root_fd,
            skills_factory=factory,
        )
        try:
            with pytest.raises(SkillMaterializerError) as caught:
                builder.prepare(snapshot(artifact("alpha", 0)))
        finally:
            os.close(root_fd)
        assert caught.value.code == "skill_validation_failed"
        assert list(tmp_path.iterdir()) == []


def test_existing_generation_is_never_overwritten(tmp_path: Path) -> None:
    existing = tmp_path / f"generation-{SET_ID}"
    existing.mkdir()
    marker = existing / "marker"
    marker.write_text("keep")
    builder, root_fd = materializer(tmp_path)
    try:
        with pytest.raises(SkillMaterializerError) as caught:
            builder.prepare(snapshot(artifact("alpha", 0)))
    finally:
        os.close(root_fd)

    assert caught.value.code == "artifact_invalid"
    assert marker.read_text() == "keep"
    assert not (tmp_path / f".preparing-{SET_ID}").exists()


def test_process_interrupt_cleans_final_generation_and_propagates(
    tmp_path: Path,
) -> None:
    def interrupt(_: str) -> Never:
        raise KeyboardInterrupt

    root_fd = os.open(tmp_path, os.O_RDONLY | os.O_DIRECTORY)
    builder = SkillGenerationMaterializer(
        root_path=tmp_path,
        root_fd=root_fd,
        skills_factory=interrupt,
    )
    try:
        with pytest.raises(KeyboardInterrupt):
            builder.prepare(snapshot(artifact("alpha", 0)))
    finally:
        os.close(root_fd)

    assert list(tmp_path.iterdir()) == []
