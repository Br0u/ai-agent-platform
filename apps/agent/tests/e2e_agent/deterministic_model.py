"""Offline Agno model used only by deterministic container acceptance."""

from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from typing import Any

from agno.models.base import Model
from agno.models.message import Message
from agno.models.response import ModelResponse

from agent_service.config import ActiveModelSettings
from agent_service.model_runtime_types import ManagedModel


INVALID_RESPONSE_SENTINEL = "__aap_e2e_invalid_response__"
_close_counts: dict[str, int] = {}


def _user_question(message: Message) -> str:
    content = message.get_content_string().replace("\r\n", "\n").replace("\r", "\n")
    marker = "\n\n用户问题："
    question = content.partition(marker)[2] if marker in content else content
    return question.strip()


@dataclass
class DeterministicModel(Model):
    """Return a stable response derived only from the supplied Agno messages."""

    id: str = "e2e-deterministic"
    name: str = "DeterministicModel"
    provider: str = "Acceptance"

    def _response(self, messages: list[Message]) -> ModelResponse:
        user_messages = [message for message in messages if message.role == "user"]
        invalid_question = bool(
            user_messages
            and _user_question(user_messages[-1]) == INVALID_RESPONSE_SENTINEL
        )
        if self.id.startswith("e2e-fail-") or invalid_question:
            content = ""
        elif self.id == "e2e-deterministic":
            content = f"deterministic-turn:{len(user_messages)}"
        else:
            content = f"deterministic-model:{self.id}:turn:{len(user_messages)}"
        return ModelResponse(role="assistant", content=content)

    def invoke(
        self,
        messages: list[Message],
        assistant_message: Message,
        **_: Any,
    ) -> ModelResponse:
        return self._response(messages)

    async def ainvoke(
        self,
        messages: list[Message],
        assistant_message: Message,
        **_: Any,
    ) -> ModelResponse:
        return self._response(messages)

    def invoke_stream(
        self,
        messages: list[Message],
        assistant_message: Message,
        **_: Any,
    ) -> Iterator[ModelResponse]:
        yield self._response(messages)

    async def ainvoke_stream(
        self,
        messages: list[Message],
        assistant_message: Message,
        **_: Any,
    ) -> AsyncIterator[ModelResponse]:
        yield self._response(messages)

    def _parse_provider_response(
        self,
        response: ModelResponse,
        **_: Any,
    ) -> ModelResponse:
        return response

    def _parse_provider_response_delta(
        self,
        response_delta: ModelResponse,
    ) -> ModelResponse:
        return response_delta


def acceptance_model_close_count(model_id: str) -> int:
    """Expose only an ID-scoped close count for acceptance assertions."""
    return _close_counts.get(model_id, 0)


def build_acceptance_managed_model(settings: ActiveModelSettings) -> ManagedModel:
    """Build the real owned runtime handle around an offline deterministic model."""
    model_id = settings.model_id
    model = DeterministicModel(id=model_id)

    async def close_model() -> None:
        _close_counts[model_id] = _close_counts.get(model_id, 0) + 1

    return ManagedModel(model=model, close_callback=close_model)
