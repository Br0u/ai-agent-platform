from dataclasses import FrozenInstanceError, replace
import logging
from typing import cast
from uuid import UUID, uuid4

from pydantic import SecretStr
import pytest

import agent_service.model_config_crypto as crypto_module
from agent_service.model_config_crypto import (
    ModelConfigCipher,
    ModelConfigCryptoError,
    SealedSecret,
)
from agent_service.model_config_types import ModelProvider


MASTER_KEY = "01" * 32
OTHER_MASTER_KEY = "10" * 32
CONFIG_ID = UUID("f14b5380-0b72-4c62-b9b4-7f57243bbc01")
RAW_SECRET = "provider-secret-sentinel-1234"
FIXED_ERROR = "model configuration cryptography failed"


def make_cipher(master_key: str = MASTER_KEY) -> ModelConfigCipher:
    return ModelConfigCipher(master_key=SecretStr(master_key))


def seal_secret(
    cipher: ModelConfigCipher | None = None,
    *,
    config_id: UUID = CONFIG_ID,
    provider: ModelProvider = "deepseek",
    revision: int = 1,
    secret: str = RAW_SECRET,
) -> SealedSecret:
    return (cipher or make_cipher()).seal(
        config_id=config_id,
        provider=provider,
        revision=revision,
        secret=SecretStr(secret),
    )


def assert_fixed_crypto_error(exc_info: pytest.ExceptionInfo[Exception]) -> None:
    assert type(exc_info.value) is ModelConfigCryptoError
    assert str(exc_info.value) == FIXED_ERROR
    assert repr(exc_info.value) == f"ModelConfigCryptoError('{FIXED_ERROR}')"
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__context__ is None
    assert exc_info.value.__suppress_context__ is True


def test_round_trip_uses_random_12_byte_nonce_and_exact_last_four() -> None:
    cipher = make_cipher()

    first = seal_secret(cipher)
    second = seal_secret(cipher)

    assert len(first.nonce) == 12
    assert len(second.nonce) == 12
    assert first.nonce != second.nonce
    assert first.ciphertext != second.ciphertext
    assert first.key_version == 1
    assert first.last_four == "1234"
    assert (
        cipher.open(
            config_id=CONFIG_ID,
            provider="deepseek",
            revision=1,
            sealed=first,
        ).get_secret_value()
        == RAW_SECRET
    )


def test_nonce_generator_is_requested_to_return_exactly_12_bytes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requested_sizes: list[int] = []

    def deterministic_token_bytes(size: int) -> bytes:
        requested_sizes.append(size)
        return b"n" * size

    monkeypatch.setattr(crypto_module.secrets, "token_bytes", deterministic_token_bytes)

    sealed = seal_secret()

    assert requested_sizes == [12]
    assert sealed.nonce == b"n" * 12


def test_master_key_is_decoded_from_exactly_64_lowercase_hex_characters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    decoded_keys: list[bytes] = []

    class CapturingAESGCM:
        def __init__(self, key: bytes) -> None:
            decoded_keys.append(key)

        def encrypt(self, nonce: bytes, data: bytes, aad: bytes) -> bytes:
            return b"captured-ciphertext"

    monkeypatch.setattr(crypto_module, "AESGCM", CapturingAESGCM)

    seal_secret(make_cipher())

    assert decoded_keys == [bytes.fromhex(MASTER_KEY)]
    assert len(decoded_keys[0]) == 32


def test_aad_is_deterministic_unambiguous_and_contains_every_context_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_aad: list[bytes] = []

    class CapturingAESGCM:
        def __init__(self, key: bytes) -> None:
            pass

        def encrypt(self, nonce: bytes, data: bytes, aad: bytes) -> bytes:
            captured_aad.append(aad)
            return b"captured-ciphertext"

    def frame(value: bytes) -> bytes:
        return len(value).to_bytes(4, "big") + value

    monkeypatch.setattr(crypto_module, "AESGCM", CapturingAESGCM)

    seal_secret(make_cipher())
    seal_secret(make_cipher())

    expected = b"".join(
        frame(value)
        for value in (
            b"agent-model-config:aes-256-gcm:v1",
            CONFIG_ID.bytes,
            b"deepseek",
            b"\x01",
            b"\x01",
        )
    )
    assert captured_aad == [expected, expected]


@pytest.mark.parametrize(
    "master_key",
    (
        "a" * 63,
        "a" * 65,
        "A" * 64,
        "0x" + "a" * 64,
        "a" * 63 + "=",
        "a" * 62 + "==",
        "a" * 63 + "\n",
        "g" * 64,
    ),
)
def test_master_key_rejects_every_noncanonical_encoding(master_key: str) -> None:
    with pytest.raises(ModelConfigCryptoError) as exc_info:
        make_cipher(master_key)

    assert_fixed_crypto_error(exc_info)
    assert master_key not in str(exc_info.value)


def test_master_key_decode_failure_discards_underlying_exception_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FailingBytes:
        @classmethod
        def fromhex(cls, value: str) -> bytes:
            raise ValueError(MASTER_KEY)

    monkeypatch.setattr(crypto_module, "bytes", FailingBytes, raising=False)

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        make_cipher()

    assert_fixed_crypto_error(exc_info)
    assert MASTER_KEY not in repr(exc_info.value)


class SecretString(str):
    pass


@pytest.mark.parametrize(
    "value",
    (123, SecretString("01" * 32)),
)
def test_master_key_requires_get_secret_value_to_return_exact_str(
    value: object,
) -> None:
    master_key = SecretStr(cast(str, value))

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        ModelConfigCipher(master_key=master_key)

    assert_fixed_crypto_error(exc_info)


@pytest.mark.parametrize(
    ("config_id", "provider", "revision"),
    (
        (UUID("8d958d97-06db-4b07-9728-69871e842521"), "deepseek", 1),
        (CONFIG_ID, "openai", 1),
        (CONFIG_ID, "deepseek", 2),
    ),
)
def test_authenticated_context_binds_config_provider_and_revision(
    config_id: UUID,
    provider: ModelProvider,
    revision: int,
) -> None:
    cipher = make_cipher()
    sealed = seal_secret(cipher)

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        cipher.open(
            config_id=config_id,
            provider=provider,
            revision=revision,
            sealed=sealed,
        )

    assert_fixed_crypto_error(exc_info)


@pytest.mark.parametrize("field_name", ("ciphertext", "nonce"))
def test_ciphertext_and_nonce_tampering_fail_closed(field_name: str) -> None:
    cipher = make_cipher()
    sealed = seal_secret(cipher)
    original = cast(bytes, getattr(sealed, field_name))
    tampered_value = bytes([original[0] ^ 1]) + original[1:]
    if field_name == "ciphertext":
        tampered = replace(sealed, ciphertext=tampered_value)
    else:
        assert field_name == "nonce"
        tampered = replace(sealed, nonce=tampered_value)

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        cipher.open(
            config_id=CONFIG_ID,
            provider="deepseek",
            revision=1,
            sealed=tampered,
        )

    assert_fixed_crypto_error(exc_info)


def test_last_four_tampering_fails_closed() -> None:
    cipher = make_cipher()
    sealed = replace(seal_secret(cipher), last_four="xxxx")

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        cipher.open(
            config_id=CONFIG_ID,
            provider="deepseek",
            revision=1,
            sealed=sealed,
        )

    assert_fixed_crypto_error(exc_info)


def test_wrong_master_key_fails_closed() -> None:
    sealed = seal_secret()

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        make_cipher(OTHER_MASTER_KEY).open(
            config_id=CONFIG_ID,
            provider="deepseek",
            revision=1,
            sealed=sealed,
        )

    assert_fixed_crypto_error(exc_info)


def test_seal_discards_unicode_encode_error_with_secret_object() -> None:
    raw_secret = "surrogate-secret-\ud800-value"

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        seal_secret(secret=raw_secret)

    assert_fixed_crypto_error(exc_info)
    assert raw_secret not in repr(exc_info.value)


def test_open_discards_invalid_tag_exception_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RejectingAESGCM:
        def __init__(self, key: bytes) -> None:
            pass

        def decrypt(self, nonce: bytes, data: bytes, aad: bytes) -> bytes:
            raise crypto_module.InvalidTag(RAW_SECRET)

    monkeypatch.setattr(crypto_module, "AESGCM", RejectingAESGCM)
    cipher = make_cipher()
    sealed = SealedSecret(
        ciphertext=b"ciphertext-and-tag",
        nonce=b"n" * 12,
        key_version=1,
        last_four="1234",
    )

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        cipher.open(
            config_id=CONFIG_ID,
            provider="deepseek",
            revision=1,
            sealed=sealed,
        )

    assert_fixed_crypto_error(exc_info)
    assert RAW_SECRET not in repr(exc_info.value)


def test_open_discards_invalid_utf8_exception_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class InvalidUtf8AESGCM:
        def __init__(self, key: bytes) -> None:
            pass

        def decrypt(self, nonce: bytes, data: bytes, aad: bytes) -> bytes:
            return b"\xff" * 8

    monkeypatch.setattr(crypto_module, "AESGCM", InvalidUtf8AESGCM)
    cipher = make_cipher()
    sealed = SealedSecret(
        ciphertext=b"ciphertext-and-tag",
        nonce=b"n" * 12,
        key_version=1,
        last_four="1234",
    )

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        cipher.open(
            config_id=CONFIG_ID,
            provider="deepseek",
            revision=1,
            sealed=sealed,
        )

    assert_fixed_crypto_error(exc_info)


def test_unknown_key_version_fails_before_aesgcm_decrypt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    decrypt_calls = 0

    class FailIfDecryptCalledAESGCM:
        def __init__(self, key: bytes) -> None:
            pass

        def decrypt(self, nonce: bytes, data: bytes, aad: bytes) -> bytes:
            nonlocal decrypt_calls
            decrypt_calls += 1
            raise AssertionError("AESGCM.decrypt must not be called")

    monkeypatch.setattr(crypto_module, "AESGCM", FailIfDecryptCalledAESGCM)
    cipher = make_cipher()
    sealed = SealedSecret(
        ciphertext=b"ciphertext-and-tag",
        nonce=b"n" * 12,
        key_version=2,
        last_four="1234",
    )

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        cipher.open(
            config_id=CONFIG_ID,
            provider="deepseek",
            revision=1,
            sealed=sealed,
        )

    assert decrypt_calls == 0
    assert_fixed_crypto_error(exc_info)


@pytest.mark.parametrize(
    "secret",
    tuple("x" * length for length in range(8))
    + (
        "abcdefgh ",
        "abcd efgh",
        "abcd\nefgh",
        "abcd\tefgh",
        "abcd\u2003efgh",
        "x" * 4097,
    ),
)
def test_secret_rejects_out_of_bounds_or_any_whitespace(secret: str) -> None:
    with pytest.raises(ModelConfigCryptoError) as exc_info:
        seal_secret(secret=secret)

    assert_fixed_crypto_error(exc_info)
    if secret:
        assert secret not in str(exc_info.value)


@pytest.mark.parametrize("length", (8, 4096))
def test_secret_accepts_exact_inclusive_length_boundaries(length: int) -> None:
    raw_secret = "x" * length
    cipher = make_cipher()
    sealed = seal_secret(cipher, secret=raw_secret)

    assert sealed.last_four == "xxxx"
    assert (
        cipher.open(
            config_id=CONFIG_ID,
            provider="deepseek",
            revision=1,
            sealed=sealed,
        ).get_secret_value()
        == raw_secret
    )


@pytest.mark.parametrize(
    "value",
    (123, SecretString("valid-secret-value")),
)
def test_secret_requires_get_secret_value_to_return_exact_str(
    value: object,
) -> None:
    secret = SecretStr(cast(str, value))

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        make_cipher().seal(
            config_id=CONFIG_ID,
            provider="deepseek",
            revision=1,
            secret=secret,
        )

    assert_fixed_crypto_error(exc_info)


@pytest.mark.parametrize("revision", (0, -1, True, 1.0, "1"))
def test_revision_requires_an_exact_positive_integer(revision: object) -> None:
    with pytest.raises(ModelConfigCryptoError) as exc_info:
        seal_secret(revision=cast(int, revision))

    assert_fixed_crypto_error(exc_info)


@pytest.mark.parametrize("provider", ("local", "OpenAI", 1, True))
def test_provider_is_validated_at_runtime(provider: object) -> None:
    with pytest.raises(ModelConfigCryptoError) as exc_info:
        seal_secret(provider=cast(ModelProvider, provider))

    assert_fixed_crypto_error(exc_info)


def test_provider_rejects_string_subclasses() -> None:
    class ProviderString(str):
        pass

    with pytest.raises(ModelConfigCryptoError) as exc_info:
        seal_secret(provider=cast(ModelProvider, ProviderString("openai")))

    assert_fixed_crypto_error(exc_info)


@pytest.mark.parametrize("config_id", (str(CONFIG_ID), 1, None))
def test_config_id_requires_a_uuid_instance(config_id: object) -> None:
    with pytest.raises(ModelConfigCryptoError) as exc_info:
        seal_secret(config_id=cast(UUID, config_id))

    assert_fixed_crypto_error(exc_info)


def test_sealed_secret_is_frozen_and_plaintext_never_leaks(
    caplog: pytest.LogCaptureFixture,
) -> None:
    cipher = make_cipher()
    sealed = seal_secret(cipher)

    assert MASTER_KEY not in repr(cipher)
    assert RAW_SECRET not in repr(cipher)
    assert RAW_SECRET not in repr(sealed)
    with pytest.raises(FrozenInstanceError):
        sealed.key_version = 2  # type: ignore[misc]

    caplog.set_level(logging.DEBUG)
    with pytest.raises(ModelConfigCryptoError) as exc_info:
        cipher.open(
            config_id=uuid4(),
            provider="deepseek",
            revision=1,
            sealed=sealed,
        )

    assert_fixed_crypto_error(exc_info)
    assert RAW_SECRET not in str(exc_info.value)
    assert RAW_SECRET not in repr(exc_info.value)
    assert MASTER_KEY not in caplog.text
    assert RAW_SECRET not in caplog.text


def test_sealed_secret_repr_hides_ciphertext_nonce_and_last_four() -> None:
    unique_suffix = "U9!q"
    sealed = seal_secret(secret=f"provider-secret-{unique_suffix}")

    assert sealed.last_four == unique_suffix
    assert unique_suffix not in repr(sealed)
    assert repr(sealed.ciphertext) not in repr(sealed)
    assert repr(sealed.nonce) not in repr(sealed)


def test_seal_and_open_never_log_plaintext(
    caplog: pytest.LogCaptureFixture,
) -> None:
    raw_secret = "logging-secret-sentinel-R7!x"
    caplog.set_level(logging.DEBUG)
    cipher = make_cipher()

    sealed = seal_secret(cipher, secret=raw_secret)
    assert raw_secret not in caplog.text

    caplog.clear()
    opened = cipher.open(
        config_id=CONFIG_ID,
        provider="deepseek",
        revision=1,
        sealed=sealed,
    )
    assert opened.get_secret_value() == raw_secret
    assert raw_secret not in caplog.text
