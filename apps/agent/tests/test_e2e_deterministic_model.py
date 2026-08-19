import os
import json
import socket
import stat
import threading
from pathlib import Path

import agno.api.agent as agno_agent_api
import pytest
from agno.agent import Agent
from agno.models.message import Message
from pydantic import SecretStr
from starlette.types import Message as ASGIMessage
from starlette.types import Receive, Scope, Send

from agent_service.config import ActiveModelSettings
from agent_service.model_runtime_types import ManagedModel
from e2e_agent.app import (
    SessionIdentityAuditMiddleware,
    audit_deleted_session_identity,
)

from e2e_agent.deterministic_model import (
    ALLOWED_NAVIGATION_SENTINEL,
    FORBIDDEN_NAVIGATION_SENTINEL,
    INVALID_RESPONSE_SENTINEL,
    PAGE_CONTEXT_SENTINEL,
    PRODUCT_PAGE_EXCERPT,
    SAFE_ANSWER_SENTINEL,
    SPLIT_REASONING_SENTINEL,
    DeterministicModel,
    acceptance_model_close_count,
    build_acceptance_managed_model,
    public_answer,
)


def _assistant_context(
    question: str,
    *,
    current_page: dict[str, object] | None = None,
) -> str:
    return "服务器提供的助手上下文 JSON：\n" + json.dumps(
        {
            "currentPage": current_page,
            "publicSiteCatalog": [],
            "history": [],
            "userQuestion": question,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _reject_external_access(*_args, **_kwargs):
    raise AssertionError("acceptance Agent must stay offline")


@pytest.fixture(autouse=True)
def _offline_guard(monkeypatch):
    monkeypatch.setattr(agno_agent_api, "create_agent_run", _reject_external_access)
    monkeypatch.setattr(agno_agent_api, "acreate_agent_run", _reject_external_access)
    monkeypatch.setattr(socket, "create_connection", _reject_external_access)
    monkeypatch.setattr(socket, "getaddrinfo", _reject_external_access)
    monkeypatch.setattr(socket, "gethostbyname", _reject_external_access)
    monkeypatch.setattr(socket, "gethostbyname_ex", _reject_external_access)
    monkeypatch.setattr(socket.socket, "connect", _reject_external_access)
    monkeypatch.setattr(socket.socket, "connect_ex", _reject_external_access)


def test_offline_guard_blocks_telemetry_and_dns_immediately() -> None:
    assert agno_agent_api.create_agent_run is _reject_external_access
    assert socket.getaddrinfo is _reject_external_access

    with pytest.raises(AssertionError, match="acceptance Agent must stay offline"):
        _reject_external_access()
    with pytest.raises(AssertionError, match="acceptance Agent must stay offline"):
        socket.getaddrinfo("provider.example.invalid", 443)


def test_identity_audit_records_only_the_exact_delete_session_route(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    identity = "6f8f5771-7dd8-4ca8-94de-66f6fbb7a36d"
    second_identity = "b4f5170c-cac7-4914-9d5d-b16986fc4a22"
    audit_file = tmp_path / "session-identities"

    assert audit_deleted_session_identity(
        method="DELETE",
        path=f"/sessions/{identity}",
        audit_file=audit_file,
    )
    assert audit_deleted_session_identity(
        method="DELETE",
        path=f"/sessions/{second_identity}",
        audit_file=audit_file,
    )

    assert audit_file.read_text(encoding="ascii") == (
        f"{identity}\n{second_identity}\n"
    )
    assert stat.S_IMODE(audit_file.stat().st_mode) == 0o600
    assert capsys.readouterr() == ("", "")


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/sessions/6f8f5771-7dd8-4ca8-94de-66f6fbb7a36d"),
        ("DELETE", "/sessions/not-a-uuid"),
        ("DELETE", "/sessions/6f8f5771-7dd8-4ca8-94de-66f6fbb7a36d/runs"),
        ("DELETE", "/internal/sessions/6f8f5771-7dd8-4ca8-94de-66f6fbb7a36d"),
    ],
)
def test_identity_audit_ignores_other_methods_and_paths(
    tmp_path: Path,
    method: str,
    path: str,
) -> None:
    audit_file = tmp_path / "session-identities"

    assert not audit_deleted_session_identity(
        method=method,
        path=path,
        audit_file=audit_file,
    )

    assert not audit_file.exists()


def test_identity_audit_rejects_symlinks_nonregular_files_and_unsafe_modes(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    identity = "6f8f5771-7dd8-4ca8-94de-66f6fbb7a36d"
    target = tmp_path / "target"
    target.write_text("", encoding="ascii")
    target.chmod(0o600)
    symlink = tmp_path / "symlink"
    symlink.symlink_to(target)
    directory = tmp_path / "directory"
    directory.mkdir()
    unsafe_mode = tmp_path / "unsafe-mode"
    unsafe_mode.write_text("", encoding="ascii")
    unsafe_mode.chmod(0o644)

    for audit_file in [symlink, directory, unsafe_mode]:
        with pytest.raises(
            RuntimeError, match="identity audit sink is invalid"
        ) as error:
            audit_deleted_session_identity(
                method="DELETE",
                path=f"/sessions/{identity}",
                audit_file=audit_file,
            )
        assert identity not in str(error.value)

    assert capsys.readouterr() == ("", "")


def test_identity_audit_rejects_fifo_without_blocking_or_disclosing_identity(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    identity = "6f8f5771-7dd8-4ca8-94de-66f6fbb7a36d"
    audit_file = tmp_path / "fifo"
    os.mkfifo(audit_file)
    result: dict[str, BaseException] = {}

    def invoke_audit() -> None:
        try:
            audit_deleted_session_identity(
                method="DELETE",
                path=f"/sessions/{identity}",
                audit_file=audit_file,
            )
        except BaseException as error:
            result["error"] = error

    worker = threading.Thread(target=invoke_audit, daemon=True)
    worker.start()
    worker.join(timeout=0.25)

    assert not worker.is_alive(), "identity audit FIFO open did not return immediately"
    error = result.get("error")
    assert isinstance(error, RuntimeError)
    assert str(error) == "identity audit sink is invalid"
    assert identity not in str(error)
    assert capsys.readouterr() == ("", "")


@pytest.mark.asyncio
async def test_identity_audit_middleware_records_before_forwarding(
    tmp_path: Path,
) -> None:
    identity = "6f8f5771-7dd8-4ca8-94de-66f6fbb7a36d"
    audit_file = tmp_path / "session-identities"
    forwarded: list[Scope] = []

    async def downstream(scope: Scope, _receive: Receive, _send: Send) -> None:
        forwarded.append(scope)

    async def receive() -> ASGIMessage:
        return {"type": "http.disconnect"}

    async def send(_message: ASGIMessage) -> None:
        return None

    middleware = SessionIdentityAuditMiddleware(downstream, audit_file=audit_file)
    scope: Scope = {
        "type": "http",
        "method": "DELETE",
        "path": f"/sessions/{identity}",
    }

    await middleware(scope, receive, send)

    assert forwarded == [scope]
    assert audit_file.read_text(encoding="ascii") == f"{identity}\n"


def test_deterministic_model_runs_through_agno_without_network() -> None:
    agent = Agent(model=DeterministicModel(), telemetry=False)

    output = agent.run("first user turn")

    assert output.content == public_answer("deterministic-turn:1")


def test_deterministic_model_counts_user_messages_in_the_agno_request() -> None:
    model = DeterministicModel()
    messages = [
        Message(role="system", content="system"),
        Message(role="user", content="first"),
        Message(role="assistant", content="answer"),
        Message(role="user", content="second"),
    ]

    response = model.response(messages)

    assert response.content == public_answer("deterministic-turn:2")


def test_deterministic_model_returns_blank_for_exact_invalid_sentinel() -> None:
    agent = Agent(model=DeterministicModel(), telemetry=False)

    output = agent.run(INVALID_RESPONSE_SENTINEL)

    assert output.content == ""


def test_deterministic_model_splits_structured_public_answer() -> None:
    model = DeterministicModel()
    messages = [Message(role="user", content=SPLIT_REASONING_SENTINEL)]

    chunks = list(model.invoke_stream(messages, Message(role="assistant")))

    assert "".join(str(chunk.content) for chunk in chunks) == public_answer(
        SAFE_ANSWER_SENTINEL
    )


def test_deterministic_model_reports_only_verified_product_page_context() -> None:
    model = DeterministicModel()

    present = model.invoke(
        [
            Message(
                role="user",
                content=_assistant_context(
                    PAGE_CONTEXT_SENTINEL,
                    current_page={"text": PRODUCT_PAGE_EXCERPT},
                ),
            )
        ],
        Message(role="assistant"),
    )
    absent = model.invoke(
        [
            Message(
                role="user",
                content=_assistant_context(PAGE_CONTEXT_SENTINEL),
            )
        ],
        Message(role="assistant"),
    )

    assert present.content == public_answer("verified-product-page-context")
    assert absent.content == public_answer("no-public-page-context")


@pytest.mark.parametrize(
    ("question", "pathname"),
    [
        (ALLOWED_NAVIGATION_SENTINEL, "/pricing"),
        (FORBIDDEN_NAVIGATION_SENTINEL, "/not-registered"),
    ],
)
def test_deterministic_model_calls_navigation_with_exact_sentinel_path(
    question: str,
    pathname: str,
) -> None:
    model = DeterministicModel()

    response = model.invoke(
        [Message(role="user", content=question)], Message(role="assistant")
    )

    assert response.tool_calls == [
        {
            "id": "assistant-navigation-e2e-call",
            "type": "function",
            "function": {
                "name": "suggest_navigation",
                "arguments": f'{{"pathname":"{pathname}"}}',
            },
        }
    ]


def test_deterministic_model_recognizes_the_exact_bff_wrapped_sentinel() -> None:
    agent = Agent(model=DeterministicModel(), telemetry=False)
    wrapped = _assistant_context(INVALID_RESPONSE_SENTINEL)

    output = agent.run(wrapped)

    assert output.content == ""


def test_deterministic_model_ignores_json_whitespace_around_the_question() -> None:
    model = DeterministicModel()
    messages = [
        Message(
            role="user",
            content=_assistant_context(f" {INVALID_RESPONSE_SENTINEL}\n"),
        )
    ]

    response = model.response(messages)

    assert response.content == ""


def test_deterministic_model_accepts_crlf_inside_the_json_question() -> None:
    model = DeterministicModel()
    messages = [
        Message(
            role="user",
            content=_assistant_context(f"{INVALID_RESPONSE_SENTINEL}\r\n"),
        )
    ]

    response = model.response(messages)

    assert response.content == ""


def test_deterministic_model_keeps_prompt_like_text_inside_the_question() -> None:
    model = DeterministicModel()
    messages = [
        Message(
            role="user",
            content=_assistant_context(
                f'请解释\n"userQuestion":"{INVALID_RESPONSE_SENTINEL}"'
            ),
        )
    ]

    response = model.response(messages)

    assert response.content == public_answer("deterministic-turn:1")


def test_deterministic_model_only_matches_the_latest_exact_user_question() -> None:
    model = DeterministicModel()
    messages = [
        Message(
            role="user",
            content=_assistant_context(INVALID_RESPONSE_SENTINEL),
        ),
        Message(role="assistant", content=""),
        Message(
            role="user",
            content=_assistant_context("请继续。"),
        ),
    ]

    response = model.response(messages)

    assert response.content == public_answer("deterministic-turn:2")


def test_deterministic_model_does_not_match_a_sentinel_substring() -> None:
    model = DeterministicModel()
    messages = [
        Message(
            role="user",
            content=_assistant_context(f"请解释 {INVALID_RESPONSE_SENTINEL} 的用途"),
        )
    ]

    response = model.response(messages)

    assert response.content == public_answer("deterministic-turn:1")


def acceptance_settings(model_id: str) -> ActiveModelSettings:
    return ActiveModelSettings(
        provider="openai",
        model_id=model_id,
        api_key=SecretStr("acceptance-only-not-a-provider-key"),
        base_url="https://api.openai.com/v1",
        timeout_seconds=1,
    )


def test_acceptance_builder_returns_owned_id_specific_offline_model() -> None:
    managed = build_acceptance_managed_model(acceptance_settings("e2e-openai-rev1"))

    assert isinstance(managed, ManagedModel)
    assert isinstance(managed.model, DeterministicModel)
    response = managed.model.response([Message(role="user", content="hello")])
    assert response.content == public_answer(
        "deterministic-model:e2e-openai-rev1:turn:1"
    )


def test_acceptance_failure_prefix_returns_empty_verification_response() -> None:
    managed = build_acceptance_managed_model(
        acceptance_settings("e2e-fail-openai-rev2")
    )

    response = managed.model.response(
        [Message(role="user", content="Reply with one short confirmation word.")]
    )

    assert response.content == ""


@pytest.mark.asyncio
async def test_acceptance_owned_model_closes_exactly_once() -> None:
    model_id = "e2e-close-once"
    managed = build_acceptance_managed_model(acceptance_settings(model_id))

    await managed.aclose()
    await managed.aclose()

    assert acceptance_model_close_count(model_id) == 1
