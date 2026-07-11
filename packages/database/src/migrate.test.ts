import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { migrationsFolder, runMigrations } from "./migrate";

function migrationSession(events: string[]) {
  return {
    async query(statement: string): Promise<void> {
      events.push(statement.includes("unlock") ? "unlock" : "lock");
    },
    release(): void {
      events.push("release-client");
    },
  };
}

describe("database migrations", () => {
  it("derives the migration folder from the module URL", () => {
    expect(migrationsFolder).toBe(
      fileURLToPath(new URL("../drizzle", import.meta.url)),
    );
  });

  it("runs migrations and closes the pool", async () => {
    const events: string[] = [];
    const migrate = vi.fn(async () => {
      events.push("migrate");
    });
    const close = vi.fn(async () => {
      events.push("close-pool");
    });
    const database = { name: "database" };

    await runMigrations(database, migrationSession(events), close, migrate);

    expect(migrate).toHaveBeenCalledWith(database, {
      migrationsFolder,
    });
    expect(close).toHaveBeenCalledOnce();
    expect(events).toEqual([
      "lock",
      "migrate",
      "unlock",
      "release-client",
      "close-pool",
    ]);
  });

  it("unlocks and closes the fixed session when migration fails", async () => {
    const events: string[] = [];
    const migrate = vi.fn(async () => {
      events.push("migrate");
      throw new Error("migration failed");
    });
    const close = vi.fn(async () => {
      events.push("close-pool");
    });

    await expect(
      runMigrations({}, migrationSession(events), close, migrate),
    ).rejects.toThrow("migration failed");
    expect(close).toHaveBeenCalledOnce();
    expect(events).toEqual([
      "lock",
      "migrate",
      "unlock",
      "release-client",
      "close-pool",
    ]);
  });
});
