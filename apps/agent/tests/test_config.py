from collections.abc import Iterator

import pytest
from pydantic import SecretStr, ValidationError

from agent_service.config import MigrationSettings, RuntimeSettings


RUNTIME_URL = "postgresql+psycopg_async://runtime:runtime-password@db:5432/platform"
MIGRATOR_URL = "postgresql+psycopg_async://migrator:migrator-password@db:5432/platform"


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
    yield


@pytest.fixture
def valid_runtime_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", "internal-security-key")
    monkeypatch.setenv("AGNO_DATABASE_URL", RUNTIME_URL)


def test_runtime_requires_internal_security_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGNO_DATABASE_URL", RUNTIME_URL)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


def test_runtime_requires_runtime_database_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", "internal-security-key")

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

    settings = MigrationSettings(_env_file=None)

    assert settings.agno_migrator_database_url.get_secret_value() == MIGRATOR_URL
    assert "os_security_key" not in MigrationSettings.model_fields
    assert "agno_database_url" not in MigrationSettings.model_fields


def test_migration_requires_migrator_database_url() -> None:
    with pytest.raises(ValidationError):
        MigrationSettings(_env_file=None)


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
    monkeypatch.setenv("OS_SECURITY_KEY", "internal-security-key")
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
@pytest.mark.parametrize("value", ["0", "-1"])
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


def test_secrets_are_wrapped_and_hidden_from_repr(valid_runtime_env: None) -> None:
    settings = RuntimeSettings(_env_file=None)
    rendered = repr(settings)

    assert isinstance(settings.os_security_key, SecretStr)
    assert isinstance(settings.agno_database_url, SecretStr)
    assert "internal-security-key" not in rendered
    assert "runtime-password" not in rendered


def test_invalid_url_error_does_not_echo_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", "internal-security-key")
    monkeypatch.setenv(
        "AGNO_DATABASE_URL",
        "postgresql://runtime:do-not-leak@db:5432/platform",
    )

    with pytest.raises(ValidationError) as error:
        RuntimeSettings(_env_file=None)

    assert "do-not-leak" not in str(error.value)
