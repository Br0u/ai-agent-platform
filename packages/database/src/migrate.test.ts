import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { migrationsFolder, runMigrations } from "./migrate";

describe("database migrations", () => {
  it("derives the migration folder from the module URL", () => {
    expect(migrationsFolder).toBe(
      fileURLToPath(new URL("../drizzle", import.meta.url)),
    );
  });

  it("runs migrations and closes the pool", async () => {
    const migrate = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const database = { name: "database" };

    await runMigrations(database, close, migrate);

    expect(migrate).toHaveBeenCalledWith(database, {
      migrationsFolder,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the pool when migration fails", async () => {
    const migrate = vi.fn().mockRejectedValue(new Error("migration failed"));
    const close = vi.fn().mockResolvedValue(undefined);

    await expect(runMigrations({}, close, migrate)).rejects.toThrow(
      "migration failed",
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
