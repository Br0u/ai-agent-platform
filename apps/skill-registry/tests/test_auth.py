from __future__ import annotations

import base64
import hashlib
import hmac
import json
from collections.abc import Callable
from uuid import UUID

import pytest
from pydantic import SecretStr
from starlette.types import Message

from skill_registry.auth import (
    ASSERTION_HEADER_NAME,
    ASSERTION_KEY_DERIVATION_DOMAIN,
    SkillRegistryAssertionError,
    SkillRegistryAuthenticator,
    SkillRegistryAuthMiddleware,
    SkillRegistryBearerError,
    match_request_target,
)


CONTROL_KEY = "skill-registry-control-key-0123456789abcdef"
ACTOR = "00000000-0000-4000-8000-000000000001"
REQUEST_ID = "10000000-0000-4000-8000-000000000001"
NONCE = "20000000-0000-4000-8000-000000000001"


def signed_assertion(
    *,
    action: str = "upload",
    permission: str = "admin:assistant:skills:upload",
    target: str = "new",
    assurance: str = "session",
    assured_at: int | None = None,
    issued_at: int = 100,
    expires_at: int = 105,
    nonce: str = NONCE,
    control_key: str = CONTROL_KEY,
    payload_transform: Callable[[bytes], bytes] | None = None,
) -> str:
    payload = {
        "action": action,
        "actor": ACTOR,
        "assurance": assurance,
        "assuredAt": assured_at,
        "expiresAt": expires_at,
        "issuedAt": issued_at,
        "nonce": nonce,
        "permission": permission,
        "requestId": REQUEST_ID,
        "target": target,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    if payload_transform is not None:
        raw = payload_transform(raw)
    derived = hmac.new(
        control_key.encode(), ASSERTION_KEY_DERIVATION_DOMAIN, hashlib.sha256
    ).digest()
    signature = hmac.new(derived, raw, hashlib.sha256).digest()

    def encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode()

    return f"{encode(raw)}.{encode(signature)}"


def headers(assertion: str | None = None) -> list[tuple[bytes, bytes]]:
    result = [(b"authorization", f"Bearer {CONTROL_KEY}".encode())]
    if assertion is not None:
        result.append((ASSERTION_HEADER_NAME, assertion.encode()))
    return result


def authenticator() -> SkillRegistryAuthenticator:
    return SkillRegistryAuthenticator(control_key=SecretStr(CONTROL_KEY))


def test_authenticates_exact_canonical_upload_assertion() -> None:
    assertion = authenticator().authenticate(
        headers=headers(signed_assertion()), action="upload", target="new", now=100
    )

    assert assertion.actor == UUID(ACTOR)
    assert assertion.request_id == UUID(REQUEST_ID)
    assert assertion.nonce == UUID(NONCE)
    assert assertion.assurance == "session"


@pytest.mark.parametrize(
    "bad_headers",
    [
        [],
        [(b"authorization", b"Bearer wrong")],
        [
            (b"authorization", f"Bearer {CONTROL_KEY}".encode()),
            (b"Authorization", f"Bearer {CONTROL_KEY}".encode()),
        ],
    ],
)
def test_rejects_missing_wrong_or_duplicate_bearer(
    bad_headers: list[tuple[bytes, bytes]],
) -> None:
    with pytest.raises(SkillRegistryBearerError):
        authenticator().authenticate(headers=bad_headers, action="upload", target="new", now=100)


@pytest.mark.parametrize(
    "assertion",
    [
        signed_assertion(control_key="wrong-key-012345678901234567890123"),
        signed_assertion(permission="admin:assistant:skills:review"),
        signed_assertion(action="review"),
        signed_assertion(target="different"),
        signed_assertion(issued_at=101, expires_at=105),
        signed_assertion(issued_at=94, expires_at=99),
        signed_assertion(issued_at=99, expires_at=100),
        signed_assertion(issued_at=99, expires_at=105),
        signed_assertion(payload_transform=lambda raw: raw.replace(b'"action"', b' "action"')),
    ],
)
def test_rejects_bad_signature_contract_time_or_noncanonical_json(assertion: str) -> None:
    with pytest.raises(SkillRegistryAssertionError):
        authenticator().authenticate(
            headers=headers(assertion), action="upload", target="new", now=100
        )


def test_rejects_duplicate_assertion_header_and_padded_base64url() -> None:
    assertion = signed_assertion()
    with pytest.raises(SkillRegistryAssertionError):
        authenticator().authenticate(
            headers=headers(assertion) + [(ASSERTION_HEADER_NAME, assertion.encode())],
            action="upload",
            target="new",
            now=100,
        )
    payload, signature = assertion.split(".")
    with pytest.raises(SkillRegistryAssertionError):
        authenticator().authenticate(
            headers=headers(f"{payload}=.{signature}"),
            action="upload",
            target="new",
            now=100,
        )


def test_review_requires_recent_password_and_mfa_assurance() -> None:
    target = f"{ACTOR}/{REQUEST_ID}"
    verifier = authenticator()
    valid = signed_assertion(
        action="review",
        permission="admin:assistant:skills:review",
        target=target,
        assurance="password+mfa",
        assured_at=0,
        nonce="20000000-0000-4000-8000-000000000002",
    )
    assert (
        verifier.authenticate(
            headers=headers(valid), action="review", target=target, now=100
        ).assured_at
        == 0
    )

    for assertion in (
        signed_assertion(
            action="review",
            permission="admin:assistant:skills:review",
            target=target,
            nonce="20000000-0000-4000-8000-000000000003",
        ),
        signed_assertion(
            action="review",
            permission="admin:assistant:skills:review",
            target=target,
            assurance="password+mfa",
            assured_at=-501,
            nonce="20000000-0000-4000-8000-000000000004",
        ),
        signed_assertion(
            action="review",
            permission="admin:assistant:skills:review",
            target=target,
            assurance="password+mfa",
            assured_at=101,
            nonce="20000000-0000-4000-8000-000000000005",
        ),
    ):
        with pytest.raises(SkillRegistryAssertionError):
            verifier.authenticate(
                headers=headers(assertion), action="review", target=target, now=100
            )


def test_read_nonce_replay_is_rejected_and_cache_is_bounded() -> None:
    verifier = SkillRegistryAuthenticator(control_key=SecretStr(CONTROL_KEY), nonce_capacity=1)
    assertion = signed_assertion(
        action="list",
        permission="admin:assistant:skills",
        target="skills",
    )
    verifier.authenticate(headers=headers(assertion), action="list", target="skills", now=100)
    with pytest.raises(SkillRegistryAssertionError):
        verifier.authenticate(headers=headers(assertion), action="list", target="skills", now=100)

    second = signed_assertion(
        action="list",
        permission="admin:assistant:skills",
        target="skills",
        nonce="20000000-0000-4000-8000-000000000009",
    )
    with pytest.raises(SkillRegistryAssertionError):
        verifier.authenticate(headers=headers(second), action="list", target="skills", now=100)


def test_skill_set_reads_and_mutations_use_exact_permissions_assurance_and_nonce() -> None:
    read = signed_assertion(
        action="skill_set_status",
        permission="admin:assistant:skills",
        target="maduoduo",
    )
    assert (
        authenticator()
        .authenticate(
            headers=headers(read),
            action="skill_set_status",
            target="maduoduo",
            now=100,
        )
        .assurance
        == "session"
    )

    mutation = signed_assertion(
        action="skill_set_create",
        permission="admin:assistant:skills:configure",
        target="maduoduo",
        assurance="password+mfa",
        assured_at=0,
        nonce=REQUEST_ID,
    )
    verified = authenticator().authenticate(
        headers=headers(mutation),
        action="skill_set_create",
        target="maduoduo",
        now=100,
    )
    assert verified.nonce == verified.request_id

    for invalid in (
        signed_assertion(
            action="skill_set_create",
            permission="admin:assistant:skills:configure",
            target="maduoduo",
            nonce=REQUEST_ID,
        ),
        signed_assertion(
            action="skill_set_create",
            permission="admin:assistant:skills:review",
            target="maduoduo",
            assurance="password+mfa",
            assured_at=0,
            nonce=REQUEST_ID,
        ),
        signed_assertion(
            action="skill_set_create",
            permission="admin:assistant:skills:configure",
            target="maduoduo",
            assurance="password+mfa",
            assured_at=0,
        ),
    ):
        with pytest.raises(SkillRegistryAssertionError):
            authenticator().authenticate(
                headers=headers(invalid),
                action="skill_set_create",
                target="maduoduo",
                now=100,
            )


@pytest.mark.parametrize(
    ("method", "path", "query", "expected"),
    [
        ("POST", "/internal/skill-sets", b"", ("skill_set_create", "maduoduo")),
        (
            "GET",
            "/internal/skill-sets/runtime-status",
            b"",
            ("skill_set_status", "maduoduo"),
        ),
        (
            "GET",
            "/internal/skill-sets/available-revisions",
            b"limit=100&offset=0",
            ("skill_set_available", "published-revisions"),
        ),
        (
            "POST",
            f"/internal/skill-sets/{REQUEST_ID}/discard",
            b"",
            ("skill_set_discard", f"maduoduo:{REQUEST_ID}"),
        ),
        (
            "POST",
            "/internal/skill-sets/rollback-candidates",
            b"",
            ("skill_set_rollback", "maduoduo:previous"),
        ),
    ],
)
def test_skill_set_routes_bind_exact_assertion_action_and_target(
    method: str,
    path: str,
    query: bytes,
    expected: tuple[str, str],
) -> None:
    assert (
        match_request_target(
            {"type": "http", "method": method, "path": path, "query_string": query}
        )
        == expected
    )


@pytest.mark.asyncio
async def test_middleware_rejects_authentication_before_body_receive() -> None:
    called = False

    async def downstream(scope: object, receive: object, send: object) -> None:
        raise AssertionError("downstream must not run")

    async def receive() -> dict[str, object]:
        nonlocal called
        called = True
        raise AssertionError("authentication failure must not read body")

    sent: list[Message] = []

    async def send(message: Message) -> None:
        sent.append(message)

    middleware = SkillRegistryAuthMiddleware(
        downstream, authenticator=authenticator(), clock=lambda: 100.0
    )
    await middleware(
        {
            "type": "http",
            "method": "POST",
            "path": "/internal/skills/uploads",
            "query_string": b"",
            "headers": [],
        },
        receive,
        send,
    )

    assert called is False
    assert sent[0]["status"] == 401
