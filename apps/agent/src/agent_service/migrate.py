"""One-shot Agno schema migration entrypoint."""

import asyncio
from collections.abc import Awaitable, Callable
import sys
from typing import Protocol

from agno.db.migrations.manager import MigrationManager
from agno.db.postgres import AsyncPostgresDb
from agno.os import AgentOS

from agent_service.config import MigrationSettings


class MigrationRunner(Protocol):
    async def up(self) -> None: ...


class DatabaseFactory(Protocol):
    def __call__(self, *, db_url: str, db_schema: str) -> AsyncPostgresDb: ...


class ManagerFactory(Protocol):
    def __call__(self, database: AsyncPostgresDb, /) -> MigrationRunner: ...


class DatabaseProvisioner(Protocol):
    async def __call__(self, *, database_url: str, db_schema: str) -> None: ...


MigrationCommand = Callable[[], Awaitable[None]]


REQUIRED_AGNO_TABLE_NAMES = (
    "agno_sessions",
    "agno_memories",
    "agno_metrics",
    "agno_eval_runs",
    "agno_knowledge",
    "agno_schema_versions",
    "agno_learnings",
    "agno_schedules",
    "agno_schedule_runs",
    "agno_approvals",
    "agno_service_accounts",
)


def build_migration_database(*, db_url: str, db_schema: str) -> AsyncPostgresDb:
    return AsyncPostgresDb(db_url=db_url, db_schema=db_schema)


def build_migration_manager(database: AsyncPostgresDb) -> MigrationRunner:
    return MigrationManager(database)


async def provision_agno_database(*, database_url: str, db_schema: str) -> None:
    """Initialize Agno tables through AgentOS's public provisioning lifecycle."""
    bootstrap_database = AsyncPostgresDb(
        db_url=database_url,
        db_schema=db_schema,
    )
    bootstrap_os = AgentOS(
        id="ai-agent-platform-migrator",
        agents=[],
        db=bootstrap_database,
        auto_provision_dbs=True,
        telemetry=False,
    )
    application = bootstrap_os.get_app()
    async with application.router.lifespan_context(application):
        pass


async def run_migration(
    settings: MigrationSettings | None = None,
    *,
    database_factory: DatabaseFactory = build_migration_database,
    manager_factory: ManagerFactory = build_migration_manager,
    provisioner: DatabaseProvisioner = provision_agno_database,
) -> None:
    """Apply Agno migrations once with dedicated migrator credentials."""
    migration_settings = settings or MigrationSettings()
    database_url = migration_settings.agno_migrator_database_url.get_secret_value()
    database = database_factory(
        db_url=database_url,
        db_schema="agno",
    )
    try:
        await provisioner(database_url=database_url, db_schema="agno")
        for table_name in REQUIRED_AGNO_TABLE_NAMES:
            if not await database.table_exists(table_name):
                raise RuntimeError("Agno database initialization incomplete")
        manager = manager_factory(database)
        await manager.up()
    finally:
        await database.close()


def main(*, migration: MigrationCommand = run_migration) -> int:
    """Run the one-shot migration and return a process exit code."""

    async def execute() -> None:
        await migration()

    try:
        asyncio.run(execute())
    except Exception:
        print("Agno migration failed.", file=sys.stderr)
        return 1

    print("Agno migration complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
