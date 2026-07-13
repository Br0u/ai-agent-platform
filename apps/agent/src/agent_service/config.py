"""Strict, role-separated configuration for the internal agent service."""

from typing import Literal

from pydantic import PositiveFloat, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


AsyncPostgresUrl = SecretStr


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
        extra="ignore",
        hide_input_in_errors=True,
    )

    agno_schema: Literal["agno"] = "agno"


class RuntimeSettings(_AgentSettings):
    """Credentials and health controls available to the runtime role only."""

    os_security_key: SecretStr
    agno_database_url: AsyncPostgresUrl
    agent_enabled: Literal[False] = False
    health_ready_cache_ttl_seconds: PositiveFloat = 5.0
    health_db_probe_timeout_seconds: PositiveFloat = 2.0

    _validate_database_url = field_validator("agno_database_url")(
        _validate_async_postgres_url
    )

    @property
    def capability(self) -> Literal["placeholder"]:
        return "placeholder"


class MigrationSettings(_AgentSettings):
    """Credentials available only to the one-shot migration role."""

    agno_migrator_database_url: AsyncPostgresUrl

    _validate_database_url = field_validator("agno_migrator_database_url")(
        _validate_async_postgres_url
    )
