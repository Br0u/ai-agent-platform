from collections.abc import Iterator

from agno.models.anthropic import Claude
from agno.models.dashscope import DashScope
from agno.models.deepseek import DeepSeek
from agno.models.google import Gemini
from agno.models.message import Message
from agno.models.minimax import MiniMax
from agno.models.openai import OpenAIResponses
from agno.models.openai.like import OpenAILike
from agno.models.response import ModelResponse
from anthropic.types.raw_content_block_delta_event import RawContentBlockDeltaEvent
from anthropic.types.text_delta import TextDelta
from anthropic.types.thinking_delta import ThinkingDelta
from google.genai.types import Candidate, Content, GenerateContentResponse, Part
from openai.types.chat import ChatCompletionChunk
from openai.types.responses import (
    ResponseReasoningSummaryTextDeltaEvent,
    ResponseTextDeltaEvent,
)
import pytest


def _chat_delta(*, content: str, reasoning_content: str) -> ChatCompletionChunk:
    return ChatCompletionChunk(
        id="mock-chunk",
        choices=[
            {
                "delta": {
                    "content": content,
                    "reasoning_content": reasoning_content,
                },
                "finish_reason": None,
                "index": 0,
            }
        ],
        created=0,
        model="mock-model",
        object="chat.completion.chunk",
    )


def test_openai_response_deltas_keep_reasoning_out_of_content() -> None:
    model = OpenAIResponses(api_key="fake-key", store=False)
    assistant_message = Message(role="assistant")
    reasoning, _ = model._parse_provider_response_delta(
        ResponseReasoningSummaryTextDeltaEvent(
            delta="private reasoning",
            item_id="reasoning-item",
            output_index=0,
            sequence_number=1,
            summary_index=0,
            type="response.reasoning_summary_text.delta",
        ),
        assistant_message,
        {},
    )
    answer, _ = model._parse_provider_response_delta(
        ResponseTextDeltaEvent(
            content_index=0,
            delta="safe answer",
            item_id="answer-item",
            logprobs=[],
            output_index=0,
            sequence_number=2,
            type="response.output_text.delta",
        ),
        assistant_message,
        {},
    )

    assert reasoning.reasoning_content == "private reasoning"
    assert reasoning.content is None
    assert answer.content == "safe answer"
    assert answer.reasoning_content is None


def test_anthropic_deltas_keep_thinking_out_of_content() -> None:
    model = Claude(api_key="fake-key")
    reasoning = model._parse_provider_response_delta(
        RawContentBlockDeltaEvent(
            delta=ThinkingDelta(
                thinking="private reasoning",
                type="thinking_delta",
            ),
            index=0,
            type="content_block_delta",
        )
    )
    answer = model._parse_provider_response_delta(
        RawContentBlockDeltaEvent(
            delta=TextDelta(text="safe answer", type="text_delta"),
            index=1,
            type="content_block_delta",
        )
    )

    assert reasoning.reasoning_content == "private reasoning"
    assert reasoning.content is None
    assert answer.content == "safe answer"
    assert answer.reasoning_content is None


def test_google_parts_keep_thoughts_out_of_content() -> None:
    response = Gemini(api_key="fake-key")._parse_provider_response_delta(
        GenerateContentResponse(
            candidates=[
                Candidate(
                    content=Content(
                        role="model",
                        parts=[
                            Part(thought=True, text="private reasoning"),
                            Part(text="safe answer"),
                        ],
                    )
                )
            ]
        )
    )

    assert response.reasoning_content == "private reasoning"
    assert response.content == "safe answer"


@pytest.mark.parametrize("model_type", (DashScope, DeepSeek))
def test_openai_compatible_deltas_keep_reasoning_out_of_content(
    model_type: type[DashScope] | type[DeepSeek],
) -> None:
    response = model_type(api_key="fake-key")._parse_provider_response_delta(
        _chat_delta(content="safe answer", reasoning_content="private reasoning")
    )

    assert response.reasoning_content == "private reasoning"
    assert response.content == "safe answer"


def test_minimax_stream_strips_split_think_tags_but_keeps_structured_reasoning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chunks = (
        _chat_delta(content="Safe <thi", reasoning_content="structured "),
        _chat_delta(content="nk>inline secret</th", reasoning_content="reasoning"),
        _chat_delta(content="ink> answer", reasoning_content=""),
    )

    def fake_provider_stream(
        model: OpenAILike,
        *_args: object,
        **_kwargs: object,
    ) -> Iterator[ModelResponse]:
        for chunk in chunks:
            yield model._parse_provider_response_delta(chunk)

    monkeypatch.setattr(OpenAILike, "invoke_stream", fake_provider_stream)

    responses = list(MiniMax(api_key="fake-key").invoke_stream())
    content = "".join(response.content or "" for response in responses)
    reasoning = "".join(response.reasoning_content or "" for response in responses)

    assert content == "Safe  answer"
    assert "inline secret" not in content
    assert reasoning == "structured reasoning"
