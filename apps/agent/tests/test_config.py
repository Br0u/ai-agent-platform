from collections.abc import Iterator
from dataclasses import FrozenInstanceError, is_dataclass
import math
from typing import get_args

import pytest
from pydantic import SecretStr, ValidationError

import agent_service.config as config
from agent_service.config import MigrationSettings, RuntimeSettings


RUNTIME_URL = "postgresql+psycopg_async://runtime:runtime-password@db:5432/platform"
MIGRATOR_URL = "postgresql+psycopg_async://migrator:migrator-password@db:5432/platform"
SECURITY_KEY = "internal-security-key-0123456789abcdef"
MODEL_API_KEY = "model-api-key-that-must-stay-secret"
MODEL_PROVIDERS = (
    "openai",
    "anthropic",
    "google",
    "dashscope",
    "deepseek",
    "minimax",
)


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
        "GOOGLE_API_KEY",
        "DASHSCOPE_API_KEY",
        "DEEPSEEK_API_KEY",
        "MINIMAX_API_KEY",
        "MODEL_PROVIDER",
        "MODEL_ID",
        "MODEL_API_KEY",
        "MODEL_BASE_URL",
        "MODEL_RUN_TIMEOUT_SECONDS",
    }
    for name in controlled_names:
        monkeypatch.delenv(name, raising=False)
        monkeypatch.delenv(name.lower(), raising=False)
    yield


@pytest.fixture
def valid_runtime_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OS_SECURITY_KEY", SECURITY_KEY)
    monkeypatch.setenv("AGNO_DATABASE_URL", RUNTIME_URL)


@pytest.fixture
def valid_enabled_runtime_env(
    valid_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGENT_ENABLED", "true")
    monkeypatch.setenv("MODEL_PROVIDER", "openai")
    monkeypatch.setenv("MODEL_ID", "gpt-4.1-mini")
    monkeypatch.setenv("MODEL_API_KEY", MODEL_API_KEY)


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
        "model_provider": "MODEL_PROVIDER",
        "model_id": "MODEL_ID",
        "model_api_key": "MODEL_API_KEY",
        "model_base_url": "MODEL_BASE_URL",
        "model_run_timeout_seconds": "MODEL_RUN_TIMEOUT_SECONDS",
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


def test_disabled_agent_has_no_active_model_and_ignores_host_provider_variables(
    valid_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for provider in MODEL_PROVIDERS:
        monkeypatch.setenv(f"{provider.upper()}_API_KEY", f"host-{provider}-key")

    settings = RuntimeSettings(_env_file=None)

    assert settings.agent_enabled is False
    assert settings.active_model is None
    assert settings.model_api_key is None


def test_enabled_agent_exposes_frozen_typed_active_model(
    valid_enabled_runtime_env: None,
) -> None:
    settings = RuntimeSettings(_env_file=None)

    assert get_args(config.ModelProvider) == MODEL_PROVIDERS
    assert is_dataclass(config.ActiveModelSettings)
    assert isinstance(settings.active_model, config.ActiveModelSettings)
    assert not hasattr(settings.active_model, "__dict__")
    assert settings.active_model.provider == "openai"
    assert settings.active_model.model_id == "gpt-4.1-mini"
    assert isinstance(settings.active_model.api_key, SecretStr)
    assert settings.active_model.api_key.get_secret_value() == MODEL_API_KEY
    assert settings.active_model.base_url is None
    assert settings.active_model.timeout_seconds == 50
    with pytest.raises(FrozenInstanceError):
        setattr(settings.active_model, "timeout_seconds", 1)


@pytest.mark.parametrize("missing_name", ["MODEL_PROVIDER", "MODEL_ID", "MODEL_API_KEY"])
def test_enabled_agent_requires_complete_model_configuration(
    missing_name: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(missing_name)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


@pytest.mark.parametrize("blank_key", ["", "   "])
def test_enabled_agent_rejects_blank_model_api_key(
    blank_key: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_API_KEY", blank_key)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


@pytest.mark.parametrize("provider", MODEL_PROVIDERS)
def test_enabled_agent_accepts_each_exact_provider(
    provider: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", provider)

    settings = RuntimeSettings(_env_file=None)

    assert settings.active_model is not None
    assert settings.active_model.provider == provider


@pytest.mark.parametrize(
    "provider",
    ["OpenAI", "OPENAI", "Anthropic", "azure", "openai ", ""],
)
def test_model_provider_is_exact_and_case_sensitive(
    provider: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", provider)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


def test_model_id_limit_is_128_code_points() -> None:
    assert config.MODEL_ID_MAX_CODE_POINTS == 128


@pytest.mark.parametrize(
    "model_id",
    ["", " ", "\t", "\n", " model", "model ", "\tmodel", "model\n"],
)
def test_model_id_rejects_blank_or_surrounding_whitespace(
    model_id: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_ID", model_id)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


@pytest.mark.parametrize(
    "control_character",
    ["\x00", "\x01", "\x1f", "\x7f", "\x80", "\x9f"],
)
def test_model_id_rejects_c0_and_c1_control_characters(
    control_character: str,
    valid_enabled_runtime_env: None,
) -> None:
    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None, MODEL_ID=f"model{control_character}id")


def test_model_id_accepts_128_unicode_code_points_and_safe_separators(
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    accepted_ids = ["模" * 128, "org/model.v1:chat_test-prod"]

    for model_id in accepted_ids:
        monkeypatch.setenv("MODEL_ID", model_id)
        settings = RuntimeSettings(_env_file=None)
        assert settings.active_model is not None
        assert settings.active_model.model_id == model_id


def test_model_id_rejects_129_code_points(
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_ID", "模" * 129)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


@pytest.mark.parametrize("timeout", ["1", "25", "50"])
def test_model_timeout_accepts_integers_from_1_through_50(
    timeout: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_RUN_TIMEOUT_SECONDS", timeout)

    settings = RuntimeSettings(_env_file=None)

    assert settings.active_model is not None
    assert settings.active_model.timeout_seconds == int(timeout)


@pytest.mark.parametrize(
    "timeout",
    ["0", "51", "1.0", "1.5", "inf", "-inf", "nan", "NaN"],
)
def test_model_timeout_rejects_out_of_range_and_non_integer_values(
    timeout: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_RUN_TIMEOUT_SECONDS", timeout)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


@pytest.mark.parametrize("provider", ["openai", "dashscope", "deepseek", "minimax"])
def test_supported_providers_accept_https_model_base_url(
    provider: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", provider)
    monkeypatch.setenv("MODEL_BASE_URL", "https://models.example.com/v1")

    settings = RuntimeSettings(_env_file=None)

    assert settings.active_model is not None
    assert settings.active_model.base_url == "https://models.example.com/v1"


@pytest.mark.parametrize("provider", ["anthropic", "google"])
def test_anthropic_and_google_reject_model_base_url(
    provider: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_PROVIDER", provider)
    monkeypatch.setenv("MODEL_BASE_URL", "https://models.example.com/v1")

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


@pytest.mark.parametrize(
    "base_url",
    [
        "http://models.example.com/v1",
        "https:///v1",
        "https://user:password@models.example.com/v1",
        "https://models.example.com/v1?region=cn",
        "https://models.example.com/v1?",
        "https://models.example.com/v1#models",
        "https://models.example.com/v1#",
    ],
)
def test_model_base_url_rejects_unsafe_components(
    base_url: str,
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MODEL_BASE_URL", base_url)

    with pytest.raises(ValidationError):
        RuntimeSettings(_env_file=None)


def test_model_api_key_is_redacted_from_settings_and_validation_errors(
    valid_enabled_runtime_env: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = RuntimeSettings(_env_file=None)
    assert MODEL_API_KEY not in repr(settings)

    monkeypatch.setenv("MODEL_BASE_URL", "http://models.example.com/v1")
    with pytest.raises(ValidationError) as error:
        RuntimeSettings(_env_file=None)

    assert MODEL_API_KEY not in repr(error.value)


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
