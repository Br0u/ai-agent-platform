from agno.agent import Agent
from agno.models.message import Message
from agno.models.openai import OpenAIResponses

from agent_service.catalog import AgentCatalog
from agent_service.config import RuntimeSettings
from agent_service.database import build_database
from e2e_agent.app import build_acceptance_catalog

from e2e_agent.deterministic_model import (
    INVALID_RESPONSE_SENTINEL,
    DeterministicModel,
)


def test_deterministic_model_runs_through_agno_without_network() -> None:
    agent = Agent(model=DeterministicModel())

    output = agent.run("first user turn")

    assert output.content == "deterministic-turn:1"


def test_deterministic_model_counts_user_messages_in_the_agno_request() -> None:
    model = DeterministicModel()
    messages = [
        Message(role="system", content="system"),
        Message(role="user", content="first"),
        Message(role="assistant", content="answer"),
        Message(role="user", content="second"),
    ]

    response = model.response(messages)

    assert response.content == "deterministic-turn:2"


def test_deterministic_model_returns_blank_for_exact_invalid_sentinel() -> None:
    agent = Agent(model=DeterministicModel())

    output = agent.run(INVALID_RESPONSE_SENTINEL)

    assert output.content == ""


def test_deterministic_model_recognizes_the_exact_bff_wrapped_sentinel() -> None:
    agent = Agent(model=DeterministicModel())
    wrapped = (
        "当前页面路径（仅作位置上下文，不代表已读取页面内容）：/assistant\n\n"
        f"用户问题：{INVALID_RESPONSE_SENTINEL}"
    )

    output = agent.run(wrapped)

    assert output.content == ""


def test_acceptance_catalog_keeps_disabled_mode_as_placeholder() -> None:
    settings = RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": "internal-security-key-0123456789abcdef",
            "AGNO_DATABASE_URL": (
                "postgresql+psycopg_async://runtime:password@db:5432/platform"
            ),
        }
    )
    database = build_database(settings)

    catalog = build_acceptance_catalog(settings, database)

    assert catalog == AgentCatalog()


def test_acceptance_catalog_uses_only_maduoduo_and_the_exact_database() -> None:
    settings = RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": "internal-security-key-0123456789abcdef",
            "AGNO_DATABASE_URL": (
                "postgresql+psycopg_async://runtime:password@db:5432/platform"
            ),
            "AGENT_ENABLED": True,
            "MODEL_PROVIDER": "openai",
            "MODEL_ID": "e2e-deterministic",
            "MODEL_API_KEY": "acceptance-only-not-a-provider-key",
        }
    )
    database = build_database(settings)

    catalog = build_acceptance_catalog(settings, database)

    assert catalog.capability == "available"
    assert len(catalog.agents) == 1
    agent = catalog.agents[0]
    assert agent.id == "maduoduo"
    assert agent.db is database
    assert isinstance(agent.model, DeterministicModel)
    assert not isinstance(agent.model, OpenAIResponses)
