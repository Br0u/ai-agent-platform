"""Strict pre-body authentication for the private skill registry."""

from __future__ import annotations

import base64
import binascii
from collections.abc import Callable, Iterable
from dataclasses import dataclass
import hashlib
import hmac
import json
import re
from threading import Lock
import time
from typing import Final, Literal, NoReturn, cast
from urllib.parse import unquote_to_bytes
from uuid import UUID

from pydantic import SecretStr
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


SkillRegistryAction = Literal["list", "detail", "file", "upload", "review"]
SkillRegistryPermission = Literal[
    "admin:assistant:skills",
    "admin:assistant:skills:upload",
    "admin:assistant:skills:review",
]
Assurance = Literal["session", "password+mfa"]

ASSERTION_KEY_DERIVATION_DOMAIN: Final = b"ai-agent-platform:skill-registry-assertion:v1"
ASSERTION_HEADER_NAME: Final = b"x-skill-registry-assertion"
ASSERTION_HEADER_MAX_BYTES: Final = 4096
ASSERTION_PAYLOAD_MAX_BYTES: Final = 2048
ASSERTION_TTL_SECONDS: Final = 5
MFA_MAX_AGE_SECONDS: Final = 600
READ_NONCE_WINDOW_SECONDS: Final = 5
DEFAULT_NONCE_CAPACITY: Final = 4096

_AUTHORIZATION_HEADER_NAME: Final = b"authorization"
_SIGNATURE_BYTES: Final = hashlib.sha256().digest_size
_BASE64URL_PATTERN: Final = re.compile(rb"[A-Za-z0-9_-]+\Z")
_BEARER_TOKEN_PATTERN: Final = re.compile(r"[A-Za-z0-9._~+/-]+=*\Z")
_UUID_PATTERN: Final = rb"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
_DETAIL_PATTERN: Final = re.compile(
    rb"/internal/skills/(" + _UUID_PATTERN + rb")/revisions/(" + _UUID_PATTERN + rb")\Z"
)
_FILE_PATTERN: Final = re.compile(
    rb"/internal/skills/(" + _UUID_PATTERN + rb")/revisions/(" + _UUID_PATTERN + rb")/files/(.+)\Z"
)
_REVIEW_PATTERN: Final = re.compile(
    rb"/internal/skills/(" + _UUID_PATTERN + rb")/revisions/(" + _UUID_PATTERN + rb")/review\Z"
)
_UPLOAD_QUERY_PATTERN: Final = re.compile(rb"targetSkillId=(" + _UUID_PATTERN + rb")\Z")
_ASSERTION_FIELDS: Final = frozenset(
    {
        "action",
        "actor",
        "assurance",
        "assuredAt",
        "expiresAt",
        "issuedAt",
        "nonce",
        "permission",
        "requestId",
        "target",
    }
)
_ACTION_PERMISSIONS: Final[dict[SkillRegistryAction, SkillRegistryPermission]] = {
    "list": "admin:assistant:skills",
    "detail": "admin:assistant:skills:review",
    "file": "admin:assistant:skills:review",
    "upload": "admin:assistant:skills:upload",
    "review": "admin:assistant:skills:review",
}
_READ_ACTIONS: Final = frozenset({"list", "detail", "file"})
_NO_STORE_HEADERS: Final = {"Cache-Control": "no-store"}


class SkillRegistryBearerError(RuntimeError):
    """Fixed authentication failure without caller-controlled content."""


class SkillRegistryAssertionError(RuntimeError):
    """Fixed authorization failure without caller-controlled content."""


class SkillRegistryAuthConfigurationError(RuntimeError):
    """Fixed startup failure for an invalid control key."""


@dataclass(frozen=True, slots=True)
class SkillRegistryAssertion:
    actor: UUID
    permission: SkillRegistryPermission
    request_id: UUID
    action: SkillRegistryAction
    target: str
    assurance: Assurance
    assured_at: int | None
    issued_at: int
    expires_at: int
    nonce: UUID


def _fail_bearer() -> NoReturn:
    raise SkillRegistryBearerError("skill registry authentication failed") from None


def _fail_assertion() -> NoReturn:
    raise SkillRegistryAssertionError("skill registry authorization failed") from None


def _fail_configuration() -> NoReturn:
    raise SkillRegistryAuthConfigurationError(
        "skill registry authentication configuration failed"
    ) from None


def _header_values(headers: Iterable[tuple[bytes, bytes]], name: bytes) -> list[bytes] | None:
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


def _decode_base64url(value: bytes, *, maximum: int) -> bytes | None:
    if not value or len(value) > maximum * 2 or _BASE64URL_PATTERN.fullmatch(value) is None:
        return None
    decoded: bytes | None = None
    try:
        decoded = base64.b64decode(value + b"=" * (-len(value) % 4), altchars=b"-_", validate=True)
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
            raise ValueError("duplicate field")
        result[key] = value
    return result


def _reject_constant(_: str) -> NoReturn:
    raise ValueError("non-standard number")


def _parse_json_object(raw: bytes) -> dict[str, object] | None:
    parsed: object | None = None
    try:
        parsed = json.loads(
            raw,
            object_pairs_hook=_strict_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeError, json.JSONDecodeError, TypeError, ValueError):
        pass
    return cast(dict[str, object], parsed) if type(parsed) is dict else None


def _canonical_payload_bytes(payload: dict[str, object]) -> bytes | None:
    try:
        return json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, UnicodeError, ValueError):
        return None


def _canonical_uuid(value: object) -> UUID | None:
    if type(value) is not str:
        return None
    parsed: UUID | None = None
    try:
        parsed = UUID(value)
    except (AttributeError, ValueError):
        pass
    return parsed if parsed is not None and str(parsed) == value else None


class _ReadNonceCache:
    """Bounded fail-closed replay cache safe for concurrent auth calls."""

    __slots__ = ("_capacity", "_entries", "_lock")

    def __init__(self, capacity: int) -> None:
        if type(capacity) is not int or capacity < 1:
            _fail_configuration()
        self._capacity = capacity
        self._entries: dict[UUID, int] = {}
        self._lock = Lock()

    def claim(self, nonce: UUID, *, now: int) -> bool:
        with self._lock:
            expired = [value for value, expiry in self._entries.items() if expiry <= now]
            for value in expired:
                del self._entries[value]
            if nonce in self._entries or len(self._entries) >= self._capacity:
                return False
            self._entries[nonce] = now + READ_NONCE_WINDOW_SECONDS
            return True


class SkillRegistryAuthenticator:
    """Verify Bearer and canonical actor assertion without touching a request body."""

    __slots__ = ("_control_key", "_nonce_cache", "_signing_key")

    def __init__(
        self, *, control_key: SecretStr, nonce_capacity: int = DEFAULT_NONCE_CAPACITY
    ) -> None:
        if not isinstance(control_key, SecretStr):
            _fail_configuration()
        value = control_key.get_secret_value()
        encoded: bytes | None = None
        try:
            encoded = value.encode("utf-8")
        except (AttributeError, UnicodeError):
            pass
        if (
            type(value) is not str
            or encoded is None
            or len(encoded) < 32
            or _BEARER_TOKEN_PATTERN.fullmatch(value) is None
        ):
            _fail_configuration()
        self._control_key = encoded
        self._signing_key = hmac.new(
            encoded, ASSERTION_KEY_DERIVATION_DOMAIN, hashlib.sha256
        ).digest()
        self._nonce_cache = _ReadNonceCache(nonce_capacity)

    def authenticate(
        self,
        *,
        headers: Iterable[tuple[bytes, bytes]],
        action: SkillRegistryAction | None,
        target: str | None,
        now: int,
    ) -> SkillRegistryAssertion:
        try:
            request_headers = tuple(headers)
        except TypeError:
            _fail_bearer()
        authorization = _header_values(request_headers, _AUTHORIZATION_HEADER_NAME)
        if authorization is None or len(authorization) != 1:
            _fail_bearer()
        parts = authorization[0].split(b" ")
        if len(parts) != 2:
            _fail_bearer()
        scheme, token = parts
        if not (
            hmac.compare_digest(scheme.lower(), b"bearer")
            and hmac.compare_digest(token, self._control_key)
        ):
            _fail_bearer()

        assertions = _header_values(request_headers, ASSERTION_HEADER_NAME)
        if (
            assertions is None
            or len(assertions) != 1
            or action not in _ACTION_PERMISSIONS
            or type(target) is not str
            or not target
            or type(now) is not int
        ):
            _fail_assertion()
        encoded_assertion = assertions[0]
        if (
            not encoded_assertion
            or len(encoded_assertion) > ASSERTION_HEADER_MAX_BYTES
            or encoded_assertion.count(b".") != 1
        ):
            _fail_assertion()
        encoded_payload, encoded_signature = encoded_assertion.split(b".", 1)
        raw = _decode_base64url(encoded_payload, maximum=ASSERTION_PAYLOAD_MAX_BYTES)
        signature = _decode_base64url(encoded_signature, maximum=_SIGNATURE_BYTES)
        if raw is None or signature is None or len(signature) != _SIGNATURE_BYTES:
            _fail_assertion()
        expected = hmac.new(self._signing_key, raw, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            _fail_assertion()

        payload = _parse_json_object(raw)
        if payload is None or set(payload) != _ASSERTION_FIELDS:
            _fail_assertion()
        canonical = _canonical_payload_bytes(payload)
        if canonical is None or canonical != raw:
            _fail_assertion()

        actor = _canonical_uuid(payload["actor"])
        request_id = _canonical_uuid(payload["requestId"])
        nonce = _canonical_uuid(payload["nonce"])
        permission = payload["permission"]
        asserted_action = payload["action"]
        asserted_target = payload["target"]
        assurance = payload["assurance"]
        assured_at = payload["assuredAt"]
        issued_at = payload["issuedAt"]
        expires_at = payload["expiresAt"]
        required_permission = _ACTION_PERMISSIONS[action]
        if (
            actor is None
            or request_id is None
            or nonce is None
            or type(permission) is not str
            or permission != required_permission
            or type(asserted_action) is not str
            or asserted_action != action
            or type(asserted_target) is not str
            or asserted_target != target
            or type(issued_at) is not int
            or type(expires_at) is not int
            or not issued_at < expires_at
            or expires_at - issued_at > ASSERTION_TTL_SECONDS
            or issued_at > now
            or expires_at <= now
        ):
            _fail_assertion()
        if action == "review":
            if (
                assurance != "password+mfa"
                or type(assured_at) is not int
                or assured_at > now
                or assured_at < now - MFA_MAX_AGE_SECONDS
            ):
                _fail_assertion()
        elif assurance != "session" or assured_at is not None:
            _fail_assertion()
        if action in _READ_ACTIONS and not self._nonce_cache.claim(nonce, now=now):
            _fail_assertion()

        return SkillRegistryAssertion(
            actor=actor,
            permission=permission,
            request_id=request_id,
            action=asserted_action,
            target=asserted_target,
            assurance=assurance,
            assured_at=assured_at,
            issued_at=issued_at,
            expires_at=expires_at,
            nonce=nonce,
        )


def _decode_path_target(value: bytes) -> str | None:
    try:
        decoded = unquote_to_bytes(value).decode("utf-8")
    except (UnicodeDecodeError, ValueError):
        return None
    if not decoded or "\x00" in decoded:
        return None
    return decoded


def match_request_target(scope: Scope) -> tuple[SkillRegistryAction | None, str | None]:
    method = scope.get("method")
    path = scope.get("raw_path", scope.get("path", ""))
    query = scope.get("query_string", b"")
    if type(method) is not str or type(query) is not bytes:
        return None, None
    if type(path) is str:
        try:
            path = path.encode("utf-8")
        except UnicodeError:
            return None, None
    if type(path) is not bytes:
        return None, None
    if method == "GET" and path == b"/internal/skills":
        return "list", "skills"
    if method == "POST" and path == b"/internal/skills/uploads":
        if not query:
            return "upload", "new"
        match = _UPLOAD_QUERY_PATTERN.fullmatch(query)
        return ("upload", match.group(1).decode()) if match is not None else (None, None)
    detail = _DETAIL_PATTERN.fullmatch(path)
    if method == "GET" and detail is not None and not query:
        return "detail", f"{detail.group(1).decode()}/{detail.group(2).decode()}"
    file_match = _FILE_PATTERN.fullmatch(path)
    if method == "GET" and file_match is not None and not query:
        file_target = _decode_path_target(file_match.group(3))
        if file_target is not None:
            return (
                "file",
                f"{file_match.group(1).decode()}/{file_match.group(2).decode()}/{file_target}",
            )
    review = _REVIEW_PATTERN.fullmatch(path)
    if method == "POST" and review is not None and not query:
        return "review", f"{review.group(1).decode()}/{review.group(2).decode()}"
    return None, None


class SkillRegistryAuthMiddleware:
    """Authenticate all skill routes before downstream can call receive()."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        authenticator: SkillRegistryAuthenticator,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.app = app
        self._authenticator = authenticator
        self._clock = clock

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope.get("path", "").startswith("/internal/skills"):
            await self.app(scope, receive, send)
            return
        action, target = match_request_target(scope)
        try:
            assertion = self._authenticator.authenticate(
                headers=scope.get("headers", ()),
                action=action,
                target=target,
                now=int(self._clock()),
            )
        except SkillRegistryBearerError:
            response = JSONResponse(
                {"error": "AUTHENTICATION_FAILED"},
                status_code=401,
                headers=_NO_STORE_HEADERS,
            )
            await response(scope, receive, send)
            return
        except SkillRegistryAssertionError:
            response = JSONResponse(
                {"error": "AUTHORIZATION_FAILED"},
                status_code=403,
                headers=_NO_STORE_HEADERS,
            )
            await response(scope, receive, send)
            return
        scope.setdefault("state", {})["skill_registry_assertion"] = assertion
        await self.app(scope, receive, send)
