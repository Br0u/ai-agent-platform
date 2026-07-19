from dataclasses import FrozenInstanceError, fields
from datetime import UTC, datetime
from typing import get_args

from pydantic import SecretStr, ValidationError
import pytest

from agent_service.model_config_types import (
    MODEL_ID_MAX_CODE_POINTS,
    ModelConfigDraft,
    ModelProvider,
    StoredModelConfigMetadata,
)


PROVIDERS = (
    "openai",
    "anthropic",
    "google",
    "dashscope",
    "deepseek",
    "minimax",
)
RAW_API_KEY = "secret-key-value"


def make_draft(**overrides: object) -> ModelConfigDraft:
    values: dict[str, object] = {
        "provider": "deepseek",
        "model_id": "deepseek-chat",
        "endpoint_id": "deepseek-official",
        "api_key": SecretStr(RAW_API_KEY),
        "expected_revision": 0,
    }
    values.update(overrides)
    return ModelConfigDraft.model_validate(values)


def test_provider_contract_is_exactly_the_six_supported_values() -> None:
    assert get_args(ModelProvider) == PROVIDERS

    for provider in PROVIDERS:
        assert make_draft(provider=provider).provider == provider

    with pytest.raises(ValidationError):
        make_draft(provider="local")


@pytest.mark.parametrize(
    "model_id",
    ("", " ", " leading", "trailing ", "bad\x00id", "bad\x85id"),
)
def test_model_id_rejects_blank_whitespace_and_controls(model_id: str) -> None:
    with pytest.raises(ValidationError):
        make_draft(model_id=model_id)


def test_model_id_is_bounded_by_unicode_code_points() -> None:
    maximum = "模" * MODEL_ID_MAX_CODE_POINTS

    assert make_draft(model_id=maximum).model_id == maximum
    with pytest.raises(ValidationError):
        make_draft(model_id=maximum + "型")


@pytest.mark.parametrize(
    "api_key",
    ("1234567", "x" * 4097, "        ", "abcd efgh", "abcd\nefgh"),
)
def test_api_key_requires_8_to_4096_non_whitespace_characters(
    api_key: str,
) -> None:
    with pytest.raises(ValidationError) as exc_info:
        make_draft(api_key=SecretStr(api_key))

    assert api_key not in str(exc_info.value)


def test_secret_command_is_frozen_strict_and_never_repr_leaks() -> None:
    draft = make_draft()

    assert RAW_API_KEY not in repr(draft)
    with pytest.raises(ValidationError):
        draft.model_id = "replacement"  # type: ignore[misc]
    with pytest.raises(ValidationError) as exc_info:
        ModelConfigDraft.model_validate(
            {
                **draft.model_dump(),
                "api_key": SecretStr(RAW_API_KEY),
                "unexpected": RAW_API_KEY,
            }
        )
    assert RAW_API_KEY not in str(exc_info.value)


@pytest.mark.parametrize("expected_revision", (-1, True, 1.5, "1"))
def test_expected_revision_is_a_strict_non_negative_integer(
    expected_revision: object,
) -> None:
    with pytest.raises(ValidationError):
        make_draft(expected_revision=expected_revision)


def test_metadata_is_frozen_validated_and_has_no_secret_field() -> None:
    metadata = StoredModelConfigMetadata(
        provider="deepseek",
        model_id="deepseek-chat",
        endpoint_id="deepseek-official",
        api_key_last_four="alue",
        revision=1,
        test_status="passed",
        last_tested_at=datetime(2026, 7, 18, 1, 2, 3, tzinfo=UTC),
    )

    assert {field.name for field in fields(metadata)} == {
        "provider",
        "model_id",
        "endpoint_id",
        "api_key_last_four",
        "revision",
        "test_status",
        "last_tested_at",
    }
    assert RAW_API_KEY not in repr(metadata)
    with pytest.raises(FrozenInstanceError):
        metadata.revision = 2  # type: ignore[misc]


@pytest.mark.parametrize(
    "last_tested_at",
    (datetime(2026, 7, 18, 1, 2, 3), "2026-07-18T01:02:03.000Z", 123),
)
def test_metadata_rejects_non_aware_last_tested_timestamp(
    last_tested_at: object,
) -> None:
    with pytest.raises((TypeError, ValueError)):
        StoredModelConfigMetadata(
            provider="openai",
            model_id="gpt-5",
            endpoint_id="openai-official",
            api_key_last_four="last",
            revision=1,
            test_status="passed",
            last_tested_at=last_tested_at,  # type: ignore[arg-type]
        )


@pytest.mark.parametrize(
    ("field_name", "value"),
    (
        ("provider", "local"),
        ("model_id", ""),
        ("endpoint_id", ""),
        ("api_key_last_four", "abc"),
        ("revision", 0),
        ("test_status", "unknown"),
    ),
)
def test_metadata_rejects_invalid_revision_status_and_identifiers(
    field_name: str,
    value: object,
) -> None:
    values: dict[str, object] = {
        "provider": "openai",
        "model_id": "gpt-5",
        "endpoint_id": "openai-official",
        "api_key_last_four": "last",
        "revision": 1,
        "test_status": "passed",
    }
    values[field_name] = value

    with pytest.raises((TypeError, ValueError)):
        StoredModelConfigMetadata(**values)  # type: ignore[arg-type]
