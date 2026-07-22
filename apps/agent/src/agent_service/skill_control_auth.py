"""Pre-body authentication for the private Skill runtime control plane."""

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


SkillControlAction = Literal["skill_runtime_status", "skill_runtime_activate"]
SkillControlPermission = Literal[
    "admin:assistant:skills",
    "admin:assistant:skills:configure",
]
SkillControlAssurance = Literal["session", "password+mfa"]

SKILL_ASSERTION_KEY_DERIVATION_DOMAIN: Final = (
    b"ai-agent-platform:skill-control-assertion:v1"
)
SKILL_ASSERTION_HEADER_NAME: Final = b"x-agent-control-assertion"
SKILL_ASSERTION_HEADER_MAX_BYTES: Final = 4096
SKILL_ASSERTION_PAYLOAD_MAX_BYTES: Final = 2048
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
        "target",
        "assurance",
        "assuredAt",
        "issuedAt",
        "expiresAt",
        "nonce",
    }
)
_ACTION_REQUIREMENTS: Final[
    dict[SkillControlAction, tuple[SkillControlPermission, SkillControlAssurance]]
] = {
    "skill_runtime_status": ("admin:assistant:skills", "session"),
    "skill_runtime_activate": (
        "admin:assistant:skills:configure",
        "password+mfa",
    ),
}
_BEARER_ERROR: Final = "skill control authentication failed"
_ASSERTION_ERROR: Final = "skill control authorization failed"
_CONFIGURATION_ERROR: Final = "skill control authentication configuration failed"


class SkillControlBearerError(RuntimeError):
    """A fixed 401-class failure for the dedicated internal Bearer."""


class SkillControlAssertionError(RuntimeError):
    """A fixed 403-class failure for a signed Skill control assertion."""


class SkillControlAuthConfigurationError(RuntimeError):
    """A fixed startup failure for an unsafe control-key boundary."""


@dataclass(frozen=True, slots=True)
class SkillControlAssertion:
    """Verified actor and one-time Skill command context."""

    actor: UUID
    permission: SkillControlPermission
    request_id: UUID
    action: SkillControlAction
    target: str
    assurance: SkillControlAssurance
    assured_at: int | None
    issued_at: int
    expires_at: int
    nonce: UUID


def _fail_bearer() -> NoReturn:
    raise SkillControlBearerError(_BEARER_ERROR) from None


def _fail_assertion() -> NoReturn:
    raise SkillControlAssertionError(_ASSERTION_ERROR) from None


def _fail_configuration() -> NoReturn:
    raise SkillControlAuthConfigurationError(_CONFIGURATION_ERROR) from None


def _canonical_payload_bytes(payload: dict[str, object]) -> bytes | None:
    try:
        return json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    except (TypeError, UnicodeError, ValueError):
        return None


def _decode_base64url(value: bytes, *, maximum: int) -> bytes | None:
    if (
        not value
        or len(value) > maximum * 2
        or _BASE64URL_PATTERN.fullmatch(value) is None
    ):
        return None
    try:
        padding = b"=" * (-len(value) % 4)
        decoded = base64.b64decode(value + padding, altchars=b"-_", validate=True)
    except (binascii.Error, ValueError):
        return None
    if len(decoded) > maximum:
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
    try:
        parsed = json.loads(raw_payload, object_pairs_hook=_strict_object)
    except (UnicodeError, json.JSONDecodeError, TypeError, ValueError):
        return None
    if type(parsed) is not dict:
        return None
    return cast(dict[str, object], parsed)


def _parse_canonical_uuid(value: object) -> UUID | None:
    if type(value) is not str:
        return None
    try:
        parsed = UUID(value)
    except (AttributeError, ValueError):
        return None
    return parsed if str(parsed) == value else None


def _header_values(
    headers: Iterable[tuple[bytes, bytes]],
    name: bytes,
) -> list[bytes] | None:
    values: list[bytes] = []
    try:
        for header_name, value in headers:
            if type(header_name) is not bytes or type(value) is not bytes:
                return None
            if header_name.lower() == name:
                values.append(value)
    except (TypeError, ValueError):
        return None
    return values


class SkillControlAuthenticator:
    """Verify Skill control headers without accepting an ASGI receiver."""

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
        try:
            control_bytes = control_value.encode("utf-8")
            os_bytes = os_value.encode("utf-8")
        except UnicodeError:
            _fail_configuration()
        if (
            len(control_bytes) < 32
            or _BEARER_TOKEN_PATTERN.fullmatch(control_value) is None
            or hmac.compare_digest(control_bytes, os_bytes)
        ):
            _fail_configuration()
        self._control_key = control_bytes
        self._signing_key = hmac.new(
            control_bytes,
            SKILL_ASSERTION_KEY_DERIVATION_DOMAIN,
            hashlib.sha256,
        ).digest()

    def authenticate(
        self,
        *,
        headers: Iterable[tuple[bytes, bytes]],
        action: SkillControlAction,
        target: str | None = None,
        target_prefix: str | None = None,
        now: int,
    ) -> SkillControlAssertion:
        """Authenticate one exact Skill status or activation command."""
        try:
            request_headers = tuple(headers)
        except TypeError:
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

        assertion_values = _header_values(request_headers, SKILL_ASSERTION_HEADER_NAME)
        if (
            assertion_values is None
            or type(action) is not str
            or action not in _ACTION_REQUIREMENTS
            or (target is None) == (target_prefix is None)
            or (target is not None and (type(target) is not str or not target))
            or (
                target_prefix is not None
                and (type(target_prefix) is not str or not target_prefix)
            )
            or type(now) is not int
            or len(assertion_values) != 1
        ):
            _fail_assertion()
        encoded_assertion = assertion_values[0]
        if (
            not encoded_assertion
            or len(encoded_assertion) > SKILL_ASSERTION_HEADER_MAX_BYTES
            or encoded_assertion.count(b".") != 1
        ):
            _fail_assertion()
        encoded_payload, encoded_signature = encoded_assertion.split(b".", 1)
        raw_payload = _decode_base64url(
            encoded_payload,
            maximum=SKILL_ASSERTION_PAYLOAD_MAX_BYTES,
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
        asserted_target = parsed["target"]
        assurance = parsed["assurance"]
        assured_at = parsed["assuredAt"]
        issued_at = parsed["issuedAt"]
        expires_at = parsed["expiresAt"]
        required_permission, required_assurance = _ACTION_REQUIREMENTS[
            cast(SkillControlAction, action)
        ]
        target_valid = (
            asserted_target == target
            if target is not None
            else type(asserted_target) is str
            and asserted_target.startswith(cast(str, target_prefix))
        )
        assurance_valid = (
            assured_at is None
            if action == "skill_runtime_status"
            else type(assured_at) is int
            and now - 600 <= assured_at <= now + 2
        )
        if (
            actor is None
            or request_id is None
            or nonce is None
            or type(permission) is not str
            or permission != required_permission
            or type(asserted_action) is not str
            or asserted_action != action
            or type(asserted_target) is not str
            or not target_valid
            or type(assurance) is not str
            or assurance != required_assurance
            or not assurance_valid
            or type(issued_at) is not int
            or type(expires_at) is not int
            or not issued_at < expires_at
            or expires_at - issued_at > 5
            or not issued_at - 2 <= now
            or not now <= expires_at + 2
        ):
            _fail_assertion()

        return SkillControlAssertion(
            actor=actor,
            permission=cast(SkillControlPermission, permission),
            request_id=request_id,
            action=cast(SkillControlAction, asserted_action),
            target=asserted_target,
            assurance=cast(SkillControlAssurance, assurance),
            assured_at=cast(int | None, assured_at),
            issued_at=issued_at,
            expires_at=expires_at,
            nonce=nonce,
        )
