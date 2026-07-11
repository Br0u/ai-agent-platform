import path from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

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

export async function runMigrations<T>(
  database: T,
  close: () => Promise<void>,
  migrationRunner: MigrationRunner<T>,
): Promise<void> {
  try {
    await migrationRunner(database, { migrationsFolder });
  } finally {
    await close();
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
  const database = drizzle(pool, { schema });
  await runMigrations(database, () => pool.end(), migrate);
}

const entryPoint = process.argv[1];
if (entryPoint && fileURLToPath(import.meta.url) === path.resolve(entryPoint)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Database migration failed: ${message}`);
    process.exitCode = 1;
  });
}
