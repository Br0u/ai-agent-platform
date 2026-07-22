from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any, cast
from uuid import UUID

from pydantic import SecretStr
import pytest

from agent_service.skill_control_auth import (
    SKILL_ASSERTION_KEY_DERIVATION_DOMAIN,
    SkillControlAssertion,
    SkillControlAssertionError,
    SkillControlAuthenticator,
    SkillControlBearerError,
)


CONTROL_KEY = "control-boundary-key-0123456789abcdef"
OS_KEY = "agentos-boundary-key-0123456789abcdef"
ACTOR = "11111111-1111-4111-8111-111111111111"
REQUEST_ID = "22222222-2222-4222-8222-222222222222"
NONCE = "33333333-3333-4333-8333-333333333333"
SET_ID = "44444444-4444-4444-8444-444444444444"
NOW = 2_000_000_000


def payload(*, action: str = "skill_runtime_status", **changes: object) -> dict[str, object]:
    status = action == "skill_runtime_status"
    value: dict[str, object] = {
        "actor": ACTOR,
        "permission": (
            "admin:assistant:skills" if status else "admin:assistant:skills:configure"
        ),
        "requestId": REQUEST_ID,
        "action": action,
        "target": "maduoduo" if status else f"maduoduo:{SET_ID}:7",
        "assurance": "session" if status else "password+mfa",
        "assuredAt": None if status else NOW - 300,
        "issuedAt": NOW,
        "expiresAt": NOW + 5,
        "nonce": NONCE,
    }
    value.update(changes)
    return value


def sign(value: dict[str, object], *, domain: bytes = SKILL_ASSERTION_KEY_DERIVATION_DOMAIN) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    derived = hmac.new(CONTROL_KEY.encode(), domain, hashlib.sha256).digest()
    signature = hmac.new(derived, raw, hashlib.sha256).digest()
    return ".".join(
        base64.urlsafe_b64encode(part).rstrip(b"=").decode()
        for part in (raw, signature)
    )


def authenticator() -> SkillControlAuthenticator:
    return SkillControlAuthenticator(
        control_key=SecretStr(CONTROL_KEY),
        os_security_key=SecretStr(OS_KEY),
    )


def headers(assertion: str, *, key: str = CONTROL_KEY) -> list[tuple[bytes, bytes]]:
    return [
        (b"authorization", f"Bearer {key}".encode()),
        (b"x-agent-control-assertion", assertion.encode()),
    ]


def test_status_and_recent_mfa_activation_assertions_return_typed_context() -> None:
    status = authenticator().authenticate(
        headers=headers(sign(payload())),
        action="skill_runtime_status",
        target="maduoduo",
        now=NOW,
    )
    activation = authenticator().authenticate(
        headers=headers(sign(payload(action="skill_runtime_activate"))),
        action="skill_runtime_activate",
        target=f"maduoduo:{SET_ID}:7",
        now=NOW,
    )

    assert status == SkillControlAssertion(
        UUID(ACTOR),
        "admin:assistant:skills",
        UUID(REQUEST_ID),
        "skill_runtime_status",
        "maduoduo",
        "session",
        None,
        NOW,
        NOW + 5,
        UUID(NONCE),
    )
    assert activation.assurance == "password+mfa"
    assert activation.assured_at == NOW - 300


@pytest.mark.parametrize(
    "changes",
    [
        {"permission": "admin:assistant:skills"},
        {"assurance": "session"},
        {"assuredAt": None},
        {"assuredAt": NOW - 601},
        {"target": f"maduoduo:{SET_ID}:8"},
        {"requestId": "not-a-uuid"},
        {"expiresAt": NOW + 6},
    ],
)
def test_activation_rejects_wrong_permission_assurance_freshness_or_binding(
    changes: dict[str, object],
) -> None:
    assertion = sign(payload(action="skill_runtime_activate", **changes))
    with pytest.raises(SkillControlAssertionError):
        authenticator().authenticate(
            headers=headers(assertion),
            action="skill_runtime_activate",
            target=f"maduoduo:{SET_ID}:7",
            now=NOW,
        )


def test_model_control_domain_signature_cannot_cross_into_skill_control() -> None:
    assertion = sign(
        payload(),
        domain=b"ai-agent-platform:model-control-assertion:v1",
    )
    with pytest.raises(SkillControlAssertionError):
        authenticator().authenticate(
            headers=headers(assertion),
            action="skill_runtime_status",
            target="maduoduo",
            now=NOW,
        )


@pytest.mark.parametrize(
    "request_headers",
    [
        [],
        [(b"authorization", b"Bearer wrong")],
        [(b"authorization", f"Basic {CONTROL_KEY}".encode())],
        [
            (b"authorization", f"Bearer {CONTROL_KEY}".encode()),
            (b"authorization", f"Bearer {CONTROL_KEY}".encode()),
        ],
    ],
)
def test_bearer_boundary_fails_with_fixed_error(
    request_headers: list[tuple[bytes, bytes]],
) -> None:
    with pytest.raises(SkillControlBearerError) as caught:
        authenticator().authenticate(
            headers=request_headers,
            action="skill_runtime_status",
            target="maduoduo",
            now=NOW,
        )
    assert str(caught.value) == "skill control authentication failed"
    assert caught.value.__cause__ is None


def test_malformed_header_collection_is_safely_rejected() -> None:
    with pytest.raises(SkillControlBearerError):
        authenticator().authenticate(
            headers=cast(Any, None),
            action="skill_runtime_status",
            target="maduoduo",
            now=NOW,
        )
