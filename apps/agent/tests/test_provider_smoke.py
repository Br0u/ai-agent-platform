import asyncio
from collections.abc import Iterator
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import textwrap
import time

import pytest
from agno.models.openai import OpenAIResponses
from pydantic import ValidationError

import agent_service.provider_smoke as provider_smoke
from agent_service.model_runtime_types import ManagedModel
from agent_service.model_verifier import ModelVerificationResult
from agent_service.provider_smoke import (
    ProviderSmokeSettings,
    SmokeStatus,
    _invoke_provider,
    _worker_main,
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


def _managed(closed: list[str], *, close_fails: bool = False) -> ManagedModel:
    async def close_callback() -> None:
        closed.append("closed")
        if close_fails:
            raise RuntimeError(f"private close error {MODEL_API_KEY}")

    return ManagedModel(
        model=OpenAIResponses(id="offline-smoke", api_key="offline-key"),
        close_callback=close_callback,
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


@pytest.mark.parametrize(
    ("verification", "expected"),
    [
        (ModelVerificationResult(True, "success"), "verified"),
        (
            ModelVerificationResult(False, "credential_rejected"),
            "credential_rejected",
        ),
        (ModelVerificationResult(False, "model_not_found"), "model_not_found"),
        (
            ModelVerificationResult(False, "provider_unreachable"),
            "provider_unreachable",
        ),
        (ModelVerificationResult(False, "provider_timeout"), "provider_timeout"),
    ],
)
def test_worker_core_builds_once_uses_shared_verifier_and_always_closes(
    verification: ModelVerificationResult,
    expected: SmokeStatus,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    built: list[object] = []
    verified: list[tuple[ManagedModel, int]] = []
    closed: list[str] = []
    managed = _managed(closed)

    def builder(settings: object) -> ManagedModel:
        built.append(settings)
        return managed

    async def verifier(
        candidate: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        verified.append((candidate, timeout_seconds))
        return verification

    monkeypatch.setattr(provider_smoke, "verify_model", verifier)

    status = asyncio.run(
        _invoke_provider(
            _valid_settings(),
            model_builder=builder,
        )
    )

    assert status == expected
    assert len(built) == 1
    assert verified == [(managed, 12)]
    assert closed == ["closed"]


@pytest.mark.parametrize("failure_phase", ["build", "verify", "close"])
def test_worker_core_sanitizes_every_failure_and_closes_when_owned(
    failure_phase: str,
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    closed: list[str] = []
    managed = _managed(closed, close_fails=failure_phase == "close")

    def builder(_settings: object) -> ManagedModel:
        if failure_phase == "build":
            raise RuntimeError(f"private build {MODEL_API_KEY} {MODEL_BASE_URL}")
        return managed

    async def verifier(
        _candidate: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        del timeout_seconds
        if failure_phase == "verify":
            raise RuntimeError(f"private verify {MODEL_API_KEY} {MODEL_BASE_URL}")
        return ModelVerificationResult(True, "success")

    monkeypatch.setattr(provider_smoke, "verify_model", verifier)

    status = asyncio.run(
        _invoke_provider(
            _valid_settings(),
            model_builder=builder,
        )
    )

    assert status == "invocation"
    assert closed == ([] if failure_phase == "build" else ["closed"])
    assert capfd.readouterr() == ("", "")


def test_worker_core_propagates_cancellation_during_verification_after_close(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    verification_entered = asyncio.Event()
    close_finished = asyncio.Event()
    close_calls = 0

    async def close_callback() -> None:
        nonlocal close_calls
        close_calls += 1
        await asyncio.sleep(0)
        close_finished.set()

    managed = ManagedModel(
        model=OpenAIResponses(id="offline-smoke", api_key="offline-key"),
        close_callback=close_callback,
    )

    async def verifier(
        _candidate: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        del timeout_seconds
        verification_entered.set()
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    monkeypatch.setattr(provider_smoke, "verify_model", verifier)

    async def scenario() -> None:
        worker = asyncio.create_task(
            _invoke_provider(
                _valid_settings(),
                model_builder=lambda _settings: managed,
            )
        )
        await verification_entered.wait()
        worker.cancel()

        with pytest.raises(asyncio.CancelledError):
            await worker
        assert close_calls == 1
        assert close_finished.is_set()

    asyncio.run(scenario())


def test_worker_core_propagates_close_cancellation_while_close_finishes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    close_entered = asyncio.Event()
    release_close = asyncio.Event()
    close_finished = asyncio.Event()
    close_calls = 0

    async def close_callback() -> None:
        nonlocal close_calls
        close_calls += 1
        close_entered.set()
        await release_close.wait()
        close_finished.set()

    managed = ManagedModel(
        model=OpenAIResponses(id="offline-smoke", api_key="offline-key"),
        close_callback=close_callback,
    )

    async def verifier(
        _candidate: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        del timeout_seconds
        return ModelVerificationResult(True, "success")

    monkeypatch.setattr(provider_smoke, "verify_model", verifier)

    async def scenario() -> None:
        worker = asyncio.create_task(
            _invoke_provider(
                _valid_settings(),
                model_builder=lambda _settings: managed,
            )
        )
        await close_entered.wait()
        worker.cancel()
        try:
            with pytest.raises(asyncio.CancelledError):
                await worker
        finally:
            release_close.set()
            await asyncio.wait_for(close_finished.wait(), timeout=1)
        assert close_calls == 1

    asyncio.run(scenario())


def test_configuration_and_argument_failures_are_sanitized(
    capfd: pytest.CaptureFixture[str],
) -> None:
    def invalid_settings(**_kwargs: object) -> ProviderSmokeSettings:
        raise ValueError(f"configuration included {MODEL_API_KEY}")

    assert main([], settings_factory=invalid_settings) == 1
    assert capfd.readouterr() == ("", "provider smoke failed: configuration\n")

    assert main([f"--secret={MODEL_API_KEY}"]) == 2
    assert capfd.readouterr() == ("", "provider smoke failed: arguments\n")


def test_validate_only_does_not_start_worker(
    capfd: pytest.CaptureFixture[str],
) -> None:
    calls: list[str] = []

    def isolated_runner(_settings: ProviderSmokeSettings) -> SmokeStatus:
        calls.append("worker")
        return "verified"

    assert (
        main(
            ["--validate-only"],
            settings_factory=lambda **_kwargs: _valid_settings(),
            isolated_runner=isolated_runner,
        )
        == 0
    )
    assert calls == []
    assert capfd.readouterr() == ("", "")


def test_success_prints_exact_safe_label_and_failure_uses_only_category(
    capfd: pytest.CaptureFixture[str],
) -> None:
    def settings_factory(**_kwargs: object) -> ProviderSmokeSettings:
        return _valid_settings()

    assert (
        main(
            [],
            settings_factory=settings_factory,
            isolated_runner=lambda _settings: "verified",
        )
        == 0
    )
    assert capfd.readouterr() == (f"openai/{MODEL_ID}: verified\n", "")

    assert (
        main(
            [],
            settings_factory=settings_factory,
            isolated_runner=lambda _settings: "credential_rejected",
        )
        == 1
    )
    assert capfd.readouterr() == (
        "",
        "provider smoke failed: credential_rejected\n",
    )


def test_worker_main_uses_private_pipe_and_closes_managed_model(
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    read_fd, write_fd = os.pipe()
    closed: list[str] = []

    async def verifier(
        _candidate: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        assert timeout_seconds == 12
        return ModelVerificationResult(True, "success")

    monkeypatch.setenv("AAP_PROVIDER_SMOKE_STATUS_FD", str(write_fd))
    monkeypatch.setattr(provider_smoke, "verify_model", verifier)

    try:
        exit_code = _worker_main(
            settings_factory=lambda **_kwargs: _valid_settings(),
            model_builder=lambda _settings: _managed(closed),
        )
        payload = os.read(read_fd, 64)
    finally:
        os.close(read_fd)

    assert exit_code == 0
    assert payload == b"verified"
    assert closed == ["closed"]
    assert capfd.readouterr() == ("", "")


def test_worker_rejects_stdout_as_status_channel(
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    closed: list[str] = []
    monkeypatch.setenv("AAP_PROVIDER_SMOKE_STATUS_FD", "1")

    async def verifier(
        _candidate: ManagedModel,
        *,
        timeout_seconds: int,
    ) -> ModelVerificationResult:
        del timeout_seconds
        return ModelVerificationResult(True, "success")

    monkeypatch.setattr(provider_smoke, "verify_model", verifier)

    exit_code = _worker_main(
        settings_factory=lambda **_kwargs: _valid_settings(),
        model_builder=lambda _settings: _managed(closed),
    )

    assert exit_code == 1
    assert closed == ["closed"]
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

    status = run_isolated_smoke(_valid_settings(), timeout_seconds=0.1)

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


def test_isolated_worker_runs_shared_verifier_and_discards_all_output(
    tmp_path: Path,
    capfd: pytest.CaptureFixture[str],
) -> None:
    command = _write_worker_script(
        tmp_path,
        f"""
        import asyncio
        from collections.abc import AsyncIterator, Iterator
        from dataclasses import dataclass
        import os
        import sys
        sys.path.insert(0, {str(Path(__file__).resolve().parents[1] / "src")!r})

        from agno.models.base import Model
        from agno.models.message import Message
        from agno.models.response import ModelResponse
        from agent_service.model_runtime_types import ManagedModel
        from agent_service.provider_smoke import ProviderSmokeSettings, _invoke_provider

        key = os.environ["MODEL_API_KEY"]
        url = os.environ["MODEL_BASE_URL"]

        @dataclass
        class OfflineModel(Model):
            id: str = "offline"
            name: str = "Offline"
            provider: str = "Offline"
            def invoke(self, *args, **kwargs):
                raise AssertionError
            async def ainvoke(self, messages, assistant_message, **kwargs):
                print(f"provider output {{key}} {{url}} {{messages[0].content}}")
                return ModelResponse(role="assistant", content=f"private {{key}} {{url}}")
            def invoke_stream(self, *args, **kwargs):
                raise AssertionError
                yield
            async def ainvoke_stream(self, *args, **kwargs):
                raise AssertionError
                yield
            def _parse_provider_response(self, response, **kwargs):
                return response
            def _parse_provider_response_delta(self, response_delta):
                return response_delta

        async def close():
            print(f"close {{key}} {{url}}")

        status = asyncio.run(_invoke_provider(
            ProviderSmokeSettings(_env_file=None),
            model_builder=lambda _settings: ManagedModel(OfflineModel(), close),
        ))
        os.write(int(os.environ["AAP_PROVIDER_SMOKE_STATUS_FD"]), status.encode("ascii"))
        raise SystemExit(0 if status == "verified" else 1)
        """,
    )

    status = run_isolated_smoke(
        _valid_settings(),
        worker_command=command,
        timeout_seconds=5.0,
    )

    assert status == "verified"
    assert capfd.readouterr() == ("", "")
    assert MODEL_API_KEY not in " ".join(command)
    assert MODEL_BASE_URL not in " ".join(command)


def test_isolated_worker_maps_imported_close_failure_without_leaking(
    tmp_path: Path,
    capfd: pytest.CaptureFixture[str],
) -> None:
    command = _write_worker_script(
        tmp_path,
        f"""
        import asyncio
        import os
        import sys
        sys.path.insert(0, {str(Path(__file__).resolve().parents[1] / "src")!r})
        from agno.models.openai import OpenAIResponses
        from agent_service.model_runtime_types import ManagedModel
        import agent_service.provider_smoke as smoke
        from agent_service.model_verifier import ModelVerificationResult

        async def verifier(*args, **kwargs):
            return ModelVerificationResult(True, "success")
        async def close():
            raise RuntimeError(os.environ["MODEL_API_KEY"])
        smoke.verify_model = verifier
        status = asyncio.run(smoke._invoke_provider(
            smoke.ProviderSmokeSettings(_env_file=None),
            model_builder=lambda _settings: ManagedModel(
                OpenAIResponses(id="offline", api_key="offline"), close
            ),
        ))
        os.write(int(os.environ["AAP_PROVIDER_SMOKE_STATUS_FD"]), status.encode("ascii"))
        raise SystemExit(0 if status == "verified" else 1)
        """,
    )

    status = run_isolated_smoke(
        _valid_settings(),
        worker_command=command,
        timeout_seconds=5.0,
    )

    assert status == "invocation"
    assert capfd.readouterr() == ("", "")


@pytest.mark.parametrize(
    ("source", "timeout_seconds", "expected"),
    [
        ("import time; time.sleep(60)", 0.2, "timeout"),
        (f"import os, signal; os.kill(os.getpid(), {signal.SIGTERM})", 5.0, "signal"),
        ("raise RuntimeError('raw provider failure')", 5.0, "invocation"),
    ],
    ids=["real-timeout", "signal", "exception-with-startup-budget"],
)
def test_isolated_worker_maps_process_failures_to_stable_categories(
    source: str,
    timeout_seconds: float,
    expected: SmokeStatus,
    tmp_path: Path,
    capfd: pytest.CaptureFixture[str],
) -> None:
    status = run_isolated_smoke(
        _valid_settings(),
        worker_command=_write_worker_script(tmp_path, source),
        timeout_seconds=timeout_seconds,
    )

    assert status == expected
    assert capfd.readouterr() == ("", "")


def test_isolated_worker_requires_verified_status_and_zero_exit(
    tmp_path: Path,
) -> None:
    command = _write_worker_script(
        tmp_path,
        """
        import os
        os.write(int(os.environ["AAP_PROVIDER_SMOKE_STATUS_FD"]), b"verified")
        raise SystemExit(9)
        """,
    )

    assert (
        run_isolated_smoke(
            _valid_settings(),
            worker_command=command,
            timeout_seconds=5.0,
        )
        == "invocation"
    )


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
            f"{os.getpid()} {child.pid}", encoding="ascii"
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
