"""One-shot, process-isolated verification for an explicitly selected model."""

import asyncio
from collections.abc import Callable, Sequence
import os
import re
import signal
import stat
import subprocess
import sys
from typing import Literal, cast

from pydantic import Field, SecretStr, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from agent_service.config import (
    ActiveModelSettings,
    ModelProvider,
    _validate_model_api_key_value,
    _validate_model_base_url_value,
    _validate_model_id_value,
    _validate_model_timeout_input_value,
    resolve_active_model_settings,
)
from agent_service.model_registry import build_managed_model
from agent_service.model_runtime_types import ManagedModel
from agent_service.model_verifier import verify_model


_STATUS_FD_ENV = "AAP_PROVIDER_SMOKE_STATUS_FD"
_WORKER_GRACE_SECONDS = 5.0
_REAP_TIMEOUT_SECONDS = 1.0
SmokeStatus = Literal[
    "verified",
    "configuration",
    "credential_rejected",
    "model_not_found",
    "provider_unreachable",
    "provider_timeout",
    "invocation",
    "timeout",
    "signal",
]
_FAILURE_STATUSES: frozenset[SmokeStatus] = frozenset(
    {
        "configuration",
        "credential_rejected",
        "model_not_found",
        "provider_unreachable",
        "provider_timeout",
        "invocation",
        "timeout",
        "signal",
    }
)


class ProviderSmokeSettings(BaseSettings):
    """Only the model values needed for an isolated provider invocation."""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
        hide_input_in_errors=True,
        validate_default=True,
    )

    model_provider: ModelProvider | None = Field(
        default=None,
        validation_alias="MODEL_PROVIDER",
    )
    model_id: str | None = Field(default=None, validation_alias="MODEL_ID")
    model_api_key: SecretStr | None = Field(
        default=None,
        validation_alias="MODEL_API_KEY",
    )
    model_base_url: str | None = Field(
        default=None,
        validation_alias="MODEL_BASE_URL",
    )
    model_run_timeout_seconds: int = Field(
        default=50,
        ge=1,
        le=50,
        validation_alias="MODEL_RUN_TIMEOUT_SECONDS",
    )

    @field_validator("model_provider", mode="after")
    @classmethod
    def _require_model_provider(
        cls,
        value: ModelProvider | None,
    ) -> ModelProvider:
        if value is None:
            raise ValueError("MODEL_PROVIDER is required")
        return value

    @field_validator("model_id", mode="after")
    @classmethod
    def _require_model_id(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("MODEL_ID is required")
        return _validate_model_id_value(value)

    @field_validator("model_api_key", mode="after")
    @classmethod
    def _require_model_api_key(cls, value: SecretStr | None) -> SecretStr:
        if value is None:
            raise ValueError("MODEL_API_KEY is required")
        return _validate_model_api_key_value(value)

    @field_validator("model_base_url", mode="after")
    @classmethod
    def _validate_model_base_url(
        cls,
        value: str | None,
        info: ValidationInfo,
    ) -> str | None:
        return _validate_model_base_url_value(
            value,
            info.data.get("model_provider"),
        )

    @field_validator("model_run_timeout_seconds", mode="before")
    @classmethod
    def _validate_model_timeout_input(cls, value: object) -> int:
        return _validate_model_timeout_input_value(value)

    @property
    def active_model(self) -> ActiveModelSettings:
        return resolve_active_model_settings(
            provider=self.model_provider,
            model_id=self.model_id,
            api_key=self.model_api_key,
            base_url=self.model_base_url,
            timeout_seconds=self.model_run_timeout_seconds,
        )


async def _invoke_provider(
    settings: ProviderSmokeSettings,
    *,
    model_builder: Callable[[ActiveModelSettings], ManagedModel] = build_managed_model,
) -> SmokeStatus:
    """Run the injectable one-shot core; production calls this only in the worker."""
    managed: ManagedModel | None = None
    status: SmokeStatus = "invocation"
    try:
        active_model = settings.active_model
        managed = model_builder(active_model)
        result = await verify_model(
            managed,
            timeout_seconds=active_model.timeout_seconds,
        )
        if result.ok and result.category == "success":
            status = "verified"
        elif not result.ok and result.category != "success":
            status = cast(SmokeStatus, result.category)
    except BaseException:
        status = "invocation"
    finally:
        if managed is not None:
            try:
                await managed.aclose()
            except BaseException:
                status = "invocation"
    return status


def _worker_command() -> tuple[str, ...]:
    return (sys.executable, "-m", "agent_service.provider_smoke", "--worker")


def _worker_environment(
    settings: ProviderSmokeSettings, status_fd: int
) -> dict[str, str]:
    active_model = settings.active_model
    environment = dict(os.environ)
    environment.update(
        {
            "MODEL_PROVIDER": active_model.provider,
            "MODEL_ID": active_model.model_id,
            "MODEL_API_KEY": active_model.api_key.get_secret_value(),
            "MODEL_RUN_TIMEOUT_SECONDS": str(active_model.timeout_seconds),
            _STATUS_FD_ENV: str(status_fd),
        }
    )
    if active_model.base_url is None:
        environment.pop("MODEL_BASE_URL", None)
    else:
        environment["MODEL_BASE_URL"] = active_model.base_url
    return environment


def _read_worker_status(status_fd: int) -> SmokeStatus | None:
    try:
        os.set_blocking(status_fd, False)
        payload = os.read(status_fd, 64)
        decoded = payload.decode("ascii")
    except (OSError, UnicodeError):
        return None
    valid_statuses: tuple[SmokeStatus, ...] = (
        "verified",
        "configuration",
        "credential_rejected",
        "model_not_found",
        "provider_unreachable",
        "provider_timeout",
        "invocation",
        "timeout",
        "signal",
    )
    return cast(SmokeStatus, decoded) if decoded in valid_statuses else None


def _close_fd(status_fd: int) -> None:
    try:
        os.close(status_fd)
    except BaseException:
        pass


def _terminate_worker_process_group(process: subprocess.Popen[bytes]) -> None:
    """Best-effort kill the isolated session and reap its direct child."""
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except BaseException:
        try:
            process.kill()
        except BaseException:
            pass

    for _attempt in range(3):
        try:
            process.wait(timeout=_REAP_TIMEOUT_SECONDS)
            return
        except subprocess.TimeoutExpired:
            pass
        except BaseException:
            pass
        try:
            process.kill()
        except BaseException:
            pass


def run_isolated_smoke(
    settings: ProviderSmokeSettings,
    *,
    worker_command: Sequence[str] | None = None,
    timeout_seconds: float | None = None,
) -> SmokeStatus:
    """Run the provider worker with output permanently attached to /dev/null."""
    try:
        read_fd, write_fd = os.pipe()
    except BaseException:
        return "invocation"
    process: subprocess.Popen[bytes] | None = None
    try:
        command = (
            tuple(worker_command) if worker_command is not None else _worker_command()
        )
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            pass_fds=(write_fd,),
            env=_worker_environment(settings, write_fd),
            start_new_session=True,
        )
    except BaseException:
        _close_fd(read_fd)
        _close_fd(write_fd)
        return "invocation"

    _close_fd(write_fd)
    try:
        try:
            process.wait(
                timeout=(
                    timeout_seconds
                    if timeout_seconds is not None
                    else settings.active_model.timeout_seconds + _WORKER_GRACE_SECONDS
                )
            )
        except subprocess.TimeoutExpired:
            _terminate_worker_process_group(process)
            return "timeout"
        except BaseException:
            _terminate_worker_process_group(process)
            return "invocation"

        try:
            status = _read_worker_status(read_fd)
            if process.returncode is not None and process.returncode < 0:
                _terminate_worker_process_group(process)
                return "signal"
            if process.returncode == 0 and status == "verified":
                return "verified"
            _terminate_worker_process_group(process)
            if status in _FAILURE_STATUSES:
                return status
            return "invocation"
        except BaseException:
            _terminate_worker_process_group(process)
            return "invocation"
    finally:
        try:
            is_running = process.returncode is None
        except BaseException:
            is_running = True
        if is_running:
            _terminate_worker_process_group(process)
        _close_fd(read_fd)


def _write_worker_status(status: SmokeStatus) -> bool:
    raw_status_fd = os.environ.pop(_STATUS_FD_ENV, "")
    if re.fullmatch(r"[1-9]\d*", raw_status_fd) is None:
        return False
    status_fd = int(raw_status_fd)
    if status_fd < 3:
        return False
    try:
        if not stat.S_ISFIFO(os.fstat(status_fd).st_mode):
            return False
        os.write(status_fd, status.encode("ascii"))
        os.close(status_fd)
    except OSError:
        return False
    return True


def _worker_main(
    *,
    settings_factory: Callable[..., ProviderSmokeSettings] = ProviderSmokeSettings,
    model_builder: Callable[[ActiveModelSettings], ManagedModel] = build_managed_model,
) -> int:
    try:
        settings = settings_factory(_env_file=None)
    except BaseException:
        status: SmokeStatus = "configuration"
    else:
        status = asyncio.run(
            _invoke_provider(
                settings,
                model_builder=model_builder,
            )
        )
    if not _write_worker_status(status):
        return 1
    return 0 if status == "verified" else 1


def main(
    argv: Sequence[str] | None = None,
    *,
    settings_factory: Callable[..., ProviderSmokeSettings] = ProviderSmokeSettings,
    isolated_runner: Callable[[ProviderSmokeSettings], SmokeStatus] | None = None,
) -> int:
    """Run once and expose only a stable category or a verified safe label."""
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments == ["--worker"]:
        return _worker_main(settings_factory=settings_factory)
    if arguments not in ([], ["--validate-only"]):
        print("provider smoke failed: arguments", file=sys.stderr)
        return 2

    try:
        settings = settings_factory(_env_file=None)
    except BaseException:
        print("provider smoke failed: configuration", file=sys.stderr)
        return 1
    if arguments == ["--validate-only"]:
        return 0

    try:
        status = (
            isolated_runner(settings)
            if isolated_runner is not None
            else run_isolated_smoke(settings)
        )
    except BaseException:
        status = "invocation"
    if status != "verified":
        category = status if status in _FAILURE_STATUSES else "invocation"
        print(f"provider smoke failed: {category}", file=sys.stderr)
        return 1

    active_model = settings.active_model
    print(f"{active_model.provider}/{active_model.model_id}: verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
