from collections.abc import Iterator
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import textwrap
import time
from types import SimpleNamespace
from typing import Any

import agno.api.agent as agno_agent_api
import pytest
from agno.models.openai import OpenAIResponses
from pydantic import ValidationError

import agent_service.provider_smoke as provider_smoke
from agent_service.default_agent import MADUODUO_INSTRUCTIONS
from agent_service.provider_smoke import (
    MAX_RESPONSE_CODE_POINTS,
    PROVIDER_SMOKE_PROMPT,
    ProviderSmokeSettings,
    SmokeStatus,
    _invoke_provider,
    _worker_main,
    build_smoke_agent,
    main,
    run_isolated_smoke,
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
        "AAP_PROVIDER_SMOKE_STATUS_FD",
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
    assert settings.model_provider == "openai"
    assert settings.model_base_url == MODEL_BASE_URL
    assert settings.model_run_timeout_seconds == 12
    assert isinstance(settings.model_run_timeout_seconds, int)
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
    ) -> None:
        self.output = output
        self.error = error
        self.prompts: list[str] = []
        self.closed = False

    def run(self, prompt: str) -> object:
        self.prompts.append(prompt)
        if self.error is not None:
            raise self.error
        return SimpleNamespace(content=self.output)

    def close(self) -> None:
        self.closed = True


def _invoke(
    *,
    output: object = "private provider answer",
    run_error: BaseException | None = None,
    model_error: BaseException | None = None,
) -> tuple[str, _FakeAgent, list[dict[str, Any]]]:
    fake_agent = _FakeAgent(output, run_error)
    agent_arguments: list[dict[str, Any]] = []

    def model_builder(_settings: object) -> object:
        if model_error is not None:
            raise model_error
        return object()

    def agent_factory(**kwargs: Any) -> _FakeAgent:
        agent_arguments.append(kwargs)
        return fake_agent

    status = _invoke_provider(
        _valid_settings(),
        model_builder=model_builder,
        agent_factory=agent_factory,
    )
    return status, fake_agent, agent_arguments


def test_injected_one_shot_success_uses_fixed_prompt_and_safe_agent() -> None:
    status, fake_agent, agent_arguments = _invoke(
        output=f"private answer containing {MODEL_API_KEY} and {MODEL_BASE_URL}"
    )

    assert status == "verified"
    assert fake_agent.prompts == [PROVIDER_SMOKE_PROMPT]
    assert fake_agent.closed is True
    assert agent_arguments == [
        {
            "model": agent_arguments[0]["model"],
            "instructions": list(MADUODUO_INSTRUCTIONS),
            "add_history_to_context": False,
            "tools": None,
            "telemetry": False,
        }
    ]


@pytest.mark.parametrize("content", [None, "", "   ", "x" * (MAX_RESPONSE_CODE_POINTS + 1)])
def test_blank_or_oversize_responses_fail_with_only_a_stable_category(
    content: object,
) -> None:
    status, _agent, _arguments = _invoke(output=content)

    assert status == "response"


@pytest.mark.parametrize(
    "failure",
    [
        RuntimeError(f"raw exception {MODEL_API_KEY}"),
        ValueError(f"raw URL {MODEL_BASE_URL}"),
    ],
)
def test_invocation_exceptions_never_leak_raw_details(
    failure: BaseException,
) -> None:
    status, _agent, _arguments = _invoke(run_error=failure)

    assert status == "invocation"


def test_model_construction_failure_is_sanitized() -> None:
    status, _agent, _arguments = _invoke(
        model_error=RuntimeError(f"provider key {MODEL_API_KEY}")
    )

    assert status == "invocation"


def test_close_failure_maps_to_invocation_without_exposing_exception() -> None:
    class CloseFailureResult:
        content = "private answer"

        def close(self) -> None:
            raise RuntimeError(f"close failed {MODEL_API_KEY}")

    class CloseFailureAgent(_FakeAgent):
        def run(self, prompt: str) -> object:
            self.prompts.append(prompt)
            return CloseFailureResult()

    fake_agent = CloseFailureAgent("unused")

    status = _invoke_provider(
        _valid_settings(),
        model_builder=lambda _settings: object(),
        agent_factory=lambda **_kwargs: fake_agent,
    )

    assert status == "invocation"


def test_close_failure_still_closes_every_constructed_resource() -> None:
    closed: list[str] = []

    class Resource:
        def __init__(self, name: str, *, fail: bool = False) -> None:
            self.name = name
            self.fail = fail

        def close(self) -> None:
            closed.append(self.name)
            if self.fail:
                raise RuntimeError(MODEL_API_KEY)

    class Result(Resource):
        content = "private answer"

    class AgentResource(Resource):
        def run(self, _prompt: str) -> object:
            return Result("result", fail=True)

    status = _invoke_provider(
        _valid_settings(),
        model_builder=lambda _settings: Resource("model"),
        agent_factory=lambda **_kwargs: AgentResource("agent"),
    )

    assert status == "invocation"
    assert closed == ["result", "agent", "model"]


def test_configuration_failure_is_sanitized(
    capfd: pytest.CaptureFixture[str],
) -> None:
    def invalid_settings(**_kwargs: object) -> ProviderSmokeSettings:
        raise ValueError(f"configuration included {MODEL_API_KEY}")

    exit_code = main(
        [],
        settings_factory=invalid_settings,
        isolated_runner=lambda _settings: "verified",
    )

    assert exit_code != 0
    assert capfd.readouterr() == ("", "provider smoke failed: configuration\n")


def test_validate_only_checks_settings_without_constructing_a_model(
    capfd: pytest.CaptureFixture[str],
) -> None:
    calls: list[str] = []

    def isolated_runner(_settings: ProviderSmokeSettings) -> SmokeStatus:
        calls.append("worker")
        return "verified"

    exit_code = main(
        ["--validate-only"],
        settings_factory=lambda **_kwargs: _valid_settings(),
        isolated_runner=isolated_runner,
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


def test_success_prints_only_safe_label_from_isolated_status(
    capfd: pytest.CaptureFixture[str],
) -> None:
    exit_code = main(
        [],
        settings_factory=lambda **_kwargs: _valid_settings(),
        isolated_runner=lambda _settings: "verified",
    )

    assert exit_code == 0
    assert capfd.readouterr() == (f"openai/{MODEL_ID}: verified\n", "")


def test_worker_rejects_stdout_as_a_status_channel(
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv("AAP_PROVIDER_SMOKE_STATUS_FD", "1")

    exit_code = _worker_main(
        settings_factory=lambda **_kwargs: _valid_settings(),
        model_builder=lambda _settings: object(),
        agent_factory=lambda **_kwargs: _FakeAgent("private answer"),
    )

    assert exit_code != 0
    assert capfd.readouterr() == ("", "")


def _write_worker_script(tmp_path: Path, source: str) -> list[str]:
    script = tmp_path / "provider-smoke-worker.py"
    script.write_text(textwrap.dedent(source), encoding="utf-8")
    return [sys.executable, str(script)]


class _ParentAbort(BaseException):
    pass


def test_isolated_worker_maps_status_pipe_creation_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        provider_smoke.os,
        "pipe",
        lambda: (_ for _ in ()).throw(OSError("raw pipe failure")),
    )

    assert run_isolated_smoke(_valid_settings(), timeout_seconds=0.1) == "invocation"


@pytest.mark.parametrize(
    "wait_error",
    [KeyboardInterrupt(), _ParentAbort("parent aborted")],
    ids=["keyboard-interrupt", "arbitrary-base-exception"],
)
def test_isolated_worker_reaps_process_group_when_parent_wait_is_interrupted(
    wait_error: BaseException,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class InterruptedProcess:
        pid = 43_210
        returncode: int | None = None
        wait_calls = 0

        def wait(self, timeout: float | None = None) -> int:
            del timeout
            self.wait_calls += 1
            if self.wait_calls == 1:
                raise wait_error
            self.returncode = -signal.SIGKILL
            return self.returncode

        def kill(self) -> None:
            raise AssertionError("process-group termination should be attempted first")

    process = InterruptedProcess()
    popen_options: dict[str, object] = {}
    killed_groups: list[tuple[int, int]] = []

    def fake_popen(
        _command: object,
        **options: object,
    ) -> InterruptedProcess:
        popen_options.update(options)
        return process

    monkeypatch.setattr(provider_smoke.subprocess, "Popen", fake_popen)
    monkeypatch.setattr(
        provider_smoke.os,
        "killpg",
        lambda process_group, sent_signal: killed_groups.append(
            (process_group, sent_signal)
        ),
    )

    try:
        status = run_isolated_smoke(_valid_settings(), timeout_seconds=0.1)
    except BaseException as error:  # pragma: no cover - assertion for RED behavior
        pytest.fail(f"parent wait interruption escaped: {type(error).__name__}")

    assert status == "invocation"
    assert popen_options["start_new_session"] is True
    assert killed_groups == [(process.pid, signal.SIGKILL)]
    assert process.wait_calls == 2


def test_isolated_worker_maps_termination_and_reap_failures_without_raw_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class ResistantProcess:
        pid = 43_211
        returncode: int | None = None
        wait_calls = 0
        direct_kill_calls = 0

        def wait(self, timeout: float | None = None) -> int:
            self.wait_calls += 1
            if self.wait_calls == 1:
                raise subprocess.TimeoutExpired("worker", timeout or 0.0)
            if self.wait_calls == 2:
                raise OSError("raw reap failure")
            self.returncode = -signal.SIGKILL
            return self.returncode

        def kill(self) -> None:
            self.direct_kill_calls += 1

    process = ResistantProcess()
    monkeypatch.setattr(
        provider_smoke.subprocess,
        "Popen",
        lambda *_args, **_kwargs: process,
    )
    monkeypatch.setattr(
        provider_smoke.os,
        "killpg",
        lambda *_args: (_ for _ in ()).throw(OSError("raw group kill failure")),
    )

    status = run_isolated_smoke(_valid_settings(), timeout_seconds=0.1)

    assert status == "timeout"
    assert process.direct_kill_calls >= 1
    assert process.wait_calls >= 3


def test_isolated_worker_timeout_removes_worker_and_grandchild_processes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pid_file = tmp_path / "worker-tree-pids"
    monkeypatch.setenv("AAP_PROVIDER_SMOKE_TEST_PID_FILE", str(pid_file))
    command = _write_worker_script(
        tmp_path,
        """
        import os
        from pathlib import Path
        import subprocess
        import sys
        import time

        child = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(60)"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        Path(os.environ["AAP_PROVIDER_SMOKE_TEST_PID_FILE"]).write_text(
            f"{os.getpid()} {child.pid}",
            encoding="ascii",
        )
        time.sleep(60)
        """,
    )

    status = run_isolated_smoke(
        _valid_settings(),
        worker_command=command,
        timeout_seconds=0.5,
    )

    assert status == "timeout"
    worker_pid, child_pid = (int(value) for value in pid_file.read_text().split())
    for pid in (worker_pid, child_pid):
        for _attempt in range(100):
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.01)
        else:
            pytest.fail(f"provider smoke process survived timeout: {pid}")


def test_isolated_worker_discards_build_run_close_destructor_and_delayed_output(
    tmp_path: Path,
    capfd: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    killed_process_groups: list[int] = []
    monkeypatch.setattr(
        provider_smoke.os,
        "killpg",
        lambda process_group, _signal: killed_process_groups.append(process_group),
    )
    command = _write_worker_script(
        tmp_path,
        f"""
        import os
        import sys
        import threading
        import time
        sys.path.insert(0, {str(Path(__file__).resolve().parents[1] / "src")!r})
        from types import SimpleNamespace
        from agent_service.provider_smoke import ProviderSmokeSettings, _invoke_provider

        key = os.environ["MODEL_API_KEY"]
        url = os.environ["MODEL_BASE_URL"]

        class Noisy:
            def __init__(self, name):
                self.name = name
            def close(self):
                print(f"close {{self.name}} {{key}} {{url}}")
            def __del__(self):
                print(f"del {{self.name}} {{key}} {{url}}")

        class Result(Noisy):
            content = "private provider answer"

        class FakeAgent(Noisy):
            def run(self, prompt):
                print(f"run {{prompt}} {{key}} {{url}}")
                threading.Thread(
                    target=lambda: (time.sleep(0.05), print(f"delayed {{key}} {{url}}")),
                ).start()
                return Result("result")

        settings = ProviderSmokeSettings(_env_file=None)
        status = _invoke_provider(
            settings,
            model_builder=lambda _settings: Noisy("model"),
            agent_factory=lambda **_kwargs: FakeAgent("agent"),
        )
        os.write(int(os.environ["AAP_PROVIDER_SMOKE_STATUS_FD"]), status.encode("ascii"))
        raise SystemExit(0 if status == "verified" else 1)
        """,
    )

    status = run_isolated_smoke(
        _valid_settings(),
        worker_command=command,
        timeout_seconds=1.0,
    )

    assert status == "verified"
    assert capfd.readouterr() == ("", "")
    assert MODEL_API_KEY not in " ".join(command)
    assert MODEL_BASE_URL not in " ".join(command)
    assert PROVIDER_SMOKE_PROMPT not in " ".join(command)
    assert killed_process_groups == []


def test_isolated_worker_maps_close_exception_without_leaking(
    tmp_path: Path,
    capfd: pytest.CaptureFixture[str],
) -> None:
    command = _write_worker_script(
        tmp_path,
        f"""
        import os
        import sys
        sys.path.insert(0, {str(Path(__file__).resolve().parents[1] / "src")!r})
        from agent_service.provider_smoke import ProviderSmokeSettings, _invoke_provider

        class Result:
            content = "private answer"
            def close(self):
                raise RuntimeError(os.environ["MODEL_API_KEY"])

        class FakeAgent:
            def run(self, _prompt):
                return Result()

        status = _invoke_provider(
            ProviderSmokeSettings(_env_file=None),
            model_builder=lambda _settings: object(),
            agent_factory=lambda **_kwargs: FakeAgent(),
        )
        os.write(int(os.environ["AAP_PROVIDER_SMOKE_STATUS_FD"]), status.encode("ascii"))
        raise SystemExit(0 if status == "verified" else 1)
        """,
    )

    status = run_isolated_smoke(
        _valid_settings(),
        worker_command=command,
        timeout_seconds=1.0,
    )

    assert status == "invocation"
    assert capfd.readouterr() == ("", "")


def test_isolated_worker_requires_verified_status_and_zero_exit(
    tmp_path: Path,
    capfd: pytest.CaptureFixture[str],
) -> None:
    command = _write_worker_script(
        tmp_path,
        """
        import os

        os.write(
            int(os.environ["AAP_PROVIDER_SMOKE_STATUS_FD"]),
            b"verified",
        )
        raise SystemExit(9)
        """,
    )

    status = run_isolated_smoke(
        _valid_settings(),
        worker_command=command,
        timeout_seconds=1.0,
    )

    assert status == "invocation"
    assert capfd.readouterr() == ("", "")


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("import time; time.sleep(5)", "timeout"),
        (f"import os, signal; os.kill(os.getpid(), {signal.SIGTERM})", "signal"),
        ("raise RuntimeError('raw provider failure')", "invocation"),
    ],
    ids=["timeout", "signal", "exception"],
)
def test_isolated_worker_maps_process_failures_to_stable_categories(
    source: str,
    expected: str,
    tmp_path: Path,
    capfd: pytest.CaptureFixture[str],
) -> None:
    command = _write_worker_script(tmp_path, source)

    status = run_isolated_smoke(
        _valid_settings(),
        worker_command=command,
        timeout_seconds=0.1,
    )

    assert status == expected
    assert capfd.readouterr() == ("", "")
