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
  let preCmsMigrationsFolder: string;

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

    preCmsMigrationsFolder = mkdtempSync(
      join(tmpdir(), "ai-agent-platform-pre-cms-migrations-"),
    );
    mkdirSync(join(preCmsMigrationsFolder, "meta"));
    for (const name of [
      "0000_tired_cardiac.sql",
      "0001_identity_access_control.sql",
      "0002_session_realm_guard.sql",
      "0003_registration_company_name.sql",
      "0004_registration_query_indexes.sql",
      "0005_identity_pagination_indexes.sql",
    ]) {
      cpSync(join(migrationsFolder, name), join(preCmsMigrationsFolder, name));
    }
    writeFileSync(
      join(preCmsMigrationsFolder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 6) }),
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
    if (preCmsMigrationsFolder)
      rmSync(preCmsMigrationsFolder, { recursive: true });
  });

  it("upgrades legacy identity data through populated migration 0005", async () => {
    await migrate(database, { migrationsFolder: preCmsMigrationsFolder });

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

    const content = await pool.query<{
      author_id: string;
      body: Record<string, unknown>;
      title: string;
    }>(
      `SELECT author_id, body, title
       FROM content WHERE slug = 'legacy-content'`,
    );
    expect(content.rows).toEqual([
      {
        author_id: "00000000-0000-4000-8000-000000000001",
        body: {},
        title: "Legacy content",
      },
    ]);

    const journal = await pool.query<{ latest: string }>(
      "SELECT max(created_at)::text AS latest FROM drizzle.__drizzle_migrations",
    );
    expect(journal.rows).toEqual([{ latest: "1783854600000" }]);
  });

  it("rejects a populated 0005 non-super admin document-delete grant", async () => {
    const collisionRole = await pool.query<{ id: string }>(
      `INSERT INTO roles (name, realm_scope)
       VALUES ('collision_operator', 'workforce') RETURNING id`,
    );
    const collisionPermission = await pool.query<{ id: string }>(
      `INSERT INTO permissions (key, name)
       VALUES ('admin:docs:delete', 'Collision') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       VALUES ($1, $2)`,
      [collisionRole.rows[0]?.id, collisionPermission.rows[0]?.id],
    );

    await expect(migrate(database, { migrationsFolder })).rejects.toMatchObject(
      {
        cause: expect.objectContaining({ code: "23514" }),
      },
    );

    const state = await pool.query<{
      collision_grants: string;
      latest: string;
      revision_column: string | null;
    }>(`SELECT
        (SELECT max(created_at)::text FROM drizzle.__drizzle_migrations) AS latest,
        (SELECT count(*)::text FROM role_permissions rp
           JOIN permissions p ON p.id = rp.permission_id
          WHERE p.key = 'admin:docs:delete') AS collision_grants,
        (SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'content'
            AND column_name = 'revision') AS revision_column`);
    expect(state.rows).toEqual([
      {
        collision_grants: "1",
        latest: "1783854600000",
        revision_column: null,
      },
    ]);

    await pool.query("DELETE FROM role_permissions WHERE permission_id = $1", [
      collisionPermission.rows[0]?.id,
    ]);
    await pool.query("DELETE FROM permissions WHERE id = $1", [
      collisionPermission.rows[0]?.id,
    ]);
    await pool.query("DELETE FROM roles WHERE id = $1", [
      collisionRole.rows[0]?.id,
    ]);
  });

  it("upgrades populated 0005 content through 0006 without losing data", async () => {
    await migrate(database, { migrationsFolder });

    const content = await pool.query<{
      author_id: string;
      body: Record<string, unknown>;
      published_revision: number | null;
      revision: number;
      row_version: number;
      title: string;
    }>(
      `SELECT author_id, body, title, revision, row_version, published_revision
       FROM content WHERE slug = 'legacy-content'`,
    );
    expect(content.rows).toEqual([
      {
        author_id: "00000000-0000-4000-8000-000000000001",
        body: {},
        title: "Legacy content",
        revision: 1,
        row_version: 1,
        published_revision: null,
      },
    ]);

    const constraints = await pool.query<{ conname: string; contype: string }>(
      `SELECT conname, contype
       FROM pg_constraint
       WHERE conname IN (
         'content_revision_positive_check',
         'content_row_version_positive_check',
         'content_published_revision_check',
         'content_published_revision_fk',
         'content_revisions_content_id_content_id_fk',
         'content_revisions_created_by_users_id_fk',
         'content_revisions_revision_positive_check'
       )
       ORDER BY conname`,
    );
    expect(constraints.rows).toEqual([
      { conname: "content_published_revision_check", contype: "c" },
      { conname: "content_published_revision_fk", contype: "f" },
      { conname: "content_revision_positive_check", contype: "c" },
      {
        conname: "content_revisions_content_id_content_id_fk",
        contype: "f",
      },
      {
        conname: "content_revisions_created_by_users_id_fk",
        contype: "f",
      },
      {
        conname: "content_revisions_revision_positive_check",
        contype: "c",
      },
      { conname: "content_row_version_positive_check", contype: "c" },
    ]);

    await expect(
      pool.query(
        "UPDATE content SET revision = 0 WHERE slug = 'legacy-content'",
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "UPDATE content SET published_revision = 1 WHERE slug = 'legacy-content'",
      ),
    ).rejects.toMatchObject({ code: "23503" });

    const journal = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    expect(journal.rows).toEqual([{ count: "7" }]);
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
