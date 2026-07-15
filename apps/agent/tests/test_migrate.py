from typing import cast

import pytest
from agno.db.postgres import AsyncPostgresDb

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
    events: list[str] = []

    class Database:
        session_table_name = "agno_sessions"
        memory_table_name = "agno_memories"
        metrics_table_name = "agno_metrics"
        eval_table_name = "agno_eval_runs"
        knowledge_table_name = "agno_knowledge"
        versions_table_name = "agno_schema_versions"
        learnings_table_name = "agno_learnings"
        schedules_table_name = "agno_schedules"
        schedule_runs_table_name = "agno_schedule_runs"
        approvals_table_name = "agno_approvals"
        service_accounts_table_name = "agno_service_accounts"

        async def table_exists(self, table_name: str) -> bool:
            events.append(f"check:{table_name}")
            return True

        async def close(self) -> None:
            events.append("close")

    database = Database()

    def database_factory(*, db_url: str, db_schema: str) -> AsyncPostgresDb:
        assert db_url == MIGRATOR_URL
        assert db_schema == "agno"
        events.append("database")
        return cast(AsyncPostgresDb, database)

    async def provisioner(*, database_url: str, db_schema: str) -> None:
        assert database_url == MIGRATOR_URL
        assert db_schema == "agno"
        events.append("initialize")

    class Manager:
        async def up(self) -> None:
            events.append("up")

    def manager_factory(received_database: AsyncPostgresDb) -> Manager:
        assert received_database is database
        events.append("manager")
        return Manager()

    await run_migration(
        settings=settings,
        database_factory=database_factory,
        manager_factory=manager_factory,
        provisioner=provisioner,
    )

    assert events == [
        "database",
        "initialize",
        "check:agno_sessions",
        "check:agno_memories",
        "check:agno_metrics",
        "check:agno_eval_runs",
        "check:agno_knowledge",
        "check:agno_schema_versions",
        "check:agno_learnings",
        "check:agno_schedules",
        "check:agno_schedule_runs",
        "check:agno_approvals",
        "check:agno_service_accounts",
        "manager",
        "up",
        "close",
    ]


@pytest.mark.asyncio
async def test_initialization_failure_closes_database_without_running_migrations(
    settings: MigrationSettings,
) -> None:
    events: list[str] = []

    class Database:
        async def close(self) -> None:
            events.append("close")

    database = Database()

    def database_factory(*, db_url: str, db_schema: str) -> AsyncPostgresDb:
        events.append("database")
        return cast(AsyncPostgresDb, database)

    async def failing_provisioner(*, database_url: str, db_schema: str) -> None:
        events.append("initialize")
        raise RuntimeError("initialization failed")

    class Manager:
        async def up(self) -> None:
            raise AssertionError("migration must not run")

    def manager_factory(received_database: AsyncPostgresDb) -> Manager:
        raise AssertionError("manager must not be constructed")

    with pytest.raises(RuntimeError, match="initialization failed"):
        await run_migration(
            settings=settings,
            database_factory=database_factory,
            manager_factory=manager_factory,
            provisioner=failing_provisioner,
        )

    assert events == ["database", "initialize", "close"]


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
