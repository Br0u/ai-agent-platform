from __future__ import annotations

import base64
import hashlib
import hmac
import json
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
import pytest

from agent_service.model_control_api import ModelControlAuthMiddleware
from agent_service.model_control_auth import ModelControlAuthenticator
from agent_service.skill_activation_coordinator import (
    ActivateSkillRuntime,
    SkillActivationError,
    SkillActivationResult,
    SkillRuntimeStatus,
)
from agent_service.skill_control_api import (
    SkillControlAuthMiddleware,
    build_skill_control_router,
)
from agent_service.skill_control_auth import (
    SKILL_ASSERTION_KEY_DERIVATION_DOMAIN,
    SkillControlAuthenticator,
)


CONTROL_KEY = "control-boundary-key-0123456789abcdef"
OS_KEY = "agentos-boundary-key-0123456789abcdef"
ACTOR = "11111111-1111-4111-8111-111111111111"
REQUEST_ID = "22222222-2222-4222-8222-222222222222"
NONCE = "33333333-3333-4333-8333-333333333333"
SET_ID = "44444444-4444-4444-8444-444444444444"
NOW = 2_000_000_000


def assertion(
    *,
    action: str,
    target: str,
    request_id: str = REQUEST_ID,
) -> str:
    status = action == "skill_runtime_status"
    payload = {
        "actor": ACTOR,
        "permission": (
            "admin:assistant:skills" if status else "admin:assistant:skills:configure"
        ),
        "requestId": request_id,
        "action": action,
        "target": target,
        "assurance": "session" if status else "password+mfa",
        "assuredAt": None if status else NOW,
        "issuedAt": NOW,
        "expiresAt": NOW + 5,
        "nonce": NONCE,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    derived = hmac.new(
        CONTROL_KEY.encode(),
        SKILL_ASSERTION_KEY_DERIVATION_DOMAIN,
        hashlib.sha256,
    ).digest()
    signature = hmac.new(derived, raw, hashlib.sha256).digest()
    return ".".join(
        base64.urlsafe_b64encode(value).rstrip(b"=").decode()
        for value in (raw, signature)
    )


def auth_headers(*, action: str, target: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {CONTROL_KEY}",
        "x-agent-control-assertion": assertion(action=action, target=target),
    }


class Coordinator:
    def __init__(self) -> None:
        self.runtime_status = SkillRuntimeStatus(
            "unconfigured", False, None, None, None, 0, None
        )
        self.error: SkillActivationError | None = None
        self.commands: list[ActivateSkillRuntime] = []

    def status(self) -> SkillRuntimeStatus:
        return self.runtime_status

    async def activate(self, command: ActivateSkillRuntime) -> SkillActivationResult:
        self.commands.append(command)
        if self.error is not None:
            raise self.error
        return SkillActivationResult(command.set_id, 8)


def app(coordinator: Coordinator, *, with_model_middleware: bool = False) -> FastAPI:
    application = FastAPI()
    application.include_router(build_skill_control_router(lambda: coordinator))
    if with_model_middleware:
        application.add_middleware(
            ModelControlAuthMiddleware,
            authenticator=ModelControlAuthenticator(
                control_key=SecretStr(CONTROL_KEY),
                os_security_key=SecretStr(OS_KEY),
            ),
            clock=lambda: NOW,
        )
    application.add_middleware(
        SkillControlAuthMiddleware,
        authenticator=SkillControlAuthenticator(
            control_key=SecretStr(CONTROL_KEY),
            os_security_key=SecretStr(OS_KEY),
        ),
        clock=lambda: NOW,
    )
    return application


def activate(
    client: TestClient,
    *,
    body: dict[str, object] | None = None,
    target: str = f"maduoduo:{SET_ID}:7",
):
    return client.post(
        f"/internal/control/skill-runtime/{SET_ID}/activate",
        headers=auth_headers(action="skill_runtime_activate", target=target),
        json=(
            {"expectedActivationVersion": 7, "requestId": REQUEST_ID}
            if body is None
            else body
        ),
    )


def test_status_contract_is_exact_and_no_store() -> None:
    coordinator = Coordinator()
    with TestClient(app(coordinator)) as client:
        response = client.get(
            "/internal/control/skill-runtime",
            headers=auth_headers(action="skill_runtime_status", target="maduoduo"),
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "skillCapability": "unconfigured",
        "configured": False,
        "activeSetId": None,
        "loadedSetId": None,
        "previousSetId": None,
        "activationVersion": 0,
        "failureCode": None,
    }


def test_activation_binds_signed_target_body_and_typed_command() -> None:
    coordinator = Coordinator()
    with TestClient(app(coordinator, with_model_middleware=True)) as client:
        response = activate(client)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "requestId": REQUEST_ID,
        "setId": SET_ID,
        "activationVersion": 8,
    }
    assert coordinator.commands == [
        ActivateSkillRuntime(
            UUID(SET_ID),
            7,
            UUID(ACTOR),
            UUID(REQUEST_ID),
        )
    ]


@pytest.mark.parametrize(
    ("code", "status"),
    [
        ("activation_busy", 423),
        ("runtime_busy", 423),
        ("candidate_invalid", 400),
        ("artifact_invalid", 422),
        ("skill_validation_failed", 422),
        ("activation_conflict", 409),
        ("activation_timeout", 504),
        ("activation_result_unknown", 503),
        ("runtime_degraded", 503),
        ("storage_unavailable", 503),
    ],
)
def test_activation_error_mapping_is_stable(code: str, status: int) -> None:
    coordinator = Coordinator()
    coordinator.error = SkillActivationError(code)
    with TestClient(app(coordinator)) as client:
        response = activate(client)

    assert response.status_code == status
    assert response.json() == {"requestId": REQUEST_ID, "error": code}


@pytest.mark.parametrize(
    ("body", "target"),
    [
        ({"expectedActivationVersion": 7}, f"maduoduo:{SET_ID}:7"),
        (
            {
                "expectedActivationVersion": 7,
                "requestId": REQUEST_ID,
                "extra": True,
            },
            f"maduoduo:{SET_ID}:7",
        ),
        (
            {"expectedActivationVersion": 8, "requestId": REQUEST_ID},
            f"maduoduo:{SET_ID}:7",
        ),
        (
            {"expectedActivationVersion": 7, "requestId": str(UUID(int=9))},
            f"maduoduo:{SET_ID}:7",
        ),
        (
            {"expectedActivationVersion": 7, "requestId": REQUEST_ID},
            f"maduoduo:{SET_ID}:07",
        ),
    ],
)
def test_invalid_or_unbound_activation_body_fails_before_service(
    body: dict[str, object], target: str
) -> None:
    coordinator = Coordinator()
    with TestClient(app(coordinator)) as client:
        response = activate(client, body=body, target=target)

    assert response.status_code == 400
    assert response.json() == {"requestId": REQUEST_ID, "error": "candidate_invalid"}
    assert coordinator.commands == []


def test_duplicate_json_fields_and_trailing_slash_are_rejected() -> None:
    coordinator = Coordinator()
    headers = auth_headers(
        action="skill_runtime_activate", target=f"maduoduo:{SET_ID}:7"
    )
    with TestClient(app(coordinator, with_model_middleware=True)) as client:
        duplicate = client.post(
            f"/internal/control/skill-runtime/{SET_ID}/activate",
            headers={**headers, "Content-Type": "application/json"},
            content=(
                '{"expectedActivationVersion":7,'
                f'"requestId":"{REQUEST_ID}","requestId":"{REQUEST_ID}"}}'
            ),
        )
        trailing = client.post(
            f"/internal/control/skill-runtime/{SET_ID}/activate/",
            headers=headers,
            json={"expectedActivationVersion": 7, "requestId": REQUEST_ID},
        )

    assert duplicate.status_code == 400
    assert trailing.status_code == 403
    assert coordinator.commands == []


def test_authentication_failure_does_not_enter_route_or_accept_body() -> None:
    coordinator = Coordinator()
    with TestClient(app(coordinator)) as client:
        response = client.post(
            f"/internal/control/skill-runtime/{SET_ID}/activate",
            headers={"Authorization": "Bearer wrong", "Content-Type": "application/json"},
            content=b"x" * 9000,
        )

    assert response.status_code == 401
    assert response.json() == {"error": "authentication_failed"}
    assert coordinator.commands == []
