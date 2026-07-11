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
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migration-test-safety";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeTestDatabaseUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeTestDatabaseUrl
  ? describe.sequential
  : describe.skip;
const migrationsFolder = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

describePostgres("identity migration from the legacy database", () => {
  const pool = new Pool({ connectionString: safeTestDatabaseUrl });
  const database = drizzle(pool);
  let legacyMigrationsFolder: string;

  beforeAll(async () => {
    legacyMigrationsFolder = mkdtempSync(
      join(tmpdir(), "ai-agent-platform-legacy-migrations-"),
    );
    mkdirSync(join(legacyMigrationsFolder, "meta"));
    cpSync(
      join(migrationsFolder, "0000_tired_cardiac.sql"),
      join(legacyMigrationsFolder, "0000_tired_cardiac.sql"),
    );

    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
    ) as { entries: unknown[] };
    writeFileSync(
      join(legacyMigrationsFolder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }),
    );

    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(database, { migrationsFolder: legacyMigrationsFolder });

    const role = await pool.query<{ id: number }>(
      "INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id",
      ["legacy-admin", "Legacy administrator"],
    );
    const roleId = role.rows[0]?.id;
    if (!roleId) throw new Error("Legacy role fixture was not created");

    await pool.query(
      `INSERT INTO users
        (id, email, display_name, password_hash, role_id, status)
       VALUES
        ('00000000-0000-4000-8000-000000000001', 'Active@Example.com', 'Active User', 'active-password-hash', $1, 'active'),
        ('00000000-0000-4000-8000-000000000002', 'Disabled@Example.com', 'Disabled User', 'disabled-password-hash', $1, 'disabled')`,
      [roleId],
    );
    await pool.query(
      `INSERT INTO content
        (id, type, slug, title, body, author_id)
       VALUES
        ('00000000-0000-4000-8000-000000000010', 'page', 'legacy-content', 'Legacy content', '{}', '00000000-0000-4000-8000-000000000001')`,
    );
  });

  afterAll(async () => {
    await pool.end();
    if (legacyMigrationsFolder)
      rmSync(legacyMigrationsFolder, { recursive: true });
  });

  it("upgrades through the Drizzle migrator without losing legacy data", async () => {
    await migrate(database, { migrationsFolder });

    const users = await pool.query<{
      email: string;
      status: string;
      password: string;
      role_name: string;
    }>(
      `SELECT users.email, users.status::text, accounts.password, roles.name AS role_name
       FROM users
       JOIN accounts ON accounts.user_id = users.id AND accounts.provider_id = 'credential'
       JOIN user_roles ON user_roles.user_id = users.id
       JOIN roles ON roles.id = user_roles.role_id
       ORDER BY users.email`,
    );

    expect(users.rows).toEqual([
      {
        email: "Active@Example.com",
        status: "active",
        password: "active-password-hash",
        role_name: "legacy-admin",
      },
      {
        email: "Disabled@Example.com",
        status: "disabled",
        password: "disabled-password-hash",
        role_name: "legacy-admin",
      },
    ]);

    const content = await pool.query<{ author_id: string }>(
      "SELECT author_id FROM content WHERE slug = 'legacy-content'",
    );
    expect(content.rows).toEqual([
      { author_id: "00000000-0000-4000-8000-000000000001" },
    ]);

    const migratedRole = await pool.query<{ is_system: boolean }>(
      "SELECT is_system FROM roles WHERE name = 'legacy-admin'",
    );
    expect(migratedRole.rows).toEqual([{ is_system: false }]);

    const journal = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    expect(journal.rows).toEqual([{ count: "3" }]);
  });

  it("enforces case-insensitive identities and legal-name key shape", async () => {
    await expect(
      pool.query(
        `INSERT INTO users (name, email, identity_realm)
         VALUES ('Duplicate email', 'active@example.com', 'customer')`,
      ),
    ).rejects.toMatchObject({ code: "23505" });

    await pool.query(
      "UPDATE users SET username = 'Admin.User' WHERE id = '00000000-0000-4000-8000-000000000001'",
    );
    await expect(
      pool.query(
        "UPDATE users SET username = 'admin.user' WHERE id = '00000000-0000-4000-8000-000000000002'",
      ),
    ).rejects.toMatchObject({ code: "23505" });

    for (const invalidKey of [
      "",
      " acme",
      "\tacme",
      "acme\n",
      "ACME",
      "acme  corp",
      "acme\tcorp",
      "acme\ncorp",
      "acme\t\tcorp",
    ]) {
      await expect(
        pool.query(
          "INSERT INTO organizations (legal_name, legal_name_key) VALUES ('ACME Corp', $1)",
          [invalidKey],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }

    await expect(
      pool.query(
        "INSERT INTO organizations (legal_name, legal_name_key) VALUES ('ACME Corp', 'acme corp')",
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });
});
