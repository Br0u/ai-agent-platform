import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";
import { runMigrations } from "./migrate";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeTestDatabaseUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeTestDatabaseUrl
  ? describe.sequential
  : describe.skip;

describePostgres("concurrent production migrations", () => {
  it("serializes two migrators and records each journal entry once", async () => {
    const setupPool = new Pool({ connectionString: safeTestDatabaseUrl });
    await setupPool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await setupPool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await setupPool.query("CREATE SCHEMA public");
    await setupPool.end();

    const run = async () => {
      const pool = new Pool({ connectionString: safeTestDatabaseUrl });
      const client = await pool.connect();
      await runMigrations(drizzle(client), client, () => pool.end(), migrate);
    };

    await expect(Promise.all([run(), run()])).resolves.toEqual([
      undefined,
      undefined,
    ]);

    const verifier = new Pool({ connectionString: safeTestDatabaseUrl });
    const journal = await verifier.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    await verifier.end();
    expect(journal.rows).toEqual([{ count: "7" }]);
  });
});
