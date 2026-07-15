from collections.abc import Iterator
import math

import pytest
from pydantic import SecretStr, ValidationError

from agent_service.config import MigrationSettings, RuntimeSettings


RUNTIME_URL = "postgresql+psycopg_async://runtime:runtime-password@db:5432/platform"
MIGRATOR_URL = "postgresql+psycopg_async://migrator:migrator-password@db:5432/platform"
SECURITY_KEY = "internal-security-key-0123456789abcdef"


@pytest.fixture(autouse=True)
def isolated_agent_environment(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    controlled_names = {
        "OS_SECURITY_KEY",
        "AGNO_DATABASE_URL",
        "AGNO_MIGRATOR_DATABASE_URL",
        "AGNO_SCHEMA",
        "AGENT_ENABLED",
        "CAPABILITY",
        "HEALTH_READY_CACHE_TTL_SECONDS",
        "HEALTH_DB_PROBE_TIMEOUT_SECONDS",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "MODEL_PROVIDER",
        "MODEL_ID",
    }
    for name in controlled_names:
        monkeypatch.delenv(name, raising=False)
        monkeypatch.delenv(name.lower(), raising=False)
    yield


@pytest.fixture
def valid_runtime_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", SECURITY_KEY)
    monkeypatch.setenv("AGNO_DATABASE_URL", RUNTIME_URL)


def test_runtime_requires_internal_security_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGNO_DATABASE_URL", RUNTIME_URL)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


@pytest.mark.parametrize(
    "invalid_key",
    ["", "   ", "short", "a" * 31, "a" * 31 + " ", "é" * 32, "a" * 32 + "\n"],
)
def test_runtime_rejects_unsafe_internal_security_key_without_leaking_it(
    invalid_key: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", invalid_key)
    monkeypatch.setenv("AGNO_DATABASE_URL", RUNTIME_URL)

    with pytest.raises(ValidationError) as error:
        RuntimeSettings(_env_file=None)

    assert "input_value" not in repr(error.value)


def test_runtime_accepts_non_blank_internal_security_key(
    valid_runtime_env: None,
) -> None:
    settings = RuntimeSettings(_env_file=None)

    assert settings.os_security_key.get_secret_value() == SECURITY_KEY


def test_runtime_requires_runtime_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", SECURITY_KEY)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


def test_runtime_does_not_require_migrator_database_url(
    valid_runtime_env: None,
) -> None:
    settings = RuntimeSettings(_env_file=None)

    assert settings.agno_database_url.get_secret_value() == RUNTIME_URL
    assert "agno_migrator_database_url" not in RuntimeSettings.model_fields


def test_migration_requires_only_migrator_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGNO_MIGRATOR_DATABASE_URL", MIGRATOR_URL)
    monkeypatch.setenv("AGNO_SCHEMA", "public")
    monkeypatch.setenv("OS_SECURITY_KEY", SECURITY_KEY)
    monkeypatch.setenv("AGNO_DATABASE_URL", RUNTIME_URL)

    settings = MigrationSettings(_env_file=None)

    assert settings.agno_migrator_database_url.get_secret_value() == MIGRATOR_URL
    assert set(MigrationSettings.model_fields) == {"agno_migrator_database_url"}


def test_migration_requires_migrator_database_url() -> None:
    with pytest.raises(ValidationError):
        MigrationSettings(_env_file=None)


def test_lowercase_variables_do_not_satisfy_required_runtime_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("os_security_key", "lowercase-security-key")
    monkeypatch.setenv("agno_database_url", RUNTIME_URL)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


def test_lowercase_variable_does_not_satisfy_migration_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("agno_migrator_database_url", MIGRATOR_URL)

    with pytest.raises(ValidationError):
        MigrationSettings(_env_file=None)


def test_uppercase_variables_win_when_both_cases_exist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lowercase_values = {
        "os_security_key": " ",
        "agno_database_url": "postgresql://unsafe:unsafe@db/platform",
        "agno_schema": "public",
        "agent_enabled": "true",
        "health_ready_cache_ttl_seconds": "-1",
        "health_db_probe_timeout_seconds": "nan",
    }
    uppercase_values = {
        "OS_SECURITY_KEY": SECURITY_KEY,
        "AGNO_DATABASE_URL": RUNTIME_URL,
        "AGNO_SCHEMA": "agno",
        "AGENT_ENABLED": "false",
        "HEALTH_READY_CACHE_TTL_SECONDS": "4",
        "HEALTH_DB_PROBE_TIMEOUT_SECONDS": "2",
    }
    for name, value in lowercase_values.items():
        monkeypatch.setenv(name, value)
    for name, value in uppercase_values.items():
        monkeypatch.setenv(name, value)

    settings = RuntimeSettings(_env_file=None)

    assert settings.os_security_key.get_secret_value() == SECURITY_KEY
    assert settings.agno_database_url.get_secret_value() == RUNTIME_URL
    assert settings.agno_schema == "agno"
    assert settings.agent_enabled is False
    assert settings.health_ready_cache_ttl_seconds == 4
    assert settings.health_db_probe_timeout_seconds == 2


def test_all_fields_use_explicit_uppercase_environment_aliases() -> None:
    runtime_aliases = {
        name: field.validation_alias
        for name, field in RuntimeSettings.model_fields.items()
    }
    migration_aliases = {
        name: field.validation_alias
        for name, field in MigrationSettings.model_fields.items()
    }

    assert runtime_aliases == {
        "agno_schema": "AGNO_SCHEMA",
        "os_security_key": "OS_SECURITY_KEY",
        "agno_database_url": "AGNO_DATABASE_URL",
        "agent_enabled": "AGENT_ENABLED",
        "health_ready_cache_ttl_seconds": "HEALTH_READY_CACHE_TTL_SECONDS",
        "health_db_probe_timeout_seconds": "HEALTH_DB_PROBE_TIMEOUT_SECONDS",
    }
    assert migration_aliases == {
        "agno_migrator_database_url": "AGNO_MIGRATOR_DATABASE_URL",
    }


@pytest.mark.parametrize(
    "invalid_url",
    [
        "postgresql://runtime:password@db:5432/platform",
        "postgresql+psycopg://runtime:password@db:5432/platform",
        "postgresql+asyncpg://runtime:password@db:5432/platform",
        "mysql+aiomysql://runtime:password@db:3306/platform",
        "postgresql+psycopg_async://runtime:password@/platform",
        "postgresql+psycopg_async://runtime:password@db:5432",
    ],
    ids=[
        "bare-postgres",
        "sync-psycopg",
        "unknown-postgres-driver",
        "wrong-database",
        "missing-host",
        "missing-database",
    ],
)
def test_runtime_rejects_unsafe_database_urls(
    invalid_url: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", SECURITY_KEY)
    monkeypatch.setenv("AGNO_DATABASE_URL", invalid_url)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


def test_runtime_and_migration_share_the_same_url_policy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "AGNO_MIGRATOR_DATABASE_URL",
        "postgresql+psycopg://migrator:password@db:5432/platform",
    )

    with pytest.raises(ValidationError):
        MigrationSettings(_env_file=None)


def test_placeholder_is_distinct_from_readiness(valid_runtime_env: None) -> None:
    settings = RuntimeSettings(_env_file=None)

    assert settings.capability == "placeholder"
    assert settings.agent_enabled is False


def test_capability_cannot_be_overridden_from_environment(
    valid_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CAPABILITY", "ready")

    settings = RuntimeSettings(_env_file=None)

    assert settings.capability == "placeholder"
    assert "capability" not in RuntimeSettings.model_fields


def test_agent_cannot_be_enabled_before_model_configuration_exists(
    valid_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGENT_ENABLED", "true")

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


def test_provider_environment_does_not_enable_or_become_required(
    valid_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "host-openai-key")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "host-anthropic-key")
    monkeypatch.setenv("MODEL_PROVIDER", "openai")
    monkeypatch.setenv("MODEL_ID", "host-model")

    settings = RuntimeSettings(_env_file=None)

    assert settings.agent_enabled is False
    assert not {
        "openai_api_key",
        "anthropic_api_key",
        "model_provider",
        "model_id",
    }.intersection(RuntimeSettings.model_fields)


def test_schema_is_fixed_to_agno(valid_runtime_env: None) -> None:
    settings = RuntimeSettings(_env_file=None)

    assert settings.agno_schema == "agno"


def test_schema_rejects_environment_override(
    valid_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGNO_SCHEMA", "public")

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


@pytest.mark.parametrize(
    "name",
    ["HEALTH_READY_CACHE_TTL_SECONDS", "HEALTH_DB_PROBE_TIMEOUT_SECONDS"],
)
@pytest.mark.parametrize("value", ["0", "-1", "inf", "-inf", "nan"])
def test_health_settings_must_be_positive(
    name: str,
    value: str,
    valid_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(name, value)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


def test_health_settings_have_positive_defaults(valid_runtime_env: None) -> None:
    settings = RuntimeSettings(_env_file=None)

    assert settings.health_ready_cache_ttl_seconds > 0
    assert settings.health_db_probe_timeout_seconds > 0
    assert math.isfinite(settings.health_ready_cache_ttl_seconds)
    assert math.isfinite(settings.health_db_probe_timeout_seconds)


def test_secrets_are_wrapped_and_hidden_from_repr(valid_runtime_env: None) -> None:
    settings = RuntimeSettings(_env_file=None)
    rendered = repr(settings)

    assert isinstance(settings.os_security_key, SecretStr)
    assert isinstance(settings.agno_database_url, SecretStr)
    assert SECURITY_KEY not in rendered
    assert "runtime-password" not in rendered


def test_invalid_url_error_does_not_echo_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", SECURITY_KEY)
    monkeypatch.setenv(
        "AGNO_DATABASE_URL",
        "postgresql://runtime:do-not-leak@db:5432/platform",
    )

    with pytest.raises(ValidationError) as error:
        RuntimeSettings(_env_file=None)

    assert "do-not-leak" not in str(error.value)
