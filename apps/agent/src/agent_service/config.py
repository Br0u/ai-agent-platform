"""Strict, role-separated configuration for the internal agent service."""

from dataclasses import dataclass
import re
from typing import Annotated, Any, Literal

from pydantic import (
    Field,
    FiniteFloat,
    HttpUrl,
    SecretStr,
    TypeAdapter,
    ValidationError,
    ValidationInfo,
    field_validator,
    model_validator,
)
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


AsyncPostgresUrl = SecretStr
PositiveFiniteFloat = Annotated[FiniteFloat, Field(gt=0)]
ModelProvider = Literal[
    "openai",
    "anthropic",
    "google",
    "dashscope",
    "deepseek",
    "minimax",
]

MODEL_ID_MAX_CODE_POINTS = 128
_BASE_URL_PROVIDERS: frozenset[ModelProvider] = frozenset(
    {"openai", "dashscope", "deepseek", "minimax"}
)
_BOOLEAN_ADAPTER = TypeAdapter(bool)
_HTTP_URL_ADAPTER = TypeAdapter(HttpUrl)
_DIRECT_MODEL_SETTING_ALIASES = {
    "agent_enabled": "AGENT_ENABLED",
    "model_provider": "MODEL_PROVIDER",
    "model_id": "MODEL_ID",
    "model_api_key": "MODEL_API_KEY",
    "model_base_url": "MODEL_BASE_URL",
    "model_run_timeout_seconds": "MODEL_RUN_TIMEOUT_SECONDS",
}
_MODEL_SETTING_INPUT_KEYS = frozenset(
    {
        "MODEL_PROVIDER",
        "MODEL_ID",
        "MODEL_API_KEY",
        "MODEL_BASE_URL",
        "MODEL_RUN_TIMEOUT_SECONDS",
        "model_provider",
        "model_id",
        "model_api_key",
        "model_base_url",
        "model_run_timeout_seconds",
    }
)


@dataclass(frozen=True, slots=True)
class ActiveModelSettings:
    """Validated model configuration consumed by the runtime model registry."""

    provider: ModelProvider
    model_id: str
    api_key: SecretStr
    base_url: str | None
    timeout_seconds: int


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
        validate_default=True,
    )


class RuntimeSettings(_AgentSettings):
    """Credentials and health controls available to the runtime role only."""

    agno_schema: Literal["agno"] = Field(
        default="agno",
        validation_alias="AGNO_SCHEMA",
    )
    os_security_key: SecretStr = Field(validation_alias="OS_SECURITY_KEY")
    agno_database_url: AsyncPostgresUrl = Field(validation_alias="AGNO_DATABASE_URL")
    agent_enabled: bool = Field(
        default=False,
        validation_alias="AGENT_ENABLED",
    )
    model_provider: ModelProvider | None = Field(
        default=None,
        validation_alias="MODEL_PROVIDER",
    )
    model_id: str | None = Field(
        default=None,
        validation_alias="MODEL_ID",
    )
    model_api_key: SecretStr | None = Field(
        default=None,
        validation_alias="MODEL_API_KEY",
    )
    model_base_url: str | None = Field(
        default=None,
        validation_alias="MODEL_BASE_URL",
    )
    model_run_timeout_seconds: int = Field(
        default=50,
        ge=1,
        le=50,
        validation_alias="MODEL_RUN_TIMEOUT_SECONDS",
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

    @model_validator(mode="before")
    @classmethod
    def _ignore_disabled_model_configuration(cls, values: Any) -> Any:
        if not isinstance(values, dict):
            return values
        normalized_values = dict(values)
        for field_name, validation_alias in _DIRECT_MODEL_SETTING_ALIASES.items():
            if (
                validation_alias not in normalized_values
                and field_name in normalized_values
            ):
                normalized_values[validation_alias] = normalized_values[field_name]
            normalized_values.pop(field_name, None)
        try:
            agent_enabled = _BOOLEAN_ADAPTER.validate_python(
                normalized_values.get("AGENT_ENABLED", False)
            )
        except ValidationError:
            agent_enabled = None
        if agent_enabled is False:
            return {
                key: value
                for key, value in normalized_values.items()
                if key not in _MODEL_SETTING_INPUT_KEYS
            }
        raw_api_key = normalized_values.get("MODEL_API_KEY")
        if isinstance(raw_api_key, str):
            normalized_values["MODEL_API_KEY"] = SecretStr(raw_api_key)
        return normalized_values

    @field_validator("os_security_key", mode="after")
    @classmethod
    def _validate_security_key(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if len(secret.encode("utf-8")) < 32:
            raise ValueError("OS security key must contain at least 32 bytes")
        if re.fullmatch(r"[A-Za-z0-9._~+/-]+=*", secret) is None:
            raise ValueError("OS security key must be a valid Bearer token")
        return value

    @field_validator("model_provider", mode="after")
    @classmethod
    def _validate_model_provider(
        cls,
        value: ModelProvider | None,
        info: ValidationInfo,
    ) -> ModelProvider | None:
        if info.data.get("agent_enabled") and value is None:
            raise ValueError("MODEL_PROVIDER is required when the agent is enabled")
        return value

    @field_validator("model_id", mode="after")
    @classmethod
    def _validate_model_id(
        cls,
        value: str | None,
        info: ValidationInfo,
    ) -> str | None:
        if value is None:
            if info.data.get("agent_enabled"):
                raise ValueError("MODEL_ID is required when the agent is enabled")
            return value
        if not value.strip() or value != value.strip():
            raise ValueError("model ID must not be blank or have surrounding whitespace")
        if len(value) > MODEL_ID_MAX_CODE_POINTS:
            raise ValueError(
                f"model ID must contain at most {MODEL_ID_MAX_CODE_POINTS} code points"
            )
        if any(ord(character) <= 0x1F or 0x7F <= ord(character) <= 0x9F for character in value):
            raise ValueError("model ID must not contain C0 or C1 control characters")
        return value

    @field_validator("model_api_key", mode="after")
    @classmethod
    def _validate_model_api_key(
        cls,
        value: SecretStr | None,
        info: ValidationInfo,
    ) -> SecretStr | None:
        if value is None:
            if info.data.get("agent_enabled"):
                raise ValueError("MODEL_API_KEY is required when the agent is enabled")
            return value
        secret = value.get_secret_value()
        if not secret or secret != secret.strip():
            raise ValueError(
                "model API key must not be blank or have surrounding whitespace"
            )
        return value

    @field_validator("model_base_url", mode="after")
    @classmethod
    def _validate_model_base_url(
        cls,
        value: str | None,
        info: ValidationInfo,
    ) -> str | None:
        if value is None:
            return value

        provider = info.data.get("model_provider")
        if provider is not None and provider not in _BASE_URL_PROVIDERS:
            raise ValueError("MODEL_BASE_URL is not supported for the selected provider")
        if any(
            character.isspace()
            or ord(character) <= 0x1F
            or 0x7F <= ord(character) <= 0x9F
            for character in value
        ) or "\\" in value:
            raise ValueError(
                "MODEL_BASE_URL must not contain whitespace, controls, or backslashes"
            )
        authority = value[8:].split("/", maxsplit=1)[0]
        if "@" in authority:
            raise ValueError("MODEL_BASE_URL must not contain userinfo")
        try:
            parsed = _HTTP_URL_ADAPTER.validate_python(value)
        except ValidationError:
            raise ValueError("MODEL_BASE_URL must be a valid HTTPS URL") from None
        if (
            parsed.scheme != "https"
            or not value.lower().startswith("https://")
            or value[8:9] in {"", "/"}
            or not parsed.host
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query is not None
            or parsed.fragment is not None
            or "?" in value
            or "#" in value
        ):
            raise ValueError(
                "MODEL_BASE_URL must use HTTPS with a host and without "
                "credentials, query, or fragment"
            )
        return str(parsed)

    @field_validator("model_run_timeout_seconds", mode="before")
    @classmethod
    def _validate_model_timeout_input(cls, value: object) -> int:
        if isinstance(value, bool):
            raise ValueError("model run timeout must be an integer")
        if isinstance(value, int):
            return value
        if isinstance(value, str) and re.fullmatch(r"[+-]?\d+", value):
            return int(value)
        raise ValueError("model run timeout must be an integer")

    @property
    def active_model(self) -> ActiveModelSettings | None:
        if not self.agent_enabled:
            return None
        if (
            self.model_provider is None
            or self.model_id is None
            or self.model_api_key is None
        ):
            raise RuntimeError("enabled agent has incomplete model configuration")
        return ActiveModelSettings(
            provider=self.model_provider,
            model_id=self.model_id,
            api_key=self.model_api_key,
            base_url=self.model_base_url,
            timeout_seconds=self.model_run_timeout_seconds,
        )

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
