import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Pool } from "pg";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const role = await pool.query(
      "SELECT 1 FROM pg_roles WHERE rolname = 'ai_agent_runtime'",
    );
    if (role.rowCount === 0) return;
    const sql = await readFile(
      path.resolve(
        import.meta.dirname,
        "../../../infra/postgres/02-runtime-grants.sql",
      ),
      "utf8",
    );
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && fileURLToPath(import.meta.url) === path.resolve(entryPoint)) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Privilege grant failed",
    );
    process.exitCode = 1;
  });
}
