import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export function assertSafeDownloadResourceE2EDatabaseUrl(databaseUrl: string) {
  return assertSafeIdentityMigrationTestDatabaseUrl(databaseUrl);
}

export async function prepareDownloadResourceE2E(
  databaseUrl: string,
): Promise<void> {
  const safeDatabaseUrl = assertSafeDownloadResourceE2EDatabaseUrl(databaseUrl);
  const pool = new Pool({ connectionString: safeDatabaseUrl });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(drizzle(pool, { schema }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");
  await prepareDownloadResourceE2E(databaseUrl);
}

const entryPoint = process.argv[1];
if (entryPoint && fileURLToPath(import.meta.url) === path.resolve(entryPoint)) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "E2E database preparation failed",
    );
    process.exitCode = 1;
  });
}
