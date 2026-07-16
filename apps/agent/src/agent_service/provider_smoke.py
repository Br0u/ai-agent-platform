"""One-shot, process-isolated verification for an explicitly selected model."""

from collections.abc import Callable, Sequence
import gc
import os
import re
import stat
import subprocess
import sys
from typing import Any, Literal, cast

from agno.agent import Agent
from agno.models.base import Model
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
from agent_service.default_agent import MADUODUO_INSTRUCTIONS
from agent_service.model_registry import build_model


PROVIDER_SMOKE_PROMPT = "仅回复一个简短的确认词。"
MAX_RESPONSE_CODE_POINTS = 32_768
_STATUS_FD_ENV = "AAP_PROVIDER_SMOKE_STATUS_FD"
_WORKER_GRACE_SECONDS = 5.0
SmokeStatus = Literal[
    "verified",
    "configuration",
    "response",
    "invocation",
    "timeout",
    "signal",
]
_FAILURE_STATUSES: frozenset[SmokeStatus] = frozenset(
    {"configuration", "response", "invocation", "timeout", "signal"}
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


def build_smoke_agent(
    model: Model,
    *,
    agent_factory: Callable[..., Any] = Agent,
) -> Any:
    """Build an isolated Agent without persistence, history, tools, or telemetry."""
    return agent_factory(
        model=model,
        instructions=list(MADUODUO_INSTRUCTIONS),
        add_history_to_context=False,
        tools=None,
        telemetry=False,
    )


def _close_resource(resource: object | None) -> bool:
    if resource is None:
        return True
    close = getattr(resource, "close", None)
    if not callable(close):
        return True
    try:
        close()
    except BaseException:
        return False
    return True


def _invoke_provider(
    settings: ProviderSmokeSettings,
    *,
    model_builder: Callable[[ActiveModelSettings], object] = build_model,
    agent_factory: Callable[..., Any] = Agent,
) -> SmokeStatus:
    """Run the injectable one-shot core; production calls this only in the worker."""
    model: object | None = None
    agent: Any = None
    result: object | None = None
    status: SmokeStatus = "invocation"
    try:
        model = model_builder(settings.active_model)
        agent = build_smoke_agent(cast(Model, model), agent_factory=agent_factory)
        result = agent.run(PROVIDER_SMOKE_PROMPT)
        content = getattr(result, "content", None)
        status = (
            "verified"
            if isinstance(content, str)
            and bool(content.strip())
            and len(content) <= MAX_RESPONSE_CODE_POINTS
            else "response"
        )
    except BaseException:
        status = "invocation"
    finally:
        resources_closed = True
        for resource in (result, agent, model):
            if not _close_resource(resource):
                resources_closed = False
        if not resources_closed:
            status = "invocation"
        result = None
        agent = None
        model = None
        gc.collect()
    return status


def _worker_command() -> tuple[str, ...]:
    return (sys.executable, "-m", "agent_service.provider_smoke", "--worker")


def _worker_environment(settings: ProviderSmokeSettings, status_fd: int) -> dict[str, str]:
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
        "response",
        "invocation",
        "timeout",
        "signal",
    )
    return cast(SmokeStatus, decoded) if decoded in valid_statuses else None


def run_isolated_smoke(
    settings: ProviderSmokeSettings,
    *,
    worker_command: Sequence[str] | None = None,
    timeout_seconds: float | None = None,
) -> SmokeStatus:
    """Run the provider worker with output permanently attached to /dev/null."""
    read_fd, write_fd = os.pipe()
    process: subprocess.Popen[bytes] | None = None
    try:
        command = tuple(worker_command) if worker_command is not None else _worker_command()
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            pass_fds=(write_fd,),
            env=_worker_environment(settings, write_fd),
        )
    except BaseException:
        os.close(read_fd)
        os.close(write_fd)
        return "invocation"

    os.close(write_fd)
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
            process.kill()
            process.wait()
            return "timeout"

        status = _read_worker_status(read_fd)
        if process.returncode is not None and process.returncode < 0:
            return "signal"
        if process.returncode == 0 and status == "verified":
            return "verified"
        if status in _FAILURE_STATUSES:
            return status
        return "invocation"
    finally:
        os.close(read_fd)


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
    model_builder: Callable[[ActiveModelSettings], object] = build_model,
    agent_factory: Callable[..., Any] = Agent,
) -> int:
    try:
        settings = settings_factory(_env_file=None)
    except BaseException:
        status: SmokeStatus = "configuration"
    else:
        status = _invoke_provider(
            settings,
            model_builder=model_builder,
            agent_factory=agent_factory,
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
