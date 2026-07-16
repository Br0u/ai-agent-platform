from collections.abc import Iterator
from contextlib import contextmanager
import os
import socket
import sys
from types import SimpleNamespace
from typing import Any

import agno.api.agent as agno_agent_api
import pytest
from agno.models.openai import OpenAIResponses
from pydantic import ValidationError

from agent_service.default_agent import MADUODUO_INSTRUCTIONS
import agent_service.provider_smoke as provider_smoke
from agent_service.provider_smoke import (
    MAX_RESPONSE_CODE_POINTS,
    PROVIDER_SMOKE_PROMPT,
    ProviderSmokeSettings,
    build_smoke_agent,
    main,
)


MODEL_API_KEY = "provider-smoke-key-that-must-never-be-printed"
MODEL_BASE_URL = "https://provider-smoke.example.invalid/v1"
MODEL_ID = "safe-smoke-model"


def _reject_external_access(*_args: object, **_kwargs: object) -> None:
    raise AssertionError("provider smoke unit tests must stay offline")


@pytest.fixture(autouse=True)
def isolated_smoke_environment(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    for name in (
        "MODEL_PROVIDER",
        "MODEL_ID",
        "MODEL_API_KEY",
        "MODEL_BASE_URL",
        "MODEL_RUN_TIMEOUT_SECONDS",
        "OS_SECURITY_KEY",
        "AGNO_DATABASE_URL",
    ):
        monkeypatch.delenv(name, raising=False)
        monkeypatch.delenv(name.lower(), raising=False)
    monkeypatch.setattr(agno_agent_api, "create_agent_run", _reject_external_access)
    monkeypatch.setattr(agno_agent_api, "acreate_agent_run", _reject_external_access)
    monkeypatch.setattr(socket, "create_connection", _reject_external_access)
    monkeypatch.setattr(socket, "getaddrinfo", _reject_external_access)
    monkeypatch.setattr(socket.socket, "connect", _reject_external_access)
    yield


def _valid_settings() -> ProviderSmokeSettings:
    return ProviderSmokeSettings.model_validate(
        {
            "MODEL_PROVIDER": "openai",
            "MODEL_ID": MODEL_ID,
            "MODEL_API_KEY": MODEL_API_KEY,
            "MODEL_BASE_URL": MODEL_BASE_URL,
            "MODEL_RUN_TIMEOUT_SECONDS": 12,
        }
    )


def test_provider_smoke_settings_are_model_only_and_always_required() -> None:
    assert set(ProviderSmokeSettings.model_fields) == {
        "model_provider",
        "model_id",
        "model_api_key",
        "model_base_url",
        "model_run_timeout_seconds",
    }
    with pytest.raises(ValidationError):
        ProviderSmokeSettings(_env_file=None)

    settings = _valid_settings()

    assert settings.active_model.provider == "openai"
    assert settings.active_model.model_id == MODEL_ID
    assert settings.active_model.api_key.get_secret_value() == MODEL_API_KEY
    assert settings.active_model.base_url == MODEL_BASE_URL
    assert settings.active_model.timeout_seconds == 12
    assert not hasattr(settings, "agno_database_url")
    assert not hasattr(settings, "os_security_key")


def test_build_smoke_agent_reuses_identity_rules_without_state_or_tools() -> None:
    model = OpenAIResponses(id="offline-model", api_key="offline-key")

    agent = build_smoke_agent(model)

    assert agent.model is model
    assert agent.db is None
    assert agent.instructions == list(MADUODUO_INSTRUCTIONS)
    assert agent.add_history_to_context is False
    assert agent.tools == []
    assert agent.telemetry is False


class _FakeAgent:
    def __init__(
        self,
        output: object,
        error: BaseException | None = None,
        buffered_output: bool = False,
    ) -> None:
        self.output = output
        self.error = error
        self.buffered_output = buffered_output
        self.prompts: list[str] = []

    def run(self, prompt: str) -> object:
        self.prompts.append(prompt)
        os.write(1, b"suppressed invocation stdout\n")
        os.write(2, b"suppressed invocation stderr\n")
        if self.buffered_output:
            sys.stdout.write("buffered provider stdout")
            sys.stderr.write("buffered provider stderr")
        if self.error is not None:
            raise self.error
        return SimpleNamespace(content=self.output)


def _invoke(
    *,
    output: object = "private provider answer",
    run_error: BaseException | None = None,
    model_error: BaseException | None = None,
    buffered_output: bool = False,
) -> tuple[int, _FakeAgent, list[dict[str, Any]]]:
    fake_agent = _FakeAgent(output, run_error, buffered_output)
    agent_arguments: list[dict[str, Any]] = []

    def model_builder(_settings: object) -> object:
        if model_error is not None:
            raise model_error
        return object()

    def agent_factory(**kwargs: Any) -> _FakeAgent:
        agent_arguments.append(kwargs)
        return fake_agent

    exit_code = main(
        [],
        settings_factory=lambda **_kwargs: _valid_settings(),
        model_builder=model_builder,
        agent_factory=agent_factory,
    )
    return exit_code, fake_agent, agent_arguments


def test_one_shot_success_suppresses_invocation_and_prints_only_safe_label(
    capfd: pytest.CaptureFixture[str],
) -> None:
    exit_code, fake_agent, agent_arguments = _invoke(
        output=f"private answer containing {MODEL_API_KEY} and {MODEL_BASE_URL}"
    )

    assert exit_code == 0
    assert fake_agent.prompts == [PROVIDER_SMOKE_PROMPT]
    assert agent_arguments == [
        {
            "model": agent_arguments[0]["model"],
            "instructions": list(MADUODUO_INSTRUCTIONS),
            "add_history_to_context": False,
            "tools": None,
            "telemetry": False,
        }
    ]
    assert capfd.readouterr() == (f"openai/{MODEL_ID}: verified\n", "")


@pytest.mark.parametrize("content", [None, "", "   ", "x" * (MAX_RESPONSE_CODE_POINTS + 1)])
def test_blank_or_oversize_responses_fail_with_only_a_stable_category(
    content: object,
    capfd: pytest.CaptureFixture[str],
) -> None:
    exit_code, _agent, _arguments = _invoke(output=content)

    assert exit_code != 0
    assert capfd.readouterr() == ("", "provider smoke failed: response\n")


@pytest.mark.parametrize(
    "failure",
    [
        RuntimeError(f"raw exception {MODEL_API_KEY}"),
        ValueError(f"raw URL {MODEL_BASE_URL}"),
    ],
)
def test_invocation_exceptions_never_leak_raw_details(
    failure: BaseException,
    capfd: pytest.CaptureFixture[str],
) -> None:
    exit_code, _agent, _arguments = _invoke(run_error=failure)

    assert exit_code != 0
    assert capfd.readouterr() == ("", "provider smoke failed: invocation\n")


def test_buffered_invocation_output_is_suppressed_even_when_run_raises(
    capfd: pytest.CaptureFixture[str],
) -> None:
    exit_code, _agent, _arguments = _invoke(
        run_error=RuntimeError(MODEL_API_KEY),
        buffered_output=True,
    )

    assert exit_code != 0
    assert capfd.readouterr() == ("", "provider smoke failed: invocation\n")


def test_model_construction_failure_is_sanitized(
    capfd: pytest.CaptureFixture[str],
) -> None:
    exit_code, _agent, _arguments = _invoke(
        model_error=RuntimeError(f"provider key {MODEL_API_KEY}")
    )

    assert exit_code != 0
    assert capfd.readouterr() == ("", "provider smoke failed: invocation\n")


def test_configuration_failure_is_sanitized(
    capfd: pytest.CaptureFixture[str],
) -> None:
    def invalid_settings(**_kwargs: object) -> ProviderSmokeSettings:
        raise ValueError(f"configuration included {MODEL_API_KEY}")

    exit_code = main([], settings_factory=invalid_settings)

    assert exit_code != 0
    assert capfd.readouterr() == ("", "provider smoke failed: configuration\n")


def test_validate_only_checks_settings_without_constructing_a_model(
    capfd: pytest.CaptureFixture[str],
) -> None:
    calls: list[str] = []

    exit_code = main(
        ["--validate-only"],
        settings_factory=lambda **_kwargs: _valid_settings(),
        model_builder=lambda _settings: calls.append("model"),
    )

    assert exit_code == 0
    assert calls == []
    assert capfd.readouterr() == ("", "")


def test_unknown_cli_arguments_fail_without_argparse_diagnostics(
    capfd: pytest.CaptureFixture[str],
) -> None:
    exit_code = main([f"--secret={MODEL_API_KEY}"])

    assert exit_code != 0
    assert capfd.readouterr() == ("", "provider smoke failed: arguments\n")


def test_output_suppression_setup_failure_is_sanitized(
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    @contextmanager
    def fail_suppression() -> Iterator[None]:
        raise OSError(f"raw fd error {MODEL_API_KEY}")
        yield

    monkeypatch.setattr(
        provider_smoke,
        "_suppress_process_output",
        fail_suppression,
    )

    exit_code = main([], settings_factory=lambda **_kwargs: _valid_settings())

    assert exit_code != 0
    assert capfd.readouterr() == ("", "provider smoke failed: invocation\n")
