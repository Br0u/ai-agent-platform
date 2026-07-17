"""Authenticated encryption for administrator-managed model API keys."""

from dataclasses import dataclass, field
import re
import secrets
from typing import Final, NoReturn
from uuid import UUID

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import SecretStr

from agent_service.model_config_types import (
    MODEL_API_KEY_MAX_CODE_POINTS,
    MODEL_API_KEY_MIN_CODE_POINTS,
    MODEL_PROVIDERS,
    ModelProvider,
)


_KEY_VERSION: Final = 1
_NONCE_BYTES: Final = 12
_MASTER_KEY_PATTERN: Final = re.compile(r"[0-9a-f]{64}\Z")
_ERROR_MESSAGE: Final = "model configuration cryptography failed"
_AAD_DOMAIN: Final = b"agent-model-config:aes-256-gcm:v1"


class ModelConfigCryptoError(RuntimeError):
    """A fixed, secret-free model configuration cryptography failure."""


@dataclass(frozen=True, slots=True)
class SealedSecret:
    """Encrypted model API key plus the metadata required to open it."""

    ciphertext: bytes = field(repr=False)
    nonce: bytes = field(repr=False)
    key_version: int
    last_four: str


def _fail() -> NoReturn:
    raise ModelConfigCryptoError(_ERROR_MESSAGE) from None


def _validate_context(
    *,
    config_id: UUID,
    provider: ModelProvider,
    revision: int,
) -> None:
    if (
        type(config_id) is not UUID
        or type(provider) is not str
        or provider not in MODEL_PROVIDERS
        or type(revision) is not int
        or revision < 1
    ):
        _fail()


def _validate_secret(secret: SecretStr) -> str:
    if not isinstance(secret, SecretStr):
        _fail()
    value = secret.get_secret_value()
    if not MODEL_API_KEY_MIN_CODE_POINTS <= len(
        value
    ) <= MODEL_API_KEY_MAX_CODE_POINTS or any(
        character.isspace() for character in value
    ):
        _fail()
    return value


def _frame(value: bytes) -> bytes:
    return len(value).to_bytes(4, "big") + value


def _positive_integer_bytes(value: int) -> bytes:
    return value.to_bytes(max(1, (value.bit_length() + 7) // 8), "big")


def _associated_data(
    *,
    config_id: UUID,
    provider: ModelProvider,
    revision: int,
    key_version: int,
) -> bytes:
    fields = (
        _AAD_DOMAIN,
        config_id.bytes,
        provider.encode("ascii"),
        _positive_integer_bytes(revision),
        _positive_integer_bytes(key_version),
    )
    return b"".join(_frame(value) for value in fields)


class ModelConfigCipher:
    """AES-256-GCM cipher bound to one deployment master key."""

    __slots__ = ("__aead",)

    def __init__(self, *, master_key: SecretStr) -> None:
        if not isinstance(master_key, SecretStr):
            _fail()
        encoded_key = master_key.get_secret_value()
        if _MASTER_KEY_PATTERN.fullmatch(encoded_key) is None:
            _fail()
        try:
            decoded_key = bytes.fromhex(encoded_key)
            self.__aead = AESGCM(decoded_key)
        except (TypeError, ValueError):
            _fail()

    def seal(
        self,
        *,
        config_id: UUID,
        provider: ModelProvider,
        revision: int,
        secret: SecretStr,
    ) -> SealedSecret:
        """Encrypt one validated API key under fresh authenticated context."""
        _validate_context(
            config_id=config_id,
            provider=provider,
            revision=revision,
        )
        value = _validate_secret(secret)
        nonce = secrets.token_bytes(_NONCE_BYTES)
        aad = _associated_data(
            config_id=config_id,
            provider=provider,
            revision=revision,
            key_version=_KEY_VERSION,
        )
        try:
            ciphertext = self.__aead.encrypt(
                nonce,
                value.encode("utf-8"),
                aad,
            )
        except (OverflowError, TypeError, ValueError):
            _fail()
        return SealedSecret(
            ciphertext=ciphertext,
            nonce=nonce,
            key_version=_KEY_VERSION,
            last_four=value[-4:],
        )

    def open(
        self,
        *,
        config_id: UUID,
        provider: ModelProvider,
        revision: int,
        sealed: SealedSecret,
    ) -> SecretStr:
        """Decrypt one API key, failing closed on every invalid input."""
        if (
            type(sealed) is not SealedSecret
            or type(sealed.key_version) is not int
            or sealed.key_version != _KEY_VERSION
        ):
            _fail()
        _validate_context(
            config_id=config_id,
            provider=provider,
            revision=revision,
        )
        if (
            type(sealed.ciphertext) is not bytes
            or len(sealed.ciphertext) < 16
            or type(sealed.nonce) is not bytes
            or len(sealed.nonce) != _NONCE_BYTES
            or type(sealed.last_four) is not str
            or len(sealed.last_four) != 4
            or any(character.isspace() for character in sealed.last_four)
        ):
            _fail()
        aad = _associated_data(
            config_id=config_id,
            provider=provider,
            revision=revision,
            key_version=sealed.key_version,
        )
        try:
            plaintext = self.__aead.decrypt(
                sealed.nonce,
                sealed.ciphertext,
                aad,
            ).decode("utf-8")
        except (InvalidTag, OverflowError, TypeError, UnicodeError, ValueError):
            _fail()
        _validate_secret(SecretStr(plaintext))
        if plaintext[-4:] != sealed.last_four:
            _fail()
        return SecretStr(plaintext)
