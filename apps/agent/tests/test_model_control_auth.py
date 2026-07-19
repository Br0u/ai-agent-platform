import base64
import hashlib
import hmac
import json
from pathlib import Path
from typing import Any, cast
from uuid import UUID

from pydantic import SecretStr
import pytest

import agent_service.model_control_auth as auth_module
from agent_service.model_config_types import MODEL_PROVIDERS, ModelProvider
from agent_service.model_control_auth import (
    ASSERTION_HEADER_MAX_BYTES,
    ASSERTION_PAYLOAD_MAX_BYTES,
    ModelControlAssertion,
    ModelControlAssertionError,
    ModelControlAuthConfigurationError,
    ModelControlAuthenticator,
    ModelControlBearerError,
)


CONTROL_KEY = "control-boundary-key-0123456789abcdef"
OS_SECURITY_KEY = "agentos-boundary-key-0123456789abcdef"
DOMAIN = b"ai-agent-platform:model-control-assertion:v1"
ACTOR = "11111111-1111-4111-8111-111111111111"
REQUEST_ID = "22222222-2222-4222-8222-222222222222"
NONCE = "33333333-3333-4333-8333-333333333333"
NOW = 2_000_000_000
ASSERTION_HEADER = b"x-agent-control-assertion"
FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "docs/testing/fixtures/model-control-assertion-v1.json"
)


def payload(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "actor": ACTOR,
        "permission": "admin:assistant:configure",
        "requestId": REQUEST_ID,
        "action": "save",
        "provider": "openai",
        "issuedAt": NOW,
        "expiresAt": NOW + 5,
        "nonce": NONCE,
    }
    value.update(overrides)
    return value


def canonical_bytes(value: dict[str, object]) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode()


def encode_raw(raw_payload: bytes, key: str = CONTROL_KEY) -> str:
    derived_key = hmac.new(key.encode(), DOMAIN, hashlib.sha256).digest()
    signature = hmac.new(derived_key, raw_payload, hashlib.sha256).digest()
    encoded_payload = base64.urlsafe_b64encode(raw_payload).rstrip(b"=").decode()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()
    return f"{encoded_payload}.{encoded_signature}"


def encode_assertion(
    value: dict[str, object] | None = None,
    key: str = CONTROL_KEY,
) -> str:
    return encode_raw(
        canonical_bytes(value if value is not None else payload()),
        key,
    )


def headers(
    *,
    key: str = CONTROL_KEY,
    assertion: str | None = None,
) -> list[tuple[bytes, bytes]]:
    values = [(b"authorization", f"Bearer {key}".encode())]
    if assertion is not None:
        values.append((ASSERTION_HEADER, assertion.encode()))
    return values


def authenticator(
    *,
    control_key: str = CONTROL_KEY,
    os_security_key: str = OS_SECURITY_KEY,
) -> ModelControlAuthenticator:
    return ModelControlAuthenticator(
        control_key=SecretStr(control_key),
        os_security_key=SecretStr(os_security_key),
    )


def authenticate_save(
    *,
    assertion: str | None = None,
    request_headers: list[tuple[bytes, bytes]] | None = None,
    now: int = NOW,
) -> ModelControlAssertion:
    result = authenticator().authenticate(
        headers=request_headers
        if request_headers is not None
        else headers(
            assertion=assertion if assertion is not None else encode_assertion()
        ),
        action="save",
        provider="openai",
        now=now,
    )
    assert result is not None
    return result


def assert_fixed_error(
    error: BaseException,
    expected_type: type[BaseException],
    expected_message: str,
) -> None:
    assert type(error) is expected_type
    assert str(error) == expected_message
    assert repr(error) == f"{expected_type.__name__}('{expected_message}')"
    assert error.__cause__ is None
    assert error.__context__ is None
    assert error.__suppress_context__ is True


@pytest.mark.parametrize(
    "request_headers",
    (
        [],
        [
            (b"authorization", f"Bearer {CONTROL_KEY}".encode()),
            (b"Authorization", f"Bearer {CONTROL_KEY}".encode()),
        ],
        [(b"authorization", f"Basic {CONTROL_KEY}".encode())],
        [(b"authorization", f"bearer  {CONTROL_KEY}".encode())],
        [(b"authorization", f"Bearer\t{CONTROL_KEY}".encode())],
        [(b"authorization", f"Bearer {CONTROL_KEY}\x00".encode())],
        [(b"authorization", f"Bearer {CONTROL_KEY},Bearer other".encode())],
        [(b"authorization", b"Bearer wrong-control-key")],
        [(b"authorization", f"Bearer {OS_SECURITY_KEY}".encode())],
    ),
    ids=(
        "missing",
        "duplicate",
        "wrong-scheme",
        "extra-space",
        "tab-separator",
        "control-byte",
        "combined-values",
        "wrong-key",
        "os-key",
    ),
)
def test_dedicated_bearer_rejects_every_ambiguous_or_wrong_header(
    request_headers: list[tuple[bytes, bytes]],
) -> None:
    with pytest.raises(ModelControlBearerError) as error:
        authenticator().authenticate(
            headers=request_headers,
            action=None,
            provider=None,
            now=NOW,
        )

    assert_fixed_error(
        error.value,
        ModelControlBearerError,
        "model control authentication failed",
    )


def test_rejected_bearer_and_assertion_never_call_downstream_body_receiver() -> None:
    calls = 0

    async def receive() -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {"type": "http.request"}

    async def dispatch(request_headers: list[tuple[bytes, bytes]]) -> None:
        try:
            authenticator().authenticate(
                headers=request_headers,
                action="save",
                provider="openai",
                now=NOW,
            )
        except (ModelControlBearerError, ModelControlAssertionError):
            return
        await receive()

    import asyncio

    asyncio.run(dispatch(headers(key="wrong-key", assertion=encode_assertion())))
    asyncio.run(dispatch(headers(assertion="malformed")))
    assert calls == 0


@pytest.mark.parametrize("invalid_key", ("short", "\ud800" * 32, CONTROL_KEY))
def test_authenticator_rejects_invalid_or_reused_control_key_without_values(
    invalid_key: str,
) -> None:
    os_key = CONTROL_KEY if invalid_key == CONTROL_KEY else OS_SECURITY_KEY
    with pytest.raises(ModelControlAuthConfigurationError) as error:
        authenticator(control_key=invalid_key, os_security_key=os_key)

    assert_fixed_error(
        error.value,
        ModelControlAuthConfigurationError,
        "model control authentication configuration failed",
    )
    assert invalid_key not in str(error.value)


def test_malformed_header_collection_uses_a_fixed_context_free_error() -> None:
    with pytest.raises(ModelControlBearerError) as error:
        authenticator().authenticate(
            headers=cast(Any, None),
            action=None,
            provider=None,
            now=NOW,
        )

    assert_fixed_error(
        error.value,
        ModelControlBearerError,
        "model control authentication failed",
    )


def test_valid_assertion_returns_typed_uuid_domain_values_only_after_verification() -> (
    None
):
    result = authenticate_save()

    assert result == ModelControlAssertion(
        actor=UUID(ACTOR),
        permission="admin:assistant:configure",
        request_id=UUID(REQUEST_ID),
        action="save",
        provider="openai",
        issued_at=NOW,
        expires_at=NOW + 5,
        nonce=UUID(NONCE),
    )
    assert isinstance(result.actor, UUID)
    assert isinstance(result.request_id, UUID)
    assert isinstance(result.nonce, UUID)


@pytest.mark.parametrize(
    "mutator",
    (
        lambda value: {key: item for key, item in value.items() if key != "nonce"},
        lambda value: {**value, "extra": "forbidden"},
        lambda value: {**value, "issuedAt": "2000000000"},
        lambda value: {**value, "expiresAt": True},
        lambda value: {**value, "actor": "not-a-uuid"},
        lambda value: {**value, "requestId": "A2222222-2222-4222-8222-222222222222"},
        lambda value: {**value, "nonce": "33333333333343338333333333333333"},
        lambda value: {**value, "provider": "OpenAI"},
        lambda value: {**value, "action": "delete"},
        lambda value: {**value, "permission": 7},
    ),
    ids=(
        "missing",
        "extra",
        "issued-string",
        "expires-bool",
        "actor-invalid",
        "request-noncanonical",
        "nonce-noncanonical",
        "provider-case",
        "action-unknown",
        "permission-type",
    ),
)
def test_assertion_grammar_is_exact(mutator: Any) -> None:
    invalid_payload = mutator(payload())
    with pytest.raises(ModelControlAssertionError) as error:
        authenticate_save(assertion=encode_assertion(invalid_payload))

    assert_fixed_error(
        error.value,
        ModelControlAssertionError,
        "model control authorization failed",
    )


def test_duplicate_json_keys_are_rejected_even_with_a_valid_signature() -> None:
    raw = canonical_bytes(payload()).replace(
        b'{"action":"save",',
        b'{"action":"save","action":"save",',
        1,
    )

    with pytest.raises(ModelControlAssertionError):
        authenticate_save(assertion=encode_raw(raw))


def test_noncanonical_json_is_rejected_even_with_a_valid_signature() -> None:
    raw = json.dumps(payload(), separators=(", ", ": ")).encode()

    with pytest.raises(ModelControlAssertionError):
        authenticate_save(assertion=encode_raw(raw))


@pytest.mark.parametrize(
    "invalid_assertion",
    (
        "",
        "one-part",
        "a.b.c",
        "=.AAAA",
        "+.AAAA",
        "/.AAAA",
        "AA==.AAAA",
        "AA.AAAA=",
        "AA.AAA+",
        "AA.AAA/",
        "AA.AA A",
        "é.AAAA",
    ),
)
def test_assertion_requires_strict_unpadded_base64url(invalid_assertion: str) -> None:
    with pytest.raises(ModelControlAssertionError):
        authenticate_save(assertion=invalid_assertion)


def test_invalid_signature_is_rejected_and_compared_in_constant_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    comparisons: list[tuple[object, object]] = []
    real_compare_digest = hmac.compare_digest

    def capture(left: object, right: object) -> bool:
        comparisons.append((left, right))
        return real_compare_digest(cast(Any, left), cast(Any, right))

    monkeypatch.setattr(auth_module.hmac, "compare_digest", capture)

    with pytest.raises(ModelControlAssertionError):
        authenticate_save(
            assertion=encode_assertion(key="other-key-0123456789abcdef0123456789")
        )

    assert any(
        isinstance(left, bytes)
        and isinstance(right, bytes)
        and len(left) == len(right) == hashlib.sha256().digest_size
        for left, right in comparisons
    )


@pytest.mark.parametrize("mutation", (False, True), ids=("get", "mutation"))
def test_duplicate_mixed_case_assertion_headers_are_always_rejected(
    mutation: bool,
) -> None:
    assertion = encode_assertion()
    request_headers = headers(assertion=assertion)
    request_headers.append((b"X-Agent-Control-Assertion", assertion.encode()))

    with pytest.raises(ModelControlAssertionError):
        authenticator().authenticate(
            headers=request_headers,
            action="save" if mutation else None,
            provider="openai" if mutation else None,
            now=NOW,
        )


@pytest.mark.parametrize(
    "oversized_assertion",
    (
        "A" * (ASSERTION_HEADER_MAX_BYTES + 1),
        base64.urlsafe_b64encode(b"x" * (ASSERTION_PAYLOAD_MAX_BYTES + 1))
        .rstrip(b"=")
        .decode()
        + "."
        + "A" * 43,
    ),
    ids=("header", "decoded-payload"),
)
def test_oversized_assertion_fails_before_hmac_or_json_parsing(
    oversized_assertion: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    active_authenticator = authenticator()
    monkeypatch.setattr(
        auth_module.hmac,
        "new",
        lambda *_args, **_kwargs: pytest.fail("oversized assertion reached HMAC"),
    )
    monkeypatch.setattr(
        auth_module.json,
        "loads",
        lambda *_args, **_kwargs: pytest.fail("oversized assertion reached JSON"),
    )

    with pytest.raises(ModelControlAssertionError):
        active_authenticator.authenticate(
            headers=headers(assertion=oversized_assertion),
            action="save",
            provider="openai",
            now=NOW,
        )


def test_public_golden_vector_is_exact_and_runtime_does_not_read_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixture = json.loads(FIXTURE_PATH.read_text())
    assert fixture["description"].startswith("PUBLIC NON-PRODUCTION")
    assert fixture["domain"] == DOMAIN.decode()
    assert (
        fixture["canonicalPayload"]
        == canonical_bytes(json.loads(fixture["canonicalPayload"])).decode()
    )
    assert (
        encode_raw(
            fixture["canonicalPayload"].encode(),
            fixture["testControlKey"],
        )
        == fixture["assertion"]
    )
    assert fixture["assertion"] == (
        f"{fixture['payloadBase64Url']}.{fixture['expectedSignatureBase64Url']}"
    )

    monkeypatch.setattr(
        Path, "read_text", lambda *_args, **_kwargs: pytest.fail("runtime read fixture")
    )
    golden_authenticator = authenticator(control_key=fixture["testControlKey"])
    result = golden_authenticator.authenticate(
        headers=headers(
            key=fixture["testControlKey"],
            assertion=fixture["assertion"],
        ),
        action="save",
        provider="openai",
        now=2_000_000_000,
    )
    assert result is not None


@pytest.mark.parametrize(
    ("issued_at", "expires_at", "now"),
    (
        (100, 101, 98),
        (100, 101, 103),
        (100, 105, 100),
    ),
    ids=("lower-skew-boundary", "upper-skew-boundary", "max-lifetime-boundary"),
)
def test_time_window_accepts_every_exact_valid_boundary(
    issued_at: int,
    expires_at: int,
    now: int,
) -> None:
    result = authenticate_save(
        assertion=encode_assertion(payload(issuedAt=issued_at, expiresAt=expires_at)),
        now=now,
    )
    assert result.issued_at == issued_at
    assert result.expires_at == expires_at


@pytest.mark.parametrize(
    ("issued_at", "expires_at", "now"),
    (
        (100, 100, 100),
        (100, 99, 100),
        (100, 106, 100),
        (100, 101, 97),
        (100, 101, 104),
    ),
    ids=(
        "equal",
        "reverse",
        "lifetime-plus-one",
        "lower-skew-minus-one",
        "upper-skew-plus-one",
    ),
)
def test_time_window_rejects_each_invalid_boundary(
    issued_at: int,
    expires_at: int,
    now: int,
) -> None:
    with pytest.raises(ModelControlAssertionError):
        authenticate_save(
            assertion=encode_assertion(
                payload(issuedAt=issued_at, expiresAt=expires_at)
            ),
            now=now,
        )


@pytest.mark.parametrize("invalid_now", (True, 2_000_000_000.0, "2000000000"))
def test_injected_clock_must_be_an_exact_integer(invalid_now: object) -> None:
    with pytest.raises(ModelControlAssertionError):
        authenticator().authenticate(
            headers=headers(assertion=encode_assertion()),
            action="save",
            provider="openai",
            now=cast(Any, invalid_now),
        )


@pytest.mark.parametrize("provider", MODEL_PROVIDERS)
@pytest.mark.parametrize(
    ("action", "permission"),
    (
        ("save", "admin:assistant:configure"),
        ("test_and_activate", "admin:assistant:configure"),
        ("reveal", "admin:assistant:secret:reveal"),
    ),
)
def test_route_policy_accepts_only_the_exact_action_permission_provider_mapping(
    provider: ModelProvider,
    action: str,
    permission: str,
) -> None:
    assertion = encode_assertion(
        payload(action=action, permission=permission, provider=provider)
    )
    result = authenticator().authenticate(
        headers=headers(assertion=assertion),
        action=cast(Any, action),
        provider=provider,
        now=NOW,
    )
    assert result is not None
    assert result.action == action
    assert result.permission == permission
    assert result.provider == provider


@pytest.mark.parametrize(
    ("assertion_overrides", "route_action", "route_provider"),
    (
        ({"permission": "admin:assistant:secret:reveal"}, "save", "openai"),
        ({"permission": "admin:assistant:configure"}, "reveal", "openai"),
        ({"action": "test_and_activate"}, "save", "openai"),
        ({"provider": "anthropic"}, "save", "openai"),
        ({}, "unknown", "openai"),
        ({}, "save", "local"),
    ),
)
def test_route_policy_rejects_permission_action_and_provider_mismatches(
    assertion_overrides: dict[str, object],
    route_action: object,
    route_provider: object,
) -> None:
    with pytest.raises(ModelControlAssertionError):
        authenticator().authenticate(
            headers=headers(assertion=encode_assertion(payload(**assertion_overrides))),
            action=cast(Any, route_action),
            provider=cast(Any, route_provider),
            now=NOW,
        )


@pytest.mark.parametrize("route", ("list", "runtime-status"))
def test_get_routes_require_only_bearer_and_reject_any_assertion(route: str) -> None:
    del route
    result = authenticator().authenticate(
        headers=headers(),
        action=None,
        provider=None,
        now=NOW,
    )
    assert result is None

    with pytest.raises(ModelControlAssertionError):
        authenticator().authenticate(
            headers=headers(assertion=encode_assertion()),
            action=None,
            provider=None,
            now=NOW,
        )


def test_errors_never_echo_keys_assertions_or_malformed_input() -> None:
    secret_assertion = "private-assertion-body"
    with pytest.raises(ModelControlAssertionError) as error:
        authenticate_save(assertion=secret_assertion)

    rendered = f"{error.value!s} {error.value!r}"
    assert CONTROL_KEY not in rendered
    assert OS_SECURITY_KEY not in rendered
    assert secret_assertion not in rendered
    assert_fixed_error(
        error.value,
        ModelControlAssertionError,
        "model control authorization failed",
    )
