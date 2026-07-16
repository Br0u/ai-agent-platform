"""One-shot, output-sanitized verification for an explicitly selected model."""

from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
import os
import sys
from typing import Any, cast

from agno.agent import Agent
from agno.models.base import Model
from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from agent_service.config import (
    ActiveModelSettings,
    resolve_active_model_settings,
)
from agent_service.default_agent import MADUODUO_INSTRUCTIONS
from agent_service.model_registry import build_model


PROVIDER_SMOKE_PROMPT = "仅回复一个简短的确认词。"
MAX_RESPONSE_CODE_POINTS = 32_768


class ProviderSmokeSettings(BaseSettings):
    """Only the model values needed for an isolated provider invocation."""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
        hide_input_in_errors=True,
        validate_default=True,
    )

    model_provider: str | None = Field(
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
    model_run_timeout_seconds: Any = Field(
        default=50,
        validation_alias="MODEL_RUN_TIMEOUT_SECONDS",
    )

    @model_validator(mode="after")
    def _validate_active_model(self) -> "ProviderSmokeSettings":
        self.active_model
        return self

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


@contextmanager
def _suppress_process_output() -> Iterator[None]:
    """Discard stdout/stderr at FD level for the complete provider invocation."""
    sys.stdout.flush()
    sys.stderr.flush()
    stdout_stream = sys.stdout
    stderr_stream = sys.stderr
    stdout_copy = os.dup(1)
    stderr_copy = os.dup(2)
    null_fd = os.open(os.devnull, os.O_WRONLY)
    null_stdout = open(os.devnull, "w", encoding="utf-8")
    null_stderr = open(os.devnull, "w", encoding="utf-8")
    try:
        os.dup2(null_fd, 1)
        os.dup2(null_fd, 2)
        sys.stdout = null_stdout
        sys.stderr = null_stderr
        yield
    finally:
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.flush()
            except BaseException:
                pass
        sys.stdout = stdout_stream
        sys.stderr = stderr_stream
        os.dup2(stdout_copy, 1)
        os.dup2(stderr_copy, 2)
        null_stdout.close()
        null_stderr.close()
        os.close(null_fd)
        os.close(stdout_copy)
        os.close(stderr_copy)


class _ProviderSmokeFailure(Exception):
    def __init__(self, category: str) -> None:
        self.category = category
        super().__init__(category)


def _execute(
    *,
    validate_only: bool,
    settings_factory: Callable[..., ProviderSmokeSettings],
    model_builder: Callable[[ActiveModelSettings], object],
    agent_factory: Callable[..., Any],
) -> ActiveModelSettings | None:
    with _suppress_process_output():
        try:
            settings = settings_factory(_env_file=None)
            active_model = settings.active_model
        except BaseException:
            raise _ProviderSmokeFailure("configuration") from None

        if validate_only:
            return None

        try:
            model = cast(Model, model_builder(active_model))
            agent = build_smoke_agent(model, agent_factory=agent_factory)
            result = agent.run(PROVIDER_SMOKE_PROMPT)
            content = getattr(result, "content", None)
            if (
                not isinstance(content, str)
                or not content.strip()
                or len(content) > MAX_RESPONSE_CODE_POINTS
            ):
                raise _ProviderSmokeFailure("response")
        except _ProviderSmokeFailure:
            raise
        except BaseException:
            raise _ProviderSmokeFailure("invocation") from None
    return active_model


def main(
    argv: Sequence[str] | None = None,
    *,
    settings_factory: Callable[..., ProviderSmokeSettings] = ProviderSmokeSettings,
    model_builder: Callable[[ActiveModelSettings], object] = build_model,
    agent_factory: Callable[..., Any] = Agent,
) -> int:
    """Run once and expose only a stable category or a verified safe label."""
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments not in ([], ["--validate-only"]):
        print("provider smoke failed: arguments", file=sys.stderr)
        return 2

    try:
        active_model = _execute(
            validate_only=arguments == ["--validate-only"],
            settings_factory=settings_factory,
            model_builder=model_builder,
            agent_factory=agent_factory,
        )
    except _ProviderSmokeFailure as error:
        print(f"provider smoke failed: {error.category}", file=sys.stderr)
        return 1
    except BaseException:
        print("provider smoke failed: invocation", file=sys.stderr)
        return 1

    if active_model is not None:
        print(f"{active_model.provider}/{active_model.model_id}: verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
