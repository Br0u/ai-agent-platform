import pytest
from pydantic import ValidationError

from skill_registry.config import ManagerSettings, MigrationSettings, RuntimeSettings


MIGRATOR_URL = (
    "postgresql+psycopg_async://ai_agent_skill_registry_migrator:private-migrator@db:5432/platform"
)
MANAGER_URL = (
    "postgresql+psycopg_async://ai_agent_skill_registry_manager:private-manager@db:5432/platform"
)
RUNTIME_URL = (
    "postgresql+psycopg_async://ai_agent_skill_registry_runtime:private-runtime@db:5432/platform"
)


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
