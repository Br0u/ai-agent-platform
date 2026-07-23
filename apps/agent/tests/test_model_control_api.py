import asyncio
import base64
import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
import pytest
from starlette.types import Message, Scope

from agent_service.app import create_app
from agent_service.config import RuntimeSettings
from agent_service.model_config_types import (
    ModelConfigDraft,
    StoredModelConfigMetadata,
)
from agent_service.model_control_api import (
    ModelControlAuthMiddleware,
    build_model_control_router,
)
from agent_service.model_control_auth import (
    ModelControlAssertion,
    ModelControlAuthenticator,
)
from agent_service.model_control_service import ModelControlService
from agent_service.model_control_service import (
    ModelControlAssistantError,
    ModelControlConflictError,
    ModelControlDisabledError,
    ModelControlEncryptionError,
    ModelControlEndpointError,
    ModelControlProviderError,
    ModelControlServiceError,
    ModelControlStorageError,
    ModelControlValidationError,
    ModelConfigListResult,
)
from agent_service.model_endpoint_catalog import EndpointOption
from agent_service.model_config_repository import (
    ActiveConfigPointer,
    StoredActiveConfig,
)


DATABASE_URL = "postgresql+psycopg_async://runtime:private-password@db:5432/platform"
CONTROL_DATABASE_URL = (
    "postgresql+psycopg_async://control:private-password@db:5432/platform"
)
OS_SECURITY_KEY = "agentos-security-key-0123456789abcdef"
CONTROL_KEY = "model-control-key-0123456789abcdef"
ENCRYPTION_KEY = "11" * 32
CONTROL_AUTHORIZATION = {"Authorization": f"Bearer {CONTROL_KEY}"}
ASSERTION_DOMAIN = b"ai-agent-platform:model-control-assertion:v1"
NOW = 2_000_000_000
ACTOR = "11111111-1111-4111-8111-111111111111"
REQUEST_ID = "22222222-2222-4222-8222-222222222222"
NONCE = "33333333-3333-4333-8333-333333333333"


class MetadataRepository:
    def __init__(self) -> None:
        self.closed = 0
        self.mutation_calls = 0

    async def load_active(self) -> StoredActiveConfig | None:
        return None

    async def list_metadata(self) -> tuple[StoredModelConfigMetadata, ...]:
        return (
            StoredModelConfigMetadata(
                provider="openai",
                model_id="gpt-5-mini",
                endpoint_id="openai-official",
                api_key_last_four="cdef",
                revision=3,
                test_status="passed",
                last_tested_at=datetime(2026, 7, 18, 1, 2, 3, tzinfo=UTC),
            ),
        )

    async def aclose(self) -> None:
        self.closed += 1

    async def save_draft(self, *_args: object) -> StoredModelConfigMetadata:
        self.mutation_calls += 1
        raise AssertionError("disabled control must reject before repository mutation")


class RecordingService:
    def __init__(self) -> None:
        self.saved: list[tuple[ModelConfigDraft, ModelControlAssertion]] = []
        self.activated: list[tuple[str, int, ModelControlAssertion]] = []
        self.revealed: list[tuple[str, int, ModelControlAssertion]] = []

    async def save_model_config(
        self,
        draft: ModelConfigDraft,
        assertion: ModelControlAssertion,
    ) -> StoredModelConfigMetadata:
        self.saved.append((draft, assertion))
        return StoredModelConfigMetadata(
            provider=draft.provider,
            model_id=draft.model_id,
            endpoint_id=draft.endpoint_id,
            api_key_last_four="cdef",
            revision=draft.expected_revision + 1,
            test_status="untested",
        )

    async def test_and_activate(
        self,
        provider: str,
        revision: int,
        assertion: ModelControlAssertion,
    ) -> ActiveConfigPointer:
        self.activated.append((provider, revision, assertion))
        return ActiveConfigPointer(
            config_id=UUID("44444444-4444-4444-8444-444444444444"),
            provider="openai",
            config_revision=revision,
            activation_version=8,
            activated_at=datetime(2026, 7, 18, tzinfo=UTC),
        )

    async def reveal_key(
        self,
        provider: str,
        revision: int,
        assertion: ModelControlAssertion,
    ) -> SecretStr:
        self.revealed.append((provider, revision, assertion))
        return SecretStr("single-use-secret-key")


class OversizedListService(RecordingService):
    async def list_model_configs(self) -> ModelConfigListResult:
        return ModelConfigListResult(
            configs=(
                StoredModelConfigMetadata(
                    provider="openai",
                    model_id="gpt-5-mini",
                    endpoint_id="openai-official",
                    api_key_last_four="cdef",
                    revision=3,
                    test_status="passed",
                ),
            ),
            endpoints=tuple(
                EndpointOption(
                    id=f"custom-endpoint-{index}",
                    label="x" * 80,
                    provider="openai",
                )
                for index in range(800)
            ),
            bootstrap=None,
            control_enabled=True,
        )


class UnexpectedSaveFailureService(RecordingService):
    def __init__(self, raw_key: str) -> None:
        super().__init__()
        self.raw_key = raw_key
        self.failure: RuntimeError | None = None

    async def save_model_config(
        self,
        draft: ModelConfigDraft,
        assertion: ModelControlAssertion,
    ) -> StoredModelConfigMetadata:
        del draft, assertion
        failure = RuntimeError(f"unclassified provider failure: {self.raw_key}")
        self.failure = failure
        raise failure


class CancellingSaveService(RecordingService):
    def __init__(self) -> None:
        super().__init__()
        self.failure: asyncio.CancelledError | None = None

    async def save_model_config(
        self,
        draft: ModelConfigDraft,
        assertion: ModelControlAssertion,
    ) -> StoredModelConfigMetadata:
        del draft, assertion
        failure = asyncio.CancelledError()
        self.failure = failure
        raise failure


class FailingService(RecordingService):
    def __init__(self, failure: ModelControlServiceError) -> None:
        super().__init__()
        self.failure = failure

    async def save_model_config(
        self,
        draft: ModelConfigDraft,
        assertion: ModelControlAssertion,
    ) -> StoredModelConfigMetadata:
        del draft, assertion
        raise self.failure


class FailingRevealService(RecordingService):
    def __init__(self, failure: ModelControlServiceError) -> None:
        super().__init__()
        self.failure = failure

    async def reveal_key(
        self,
        provider: str,
        revision: int,
        assertion: ModelControlAssertion,
    ) -> SecretStr:
        del provider, revision, assertion
        raise self.failure


class FailingActivationService(RecordingService):
    def __init__(self, failure: ModelControlServiceError) -> None:
        super().__init__()
        self.failure = failure

    async def test_and_activate(
        self,
        provider: str,
        revision: int,
        assertion: ModelControlAssertion,
    ) -> ActiveConfigPointer:
        del provider, revision, assertion
        raise self.failure


def signed_assertion(
    *,
    action: str,
    permission: str,
    provider: str = "openai",
    issued_at: int = NOW,
) -> str:
    payload = {
        "actor": ACTOR,
        "permission": permission,
        "requestId": REQUEST_ID,
        "action": action,
        "provider": provider,
        "issuedAt": issued_at,
        "expiresAt": issued_at + 5,
        "nonce": NONCE,
    }
    raw = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode()
    signing_key = hmac.new(
        CONTROL_KEY.encode(),
        ASSERTION_DOMAIN,
        hashlib.sha256,
    ).digest()
    signature = hmac.new(signing_key, raw, hashlib.sha256).digest()
    encoded_payload = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()
    return f"{encoded_payload}.{encoded_signature}"


def mutation_headers(
    *,
    action: str,
    permission: str,
    issued_at: int = NOW,
) -> dict[str, str]:
    return {
        **CONTROL_AUTHORIZATION,
        "X-Agent-Control-Assertion": signed_assertion(
            action=action,
            permission=permission,
            issued_at=issued_at,
        ),
        "Content-Type": "application/json",
    }


def control_route_app(service: RecordingService) -> FastAPI:
    application = FastAPI()
    application.include_router(
        build_model_control_router(lambda: cast(ModelControlService, service))
    )
    application.add_middleware(
        ModelControlAuthMiddleware,
        authenticator=ModelControlAuthenticator(
            control_key=SecretStr(CONTROL_KEY),
            os_security_key=SecretStr(OS_SECURITY_KEY),
        ),
        clock=lambda: NOW,
    )
    return application


def control_settings(*, agent_enabled: bool = False) -> RuntimeSettings:
    return RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": OS_SECURITY_KEY,
            "AGNO_DATABASE_URL": DATABASE_URL,
            "SKILL_REGISTRY_RUNTIME_DATABASE_URL": DATABASE_URL,
            "AGENT_CONTROL_DATABASE_URL": CONTROL_DATABASE_URL,
            "MODEL_CONFIG_ENCRYPTION_KEY": ENCRYPTION_KEY,
            "AGENT_CONFIG_CONTROL_KEY": CONTROL_KEY,
            "AGENT_ENABLED": agent_enabled,
        }
    )


def test_list_returns_only_bounded_safe_metadata_with_the_control_bearer() -> None:
    repository = MetadataRepository()
    application = create_app(
        settings=control_settings(),
        repository_builder=lambda _: repository,
        control_clock=lambda: NOW,
    )

    with TestClient(application) as client:
        response = client.get(
            "/internal/control/model-configs",
            headers=CONTROL_AUTHORIZATION,
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-type"] == "application/json"
    assert len(response.content) <= 64 * 1024
    assert response.json() == {
        "version": "1",
        "configs": [
            {
                "provider": "openai",
                "modelId": "gpt-5-mini",
                "endpointId": "openai-official",
                "apiKeyLastFour": "cdef",
                "revision": 3,
                "testStatus": "passed",
                "lastTestedAt": "2026-07-18T01:02:03.000Z",
            }
        ],
        "endpoints": [
            {
                "id": "openai-official",
                "label": "OpenAI official",
                "provider": "openai",
            },
            {
                "id": "anthropic-official",
                "label": "Anthropic official",
                "provider": "anthropic",
            },
            {
                "id": "google-official",
                "label": "Google Gemini official",
                "provider": "google",
            },
            {
                "id": "dashscope-official",
                "label": "DashScope official",
                "provider": "dashscope",
            },
            {
                "id": "deepseek-official",
                "label": "DeepSeek official",
                "provider": "deepseek",
            },
            {
                "id": "minimax-official",
                "label": "MiniMax official",
                "provider": "minimax",
            },
        ],
        "bootstrap": None,
        "controlEnabled": False,
    }
    assert "private-password" not in response.text
    assert ENCRYPTION_KEY not in response.text
    assert CONTROL_KEY not in response.text
    assert repository.closed == 1


def test_runtime_status_returns_only_the_safe_slot_snapshot() -> None:
    application = create_app(
        settings=control_settings(),
        repository_builder=lambda _: MetadataRepository(),
    )

    with TestClient(application) as client:
        response = client.get(
            "/internal/control/model-configs/runtime-status",
            headers=CONTROL_AUTHORIZATION,
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert len(response.content) <= 64 * 1024
    assert response.json() == {
        "version": "1",
        "capability": "placeholder",
        "source": None,
        "provider": None,
        "modelId": None,
        "configRevision": None,
        "activationVersion": None,
    }


def test_oversized_endpoint_response_hits_the_bounded_serializer_branch() -> None:
    service = OversizedListService()
    application = control_route_app(service)

    with TestClient(application) as client:
        response = client.get(
            "/internal/control/model-configs",
            headers=CONTROL_AUTHORIZATION,
        )

    assert response.status_code == 503
    assert response.json() == {"error": "storage_unavailable"}
    assert len(response.content) <= 64 * 1024
    assert response.headers["cache-control"] == "no-store"
    assert "cdef" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    (
        "method",
        "canonical_path",
        "action",
        "permission",
        "trailing_slashes",
        "auth_mode",
        "status_code",
    ),
    tuple(
        (
            method,
            path,
            action,
            permission,
            trailing_slashes,
            auth_mode,
            401 if auth_mode == "wrong_bearer" else 403,
        )
        for method, path, action, permission in (
            (
                "PUT",
                "/internal/control/model-configs/openai",
                "save",
                "admin:assistant:configure",
            ),
            (
                "POST",
                "/internal/control/model-configs/openai/test-and-activate",
                "test_and_activate",
                "admin:assistant:configure",
            ),
            (
                "POST",
                "/internal/control/model-configs/openai/reveal-key",
                "reveal",
                "admin:assistant:secret:reveal",
            ),
        )
        for trailing_slashes in ("/", "//")
        for auth_mode in ("valid_assertion", "missing_assertion", "wrong_bearer")
    ),
)
async def test_create_app_rejects_noncanonical_mutation_before_body_receive(
    method: str,
    canonical_path: str,
    action: str,
    permission: str,
    trailing_slashes: str,
    auth_mode: str,
    status_code: int,
) -> None:
    application = create_app(
        settings=control_settings(),
        control_clock=lambda: NOW,
    )
    path = canonical_path + trailing_slashes
    headers = [
        (
            b"authorization",
            (
                b"Bearer wrong-control-key"
                if auth_mode == "wrong_bearer"
                else f"Bearer {CONTROL_KEY}".encode()
            ),
        ),
        (b"content-type", b"application/json"),
        (b"content-length", b"999999"),
    ]
    if auth_mode != "missing_assertion":
        headers.append(
            (
                b"x-agent-control-assertion",
                signed_assertion(action=action, permission=permission).encode(),
            )
        )
    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": headers,
            "client": ("test", 123),
            "server": ("test", 80),
            "state": {},
        },
    )
    received = 0
    sent: list[Message] = []

    async def receive() -> Message:
        nonlocal received
        received += 1
        raise AssertionError("noncanonical mutation must not receive a body")

    async def send(message: Message) -> None:
        sent.append(message)

    await application(scope, receive, send)

    assert received == 0
    assert sent[0]["status"] == status_code
    response_headers = dict(sent[0]["headers"])
    if action == "reveal":
        assert response_headers[b"cache-control"] == b"no-store, private"
        assert response_headers[b"pragma"] == b"no-cache"
    else:
        assert response_headers[b"cache-control"] == b"no-store"
    assert sent[1]["body"] == (
        b'{"error":"authentication_failed"}'
        if status_code == 401
        else b'{"error":"authorization_failed"}'
    )


@pytest.mark.parametrize(
    "authorization",
    (
        None,
        "Bearer wrong-control-key",
        f"Bearer {OS_SECURITY_KEY}",
    ),
)
def test_control_get_rejects_every_missing_or_wrong_dedicated_bearer(
    authorization: str | None,
) -> None:
    application = create_app(
        settings=control_settings(),
        repository_builder=lambda _: MetadataRepository(),
    )
    headers = {} if authorization is None else {"Authorization": authorization}

    with TestClient(application) as client:
        response = client.get(
            "/internal/control/model-configs",
            headers=headers,
        )

    assert response.status_code == 401
    assert response.json() == {"error": "authentication_failed"}
    assert response.headers["cache-control"] == "no-store"
    assert CONTROL_KEY not in response.text
    assert OS_SECURITY_KEY not in response.text


def test_control_get_rejects_an_assertion_header_it_does_not_require() -> None:
    application = create_app(
        settings=control_settings(),
        repository_builder=lambda _: MetadataRepository(),
    )

    with TestClient(application) as client:
        response = client.get(
            "/internal/control/model-configs/runtime-status",
            headers={
                **CONTROL_AUTHORIZATION,
                "X-Agent-Control-Assertion": signed_assertion(
                    action="save",
                    permission="admin:assistant:configure",
                ),
            },
        )

    assert response.status_code == 403
    assert response.json() == {"error": "authorization_failed"}
    assert response.headers["cache-control"] == "no-store"


def test_control_bearer_cannot_authenticate_the_health_surface() -> None:
    application = create_app(
        settings=control_settings(),
        repository_builder=lambda _: MetadataRepository(),
    )

    with TestClient(application) as client:
        control_key = client.get(
            "/internal/health/live",
            headers=CONTROL_AUTHORIZATION,
        )
        os_key = client.get(
            "/internal/health/live",
            headers={"Authorization": f"Bearer {OS_SECURITY_KEY}"},
        )

    assert control_key.status_code == 401
    assert control_key.json() == {"detail": "Unauthorized"}
    assert os_key.status_code == 200


def test_disabled_deployment_keeps_get_observable_and_mutations_read_only() -> None:
    repository = MetadataRepository()
    application = create_app(
        settings=control_settings(),
        repository_builder=lambda _: repository,
        control_clock=lambda: NOW,
    )

    with TestClient(application) as client:
        listed = client.get(
            "/internal/control/model-configs",
            headers=CONTROL_AUTHORIZATION,
        )
        mutation = client.put(
            "/internal/control/model-configs/openai",
            headers=mutation_headers(
                action="save",
                permission="admin:assistant:configure",
            ),
            json={
                "modelId": "gpt-5-mini",
                "endpointId": "openai-official",
                "expectedRevision": 3,
            },
        )

    assert listed.status_code == 200
    assert listed.json()["controlEnabled"] is False
    assert mutation.status_code == 503
    assert mutation.json() == {"error": "control_disabled"}
    assert mutation.headers["cache-control"] == "no-store"
    assert repository.mutation_calls == 0
    assert repository.closed == 1


def test_success_failure_health_and_status_never_log_or_serialize_fixture_secrets(
    capsys: pytest.CaptureFixture[str],
    caplog: pytest.LogCaptureFixture,
) -> None:
    repository = MetadataRepository()
    application = create_app(
        settings=control_settings(),
        repository_builder=lambda _: repository,
        control_clock=lambda: NOW,
    )

    with caplog.at_level("DEBUG"):
        with TestClient(application) as client:
            listed = client.get(
                "/internal/control/model-configs",
                headers=CONTROL_AUTHORIZATION,
            )
            rejected = client.put(
                "/internal/control/model-configs/openai",
                headers=mutation_headers(
                    action="save",
                    permission="admin:assistant:configure",
                ),
                json={
                    "modelId": "gpt-5-mini",
                    "endpointId": "openai-official",
                    "apiKey": "fixture-model-api-key-cdef",
                    "expectedRevision": 3,
                },
            )
            health = client.get(
                "/internal/health/live",
                headers={"Authorization": f"Bearer {OS_SECURITY_KEY}"},
            )
            status = client.get(
                "/internal/control/model-configs/runtime-status",
                headers=CONTROL_AUTHORIZATION,
            )

    captured = capsys.readouterr()
    observed = "\n".join(
        (
            captured.out,
            captured.err,
            caplog.text,
            listed.text,
            rejected.text,
            health.text,
            status.text,
        )
    )
    assert listed.status_code == 200
    assert rejected.status_code == 503
    assert rejected.json() == {"error": "control_disabled"}
    assert health.status_code == 200
    assert status.status_code == 200
    for secret in (
        CONTROL_KEY,
        OS_SECURITY_KEY,
        ENCRYPTION_KEY,
        CONTROL_DATABASE_URL,
        "private-password",
        "fixture-model-api-key-cdef",
    ):
        assert secret not in observed


def test_save_accepts_one_strict_draft_and_passes_the_verified_assertion() -> None:
    service = RecordingService()
    application = control_route_app(service)

    with TestClient(application) as client:
        response = client.put(
            "/internal/control/model-configs/openai",
            headers=mutation_headers(
                action="save",
                permission="admin:assistant:configure",
            ),
            json={
                "modelId": "gpt-5-mini",
                "endpointId": "openai-official",
                "apiKey": "secret-api-key-cdef",
                "expectedRevision": 2,
            },
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "version": "1",
        "config": {
            "provider": "openai",
            "modelId": "gpt-5-mini",
            "endpointId": "openai-official",
            "apiKeyLastFour": "cdef",
            "revision": 3,
            "testStatus": "untested",
            "lastTestedAt": None,
        },
    }
    assert len(service.saved) == 1
    draft, assertion = service.saved[0]
    assert draft == ModelConfigDraft(
        provider="openai",
        model_id="gpt-5-mini",
        endpoint_id="openai-official",
        api_key=SecretStr("secret-api-key-cdef"),
        expected_revision=2,
    )
    assert assertion.action == "save"
    assert assertion.provider == "openai"
    assert str(assertion.actor) == ACTOR
    assert str(assertion.request_id) == REQUEST_ID
    assert str(assertion.nonce) == NONCE
    assert "secret-api-key-cdef" not in response.text


@pytest.mark.parametrize(
    "invalid_api_key",
    (
        ["a", "b", "c", "d", "e", "f", "g", "h"],
        {f"key-{index}": "value" for index in range(8)},
        12345678,
        True,
        False,
    ),
)
def test_save_rejects_every_non_string_api_key_before_service_dispatch(
    invalid_api_key: object,
) -> None:
    service = RecordingService()
    application = control_route_app(service)

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.put(
            "/internal/control/model-configs/openai",
            headers=mutation_headers(
                action="save",
                permission="admin:assistant:configure",
            ),
            json={
                "modelId": "gpt-5-mini",
                "endpointId": "openai-official",
                "apiKey": invalid_api_key,
                "expectedRevision": 2,
            },
        )

    assert response.status_code == 400
    assert response.json() == {"error": "validation_error"}
    assert response.headers["cache-control"] == "no-store"
    assert service.saved == []


def _route_traceback_locals(error: BaseException) -> list[dict[str, object]]:
    frames: list[dict[str, object]] = []
    traceback = error.__traceback__
    while traceback is not None:
        frame = traceback.tb_frame
        if (
            frame.f_code.co_name == "save_model_config"
            and frame.f_code.co_filename.endswith("model_control_api.py")
        ):
            frames.append(dict(frame.f_locals))
        traceback = traceback.tb_next
    return frames


def _assert_route_frames_have_no_key_material(
    frames: list[dict[str, object]],
    raw_key: str,
) -> None:
    for local_values in frames:
        for value in local_values.values():
            assert type(value) is not SecretStr
            if isinstance(value, str):
                assert value != raw_key
            if isinstance(value, dict):
                assert raw_key not in repr(value)


def _exception_chain_frame_locals(
    error: BaseException,
) -> list[tuple[str, str, dict[str, object]]]:
    frames: list[tuple[str, str, dict[str, object]]] = []
    pending = [error]
    visited: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in visited:
            continue
        visited.add(id(current))
        if current.__cause__ is not None:
            pending.append(current.__cause__)
        if current.__context__ is not None:
            pending.append(current.__context__)
        traceback = current.__traceback__
        while traceback is not None:
            frame = traceback.tb_frame
            if frame.f_code.co_filename != __file__:
                frames.append(
                    (
                        frame.f_code.co_filename,
                        frame.f_code.co_name,
                        dict(frame.f_locals),
                    )
                )
            traceback = traceback.tb_next
    return frames


def _assert_exception_chain_frames_have_no_key_material(
    frames: list[tuple[str, str, dict[str, object]]],
    raw_key: str,
) -> None:
    for _filename, _function, local_values in frames:
        for value in local_values.values():
            assert raw_key not in repr(value)


def test_unknown_save_exception_is_fixed_and_clears_key_traceback_locals(
    capsys: pytest.CaptureFixture[str],
    caplog: pytest.LogCaptureFixture,
) -> None:
    raw_key = "traceback-raw-api-key-cdef"
    service = UnexpectedSaveFailureService(raw_key)
    application = control_route_app(service)

    with caplog.at_level("DEBUG"):
        with TestClient(application, raise_server_exceptions=False) as client:
            response = client.put(
                "/internal/control/model-configs/openai",
                headers=mutation_headers(
                    action="save",
                    permission="admin:assistant:configure",
                ),
                json={
                    "modelId": "gpt-5-mini",
                    "endpointId": "openai-official",
                    "apiKey": raw_key,
                    "expectedRevision": 2,
                },
            )

    captured = capsys.readouterr()
    assert response.status_code == 503
    assert response.json() == {"error": "assistant_unavailable"}
    assert raw_key not in response.text
    assert raw_key not in captured.out
    assert raw_key not in captured.err
    assert raw_key not in caplog.text
    assert service.failure is not None
    _assert_route_frames_have_no_key_material(
        _route_traceback_locals(service.failure),
        raw_key,
    )


@pytest.mark.asyncio
async def test_save_cancellation_propagates_after_clearing_route_key_locals() -> None:
    raw_key = "cancelled-raw-api-key-cdef"
    service = CancellingSaveService()
    application = control_route_app(service)
    path = "/internal/control/model-configs/openai"
    body = json.dumps(
        {
            "modelId": "gpt-5-mini",
            "endpointId": "openai-official",
            "apiKey": raw_key,
            "expectedRevision": 2,
        },
        separators=(",", ":"),
    ).encode()
    headers = [
        (b"authorization", f"Bearer {CONTROL_KEY}".encode()),
        (
            b"x-agent-control-assertion",
            signed_assertion(
                action="save",
                permission="admin:assistant:configure",
            ).encode(),
        ),
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body)).encode()),
    ]
    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "PUT",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": headers,
            "client": ("test", 123),
            "server": ("test", 80),
            "state": {},
        },
    )
    received = 0

    async def receive() -> Message:
        nonlocal received
        received += 1
        if received > 1:
            raise AssertionError("save body read more than once")
        return cast(
            Message,
            {"type": "http.request", "body": body, "more_body": False},
        )

    async def send(_: Message) -> None:
        raise AssertionError("cancelled save must not send a response")

    with pytest.raises(asyncio.CancelledError):
        await application(scope, receive, send)

    assert service.failure is not None
    route_frames = _route_traceback_locals(service.failure)
    assert route_frames
    _assert_route_frames_have_no_key_material(route_frames, raw_key)


@pytest.mark.asyncio
async def test_body_receive_cancellation_has_no_key_reachable_from_exception_chain() -> (
    None
):
    raw_key = "chunked-cancel-raw-api-key-cdef"
    application = control_route_app(RecordingService())
    path = "/internal/control/model-configs/openai"
    first_body = json.dumps(
        {
            "modelId": "gpt-5-mini",
            "endpointId": "openai-official",
            "apiKey": raw_key,
            "expectedRevision": 2,
        },
        separators=(",", ":"),
    ).encode()
    headers = [
        (b"authorization", f"Bearer {CONTROL_KEY}".encode()),
        (
            b"x-agent-control-assertion",
            signed_assertion(
                action="save",
                permission="admin:assistant:configure",
            ).encode(),
        ),
        (b"content-type", b"application/json"),
        (b"content-length", str(len(first_body)).encode()),
    ]
    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "PUT",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": headers,
            "client": ("test", 123),
            "server": ("test", 80),
            "state": {},
        },
    )
    received = 0
    cancellation = asyncio.CancelledError()

    async def receive() -> Message:
        nonlocal received
        received += 1
        if received == 1:
            return cast(
                Message,
                {"type": "http.request", "body": first_body, "more_body": True},
            )
        raise cancellation

    async def send(_: Message) -> None:
        raise AssertionError("cancelled body receive must not send a response")

    with pytest.raises(asyncio.CancelledError) as raised:
        await application(scope, receive, send)

    assert received == 2
    chain_frames = _exception_chain_frame_locals(raised.value)
    assert any(function == "_read_json_object" for _, function, _ in chain_frames)
    _assert_exception_chain_frames_have_no_key_material(chain_frames, raw_key)


def test_test_and_activate_passes_only_revision_and_verified_assertion() -> None:
    service = RecordingService()
    application = control_route_app(service)

    with TestClient(application) as client:
        response = client.post(
            "/internal/control/model-configs/openai/test-and-activate",
            headers=mutation_headers(
                action="test_and_activate",
                permission="admin:assistant:configure",
            ),
            json={"revision": 3},
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "version": "1",
        "provider": "openai",
        "configRevision": 3,
        "activationVersion": 8,
    }
    assert len(service.activated) == 1
    provider, revision, assertion = service.activated[0]
    assert (provider, revision) == ("openai", 3)
    assert assertion.action == "test_and_activate"
    assert assertion.permission == "admin:assistant:configure"


def test_test_and_activate_reports_safe_successful_test_before_activation_failure() -> (
    None
):
    failure = ModelControlStorageError(
        "private activation persistence detail",
        test_succeeded=True,
    )
    application = control_route_app(FailingActivationService(failure))

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(
            "/internal/control/model-configs/openai/test-and-activate",
            headers=mutation_headers(
                action="test_and_activate",
                permission="admin:assistant:configure",
            ),
            json={"revision": 3},
        )

    assert response.status_code == 503
    assert response.json() == {
        "error": "storage_unavailable",
        "testResult": "success",
    }
    assert "private" not in response.text


def test_reveal_returns_the_one_plaintext_field_with_private_no_cache_headers() -> None:
    service = RecordingService()
    application = control_route_app(service)

    with TestClient(application) as client:
        response = client.post(
            "/internal/control/model-configs/openai/reveal-key",
            headers=mutation_headers(
                action="reveal",
                permission="admin:assistant:secret:reveal",
            ),
            json={"revision": 3},
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store, private"
    assert response.headers["pragma"] == "no-cache"
    assert response.json() == {"key": "single-use-secret-key"}
    assert set(response.json()) == {"key"}
    assert len(service.revealed) == 1
    provider, revision, assertion = service.revealed[0]
    assert (provider, revision) == ("openai", 3)
    assert assertion.action == "reveal"
    assert assertion.permission == "admin:assistant:secret:reveal"


def test_reveal_validation_failure_keeps_private_no_cache_headers() -> None:
    application = control_route_app(RecordingService())

    with TestClient(application) as client:
        response = client.post(
            "/internal/control/model-configs/openai/reveal-key",
            headers=mutation_headers(
                action="reveal",
                permission="admin:assistant:secret:reveal",
            ),
            json={"revision": 3, "unexpected": True},
        )

    assert response.status_code == 400
    assert response.json() == {"error": "validation_error"}
    assert response.headers["cache-control"] == "no-store, private"
    assert response.headers["pragma"] == "no-cache"


def test_reveal_domain_failure_keeps_private_no_cache_headers() -> None:
    failure = ModelControlStorageError("private reveal persistence detail")
    application = control_route_app(FailingRevealService(failure))

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.post(
            "/internal/control/model-configs/openai/reveal-key",
            headers=mutation_headers(
                action="reveal",
                permission="admin:assistant:secret:reveal",
            ),
            json={"revision": 3},
        )

    assert response.status_code == 503
    assert response.json() == {"error": "storage_unavailable"}
    assert response.headers["cache-control"] == "no-store, private"
    assert response.headers["pragma"] == "no-cache"
    assert str(failure) not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("request_headers", "status_code", "error_code"),
    (
        (
            [],
            401,
            "authentication_failed",
        ),
        (
            [(b"authorization", f"Bearer {CONTROL_KEY}".encode())],
            403,
            "authorization_failed",
        ),
    ),
)
async def test_reveal_auth_failure_is_private_and_precedes_body_receive(
    request_headers: list[tuple[bytes, bytes]],
    status_code: int,
    error_code: str,
) -> None:
    service = RecordingService()
    application = control_route_app(service)
    path = "/internal/control/model-configs/openai/reveal-key"
    headers = [
        *request_headers,
        (b"content-type", b"application/json"),
        (b"content-length", b"14"),
    ]
    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": headers,
            "client": ("test", 123),
            "server": ("test", 80),
            "state": {},
        },
    )
    received = 0
    sent: list[Message] = []

    async def receive() -> Message:
        nonlocal received
        received += 1
        raise AssertionError("reveal auth failure must not receive a body")

    async def send(message: Message) -> None:
        sent.append(message)

    await application(scope, receive, send)

    assert received == 0
    assert sent[0]["status"] == status_code
    response_headers = dict(sent[0]["headers"])
    assert response_headers[b"cache-control"] == b"no-store, private"
    assert response_headers[b"pragma"] == b"no-cache"
    assert sent[1]["body"] == f'{{"error":"{error_code}"}}'.encode()
    assert service.revealed == []


@pytest.mark.parametrize(
    ("method", "path", "action", "permission", "body"),
    (
        (
            "PUT",
            "/internal/control/model-configs/openai",
            "save",
            "admin:assistant:configure",
            b'{"modelId":"gpt-5-mini","endpointId":"openai-official",'
            b'"expectedRevision":2,"expectedRevision":2}',
        ),
        (
            "POST",
            "/internal/control/model-configs/openai/test-and-activate",
            "test_and_activate",
            "admin:assistant:configure",
            b'{"revision":3,"revision":3}',
        ),
        (
            "POST",
            "/internal/control/model-configs/openai/reveal-key",
            "reveal",
            "admin:assistant:secret:reveal",
            b'{"revision":3,"revision":3}',
        ),
    ),
)
def test_every_mutation_rejects_duplicate_json_fields(
    method: str,
    path: str,
    action: str,
    permission: str,
    body: bytes,
) -> None:
    service = RecordingService()
    application = control_route_app(service)

    with TestClient(application) as client:
        response = client.request(
            method,
            path,
            headers=mutation_headers(action=action, permission=permission),
            content=body,
        )

    assert response.status_code == 400
    assert response.json() == {"error": "validation_error"}
    assert response.headers["cache-control"] == (
        "no-store, private" if action == "reveal" else "no-store"
    )
    if action == "reveal":
        assert response.headers["pragma"] == "no-cache"
    assert service.saved == []
    assert service.activated == []
    assert service.revealed == []


@pytest.mark.parametrize(
    ("method", "path", "action", "permission", "payload"),
    (
        (
            "PUT",
            "/internal/control/model-configs/openai",
            "save",
            "admin:assistant:configure",
            {
                "modelId": "gpt-5-mini",
                "endpointId": "openai-official",
                "expectedRevision": 2,
                "unexpected": True,
            },
        ),
        (
            "POST",
            "/internal/control/model-configs/openai/test-and-activate",
            "test_and_activate",
            "admin:assistant:configure",
            {"revision": 3, "unexpected": True},
        ),
        (
            "POST",
            "/internal/control/model-configs/openai/reveal-key",
            "reveal",
            "admin:assistant:secret:reveal",
            {"revision": 3, "unexpected": True},
        ),
    ),
)
def test_every_mutation_rejects_extra_json_fields(
    method: str,
    path: str,
    action: str,
    permission: str,
    payload: dict[str, object],
) -> None:
    service = RecordingService()
    application = control_route_app(service)

    with TestClient(application) as client:
        response = client.request(
            method,
            path,
            headers=mutation_headers(action=action, permission=permission),
            json=payload,
        )

    assert response.status_code == 400
    assert response.json() == {"error": "validation_error"}
    assert service.saved == []
    assert service.activated == []
    assert service.revealed == []


@pytest.mark.parametrize(
    ("method", "path", "action", "permission"),
    (
        (
            "PUT",
            "/internal/control/model-configs/openai",
            "save",
            "admin:assistant:configure",
        ),
        (
            "POST",
            "/internal/control/model-configs/openai/test-and-activate",
            "test_and_activate",
            "admin:assistant:configure",
        ),
        (
            "POST",
            "/internal/control/model-configs/openai/reveal-key",
            "reveal",
            "admin:assistant:secret:reveal",
        ),
    ),
)
def test_every_mutation_requires_exact_json_content_type(
    method: str,
    path: str,
    action: str,
    permission: str,
) -> None:
    service = RecordingService()
    application = control_route_app(service)
    headers = mutation_headers(action=action, permission=permission)
    headers["Content-Type"] = "application/json; charset=utf-8"

    with TestClient(application) as client:
        response = client.request(
            method,
            path,
            headers=headers,
            content=b"{}",
        )

    assert response.status_code == 400
    assert response.json() == {"error": "validation_error"}
    assert service.saved == []
    assert service.activated == []
    assert service.revealed == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "content_type_values",
    (
        (b"application/json", b"application/json"),
        (b"application/json", b"text/plain"),
        (b"application/json\x00",),
    ),
    ids=("duplicate", "conflicting", "malformed"),
)
async def test_save_requires_one_exact_raw_content_type_header(
    content_type_values: tuple[bytes, ...],
) -> None:
    service = RecordingService()
    application = control_route_app(service)
    path = "/internal/control/model-configs/openai"
    body = (
        b'{"modelId":"gpt-5-mini","endpointId":"openai-official","expectedRevision":2}'
    )
    headers = [
        (b"authorization", f"Bearer {CONTROL_KEY}".encode()),
        (
            b"x-agent-control-assertion",
            signed_assertion(
                action="save",
                permission="admin:assistant:configure",
            ).encode(),
        ),
        *((b"content-type", value) for value in content_type_values),
        (b"content-length", str(len(body)).encode()),
    ]
    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "PUT",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": headers,
            "client": ("test", 123),
            "server": ("test", 80),
            "state": {},
        },
    )
    received = 0
    sent: list[Message] = []

    async def receive() -> Message:
        nonlocal received
        received += 1
        if received > 1:
            raise AssertionError("invalid Content-Type read past one body message")
        return cast(
            Message,
            {"type": "http.request", "body": body, "more_body": False},
        )

    async def send(message: Message) -> None:
        sent.append(message)

    await application(scope, receive, send)

    assert received == 0
    assert sent[0]["status"] == 400
    assert sent[1]["body"] == b'{"error":"validation_error"}'
    assert service.saved == []


@pytest.mark.parametrize(
    ("failure", "status_code", "code"),
    (
        (
            ModelControlValidationError("private validation key"),
            400,
            "validation_error",
        ),
        (
            ModelControlEndpointError("https://private.endpoint.invalid"),
            400,
            "endpoint_not_allowed",
        ),
        (
            ModelControlConflictError("private stale state"),
            409,
            "configuration_conflict",
        ),
        (ModelControlProviderError("credential_rejected"), 422, "credential_rejected"),
        (ModelControlProviderError("model_not_found"), 422, "model_not_found"),
        (
            ModelControlProviderError("provider_unreachable"),
            502,
            "provider_unreachable",
        ),
        (ModelControlProviderError("provider_timeout"), 504, "provider_timeout"),
        (
            ModelControlDisabledError("private deployment state"),
            503,
            "control_disabled",
        ),
        (
            ModelControlStorageError("postgresql://private:key@db/platform"),
            503,
            "storage_unavailable",
        ),
        (
            ModelControlEncryptionError("private master key failed"),
            503,
            "encryption_unavailable",
        ),
        (
            ModelControlAssistantError("private model builder state"),
            503,
            "assistant_unavailable",
        ),
    ),
)
def test_domain_failures_map_to_fixed_safe_errors(
    failure: ModelControlServiceError,
    status_code: int,
    code: str,
) -> None:
    application = control_route_app(FailingService(failure))

    with TestClient(application, raise_server_exceptions=False) as client:
        response = client.put(
            "/internal/control/model-configs/openai",
            headers=mutation_headers(
                action="save",
                permission="admin:assistant:configure",
            ),
            json={
                "modelId": "gpt-5-mini",
                "endpointId": "openai-official",
                "expectedRevision": 2,
            },
        )

    assert response.status_code == status_code
    assert response.json() == {"error": code}
    assert response.headers["cache-control"] == "no-store"
    assert str(failure) not in response.text or str(failure) == code
    assert "private" not in response.text
    assert "postgresql" not in response.text
    assert "endpoint.invalid" not in response.text


@pytest.mark.asyncio
async def test_oversized_mutation_is_rejected_without_receiving_the_body() -> None:
    service = RecordingService()
    application = control_route_app(service)
    header_values = mutation_headers(
        action="save",
        permission="admin:assistant:configure",
    )
    headers = [
        (name.lower().encode(), value.encode()) for name, value in header_values.items()
    ]
    headers.append((b"content-length", str(8 * 1024 + 1).encode()))
    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "PUT",
            "scheme": "http",
            "path": "/internal/control/model-configs/openai",
            "raw_path": b"/internal/control/model-configs/openai",
            "query_string": b"",
            "root_path": "",
            "headers": headers,
            "client": ("test", 123),
            "server": ("test", 80),
            "state": {},
        },
    )
    received = 0
    sent: list[Message] = []

    async def receive() -> Message:
        nonlocal received
        received += 1
        raise AssertionError("oversized body must not be received")

    async def send(message: Message) -> None:
        sent.append(message)

    await application(scope, receive, send)

    assert received == 0
    assert sent[0]["type"] == "http.response.start"
    assert sent[0]["status"] == 400
    assert sent[1] == {
        "type": "http.response.body",
        "body": b'{"error":"validation_error"}',
    }
    assert service.saved == []


@pytest.mark.asyncio
async def test_chunked_mutation_without_content_length_stops_at_the_body_limit() -> (
    None
):
    service = RecordingService()
    application = control_route_app(service)
    headers = [
        (name.lower().encode(), value.encode())
        for name, value in mutation_headers(
            action="save",
            permission="admin:assistant:configure",
        ).items()
    ]
    path = "/internal/control/model-configs/openai"
    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "PUT",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": headers,
            "client": ("test", 123),
            "server": ("test", 80),
            "state": {},
        },
    )
    chunks = [
        cast(
            Message,
            {
                "type": "http.request",
                "body": b"{" * 4096,
                "more_body": True,
            },
        ),
        cast(
            Message,
            {
                "type": "http.request",
                "body": b"x" * 4097,
                "more_body": True,
            },
        ),
    ]
    received = 0
    sent: list[Message] = []

    async def receive() -> Message:
        nonlocal received
        received += 1
        if received > len(chunks):
            raise AssertionError("body reader continued after crossing 8 KiB")
        return chunks[received - 1]

    async def send(message: Message) -> None:
        sent.append(message)

    await application(scope, receive, send)

    assert received == 2
    assert sent[0]["status"] == 400
    assert sent[1]["body"] == b'{"error":"validation_error"}'
    assert service.saved == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "asserted_action", "asserted_permission", "asserted_provider"),
    (
        (
            "/internal/control/model-configs/not-a-provider",
            "save",
            "admin:assistant:configure",
            "openai",
        ),
        (
            "/internal/control/model-configs/openai",
            "reveal",
            "admin:assistant:secret:reveal",
            "openai",
        ),
        (
            "/internal/control/model-configs/openai",
            "save",
            "admin:assistant:configure",
            "anthropic",
        ),
    ),
)
async def test_invalid_provider_or_route_assertion_is_rejected_before_body_receive(
    path: str,
    asserted_action: str,
    asserted_permission: str,
    asserted_provider: str,
) -> None:
    service = RecordingService()
    application = control_route_app(service)
    headers = [
        (b"authorization", f"Bearer {CONTROL_KEY}".encode()),
        (
            b"x-agent-control-assertion",
            signed_assertion(
                action=asserted_action,
                permission=asserted_permission,
                provider=asserted_provider,
            ).encode(),
        ),
        (b"content-type", b"application/json"),
        (b"content-length", b"999999"),
    ]
    scope = cast(
        Scope,
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "PUT",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": headers,
            "client": ("test", 123),
            "server": ("test", 80),
            "state": {},
        },
    )
    received = 0
    sent: list[Message] = []

    async def receive() -> Message:
        nonlocal received
        received += 1
        raise AssertionError("authorization failure must not receive a body")

    async def send(message: Message) -> None:
        sent.append(message)

    await application(scope, receive, send)

    assert received == 0
    assert sent[0]["status"] == 403
    assert sent[1]["body"] == b'{"error":"authorization_failed"}'
    assert service.saved == []
