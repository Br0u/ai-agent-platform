import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";

import * as schema from "./schema";

export const migrationsFolder = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);

interface MigrationConfig {
  readonly migrationsFolder: string;
}

type MigrationRunner<T> = (
  database: T,
  config: MigrationConfig,
) => Promise<void>;

export const migrationAdvisoryLockId = 72_134_877;

export interface MigrationSession {
  query(statement: string, values?: unknown[]): Promise<unknown>;
  release(): void;
}

export async function runMigrations<T>(
  database: T,
  session: MigrationSession,
  close: () => Promise<void>,
  migrationRunner: MigrationRunner<T>,
): Promise<void> {
  let lockAcquired = false;
  try {
    await session.query("SELECT pg_advisory_lock($1)", [
      migrationAdvisoryLockId,
    ]);
    lockAcquired = true;
    await migrationRunner(database, { migrationsFolder });
  } finally {
    try {
      if (lockAcquired) {
        await session.query("SELECT pg_advisory_unlock($1)", [
          migrationAdvisoryLockId,
        ]);
      }
    } finally {
      session.release();
      await close();
    }
  }
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required");
  }
  return value;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl() });
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error: unknown) {
    await pool.end();
    throw error;
  }
  const database = drizzle(client, { schema });
  await runMigrations(database, client, () => pool.end(), migrate);
}

const entryPoint = process.argv[1];
if (entryPoint && fileURLToPath(import.meta.url) === path.resolve(entryPoint)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Database migration failed: ${message}`);
    process.exitCode = 1;
  });
}
