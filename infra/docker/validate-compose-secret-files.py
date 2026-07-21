#!/usr/bin/env python3
"""Fail closed before Compose resolves host secret symlinks into mounts."""

from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from typing import Any


_MAX_COMPOSE_BYTES = 4 * 1024 * 1024
_ERROR = "Compose secret preflight failed."
_MODEL_SECRET_NAME = "model_api_key"
_MODEL_SECRET_TARGET = "/run/secrets/model_api_key"
_DISABLED_MODEL_SOURCE = "/dev/null"
_AGENT_WRAPPER = "/opt/aap/run-agent-with-secret-env.sh"
_MODEL_SECRET_SPEC = f"MODEL_API_KEY={_MODEL_SECRET_TARGET}"


def _fail() -> int:
    print(_ERROR, file=sys.stderr)
    return 1


def _secret_source(attachment: object) -> tuple[str, str | None] | None:
    if type(attachment) is str:
        return attachment, None
    if type(attachment) is not dict:
        return None
    source = attachment.get("source")
    target = attachment.get("target")
    if type(source) is not str or (target is not None and type(target) is not str):
        return None
    return source, target


def _disabled_model_secret_is_safe(config: dict[str, Any]) -> bool:
    services = config.get("services")
    if type(services) is not dict:
        return False
    holders: list[tuple[str, dict[str, Any], str | None]] = []
    for service_name, service_value in services.items():
        if type(service_name) is not str or type(service_value) is not dict:
            return False
        attachments = service_value.get("secrets", [])
        if type(attachments) is not list:
            return False
        for attachment in attachments:
            parsed = _secret_source(attachment)
            if parsed is None:
                return False
            source, target = parsed
            if source == _MODEL_SECRET_NAME:
                holders.append((service_name, service_value, target))
    if len(holders) != 1:
        return False
    service_name, agent, target = holders[0]
    if service_name != "agent" or target not in {None, _MODEL_SECRET_TARGET}:
        return False
    if agent.get("entrypoint") != [_AGENT_WRAPPER]:
        return False
    environment = agent.get("environment")
    if type(environment) is not dict:
        return False
    if environment.get("MODEL_PROVIDER") not in {None, ""}:
        return False
    if environment.get("MODEL_ID") not in {None, ""}:
        return False
    specifications = environment.get("SECRET_ENV_SPECS")
    if type(specifications) is not str:
        return False
    if specifications.split().count(_MODEL_SECRET_SPEC) != 1:
        return False
    if specifications.split()[-1:] != [_MODEL_SECRET_SPEC]:
        return False

    wrapper = Path(__file__).with_name("run-agent-with-secret-env.sh")
    try:
        wrapper_text = wrapper.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return False
    return (
        "SECRET_ENV_SPECS=${SECRET_ENV_SPECS%MODEL_API_KEY=/run/secrets/model_api_key}"
        in wrapper_text
        and 'if [ -z "${MODEL_PROVIDER-}" ] && [ -z "${MODEL_ID-}" ]; then' in wrapper_text
    )


def _validate(config: object, *, root: Path) -> bool:
    if type(config) is not dict:
        return False
    secrets = config.get("secrets")
    if type(secrets) is not dict or not secrets:
        return False
    for name, definition in secrets.items():
        if type(name) is not str or type(definition) is not dict:
            return False
        source = definition.get("file")
        if type(source) is not str or not source:
            return False
        if name == _MODEL_SECRET_NAME and source == _DISABLED_MODEL_SOURCE:
            if not _disabled_model_secret_is_safe(config):
                return False
            continue
        candidate = Path(source)
        if not candidate.is_absolute():
            candidate = root / candidate
        try:
            metadata = os.lstat(candidate)
        except (OSError, ValueError):
            return False
        if not stat.S_ISREG(metadata.st_mode):
            return False
        if stat.S_IMODE(metadata.st_mode) != 0o600:
            return False
    return True


def main(arguments: list[str] | None = None) -> int:
    compose_arguments = list(sys.argv[1:] if arguments is None else arguments)
    root = Path.cwd()
    try:
        rendered = subprocess.run(
            ["docker", "compose", *compose_arguments, "config", "--format", "json"],
            cwd=root,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )
        if rendered.returncode != 0 or len(rendered.stdout) > _MAX_COMPOSE_BYTES:
            return _fail()
        config = json.loads(rendered.stdout)
    except (OSError, subprocess.SubprocessError, UnicodeError, ValueError):
        return _fail()
    if not _validate(config, root=root):
        return _fail()
    print("Compose secret preflight passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
