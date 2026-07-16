"""Offline Agno model used only by deterministic container acceptance."""

from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from typing import Any

from agno.models.base import Model
from agno.models.message import Message
from agno.models.response import ModelResponse


INVALID_RESPONSE_SENTINEL = "__aap_e2e_invalid_response__"


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

    @staticmethod
    def _response(messages: list[Message]) -> ModelResponse:
        user_messages = [message for message in messages if message.role == "user"]
        content = (
            ""
            if user_messages
            and _user_question(user_messages[-1]) == INVALID_RESPONSE_SENTINEL
            else f"deterministic-turn:{len(user_messages)}"
        )
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
