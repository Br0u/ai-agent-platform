import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

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

export function getDatabase(): NodePgDatabase<typeof schema> {
  if (!pool || !database) {
    pool = new Pool({ connectionString: getDatabaseUrl() });
    database = drizzle(pool, { schema });
  }

  return database;
}

export async function probeDatabase(): Promise<void> {
  await getDatabase().execute(sql`select 1`);
}
