"""Role-separated database and immutable runtime-policy configuration."""

import json
import os
from pathlib import Path
import re
import stat
from typing import ClassVar, NoReturn, cast
from urllib.parse import unquote, urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from skill_registry.types import ScanPolicy


_IMPORT_MANIFEST_MAX_BYTES = 64 * 1024
_IMPORT_NAME_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,127}\Z")
_IMPORT_FIELDS = frozenset({"allowedPythonModules"})


class RegistryConfigError(RuntimeError):
    """Stable startup failure without path or secret material."""


def _strict_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate field")
        result[key] = value
    return result


def _reject_constant(_: str) -> NoReturn:
    raise ValueError("non-standard number")


def load_scan_policy(path: Path) -> ScanPolicy:
    """Read one root-owned, non-symlinked import allowlist through its checked fd."""
    failed = False
    modules: tuple[str, ...] = ()
    file_descriptor: int | None = None
    raw = bytearray()
    try:
        if not isinstance(path, Path) or not path.is_absolute():
            raise ValueError("path")
        file_descriptor = os.open(
            path,
            os.O_RDONLY | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0),
        )
        metadata = os.fstat(file_descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != 0
            or stat.S_IMODE(metadata.st_mode) != 0o644
        ):
            raise ValueError("metadata")
        while len(raw) <= _IMPORT_MANIFEST_MAX_BYTES:
            chunk = os.read(file_descriptor, min(8192, _IMPORT_MANIFEST_MAX_BYTES + 1 - len(raw)))
            if not chunk:
                break
            raw.extend(chunk)
        if len(raw) > _IMPORT_MANIFEST_MAX_BYTES:
            raise ValueError("size")
        parsed = json.loads(
            bytes(raw),
            object_pairs_hook=_strict_object,
            parse_constant=_reject_constant,
        )
        if type(parsed) is not dict or set(parsed) != _IMPORT_FIELDS:
            raise ValueError("schema")
        candidate = cast(dict[str, object], parsed)["allowedPythonModules"]
        if type(candidate) is not list or len(candidate) > 256:
            raise ValueError("modules")
        if any(
            type(item) is not str or _IMPORT_NAME_PATTERN.fullmatch(item) is None
            for item in candidate
        ):
            raise ValueError("module")
        modules = tuple(cast(list[str], candidate))
        if len(set(modules)) != len(modules) or modules != tuple(sorted(modules, key=str.encode)):
            raise ValueError("order")
    except Exception:
        failed = True
    finally:
        raw.clear()
        if file_descriptor is not None:
            try:
                os.close(file_descriptor)
            except OSError:
                failed = True
    if failed:
        raise RegistryConfigError("Skill registry configuration is invalid") from None
    return ScanPolicy(frozenset(modules))


def _validate_async_psycopg_url(value: SecretStr) -> SecretStr:
    raw_value = value.get_secret_value()
    prefix = "postgresql+psycopg_async://"
    if not raw_value.startswith(prefix):
        raise ValueError("database URL must use postgresql+psycopg_async")
    try:
        parsed = urlsplit(f"postgresql://{raw_value.removeprefix(prefix)}")
        _ = parsed.port
    except ValueError:
        raise ValueError("database URL must be valid") from None
    if (
        not parsed.username
        or not parsed.password
        or not parsed.hostname
        or not parsed.path.removeprefix("/")
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("database URL must include credentials, host, and database")
    return value


class _DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
        hide_input_in_errors=True,
        populate_by_name=True,
    )

    _expected_username: ClassVar[str]
    database_url: SecretStr = Field(repr=False)

    @field_validator("database_url")
    @classmethod
    def _validate_database_url(cls, value: SecretStr) -> SecretStr:
        validated = _validate_async_psycopg_url(value)
        raw_value = validated.get_secret_value()
        parsed = urlsplit(f"postgresql://{raw_value.removeprefix('postgresql+psycopg_async://')}")
        if unquote(parsed.username or "") != cls._expected_username:
            raise ValueError("database URL username does not match its registry role")
        return validated


class MigrationSettings(_DatabaseSettings):
    """Credentials available only to the schema migrator."""

    _expected_username = "ai_agent_skill_registry_migrator"
    database_url: SecretStr = Field(
        validation_alias="SKILL_REGISTRY_MIGRATOR_DATABASE_URL",
        repr=False,
    )


class ManagerSettings(_DatabaseSettings):
    """Credentials available only to the review/control manager."""

    _expected_username = "ai_agent_skill_registry_manager"
    database_url: SecretStr = Field(
        validation_alias="SKILL_REGISTRY_DATABASE_URL",
        repr=False,
    )


class RuntimeSettings(_DatabaseSettings):
    """Credentials reserved for a future isolated skill runtime."""

    _expected_username = "ai_agent_skill_registry_runtime"
    database_url: SecretStr = Field(
        validation_alias="SKILL_REGISTRY_RUNTIME_DATABASE_URL",
        repr=False,
    )


class RegistrySettings(ManagerSettings):
    """Complete private API startup configuration."""

    control_key: SecretStr = Field(
        validation_alias="SKILL_REGISTRY_CONTROL_KEY",
        repr=False,
    )
    runtime_imports_file: Path = Field(
        validation_alias="SKILL_RUNTIME_IMPORTS_FILE",
    )

    @field_validator("runtime_imports_file")
    @classmethod
    def _validate_runtime_imports_file(cls, value: Path) -> Path:
        if not value.is_absolute():
            raise ValueError("runtime imports file must be absolute")
        return value
