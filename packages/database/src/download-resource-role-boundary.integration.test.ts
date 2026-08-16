import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";
import * as schema from "./schema";

const environmentUrls = {
  owner:
    process.env.ROLE_BOUNDARY_DATABASE_URL ?? process.env.TEST_DATABASE_URL,
  migrator: process.env.MIGRATOR_DATABASE_URL,
  runtime: process.env.RUNTIME_DATABASE_URL,
  backup: process.env.BACKUP_DATABASE_URL,
};

const environmentNames = {
  owner: "ROLE_BOUNDARY_DATABASE_URL (or TEST_DATABASE_URL)",
  migrator: "MIGRATOR_DATABASE_URL",
  runtime: "RUNTIME_DATABASE_URL",
  backup: "BACKUP_DATABASE_URL",
} as const;

const missingEnvironment = Object.entries(environmentUrls)
  .filter(([, value]) => !value)
  .map(([name]) => environmentNames[name as keyof typeof environmentNames]);
const configured = missingEnvironment.length === 0;
const requiredUrls = configured
  ? assertSameLocalTestDatabase(environmentUrls as Record<string, string>)
  : environmentUrls;
const describePostgres = configured ? describe.sequential : describe.skip;
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
const runtimeGrantsFile = fileURLToPath(
  new URL("../../../infra/postgres/02-runtime-grants.sql", import.meta.url),
);

function assertSameLocalTestDatabase(
  urls: Record<string, string>,
): Record<string, string> {
  const ownerUrl = assertSafeIdentityMigrationTestDatabaseUrl(urls.owner ?? "");
  const owner = new URL(ownerUrl);
  const expected = `${owner.hostname}:${owner.port || "5432"}${owner.pathname}`;
  for (const [role, value] of Object.entries(urls)) {
    const parsed = new URL(value);
    const actual = `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
    if (actual !== expected) {
      throw new Error(`${role} must target the dedicated local test database`);
    }
  }
  return urls;
}

async function expectPermissionDenied(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ code: "42501" });
}

describePostgres(
  configured
    ? "Download resource PostgreSQL role boundary"
    : `Download resource PostgreSQL role boundary (missing ${missingEnvironment.join(", ")})`,
  () => {
    const owner = new Pool({ connectionString: requiredUrls.owner });
    const migrator = new Pool({ connectionString: requiredUrls.migrator });
    const runtime = new Pool({ connectionString: requiredUrls.runtime });
    const backup = new Pool({ connectionString: requiredUrls.backup });

    beforeAll(async () => {
      const identities = await Promise.all(
        [migrator, runtime, backup].map(async (pool) => {
          const result = await pool.query<{ current_user: string }>(
            "SELECT current_user",
          );
          return result.rows[0]?.current_user;
        }),
      );
      expect(identities).toEqual([
        "ai_agent_migrator",
        "ai_agent_runtime",
        "ai_agent_backup",
      ]);
      await owner.query(`
        DROP SCHEMA IF EXISTS public CASCADE;
        DROP SCHEMA IF EXISTS drizzle CASCADE;
        CREATE SCHEMA public;
        REVOKE USAGE ON SCHEMA public FROM PUBLIC;
        GRANT USAGE, CREATE ON SCHEMA public TO ai_agent_migrator;
        GRANT USAGE ON SCHEMA public TO ai_agent_runtime, ai_agent_backup;
        REVOKE CREATE ON SCHEMA public FROM ai_agent_runtime, ai_agent_backup;
      `);
      await migrate(drizzle(migrator, { schema }), { migrationsFolder });
      await migrator.query(await readFile(runtimeGrantsFile, "utf8"));
    }, 30_000);

    afterAll(async () => {
      await Promise.all([
        owner.end(),
        migrator.end(),
        runtime.end(),
        backup.end(),
      ]);
    });

    it("allows runtime service CRUD on resources and revisions", async () => {
      const resourceId = randomUUID();
      const revisionId = randomUUID();
      const client = await runtime.connect();
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO download_resources (id, key, admin_label)
           VALUES ($1, $2, 'Role boundary')`,
          [resourceId, `role-boundary-${resourceId}`],
        );
        await client.query(
          `INSERT INTO download_resource_revisions
             (id, resource_id, name, product, category, resource_type,
              description, sort_order, preview_policy, download_policy)
           VALUES ($1, $2, 'Role boundary', '元启', 'materials', '彩页',
             'Runtime CRUD contract', 1, 'public', 'public')`,
          [revisionId, resourceId],
        );
        await expect(
          client.query("SELECT id FROM download_resources WHERE id = $1", [
            resourceId,
          ]),
        ).resolves.toMatchObject({ rowCount: 1 });
        await expect(
          client.query(
            "SELECT id FROM download_resource_revisions WHERE id = $1",
            [revisionId],
          ),
        ).resolves.toMatchObject({ rowCount: 1 });
        await client.query(
          "UPDATE download_resources SET draft_revision_id = $1 WHERE id = $2",
          [revisionId, resourceId],
        );
        await client.query(
          "UPDATE download_resource_revisions SET description = 'updated' WHERE id = $1",
          [revisionId],
        );
        await client.query(
          "UPDATE download_resources SET draft_revision_id = NULL WHERE id = $1",
          [resourceId],
        );
        await client.query(
          "DELETE FROM download_resource_revisions WHERE id = $1",
          [revisionId],
        );
        await client.query("DELETE FROM download_resources WHERE id = $1", [
          resourceId,
        ]);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    it("allows backup reads but denies resource mutations", async () => {
      await expect(
        backup.query("SELECT id FROM download_resources LIMIT 1"),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expect(
        backup.query("SELECT id FROM download_resource_revisions LIMIT 1"),
      ).resolves.toMatchObject({ rowCount: 1 });
      await expectPermissionDenied(
        backup.query(
          "INSERT INTO download_resources (key, admin_label) VALUES ($1, 'forbidden')",
          [`forbidden-${randomUUID()}`],
        ),
      );
      await expectPermissionDenied(
        backup.query(
          "UPDATE download_resources SET admin_label = admin_label WHERE key = 'yuanqi-fullstack'",
        ),
      );
      await expectPermissionDenied(
        backup.query(
          "DELETE FROM download_resource_revisions WHERE resource_id = (SELECT id FROM download_resources WHERE key = 'yuanqi-fullstack')",
        ),
      );
    });

    it("lets the migrator apply schema and create schema objects", async () => {
      await expect(
        migrator.query(
          "SELECT id FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1",
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
      await migrator.query("BEGIN");
      try {
        await expect(
          migrator.query("CREATE TABLE download_migrator_probe (id integer)"),
        ).resolves.toMatchObject({ command: "CREATE" });
      } finally {
        await migrator.query("ROLLBACK");
      }
    });
  },
);
