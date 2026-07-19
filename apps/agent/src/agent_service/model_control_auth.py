"""Pre-body authentication for the private model-configuration control plane."""

import base64
import binascii
from collections.abc import Iterable
from dataclasses import dataclass
import hashlib
import hmac
import json
import re
from typing import Final, Literal, NoReturn, cast
from uuid import UUID

from pydantic import SecretStr

from agent_service.model_config_types import MODEL_PROVIDERS, ModelProvider


ModelControlAction = Literal["save", "test_and_activate", "reveal"]
ModelControlPermission = Literal[
    "admin:assistant:configure",
    "admin:assistant:secret:reveal",
]

ASSERTION_KEY_DERIVATION_DOMAIN: Final = b"ai-agent-platform:model-control-assertion:v1"
ASSERTION_HEADER_NAME: Final = b"x-agent-control-assertion"
ASSERTION_HEADER_MAX_BYTES: Final = 4096
ASSERTION_PAYLOAD_MAX_BYTES: Final = 2048
_AUTHORIZATION_HEADER_NAME: Final = b"authorization"
_SIGNATURE_BYTES: Final = hashlib.sha256().digest_size
_BASE64URL_PATTERN: Final = re.compile(rb"[A-Za-z0-9_-]+\Z")
_BEARER_TOKEN_PATTERN: Final = re.compile(r"[A-Za-z0-9._~+/-]+=*\Z")
_ASSERTION_FIELDS: Final = frozenset(
    {
        "actor",
        "permission",
        "requestId",
        "action",
        "provider",
        "issuedAt",
        "expiresAt",
        "nonce",
    }
)
_ACTION_PERMISSIONS: Final[dict[ModelControlAction, ModelControlPermission]] = {
    "save": "admin:assistant:configure",
    "test_and_activate": "admin:assistant:configure",
    "reveal": "admin:assistant:secret:reveal",
}
_BEARER_ERROR: Final = "model control authentication failed"
_ASSERTION_ERROR: Final = "model control authorization failed"
_CONFIGURATION_ERROR: Final = "model control authentication configuration failed"


class ModelControlBearerError(RuntimeError):
    """A fixed 401-class failure for the dedicated internal Bearer."""


class ModelControlAssertionError(RuntimeError):
    """A fixed 403-class failure for a signed request assertion."""


class ModelControlAuthConfigurationError(RuntimeError):
    """A fixed startup failure for an unsafe control-key boundary."""


@dataclass(frozen=True, slots=True)
class ModelControlAssertion:
    """Verified actor and one-time command context safe for service dispatch."""

    actor: UUID
    permission: ModelControlPermission
    request_id: UUID
    action: ModelControlAction
    provider: ModelProvider
    issued_at: int
    expires_at: int
    nonce: UUID


def _fail_bearer() -> NoReturn:
    raise ModelControlBearerError(_BEARER_ERROR) from None


def _fail_assertion() -> NoReturn:
    raise ModelControlAssertionError(_ASSERTION_ERROR) from None


def _fail_configuration() -> NoReturn:
    raise ModelControlAuthConfigurationError(_CONFIGURATION_ERROR) from None


def _canonical_payload_bytes(payload: dict[str, object]) -> bytes | None:
    encoded: bytes | None = None
    try:
        encoded = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    except (TypeError, UnicodeError, ValueError):
        pass
    return encoded


def _decode_base64url(value: bytes, *, maximum: int) -> bytes | None:
    if (
        not value
        or len(value) > maximum * 2
        or _BASE64URL_PATTERN.fullmatch(value) is None
    ):
        return None
    decoded: bytes | None = None
    try:
        padding = b"=" * (-len(value) % 4)
        decoded = base64.b64decode(value + padding, altchars=b"-_", validate=True)
    except (binascii.Error, ValueError):
        pass
    if decoded is None or len(decoded) > maximum:
        return None
    if base64.urlsafe_b64encode(decoded).rstrip(b"=") != value:
        return None
    return decoded


def _strict_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate assertion field")
        result[key] = value
    return result


def _parse_json_object(raw_payload: bytes) -> dict[str, object] | None:
    parsed: object | None = None
    try:
        parsed = json.loads(raw_payload, object_pairs_hook=_strict_object)
    except (UnicodeError, json.JSONDecodeError, TypeError, ValueError):
        pass
    if type(parsed) is not dict:
        return None
    return cast(dict[str, object], parsed)


def _parse_canonical_uuid(value: object) -> UUID | None:
    if type(value) is not str:
        return None
    parsed: UUID | None = None
    try:
        parsed = UUID(value)
    except (AttributeError, ValueError):
        pass
    if parsed is None or str(parsed) != value:
        return None
    return parsed


def _header_values(
    headers: Iterable[tuple[bytes, bytes]],
    name: bytes,
) -> list[bytes] | None:
    values: list[bytes] = []
    valid = True
    try:
        for header_name, value in headers:
            if type(header_name) is not bytes or type(value) is not bytes:
                valid = False
                break
            if header_name.lower() == name:
                values.append(value)
    except (TypeError, ValueError):
        valid = False
    return values if valid else None


class ModelControlAuthenticator:
    """Verify control headers without accepting or touching an ASGI receiver."""

    __slots__ = ("_control_key", "_signing_key")

    def __init__(
        self,
        *,
        control_key: SecretStr,
        os_security_key: SecretStr,
    ) -> None:
        if not isinstance(control_key, SecretStr) or not isinstance(
            os_security_key, SecretStr
        ):
            _fail_configuration()
        control_value = control_key.get_secret_value()
        os_value = os_security_key.get_secret_value()
        if type(control_value) is not str or type(os_value) is not str:
            _fail_configuration()
        control_bytes: bytes | None = None
        os_bytes: bytes | None = None
        try:
            control_bytes = control_value.encode("utf-8")
            os_bytes = os_value.encode("utf-8")
        except UnicodeError:
            pass
        if (
            control_bytes is None
            or os_bytes is None
            or len(control_bytes) < 32
            or _BEARER_TOKEN_PATTERN.fullmatch(control_value) is None
            or hmac.compare_digest(control_bytes, os_bytes)
        ):
            _fail_configuration()
        self._control_key = control_bytes
        self._signing_key = hmac.new(
            control_bytes,
            ASSERTION_KEY_DERIVATION_DOMAIN,
            hashlib.sha256,
        ).digest()

    def authenticate(
        self,
        *,
        headers: Iterable[tuple[bytes, bytes]],
        action: ModelControlAction | None,
        provider: ModelProvider | None,
        now: int,
    ) -> ModelControlAssertion | None:
        """Authenticate headers for one GET or one Provider-scoped mutation."""
        request_headers: tuple[tuple[bytes, bytes], ...] | None = None
        try:
            request_headers = tuple(headers)
        except TypeError:
            pass
        if request_headers is None:
            _fail_bearer()

        authorization_values = _header_values(
            request_headers,
            _AUTHORIZATION_HEADER_NAME,
        )
        if authorization_values is None or len(authorization_values) != 1:
            _fail_bearer()
        parts = authorization_values[0].split(b" ")
        if len(parts) != 2:
            _fail_bearer()
        scheme, token = parts
        if not (
            hmac.compare_digest(scheme.lower(), b"bearer")
            and hmac.compare_digest(token, self._control_key)
        ):
            _fail_bearer()

        assertion_values = _header_values(request_headers, ASSERTION_HEADER_NAME)
        if assertion_values is None:
            _fail_assertion()
        if action is None and provider is None:
            if assertion_values:
                _fail_assertion()
            return None
        if (
            type(action) is not str
            or action not in _ACTION_PERMISSIONS
            or type(provider) is not str
            or provider not in MODEL_PROVIDERS
            or type(now) is not int
            or len(assertion_values) != 1
        ):
            _fail_assertion()

        encoded_assertion = assertion_values[0]
        if (
            not encoded_assertion
            or len(encoded_assertion) > ASSERTION_HEADER_MAX_BYTES
            or encoded_assertion.count(b".") != 1
        ):
            _fail_assertion()
        encoded_payload, encoded_signature = encoded_assertion.split(b".", 1)
        raw_payload = _decode_base64url(
            encoded_payload,
            maximum=ASSERTION_PAYLOAD_MAX_BYTES,
        )
        signature = _decode_base64url(
            encoded_signature,
            maximum=_SIGNATURE_BYTES,
        )
        if (
            raw_payload is None
            or signature is None
            or len(signature) != _SIGNATURE_BYTES
        ):
            _fail_assertion()

        expected_signature = hmac.new(
            self._signing_key,
            raw_payload,
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(signature, expected_signature):
            _fail_assertion()

        parsed = _parse_json_object(raw_payload)
        if parsed is None or set(parsed) != _ASSERTION_FIELDS:
            _fail_assertion()
        canonical = _canonical_payload_bytes(parsed)
        if canonical is None or canonical != raw_payload:
            _fail_assertion()

        actor = _parse_canonical_uuid(parsed["actor"])
        request_id = _parse_canonical_uuid(parsed["requestId"])
        nonce = _parse_canonical_uuid(parsed["nonce"])
        permission = parsed["permission"]
        asserted_action = parsed["action"]
        asserted_provider = parsed["provider"]
        issued_at = parsed["issuedAt"]
        expires_at = parsed["expiresAt"]
        required_permission = _ACTION_PERMISSIONS[cast(ModelControlAction, action)]

        if (
            actor is None
            or request_id is None
            or nonce is None
            or type(permission) is not str
            or permission != required_permission
            or type(asserted_action) is not str
            or asserted_action != action
            or type(asserted_provider) is not str
            or asserted_provider != provider
            or type(issued_at) is not int
            or type(expires_at) is not int
            or not issued_at < expires_at
            or expires_at - issued_at > 5
            or not issued_at - 2 <= now
            or not now <= expires_at + 2
        ):
            _fail_assertion()

        return ModelControlAssertion(
            actor=actor,
            permission=cast(ModelControlPermission, permission),
            request_id=request_id,
            action=cast(ModelControlAction, asserted_action),
            provider=cast(ModelProvider, asserted_provider),
            issued_at=issued_at,
            expires_at=expires_at,
            nonce=nonce,
        )
