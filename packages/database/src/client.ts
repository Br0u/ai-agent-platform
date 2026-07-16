import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  return url;
}

export function databasePoolOptions(connectionString: string): PoolConfig {
  return {
    connectionString,
    max: 10,
    connectionTimeoutMillis: 1_500,
    idleTimeoutMillis: 10_000,
    query_timeout: 2_000,
    statement_timeout: 2_000,
    allowExitOnIdle: false,
  };
}

export function getDatabase(): NodePgDatabase<typeof schema> {
  if (!pool || !database) {
    pool = new Pool(databasePoolOptions(getDatabaseUrl()));
    database = drizzle(pool, { schema });
  }

  return database;
}

export async function probeDatabase(): Promise<void> {
  await getDatabase().execute(sql`select 1`);
}
