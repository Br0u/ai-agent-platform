"""Offline Agno model used only by deterministic container acceptance."""

from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
import json
from typing import Any

from agno.models.base import Model
from agno.models.message import Message
from agno.models.response import ModelResponse

from agent_service.config import ActiveModelSettings
from agent_service.model_runtime_types import ManagedModel


INVALID_RESPONSE_SENTINEL = "__aap_e2e_invalid_response__"
SPLIT_REASONING_SENTINEL = "aap-stateless-question-20260812"
SAFE_ANSWER_SENTINEL = "aap-stateless-answer-20260812"
ALLOWED_NAVIGATION_SENTINEL = "__aap_e2e_allowed_navigation__"
FORBIDDEN_NAVIGATION_SENTINEL = "__aap_e2e_forbidden_navigation__"
PAGE_CONTEXT_SENTINEL = "__aap_e2e_page_context__"
PRODUCT_PAGE_EXCERPT = "独立产品中心：成熟企业级 AI 产品，独立安装、下载即用"
ASSISTANT_CONTEXT_PREFIX = "服务器提供的助手上下文 JSON：\n"
_close_counts: dict[str, int] = {}


def public_answer(content: str) -> str:
    return json.dumps({"answer": content}, ensure_ascii=False, separators=(",", ":"))


def _user_context(message: Message) -> tuple[str, dict[str, Any] | None]:
    content = message.get_content_string().replace("\r\n", "\n").replace("\r", "\n")
    if content.startswith(ASSISTANT_CONTEXT_PREFIX):
        context = json.loads(content.removeprefix(ASSISTANT_CONTEXT_PREFIX))
        if isinstance(context, dict) and isinstance(context.get("userQuestion"), str):
            return context["userQuestion"].strip(), context
    return content.strip(), None


@dataclass
class DeterministicModel(Model):
    """Return a stable response derived only from the supplied Agno messages."""

    id: str = "e2e-deterministic"
    name: str = "DeterministicModel"
    provider: str = "Acceptance"

    def _response(self, messages: list[Message]) -> ModelResponse:
        user_messages = [message for message in messages if message.role == "user"]
        question, context = (
            _user_context(user_messages[-1]) if user_messages else ("", None)
        )
        invalid_question = question == INVALID_RESPONSE_SENTINEL
        if self.id.startswith("e2e-fail-") or invalid_question:
            content = ""
        elif question == SPLIT_REASONING_SENTINEL:
            content = SAFE_ANSWER_SENTINEL
        elif question in {
            ALLOWED_NAVIGATION_SENTINEL,
            FORBIDDEN_NAVIGATION_SENTINEL,
        }:
            if any(message.role == "tool" for message in messages):
                content = "navigation-suggestion-finished"
            else:
                pathname = (
                    "/pricing"
                    if question == ALLOWED_NAVIGATION_SENTINEL
                    else "/not-registered"
                )
                return ModelResponse(
                    role="assistant",
                    tool_calls=[
                        {
                            "id": "assistant-navigation-e2e-call",
                            "type": "function",
                            "function": {
                                "name": "suggest_navigation",
                                "arguments": json.dumps(
                                    {"pathname": pathname}, separators=(",", ":")
                                ),
                            },
                        }
                    ],
                )
        elif question == PAGE_CONTEXT_SENTINEL:
            current_page = context.get("currentPage") if context else None
            content = (
                "verified-product-page-context"
                if isinstance(current_page, dict)
                and PRODUCT_PAGE_EXCERPT in str(current_page.get("text", ""))
                else "no-public-page-context"
            )
        elif self.id == "e2e-deterministic":
            content = f"deterministic-turn:{len(user_messages)}"
        else:
            content = f"deterministic-model:{self.id}:turn:{len(user_messages)}"
        if content:
            content = public_answer(content)
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
        user_messages = [message for message in messages if message.role == "user"]
        question = _user_context(user_messages[-1])[0] if user_messages else ""
        if question == SPLIT_REASONING_SENTINEL:
            answer = public_answer(SAFE_ANSWER_SENTINEL)
            for content in [answer[:5], answer[5:12], answer[12:]]:
                yield ModelResponse(role="assistant", content=content)
            return
        yield self._response(messages)

    async def ainvoke_stream(
        self,
        messages: list[Message],
        assistant_message: Message,
        **_: Any,
    ) -> AsyncIterator[ModelResponse]:
        user_messages = [message for message in messages if message.role == "user"]
        question = _user_context(user_messages[-1])[0] if user_messages else ""
        if question == SPLIT_REASONING_SENTINEL:
            answer = public_answer(SAFE_ANSWER_SENTINEL)
            for content in [answer[:5], answer[5:12], answer[12:]]:
                yield ModelResponse(role="assistant", content=content)
            return
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
