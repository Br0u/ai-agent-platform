"""One-shot Agno schema migration entrypoint."""

import asyncio
from collections.abc import Awaitable, Callable
import sys
from typing import Any, Protocol

from agno.db.migrations.manager import MigrationManager
from agno.db.postgres import AsyncPostgresDb

from agent_service.config import MigrationSettings


class MigrationRunner(Protocol):
    async def up(self) -> Any: ...


DatabaseFactory = Callable[..., Any]
ManagerFactory = Callable[[Any], MigrationRunner]
MigrationCommand = Callable[[], Awaitable[None]]


async def run_migration(
    settings: MigrationSettings | None = None,
    *,
    database_factory: DatabaseFactory = AsyncPostgresDb,
    manager_factory: ManagerFactory = MigrationManager,
) -> None:
    """Apply Agno migrations once with dedicated migrator credentials."""
    migration_settings = settings or MigrationSettings()
    database = database_factory(
        db_url=migration_settings.agno_migrator_database_url.get_secret_value(),
        db_schema="agno",
    )
    manager = manager_factory(database)
    await manager.up()


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
