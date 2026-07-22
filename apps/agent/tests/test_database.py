from agent_service.config import RuntimeSettings
from agent_service.database import build_database
from agno.db.postgres import AsyncPostgresDb
import pytest


DATABASE_URL = "postgresql+psycopg_async://runtime:private-password@db:5432/platform"


def test_database_uses_runtime_secret_and_isolated_agno_schema(
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings = RuntimeSettings.model_validate(
        {
            "OS_SECURITY_KEY": "internal-security-key-0123456789abcdef",
            "AGNO_DATABASE_URL": DATABASE_URL,
            "SKILL_REGISTRY_RUNTIME_DATABASE_URL": DATABASE_URL,
        }
    )

    database = build_database(settings)

    assert isinstance(database, AsyncPostgresDb)
    assert database.db_url == DATABASE_URL
    assert database.db_schema == "agno"
    assert DATABASE_URL not in repr(database)
    assert "private-password" not in repr(database)
    assert DATABASE_URL not in caplog.text
    assert "private-password" not in caplog.text
