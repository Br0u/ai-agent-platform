"""Bounded, review-only diffs for canonical skill packages."""

from __future__ import annotations

import difflib

from .types import (
    CanonicalSkillPackage,
    SkillDiffStatus,
    SkillFile,
    SkillFileDiff,
    SkillPackageDiff,
)

MAX_DIFF_BYTES = 512 * 1024


def diff_packages(before: CanonicalSkillPackage, after: CanonicalSkillPackage) -> SkillPackageDiff:
    """Compare package files without mutating either revision."""

    before_files = {file.path: file for file in before.files}
    after_files = {file.path: file for file in after.files}
    paths = sorted(before_files.keys() | after_files.keys(), key=str.encode)
    remaining = MAX_DIFF_BYTES
    truncated = False
    results: list[SkillFileDiff] = []

    for path in paths:
        old_file = before_files.get(path)
        new_file = after_files.get(path)
        if old_file is not None and new_file is not None and old_file.content == new_file.content:
            continue

        old_text = _text(old_file)
        new_text = _text(new_file)
        status: SkillDiffStatus = (
            "added" if old_file is None else "deleted" if new_file is None else "modified"
        )
        if (old_file is not None and old_text is None) or (
            new_file is not None and new_text is None
        ):
            results.append(SkillFileDiff(path=path, status=status, binary=True, diff=""))
            continue

        full_diff = _unified_diff(path, old_text or "", new_text or "", status)
        bounded, was_truncated = _take_bounded_diff(full_diff, remaining)
        remaining -= len(bounded.encode("utf-8"))
        truncated = truncated or was_truncated
        results.append(SkillFileDiff(path=path, status=status, binary=False, diff=bounded))

    return SkillPackageDiff(files=tuple(results), truncated=truncated)


def _text(file: SkillFile | None) -> str | None:
    if file is None:
        return ""
    if b"\x00" in file.content:
        return None
    try:
        return file.content.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _unified_diff(path: str, before: str, after: str, status: str) -> str:
    from_path = "/dev/null" if status == "added" else f"a/{path}"
    to_path = "/dev/null" if status == "deleted" else f"b/{path}"
    return "".join(
        difflib.unified_diff(
            before.splitlines(keepends=True),
            after.splitlines(keepends=True),
            fromfile=from_path,
            tofile=to_path,
            lineterm="\n",
        )
    )


def _take_bounded_diff(diff: str, remaining: int) -> tuple[str, bool]:
    encoded = diff.encode("utf-8")
    if len(encoded) <= remaining:
        return diff, False
    if remaining <= 0:
        return "", True
    prefix = encoded[:remaining].decode("utf-8", errors="ignore")
    if "\n" not in prefix:
        return "", True
    return prefix.rsplit("\n", 1)[0] + "\n", True
