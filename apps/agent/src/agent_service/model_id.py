"""Shared model ID contract for bootstrap and administrator-managed models."""

import re
from typing import Final


MODEL_ID_MAX_CODE_POINTS: Final = 128
_URL_LIKE: Final = re.compile(r"(?:[a-z][a-z0-9+.-]*://|//)", re.IGNORECASE)


def validate_model_id(value: str) -> str:
    if not value or value != value.strip():
        raise ValueError("invalid model ID")
    if len(value) > MODEL_ID_MAX_CODE_POINTS:
        raise ValueError("invalid model ID")
    if any(
        ord(character) <= 0x1F
        or 0x7F <= ord(character) <= 0x9F
        or 0xD800 <= ord(character) <= 0xDFFF
        for character in value
    ):
        raise ValueError("invalid model ID")
    if _URL_LIKE.search(value) is not None:
        raise ValueError("invalid model ID")
    return value
