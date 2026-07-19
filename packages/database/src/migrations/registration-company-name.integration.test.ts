import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migration-test-safety";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;
const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

describePostgres("registration company name upgrade", () => {
  const pool = new Pool({ connectionString: safeUrl });
  let oldFolder = "";

  afterAll(async () => {
    await pool.end();
    if (oldFolder) rmSync(oldFolder, { recursive: true });
  });

  it("upgrades a populated 0002 database through 0003", async () => {
    oldFolder = mkdtempSync(join(tmpdir(), "aap-registration-0002-"));
    mkdirSync(join(oldFolder, "meta"));
    for (const name of [
      "0000_tired_cardiac.sql",
      "0001_identity_access_control.sql",
      "0002_session_realm_guard.sql",
    ]) {
      cpSync(join(migrationsFolder, name), join(oldFolder, name));
    }
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
    ) as { entries: unknown[] };
    writeFileSync(
      join(oldFolder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 3) }),
    );

    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(drizzle(pool), { migrationsFolder: oldFolder });
    const userId = "00000000-0000-4000-8000-000000000703";
    await pool.query(
      `INSERT INTO users (id, name, email, identity_realm, status)
       VALUES ($1, 'Legacy registration', 'legacy-registration@example.test', 'customer', 'pending_review')`,
      [userId],
    );
    await pool.query(
      "INSERT INTO customer_registrations (user_id) VALUES ($1)",
      [userId],
    );

    await migrate(drizzle(pool), { migrationsFolder });

    const upgraded = await pool.query<{ company_name: string }>(
      "SELECT company_name FROM customer_registrations WHERE user_id = $1",
      [userId],
    );
    expect(upgraded.rows).toEqual([
      { company_name: "__aap_legacy_missing_company_name_v1__" },
    ]);
    const defaultValue = await pool.query<{ column_default: string | null }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'customer_registrations'
         AND column_name = 'company_name'`,
    );
    expect(defaultValue.rows).toEqual([{ column_default: null }]);
    const indexes = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN ('rate_limits_last_request_idx', 'customer_registrations_status_created_id_idx')
       ORDER BY indexname`,
    );
    expect(indexes.rows).toEqual([
      { indexname: "customer_registrations_status_created_id_idx" },
      { indexname: "rate_limits_last_request_idx" },
    ]);
    const migrationJournal = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    expect(migrationJournal.rows).toEqual([{ count: "7" }]);
  });
});
