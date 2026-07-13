"""Strict, role-separated configuration for the internal agent service."""

from typing import Annotated, Literal

from pydantic import Field, FiniteFloat, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


AsyncPostgresUrl = SecretStr
PositiveFiniteFloat = Annotated[FiniteFloat, Field(gt=0)]


def _validate_async_postgres_url(value: SecretStr) -> SecretStr:
    """Accept only credentialed psycopg async PostgreSQL URLs."""
    raw_value = value.get_secret_value()
    try:
        parsed = make_url(raw_value)
    except Exception:
        raise ValueError("database URL must be a valid async psycopg URL") from None

    if (
        parsed.drivername != "postgresql+psycopg_async"
        or not parsed.username
        or not parsed.password
        or not parsed.host
        or not parsed.database
    ):
        raise ValueError(
            "database URL must use postgresql+psycopg_async with credentials, "
            "host, and database"
        )
    return value


class _AgentSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
        hide_input_in_errors=True,
    )

    agno_schema: Literal["agno"] = Field(
        default="agno",
        validation_alias="AGNO_SCHEMA",
    )


class RuntimeSettings(_AgentSettings):
    """Credentials and health controls available to the runtime role only."""

    os_security_key: SecretStr = Field(validation_alias="OS_SECURITY_KEY")
    agno_database_url: AsyncPostgresUrl = Field(validation_alias="AGNO_DATABASE_URL")
    agent_enabled: bool = Field(
        default=False,
        validation_alias="AGENT_ENABLED",
    )
    health_ready_cache_ttl_seconds: PositiveFiniteFloat = Field(
        default=5.0,
        validation_alias="HEALTH_READY_CACHE_TTL_SECONDS",
    )
    health_db_probe_timeout_seconds: PositiveFiniteFloat = Field(
        default=2.0,
        validation_alias="HEALTH_DB_PROBE_TIMEOUT_SECONDS",
    )

    _validate_database_url = field_validator("agno_database_url")(
        _validate_async_postgres_url
    )

    @field_validator("os_security_key", mode="after")
    @classmethod
    def _validate_security_key(cls, value: SecretStr) -> SecretStr:
        if not value.get_secret_value().strip():
            raise ValueError("OS security key must not be blank")
        return value

    @field_validator("agent_enabled", mode="after")
    @classmethod
    def _reject_enabled_agent(cls, value: bool) -> bool:
        if value:
            raise ValueError("agent capability is not configured")
        return value

    @property
    def capability(self) -> Literal["placeholder"]:
        return "placeholder"


class MigrationSettings(_AgentSettings):
    """Credentials available only to the one-shot migration role."""

    agno_migrator_database_url: AsyncPostgresUrl = Field(
        validation_alias="AGNO_MIGRATOR_DATABASE_URL"
    )

    _validate_database_url = field_validator("agno_migrator_database_url")(
        _validate_async_postgres_url
    )
