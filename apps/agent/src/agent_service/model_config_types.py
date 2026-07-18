"""Immutable domain contracts for administrator-managed model configuration."""

from dataclasses import dataclass
from datetime import datetime
from typing import Final, Literal, cast

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SecretStr,
    field_validator,
)


ModelProvider = Literal[
    "openai",
    "anthropic",
    "google",
    "dashscope",
    "deepseek",
    "minimax",
]
TestStatus = Literal["untested", "passed", "failed"]

MODEL_PROVIDERS: Final[tuple[ModelProvider, ...]] = (
    "openai",
    "anthropic",
    "google",
    "dashscope",
    "deepseek",
    "minimax",
)
TEST_STATUSES: Final[tuple[TestStatus, ...]] = (
    "untested",
    "passed",
    "failed",
)
MODEL_ID_MAX_CODE_POINTS: Final = 128
ENDPOINT_ID_MAX_CODE_POINTS: Final = 64
MODEL_API_KEY_MIN_CODE_POINTS: Final = 8
MODEL_API_KEY_MAX_CODE_POINTS: Final = 4096


def _validate_model_id(value: str) -> str:
    if not value or value != value.strip():
        raise ValueError("invalid model ID")
    if len(value) > MODEL_ID_MAX_CODE_POINTS:
        raise ValueError("invalid model ID")
    if any(
        ord(character) <= 0x1F or 0x7F <= ord(character) <= 0x9F for character in value
    ):
        raise ValueError("invalid model ID")
    return value


def _validate_endpoint_id(value: str) -> str:
    if (
        not value
        or value != value.strip()
        or len(value) > ENDPOINT_ID_MAX_CODE_POINTS
        or any(character.isspace() for character in value)
        or any(
            ord(character) <= 0x1F or 0x7F <= ord(character) <= 0x9F
            for character in value
        )
    ):
        raise ValueError("invalid endpoint ID")
    return value


def _validate_api_key(value: SecretStr | None) -> SecretStr | None:
    if value is None:
        return None
    secret = value.get_secret_value()
    if not MODEL_API_KEY_MIN_CODE_POINTS <= len(
        secret
    ) <= MODEL_API_KEY_MAX_CODE_POINTS or any(
        character.isspace() for character in secret
    ):
        raise ValueError("invalid model API key")
    return value


class ModelConfigDraft(BaseModel):
    """Strict secret-bearing command kept separate from response metadata."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        hide_input_in_errors=True,
        validate_default=True,
    )

    provider: ModelProvider
    model_id: str
    endpoint_id: str
    api_key: SecretStr | None = Field(default=None, repr=False)
    expected_revision: int = Field(ge=0, strict=True)

    @field_validator("model_id", mode="after")
    @classmethod
    def _validate_model_id_field(cls, value: str) -> str:
        return _validate_model_id(value)

    @field_validator("endpoint_id", mode="after")
    @classmethod
    def _validate_endpoint_id_field(cls, value: str) -> str:
        return _validate_endpoint_id(value)

    @field_validator("api_key", mode="after")
    @classmethod
    def _validate_api_key_field(
        cls,
        value: SecretStr | None,
    ) -> SecretStr | None:
        return _validate_api_key(value)


@dataclass(frozen=True, slots=True)
class StoredModelConfigMetadata:
    """Safe current-head projection; sealed or plaintext key fields are absent."""

    provider: ModelProvider
    model_id: str
    endpoint_id: str
    api_key_last_four: str
    revision: int
    test_status: TestStatus
    last_tested_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.provider not in MODEL_PROVIDERS:
            raise ValueError("invalid model provider")
        _validate_model_id(self.model_id)
        _validate_endpoint_id(self.endpoint_id)
        if len(self.api_key_last_four) != 4 or any(
            character.isspace() for character in self.api_key_last_four
        ):
            raise ValueError("invalid API key suffix")
        if (
            isinstance(self.revision, bool)
            or not isinstance(self.revision, int)
            or self.revision < 1
        ):
            raise ValueError("invalid model config revision")
        if self.test_status not in TEST_STATUSES:
            raise ValueError("invalid test status")
        if self.last_tested_at is not None and (
            type(self.last_tested_at) is not datetime
            or self.last_tested_at.tzinfo is None
            or self.last_tested_at.utcoffset() is None
        ):
            raise ValueError("invalid last tested timestamp")

        object.__setattr__(self, "provider", cast(ModelProvider, self.provider))
        object.__setattr__(
            self,
            "test_status",
            cast(TestStatus, self.test_status),
        )
