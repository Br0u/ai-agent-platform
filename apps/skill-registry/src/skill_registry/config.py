"""Role-separated database configuration for the skill registry."""

from typing import ClassVar
from urllib.parse import unquote, urlsplit

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
