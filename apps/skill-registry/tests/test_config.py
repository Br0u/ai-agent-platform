import os
from pathlib import Path

import pytest
from pydantic import ValidationError

from skill_registry.config import (
    ManagerSettings,
    MigrationSettings,
    RegistryConfigError,
    RegistrySettings,
    RuntimeSettings,
    load_scan_policy,
)


MIGRATOR_URL = (
    "postgresql+psycopg_async://ai_agent_skill_registry_migrator:private-migrator@db:5432/platform"
)
MANAGER_URL = (
    "postgresql+psycopg_async://ai_agent_skill_registry_manager:private-manager@db:5432/platform"
)
RUNTIME_URL = (
    "postgresql+psycopg_async://ai_agent_skill_registry_runtime:private-runtime@db:5432/platform"
)
CONTROL_KEY = "skill-registry-control-key-0123456789abcdef"


@pytest.mark.parametrize(
    ("settings_type", "environment_name", "valid_url"),
    [
        (MigrationSettings, "SKILL_REGISTRY_MIGRATOR_DATABASE_URL", MIGRATOR_URL),
        (ManagerSettings, "SKILL_REGISTRY_DATABASE_URL", MANAGER_URL),
        (RuntimeSettings, "SKILL_REGISTRY_RUNTIME_DATABASE_URL", RUNTIME_URL),
    ],
)
def test_database_settings_require_their_exact_environment_name(
    settings_type: type[MigrationSettings] | type[ManagerSettings] | type[RuntimeSettings],
    environment_name: str,
    valid_url: str,
) -> None:
    settings = settings_type.model_validate({environment_name: valid_url})

    assert settings.database_url.get_secret_value() == valid_url


@pytest.mark.parametrize("settings_type", [MigrationSettings, ManagerSettings, RuntimeSettings])
@pytest.mark.parametrize(
    "invalid_url",
    [
        "postgresql://role:password@db:5432/platform",
        "postgresql+psycopg://role:password@db:5432/platform",
        "postgresql+asyncpg://role:password@db:5432/platform",
        "postgresql+psycopg_async://role@db:5432/platform",
        "postgresql+psycopg_async://role:password@:5432/platform",
        "postgresql+psycopg_async://role:password@db:5432",
    ],
)
def test_database_settings_reject_non_psycopg_async_or_incomplete_urls(
    settings_type: type[MigrationSettings] | type[ManagerSettings] | type[RuntimeSettings],
    invalid_url: str,
) -> None:
    with pytest.raises(ValidationError):
        settings_type.model_validate({"database_url": invalid_url})


@pytest.mark.parametrize(
    ("settings_type", "valid_url"),
    [
        (MigrationSettings, MIGRATOR_URL),
        (ManagerSettings, MANAGER_URL),
        (RuntimeSettings, RUNTIME_URL),
    ],
)
def test_database_secrets_never_enter_repr(
    settings_type: type[MigrationSettings] | type[ManagerSettings] | type[RuntimeSettings],
    valid_url: str,
) -> None:
    settings = settings_type.model_validate({"database_url": valid_url})

    assert "private-" not in repr(settings)
    assert valid_url not in repr(settings)


@pytest.mark.parametrize(
    ("settings_type", "environment_name", "valid_url"),
    [
        (MigrationSettings, "SKILL_REGISTRY_MIGRATOR_DATABASE_URL", MIGRATOR_URL),
        (ManagerSettings, "SKILL_REGISTRY_DATABASE_URL", MANAGER_URL),
        (RuntimeSettings, "SKILL_REGISTRY_RUNTIME_DATABASE_URL", RUNTIME_URL),
    ],
)
def test_settings_load_only_their_role_specific_environment_variable(
    settings_type: type[MigrationSettings] | type[ManagerSettings] | type[RuntimeSettings],
    environment_name: str,
    valid_url: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for name in (
        "SKILL_REGISTRY_MIGRATOR_DATABASE_URL",
        "SKILL_REGISTRY_DATABASE_URL",
        "SKILL_REGISTRY_RUNTIME_DATABASE_URL",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv(environment_name, valid_url)

    settings = settings_type(_env_file=None)  # type: ignore[call-arg]

    assert settings.database_url.get_secret_value() == valid_url


@pytest.mark.parametrize(
    ("settings_type", "wrong_role_url"),
    [
        (MigrationSettings, MANAGER_URL),
        (MigrationSettings, RUNTIME_URL),
        (ManagerSettings, MIGRATOR_URL),
        (ManagerSettings, RUNTIME_URL),
        (RuntimeSettings, MIGRATOR_URL),
        (RuntimeSettings, MANAGER_URL),
    ],
)
def test_database_settings_reject_another_registry_roles_credentials_without_leaking(
    settings_type: type[MigrationSettings] | type[ManagerSettings] | type[RuntimeSettings],
    wrong_role_url: str,
) -> None:
    with pytest.raises(ValidationError) as error:
        settings_type.model_validate({"database_url": wrong_role_url})

    rendered = repr(error.value)
    assert wrong_role_url not in rendered
    assert "private-" not in rendered


def test_registry_settings_require_control_key_and_absolute_import_manifest(tmp_path: Path) -> None:
    manifest = tmp_path / "imports.json"
    settings = RegistrySettings.model_validate(
        {
            "SKILL_REGISTRY_DATABASE_URL": MANAGER_URL,
            "SKILL_REGISTRY_CONTROL_KEY": CONTROL_KEY,
            "SKILL_RUNTIME_IMPORTS_FILE": str(manifest),
        }
    )

    assert settings.control_key.get_secret_value() == CONTROL_KEY
    assert settings.runtime_imports_file == manifest
    assert CONTROL_KEY not in repr(settings)
    with pytest.raises(ValidationError):
        RegistrySettings.model_validate(
            {
                "SKILL_REGISTRY_DATABASE_URL": MANAGER_URL,
                "SKILL_REGISTRY_CONTROL_KEY": CONTROL_KEY,
                "SKILL_RUNTIME_IMPORTS_FILE": "relative/imports.json",
            }
        )


def _write_manifest(path: Path, raw: bytes) -> None:
    path.write_bytes(raw)
    path.chmod(0o644)


def _mock_root_owned(monkeypatch: pytest.MonkeyPatch) -> None:
    original = os.fstat

    def root_owned(fd: int) -> os.stat_result:
        fields = list(original(fd))
        fields[4] = 0
        return os.stat_result(fields)

    monkeypatch.setattr("skill_registry.config.os.fstat", root_owned)


def test_load_scan_policy_accepts_only_root_owned_0644_strict_sorted_json(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest = tmp_path / "imports.json"
    _write_manifest(manifest, b'{"allowedPythonModules":["httpx","yaml"]}\n')
    _mock_root_owned(monkeypatch)

    policy = load_scan_policy(manifest)

    assert policy.allowed_python_modules == frozenset({"httpx", "yaml"})


@pytest.mark.parametrize(
    "raw",
    [
        b'{"allowedPythonModules":["yaml","httpx"]}',
        b'{"allowedPythonModules":["httpx","httpx"]}',
        b'{"allowedPythonModules":["httpx"],"extra":true}',
        b'{"allowedPythonModules":["httpx"],"allowedPythonModules":[]}',
        b'{"allowedPythonModules":["httpx.bad"]}',
        b'{"allowedPythonModules":"httpx"}',
    ],
)
def test_load_scan_policy_rejects_invalid_schema_order_duplicates_or_extra_fields(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, raw: bytes
) -> None:
    manifest = tmp_path / "imports.json"
    _write_manifest(manifest, raw)
    _mock_root_owned(monkeypatch)

    with pytest.raises(RegistryConfigError):
        load_scan_policy(manifest)


def test_load_scan_policy_rejects_symlink_wrong_mode_and_non_root_owner(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest = tmp_path / "imports.json"
    _write_manifest(manifest, b'{"allowedPythonModules":[]}')
    link = tmp_path / "link.json"
    link.symlink_to(manifest)

    with pytest.raises(RegistryConfigError):
        load_scan_policy(link)

    manifest.chmod(0o600)
    _mock_root_owned(monkeypatch)
    with pytest.raises(RegistryConfigError):
        load_scan_policy(manifest)

    manifest.chmod(0o644)
    monkeypatch.undo()
    with pytest.raises(RegistryConfigError):
        load_scan_policy(manifest)
