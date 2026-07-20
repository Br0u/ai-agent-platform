"""Deterministic static review hints for canonical skill packages.

Findings are indicators for human review. They are not a security verdict.
"""

from __future__ import annotations

import ast
import re
import sys
from collections.abc import Iterable

from .types import CanonicalSkillPackage, SkillFinding

_POSSIBLE_SECRET = re.compile(
    r"(?i)\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret|token)\b"
    r"\s*[:=]\s*[^\s#]{8,}"
)
_PRIVATE_KEY = re.compile(r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----")
_NETWORK = re.compile(
    r"(?i)\b(?:requests\.|urllib\.|httpx\.|aiohttp\.|socket\.|urlopen\s*\(|curl\s+)"
)
_SUBPROCESS = re.compile(r"(?i)\b(?:subprocess\.|os\.system\s*\(|os\.popen\s*\(|pty\.spawn\s*\()")
_ENVIRONMENT = re.compile(r"\b(?:os\.environ|os\.getenv\s*\(|environ\.get\s*\()")
_DYNAMIC_CODE = re.compile(
    r"\b(?:eval|exec|compile|__import__)\s*\(|\bimportlib\.import_module\s*\("
)
_FILESYSTEM_WRITE = re.compile(
    r"\bopen\s*\([^\n]*(?:['\"](?:w|a|x|w\+|a\+|x\+)['\"])|"
    r"\.(?:write_text|write_bytes|unlink|mkdir|rmdir|rename|replace)\s*\("
)
_EXTERNAL_URL = re.compile(r"https?://[^\s<>'\"]+")

_LINE_PATTERNS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    ("possible_secret", _POSSIBLE_SECRET, "Possible credential-like assignment; review required."),
    ("private_key", _PRIVATE_KEY, "Private-key marker found; review required."),
    ("network_access", _NETWORK, "Network-capable operation found; review required."),
    ("subprocess", _SUBPROCESS, "Subprocess-capable operation found; review required."),
    ("environment_read", _ENVIRONMENT, "Environment access found; review required."),
    ("dynamic_code", _DYNAMIC_CODE, "Dynamic code execution found; review required."),
    ("filesystem_write", _FILESYSTEM_WRITE, "Filesystem mutation found; review required."),
    ("external_url", _EXTERNAL_URL, "External URL found; review required."),
)


def scan(
    package: CanonicalSkillPackage,
    allowed_python_modules: Iterable[str] = (),
) -> tuple[SkillFinding, ...]:
    """Return sorted static hints without ever returning matched source text."""

    allowed = sys.stdlib_module_names | frozenset(allowed_python_modules)
    findings: set[SkillFinding] = set()
    for file in package.files:
        text = _decode_text(file.content)
        if text is None:
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            for code, pattern, message in _LINE_PATTERNS:
                if pattern.search(line):
                    findings.add(
                        SkillFinding(
                            path=file.path,
                            line=line_number,
                            code=code,
                            message=message,
                        )
                    )
        if _is_python(file.path, text):
            findings.update(_unsupported_imports(file.path, text, allowed))

    return tuple(sorted(findings, key=lambda item: (item.path, item.line, item.code)))


def _decode_text(content: bytes) -> str | None:
    if b"\x00" in content:
        return None
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _is_python(path: str, text: str) -> bool:
    first_line = text.splitlines()[0] if text.splitlines() else ""
    return path.endswith(".py") or first_line in {
        "#!/usr/bin/env python3",
        "#!/usr/bin/python3",
    }


def _unsupported_imports(path: str, text: str, allowed: frozenset[str]) -> set[SkillFinding]:
    try:
        tree = ast.parse(text, filename=path)
    except SyntaxError:
        return set()

    findings: set[SkillFinding] = set()
    for node in ast.walk(tree):
        roots: list[str] = []
        line_number: int | None = None
        if isinstance(node, ast.Import):
            roots.extend(alias.name.split(".", 1)[0] for alias in node.names)
            line_number = node.lineno
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.append(node.module.split(".", 1)[0])
            line_number = node.lineno
        if any(root not in allowed for root in roots):
            assert line_number is not None
            findings.add(
                SkillFinding(
                    path=path,
                    line=line_number,
                    code="unsupported_import",
                    message=(
                        "Import is outside the configured module allowlist; publication must be blocked."
                    ),
                    blocking=True,
                )
            )
    return findings
