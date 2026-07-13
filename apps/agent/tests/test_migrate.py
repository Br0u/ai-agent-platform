from typing import Any

import pytest

from agent_service.config import MigrationSettings
from agent_service.migrate import main, run_migration


MIGRATOR_URL = "postgresql+psycopg_async://migrator:migrator-password@db:5432/platform"


@pytest.fixture
def settings() -> MigrationSettings:
    return MigrationSettings.model_validate(
        {"AGNO_MIGRATOR_DATABASE_URL": MIGRATOR_URL}
    )


@pytest.mark.asyncio
async def test_run_migration_builds_agno_database_and_calls_up_once(
    settings: MigrationSettings,
) -> None:
    database = object()
    database_calls: list[dict[str, Any]] = []
    manager_databases: list[object] = []
    up_calls = 0

    def database_factory(**kwargs: Any) -> object:
        database_calls.append(kwargs)
        return database

    class Manager:
        def __init__(self, received_database: object) -> None:
            manager_databases.append(received_database)

        async def up(self) -> None:
            nonlocal up_calls
            up_calls += 1

    await run_migration(
        settings=settings,
        database_factory=database_factory,
        manager_factory=Manager,
    )

    assert database_calls == [
        {
            "db_url": MIGRATOR_URL,
            "db_schema": "agno",
        }
    ]
    assert manager_databases == [database]
    assert up_calls == 1


def test_main_returns_nonzero_without_reporting_ready_when_migration_fails(
    capsys: pytest.CaptureFixture[str],
) -> None:
    async def failing_migration() -> None:
        raise RuntimeError("database password must not be reported")

    exit_code = main(migration=failing_migration)
    output = capsys.readouterr()

    assert exit_code != 0
    assert "ready" not in (output.out + output.err).lower()
    assert "database password must not be reported" not in output.err


def test_main_runs_the_migration_once(capsys: pytest.CaptureFixture[str]) -> None:
    calls = 0

    async def successful_migration() -> None:
        nonlocal calls
        calls += 1

    exit_code = main(migration=successful_migration)

    assert exit_code == 0
    assert calls == 1
    assert "ready" not in capsys.readouterr().out.lower()
