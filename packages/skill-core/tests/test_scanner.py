from __future__ import annotations

from skill_core.archive import canonicalize_skill_archive
from skill_core.scanner import scan


def package_with_script(zip_builder, script: bytes, *, path: str = "scripts/review.py"):
    return canonicalize_skill_archive(
        zip_builder(
            {
                "demo-skill/SKILL.md": (
                    b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n"
                ),
                f"demo-skill/{path}": script,
            }
        )
    )


def test_reports_all_deterministic_review_hint_codes_without_claiming_safety(zip_builder) -> None:
    secret = "sk-test-VERY-SENSITIVE-VALUE-123456"
    script = f"""#!/usr/bin/env python3
import os
import requests
import subprocess
from mystery.submodule import run

api_key = "{secret}"
private = "-----BEGIN PRIVATE KEY-----"
endpoint = "https://api.example.test/v1"
requests.get(endpoint)
subprocess.run(["echo", "ok"])
value = os.environ.get("TOKEN")
eval("1 + 1")
open("out.txt", "w").write(value)
""".encode()
    package = package_with_script(zip_builder, script)

    findings = scan(package, allowed_python_modules=frozenset({"requests"}))

    assert {finding.code for finding in findings} == {
        "possible_secret",
        "private_key",
        "network_access",
        "subprocess",
        "environment_read",
        "dynamic_code",
        "filesystem_write",
        "unsupported_import",
        "external_url",
    }
    assert findings == tuple(sorted(findings, key=lambda item: (item.path, item.line, item.code)))
    assert all(finding.path == "scripts/review.py" for finding in findings)
    assert all(finding.line > 0 for finding in findings)
    assert all(secret not in finding.message for finding in findings)
    assert "safe" not in " ".join(finding.message.casefold() for finding in findings)


def test_imports_compare_dotted_first_segment_with_stdlib_and_explicit_allowlist(
    zip_builder,
) -> None:
    package = package_with_script(
        zip_builder,
        b"""#!/usr/bin/env python3
import json
import pathlib
import allowed_pkg.child
import denied_pkg.child
from another_denied.deep import item
""",
    )

    findings = scan(package, allowed_python_modules={"allowed_pkg"})
    unsupported = [finding for finding in findings if finding.code == "unsupported_import"]

    assert [(finding.line, finding.blocking) for finding in unsupported] == [(5, True), (6, True)]
    assert all("denied_pkg" not in finding.message for finding in unsupported)
    assert all("another_denied" not in finding.message for finding in unsupported)


def test_default_allowlist_does_not_read_an_external_runtime_file(zip_builder) -> None:
    package = package_with_script(
        zip_builder,
        b"#!/usr/bin/env python3\nimport requests\n",
    )
    findings = scan(package)
    assert [(finding.code, finding.blocking) for finding in findings] == [
        ("unsupported_import", True)
    ]


def test_scans_extensionless_python3_scripts_but_not_reference_prose_as_python(
    zip_builder,
) -> None:
    package = canonicalize_skill_archive(
        zip_builder(
            {
                "demo-skill/SKILL.md": (
                    b"---\nname: demo-skill\ndescription: Demo.\n---\n# Demo\n"
                ),
                "demo-skill/scripts/run": b"#!/bin/sh\ncurl https://example.test\n",
                "demo-skill/references/import.md": b"import imaginary\n",
            }
        )
    )
    findings = scan(package)
    assert ("references/import.md", 1, "unsupported_import") not in {
        (finding.path, finding.line, finding.code) for finding in findings
    }
    assert ("scripts/run", 2, "external_url") in {
        (finding.path, finding.line, finding.code) for finding in findings
    }


def test_possible_secret_message_never_contains_secret_value(zip_builder) -> None:
    secret = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
    package = package_with_script(
        zip_builder,
        f'#!/usr/bin/env python3\ntoken = "{secret}"\n'.encode(),
    )
    findings = scan(package)
    possible_secret = next(finding for finding in findings if finding.code == "possible_secret")
    assert secret not in repr(possible_secret)
