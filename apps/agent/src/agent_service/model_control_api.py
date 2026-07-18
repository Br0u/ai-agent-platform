"""Thin private HTTP boundary for administrator-managed model configuration."""

from collections.abc import Callable
import json
import re
import time
from typing import Final, cast

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import SecretStr, ValidationError
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from agent_service.model_config_types import (
    MODEL_PROVIDERS,
    ModelConfigDraft,
    ModelProvider,
    StoredModelConfigMetadata,
)
from agent_service.model_control_auth import (
    ModelControlAction,
    ModelControlAssertion,
    ModelControlAssertionError,
    ModelControlAuthenticator,
    ModelControlBearerError,
)
from agent_service.model_control_service import (
    ModelControlAssistantError,
    ModelControlConflictError,
    ModelControlDisabledError,
    ModelControlEncryptionError,
    ModelControlEndpointError,
    ModelControlProviderError,
    ModelControlService,
    ModelControlServiceError,
    ModelControlStorageError,
    ModelControlValidationError,
)


CONTROL_PATH_PREFIX = "/internal/control/"
_ASSERTION_STATE_KEY = "model_control_assertion"
_REQUEST_BODY_MAX_BYTES: Final = 8 * 1024
_RESPONSE_BODY_MAX_BYTES: Final = 64 * 1024
_PROVIDER_ERROR_STATUS: Final = {
    "credential_rejected": 422,
    "model_not_found": 422,
    "provider_unreachable": 502,
    "provider_timeout": 504,
}
_NO_STORE_HEADERS: Final = {"Cache-Control": "no-store"}
_PRIVATE_NO_STORE_HEADERS: Final = {
    "Cache-Control": "no-store, private",
    "Pragma": "no-cache",
}


def _match_control_target(
    method: str,
    path: str,
) -> tuple[ModelControlAction | None, str | None]:
    parts = path.split("/")
    if (
        method == "PUT"
        and len(parts) == 5
        and parts[1:4] == ["internal", "control", "model-configs"]
    ):
        return "save", parts[4]
    if (
        method == "POST"
        and len(parts) == 6
        and parts[1:4] == ["internal", "control", "model-configs"]
    ):
        actions: dict[str, ModelControlAction] = {
            "test-and-activate": "test_and_activate",
            "reveal-key": "reveal",
        }
        return actions.get(parts[5]), parts[4]
    return None, None


def _control_target(
    scope: Scope,
) -> tuple[ModelControlAction | None, str | None, bool]:
    method = scope.get("method")
    path = scope.get("path")
    if type(method) is not str or type(path) is not str:
        return None, None, True
    action, provider = _match_control_target(method, path)
    if action is not None:
        return action, provider, True
    normalized_path = path.rstrip("/")
    if normalized_path != path:
        action, provider = _match_control_target(method, normalized_path)
        if action is not None:
            return action, provider, False
    return None, None, True


class ModelControlAuthMiddleware:
    """Authenticate the private control Bearer before a body can be received."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        authenticator: ModelControlAuthenticator,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.app = app
        self._authenticator = authenticator
        self._clock = clock

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope.get("path", "").startswith(
            CONTROL_PATH_PREFIX
        ):
            await self.app(scope, receive, send)
            return

        action, provider, canonical = _control_target(scope)
        private = action == "reveal"
        try:
            assertion = self._authenticator.authenticate(
                headers=scope.get("headers", ()),
                action=action,
                provider=cast(ModelProvider | None, provider),
                now=int(self._clock()),
            )
        except ModelControlBearerError:
            response = JSONResponse(
                status_code=401,
                content={"error": "authentication_failed"},
                headers=(_PRIVATE_NO_STORE_HEADERS if private else _NO_STORE_HEADERS),
            )
            await response(scope, receive, send)
            return
        except ModelControlAssertionError:
            response = JSONResponse(
                status_code=403,
                content={"error": "authorization_failed"},
                headers=(_PRIVATE_NO_STORE_HEADERS if private else _NO_STORE_HEADERS),
            )
            await response(scope, receive, send)
            return

        if not canonical:
            response = JSONResponse(
                status_code=403,
                content={"error": "authorization_failed"},
                headers=(_PRIVATE_NO_STORE_HEADERS if private else _NO_STORE_HEADERS),
            )
            await response(scope, receive, send)
            return

        state = scope.setdefault("state", {})
        if assertion is not None:
            state[_ASSERTION_STATE_KEY] = assertion
        await self.app(scope, receive, send)


def _validation_response(*, private: bool = False) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"error": "validation_error"},
        headers=_PRIVATE_NO_STORE_HEADERS if private else _NO_STORE_HEADERS,
    )


def _service_error_response(
    error: ModelControlServiceError,
    *,
    private: bool = False,
) -> JSONResponse:
    status_code = 503
    code = "assistant_unavailable"
    if isinstance(error, ModelControlValidationError):
        status_code, code = 400, "validation_error"
    elif isinstance(error, ModelControlEndpointError):
        status_code, code = 400, "endpoint_not_allowed"
    elif isinstance(error, ModelControlConflictError):
        status_code, code = 409, "configuration_conflict"
    elif isinstance(error, ModelControlProviderError):
        candidate = str(error)
        if candidate not in _PROVIDER_ERROR_STATUS:
            candidate = "provider_unreachable"
        status_code, code = _PROVIDER_ERROR_STATUS[candidate], candidate
    elif isinstance(error, ModelControlDisabledError):
        status_code, code = 503, "control_disabled"
    elif isinstance(error, ModelControlStorageError):
        status_code, code = 503, "storage_unavailable"
    elif isinstance(error, ModelControlEncryptionError):
        status_code, code = 503, "encryption_unavailable"
    elif isinstance(error, ModelControlAssistantError):
        status_code, code = 503, "assistant_unavailable"
    return JSONResponse(
        status_code=status_code,
        content={"error": code},
        headers=_PRIVATE_NO_STORE_HEADERS if private else _NO_STORE_HEADERS,
    )


def _bounded_response(
    content: dict[str, object],
    *,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    response = JSONResponse(
        content=content,
        headers=_NO_STORE_HEADERS if headers is None else headers,
    )
    if len(response.body) > _RESPONSE_BODY_MAX_BYTES:
        return _service_error_response(
            ModelControlStorageError("storage_unavailable"),
            private=headers == _PRIVATE_NO_STORE_HEADERS,
        )
    return response


def _strict_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate request field")
        result[key] = value
    return result


async def _read_json_object(request: Request) -> dict[str, object] | None:
    raw_headers = request.scope.get("headers", ())
    content_types = [
        value
        for name, value in raw_headers
        if type(name) is bytes and name.lower() == b"content-type"
    ]
    if content_types != [b"application/json"]:
        return None
    content_lengths = [
        value
        for name, value in raw_headers
        if type(name) is bytes and name.lower() == b"content-length"
    ]
    if len(content_lengths) > 1:
        return None
    if content_lengths:
        raw_length = content_lengths[0]
        if re.fullmatch(rb"0|[1-9][0-9]*", raw_length) is None:
            return None
        if int(raw_length) > _REQUEST_BODY_MAX_BYTES:
            return None

    raw = bytearray()
    message: Message | None = None
    chunk: bytes = b""
    body_bytes: bytes = b""
    try:
        while True:
            message = await request.receive()
            if message["type"] != "http.request":
                return None
            chunk = message.get("body", b"")
            if type(chunk) is not bytes:
                return None
            if len(raw) + len(chunk) > _REQUEST_BODY_MAX_BYTES:
                return None
            raw.extend(chunk)
            more_body = message.get("more_body", False)
            if type(more_body) is not bool:
                return None
            if not more_body:
                break
        body_bytes = bytes(raw)
        parsed = json.loads(body_bytes, object_pairs_hook=_strict_object)
    except (UnicodeError, json.JSONDecodeError, TypeError, ValueError):
        return None
    finally:
        raw.clear()
        message = None
        chunk = b""
        body_bytes = b""
        del request
    if type(parsed) is not dict:
        return None
    return cast(dict[str, object], parsed)


def _metadata_content(config: StoredModelConfigMetadata) -> dict[str, object]:
    return {
        "provider": config.provider,
        "modelId": config.model_id,
        "endpointId": config.endpoint_id,
        "apiKeyLastFour": config.api_key_last_four,
        "revision": config.revision,
        "testStatus": config.test_status,
    }


def build_model_control_router(
    service_provider: Callable[[], ModelControlService],
) -> APIRouter:
    """Build metadata-only control routes around one lifespan-owned service."""
    router = APIRouter()

    @router.get("/internal/control/model-configs", include_in_schema=False)
    async def list_model_configs() -> JSONResponse:
        try:
            result = await service_provider().list_model_configs()
        except ModelControlServiceError as error:
            return _service_error_response(error)
        if len(result.configs) > len(MODEL_PROVIDERS):
            return _service_error_response(
                ModelControlStorageError("storage_unavailable")
            )
        return _bounded_response(
            {
                "version": "1",
                "configs": [_metadata_content(config) for config in result.configs],
                "endpoints": [
                    {
                        "id": endpoint.id,
                        "label": endpoint.label,
                        "provider": endpoint.provider,
                    }
                    for endpoint in result.endpoints
                ],
                "bootstrap": (
                    None
                    if result.bootstrap is None
                    else {
                        "provider": result.bootstrap.provider,
                        "modelId": result.bootstrap.model_id,
                        "readOnly": result.bootstrap.read_only,
                    }
                ),
                "controlEnabled": result.control_enabled,
            }
        )

    @router.put(
        "/internal/control/model-configs/{provider}",
        include_in_schema=False,
    )
    async def save_model_config(provider: str, request: Request) -> JSONResponse:
        assertion = request.scope.get("state", {}).get(_ASSERTION_STATE_KEY)
        if type(assertion) is not ModelControlAssertion:
            return _validation_response()
        payload = await _read_json_object(request)
        if payload is None:
            return _validation_response()
        api_key: object | None = None
        draft: ModelConfigDraft | None = None
        try:
            if set(payload) - {
                "modelId",
                "endpointId",
                "apiKey",
                "expectedRevision",
            }:
                return _validation_response()
            api_key = payload.get("apiKey")
            if api_key is not None and type(api_key) is not str:
                return _validation_response()
            try:
                draft = ModelConfigDraft.model_validate(
                    {
                        "provider": provider,
                        "model_id": payload.get("modelId"),
                        "endpoint_id": payload.get("endpointId"),
                        "api_key": (
                            None if api_key is None else SecretStr(cast(str, api_key))
                        ),
                        "expected_revision": payload.get("expectedRevision"),
                    }
                )
            except (TypeError, ValidationError):
                pass
        finally:
            payload.clear()
            api_key = None
            del request
        if draft is None:
            return _validation_response()
        try:
            try:
                result = await service_provider().save_model_config(draft, assertion)
            except ModelControlServiceError as error:
                return _service_error_response(error)
            except Exception:
                return _service_error_response(
                    ModelControlAssistantError("assistant_unavailable")
                )
        finally:
            draft = None
        return _bounded_response({"version": "1", "config": _metadata_content(result)})

    @router.post(
        "/internal/control/model-configs/{provider}/test-and-activate",
        include_in_schema=False,
    )
    async def test_and_activate(provider: str, request: Request) -> JSONResponse:
        assertion = request.scope.get("state", {}).get(_ASSERTION_STATE_KEY)
        if type(assertion) is not ModelControlAssertion:
            return _validation_response()
        payload = await _read_json_object(request)
        if payload is None or set(payload) != {"revision"}:
            return _validation_response()
        revision = payload["revision"]
        if type(revision) is not int or revision < 1:
            return _validation_response()
        try:
            result = await service_provider().test_and_activate(
                cast(ModelProvider, provider),
                revision,
                assertion,
            )
        except ModelControlServiceError as error:
            return _service_error_response(error)
        return _bounded_response(
            {
                "version": "1",
                "provider": result.provider,
                "configRevision": result.config_revision,
                "activationVersion": result.activation_version,
            }
        )

    @router.post(
        "/internal/control/model-configs/{provider}/reveal-key",
        include_in_schema=False,
    )
    async def reveal_key(provider: str, request: Request) -> JSONResponse:
        assertion = request.scope.get("state", {}).get(_ASSERTION_STATE_KEY)
        if type(assertion) is not ModelControlAssertion:
            return _validation_response(private=True)
        payload = await _read_json_object(request)
        if payload is None or set(payload) != {"revision"}:
            return _validation_response(private=True)
        revision = payload["revision"]
        if type(revision) is not int or revision < 1:
            return _validation_response(private=True)
        try:
            secret: SecretStr | None = await service_provider().reveal_key(
                cast(ModelProvider, provider),
                revision,
                assertion,
            )
        except ModelControlServiceError as error:
            return _service_error_response(error, private=True)
        if secret is None:
            return _service_error_response(
                ModelControlEncryptionError("encryption_unavailable"),
                private=True,
            )
        try:
            return _bounded_response(
                {"key": secret.get_secret_value()},
                headers=_PRIVATE_NO_STORE_HEADERS,
            )
        finally:
            secret = None

    @router.get(
        "/internal/control/model-configs/runtime-status",
        include_in_schema=False,
    )
    async def runtime_status() -> JSONResponse:
        try:
            status = service_provider().runtime_status()
        except ModelControlServiceError as error:
            return _service_error_response(error)
        return _bounded_response(
            {
                "version": "1",
                "capability": status.capability,
                "source": status.source,
                "provider": status.provider,
                "modelId": status.model_id,
                "configRevision": status.config_revision,
                "activationVersion": status.activation_version,
            }
        )

    return router
