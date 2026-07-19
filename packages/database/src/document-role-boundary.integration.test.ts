import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient, type QueryResult } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";
import {
  createDrizzleAccessControlRepository,
  seedAccessControl,
} from "./seed-access-control";
import * as schema from "./schema";

const environmentUrls = {
  owner:
    process.env.ROLE_BOUNDARY_DATABASE_URL ?? process.env.TEST_DATABASE_URL,
  migrator: process.env.MIGRATOR_DATABASE_URL,
  runtime: process.env.RUNTIME_DATABASE_URL,
};

const environmentNames = {
  owner: "ROLE_BOUNDARY_DATABASE_URL (or TEST_DATABASE_URL)",
  migrator: "MIGRATOR_DATABASE_URL",
  runtime: "RUNTIME_DATABASE_URL",
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

async function expectDatabaseError(
  client: PoolClient,
  operation: () => Promise<QueryResult>,
  code: string,
): Promise<void> {
  await client.query("SAVEPOINT document_boundary_assertion");
  try {
    await expect(operation()).rejects.toMatchObject({ code });
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT document_boundary_assertion");
    await client.query("RELEASE SAVEPOINT document_boundary_assertion");
  }
}

async function waitForBackendLock(
  observer: Pool,
  processId: number,
): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const activity = await observer.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE pid = $1 AND state = 'active' AND wait_event_type = 'Lock'
       ) AS waiting`,
      [processId],
    );
    if (activity.rows[0]?.waiting) return;
    await delay(20);
  }
  throw new Error("grant update did not block on the protected parent role");
}

describePostgres(
  configured
    ? "CMS document PostgreSQL role boundary"
    : `CMS document PostgreSQL role boundary (missing ${missingEnvironment.join(", ")})`,
  () => {
    const owner = new Pool({ connectionString: requiredUrls.owner });
    const migrator = new Pool({ connectionString: requiredUrls.migrator });
    const runtime = new Pool({ connectionString: requiredUrls.runtime });

    beforeAll(async () => {
      const expectedRoles = await owner.query<{ rolname: string }>(
        `SELECT rolname FROM pg_roles
         WHERE rolname IN ('ai_agent_migrator', 'ai_agent_runtime', 'ai_agent_backup')
         ORDER BY rolname`,
      );
      expect(expectedRoles.rows.map(({ rolname }) => rolname)).toEqual([
        "ai_agent_backup",
        "ai_agent_migrator",
        "ai_agent_runtime",
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

      const database = drizzle(migrator, { schema });
      await migrate(database, { migrationsFolder });
      await seedAccessControl(createDrizzleAccessControlRepository(database));
      await migrator.query(await readFile(runtimeGrantsFile, "utf8"));
    }, 30_000);

    afterAll(async () => {
      await Promise.all([owner.end(), migrator.end(), runtime.end()]);
    });

    it("allows only append-only revision and forward-only route writes", async () => {
      const client = await runtime.connect();
      const contentId = randomUUID();
      const revisionId = randomUUID();
      const slug = `role-boundary-${randomUUID()}`;

      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO content (id, type, slug, title, body)
           VALUES ($1, 'document', $2, 'Role boundary', '{}'::jsonb)`,
          [contentId, slug],
        );
        await client.query(
          `INSERT INTO content_revisions
             (id, content_id, revision, slug, title, body)
           VALUES ($1, $2, 1, $3, 'Role boundary', '{}'::jsonb)`,
          [revisionId, contentId, slug],
        );
        await client.query(
          `INSERT INTO content_routes (slug, content_id, state)
           VALUES ($1, $2, 'reserved')`,
          [slug, contentId],
        );

        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET state = 'reserved' WHERE slug = $1",
              [slug],
            ),
          "23514",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET state = 'alias' WHERE slug = $1",
              [slug],
            ),
          "23514",
        );

        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_revisions SET title = 'forbidden' WHERE id = $1",
              [revisionId],
            ),
          "42501",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query("DELETE FROM content_revisions WHERE id = $1", [
              revisionId,
            ]),
          "42501",
        );
        await expectDatabaseError(
          client,
          () => client.query("TRUNCATE content_revisions"),
          "42501",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              `INSERT INTO content_routes (slug, content_id, state)
               VALUES ($1, $2, 'canonical')`,
              [`canonical-insert-${randomUUID()}`, contentId],
            ),
          "23514",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET content_id = $1 WHERE slug = $2",
              [randomUUID(), slug],
            ),
          "42501",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET slug = $1 WHERE slug = $2",
              [`rebound-${randomUUID()}`, slug],
            ),
          "42501",
        );

        await client.query(
          "UPDATE content_routes SET state = 'canonical' WHERE slug = $1",
          [slug],
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET state = 'canonical' WHERE slug = $1",
              [slug],
            ),
          "23514",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET state = 'reserved' WHERE slug = $1",
              [slug],
            ),
          "23514",
        );
        await client.query(
          "UPDATE content_routes SET state = 'alias' WHERE slug = $1",
          [slug],
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET state = 'alias' WHERE slug = $1",
              [slug],
            ),
          "23514",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET state = 'reserved' WHERE slug = $1",
              [slug],
            ),
          "23514",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET state = 'canonical' WHERE slug = $1",
              [slug],
            ),
          "23514",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query("DELETE FROM content_routes WHERE slug = $1", [slug]),
          "42501",
        );
        await expectDatabaseError(
          client,
          () => client.query("TRUNCATE content_routes"),
          "42501",
        );
        await expectDatabaseError(
          client,
          () => client.query("DELETE FROM content WHERE id = $1", [contentId]),
          "42501",
        );
        await expectDatabaseError(
          client,
          () => client.query("TRUNCATE content"),
          "42501",
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    it("keeps trigger boundaries active for the privileged migrator", async () => {
      const client = await migrator.connect();
      const contentId = randomUUID();
      const revisionId = randomUUID();
      const slug = `trigger-boundary-${randomUUID()}`;

      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO content (id, type, slug, title, body)
           VALUES ($1, 'document', $2, 'Trigger boundary', '{}'::jsonb)`,
          [contentId, slug],
        );
        await client.query(
          `INSERT INTO content_revisions
             (id, content_id, revision, slug, title, body)
           VALUES ($1, $2, 1, $3, 'Trigger boundary', '{}'::jsonb)`,
          [revisionId, contentId, slug],
        );
        await client.query(
          `INSERT INTO content_routes (slug, content_id, state)
           VALUES ($1, $2, 'reserved')`,
          [slug, contentId],
        );

        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_revisions SET title = 'forbidden' WHERE id = $1",
              [revisionId],
            ),
          "55000",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query("DELETE FROM content_revisions WHERE id = $1", [
              revisionId,
            ]),
          "55000",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query("DELETE FROM content_routes WHERE slug = $1", [slug]),
          "55000",
        );
        await expectDatabaseError(
          client,
          () =>
            client.query(
              "UPDATE content_routes SET content_id = $1 WHERE slug = $2",
              [randomUUID(), slug],
            ),
          "55000",
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    it("uses a restrictive created-by foreign key without mutating revisions", async () => {
      const client = await migrator.connect();
      const userId = randomUUID();
      const contentId = randomUUID();
      const revisionId = randomUUID();
      const slug = `created-by-boundary-${randomUUID()}`;

      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO users (id, name, email, identity_realm, status)
           VALUES ($1, 'Revision author', $2, 'workforce', 'active')`,
          [userId, `${userId}@example.test`],
        );
        await client.query(
          `INSERT INTO content (id, type, slug, title, body)
           VALUES ($1, 'document', $2, 'Created-by boundary', '{}'::jsonb)`,
          [contentId, slug],
        );
        await client.query(
          `INSERT INTO content_revisions
             (id, content_id, revision, slug, title, body, created_by)
           VALUES ($1, $2, 1, $3, 'Created-by boundary', '{}'::jsonb, $4)`,
          [revisionId, contentId, slug, userId],
        );

        await expectDatabaseError(
          client,
          () => client.query("DELETE FROM users WHERE id = $1", [userId]),
          "23001",
        );
        await expect(
          client.query<{ created_by: string }>(
            "SELECT created_by FROM content_revisions WHERE id = $1",
            [revisionId],
          ),
        ).resolves.toMatchObject({ rows: [{ created_by: userId }] });
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    it("rejects non-super admin document-delete grants for every database role", async () => {
      const ids = await owner.query<{
        admin_role_id: string;
        admin_roles_grant_id: string;
        delete_permission_id: string;
        super_grant_id: string;
        super_role_id: string;
      }>(`SELECT
          (SELECT id FROM roles WHERE name = 'admin' AND realm_scope = 'workforce') AS admin_role_id,
          (SELECT rp.id FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
             JOIN permissions p ON p.id = rp.permission_id
            WHERE r.name = 'admin' AND r.realm_scope = 'workforce'
              AND p.key = 'admin:roles') AS admin_roles_grant_id,
          (SELECT id FROM permissions WHERE key = 'admin:docs:delete') AS delete_permission_id,
          (SELECT rp.id FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
             JOIN permissions p ON p.id = rp.permission_id
            WHERE r.name = 'super_admin' AND r.realm_scope = 'workforce'
              AND p.key = 'admin:docs:delete') AS super_grant_id,
          (SELECT id FROM roles WHERE name = 'super_admin' AND realm_scope = 'workforce') AS super_role_id`);
      const fixture = ids.rows[0];
      expect(fixture).toEqual({
        admin_role_id: expect.any(String),
        admin_roles_grant_id: expect.any(String),
        delete_permission_id: expect.any(String),
        super_grant_id: expect.any(String),
        super_role_id: expect.any(String),
      });

      for (const pool of [runtime, migrator, owner]) {
        const client = await pool.connect();
        await client.query("BEGIN");
        try {
          await expectDatabaseError(
            client,
            () =>
              client.query("DELETE FROM role_permissions WHERE id = $1", [
                fixture?.super_grant_id,
              ]),
            "23514",
          );
          await expectDatabaseError(
            client,
            () =>
              client.query(
                `INSERT INTO role_permissions (role_id, permission_id)
                 VALUES ($1, $2)`,
                [fixture?.admin_role_id, fixture?.delete_permission_id],
              ),
            "23514",
          );
          await expectDatabaseError(
            client,
            () =>
              client.query(
                "UPDATE role_permissions SET permission_id = $1 WHERE id = $2",
                [fixture?.delete_permission_id, fixture?.admin_roles_grant_id],
              ),
            "23514",
          );
          await expectDatabaseError(
            client,
            () =>
              client.query(
                "UPDATE roles SET name = 'super_admin' WHERE id = $1",
                [fixture?.admin_role_id],
              ),
            "23505",
          );
          await expectDatabaseError(
            client,
            () =>
              client.query("DELETE FROM roles WHERE id = $1", [
                fixture?.super_role_id,
              ]),
            "23514",
          );
          await expectDatabaseError(
            client,
            () =>
              client.query(
                "UPDATE roles SET name = 'renamed_super_admin' WHERE id = $1",
                [fixture?.super_role_id],
              ),
            "23514",
          );
          await expectDatabaseError(
            client,
            () =>
              client.query("DELETE FROM permissions WHERE id = $1", [
                fixture?.delete_permission_id,
              ]),
            "23514",
          );
          await expect(
            client.query(
              "UPDATE roles SET description = description WHERE id = $1",
              [fixture?.super_role_id],
            ),
          ).resolves.toMatchObject({ rowCount: 1 });
          await expect(
            client.query(
              "UPDATE permissions SET description = description WHERE id = $1",
              [fixture?.delete_permission_id],
            ),
          ).resolves.toMatchObject({ rowCount: 1 });
          await expectDatabaseError(
            client,
            () =>
              client.query(
                "UPDATE permissions SET key = 'renamed:docs:delete' WHERE id = $1",
                [fixture?.delete_permission_id],
              ),
            "23514",
          );
          await expect(
            client.query(
              "UPDATE role_permissions SET role_id = role_id WHERE id = $1",
              [fixture?.super_grant_id],
            ),
          ).resolves.toMatchObject({ rowCount: 1 });
        } finally {
          await client.query("ROLLBACK");
          client.release();
        }
      }

      const invariant = await owner.query<{
        bad_grants: string;
        protected_grants: string;
        protected_permissions: string;
        reserved_roles: string;
      }>(`SELECT
          (SELECT count(*)::text FROM roles
            WHERE name = 'super_admin' AND realm_scope = 'workforce') AS reserved_roles,
          (SELECT count(*)::text FROM permissions
            WHERE key = 'admin:docs:delete') AS protected_permissions,
          (SELECT count(*)::text FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
             JOIN permissions p ON p.id = rp.permission_id
            WHERE r.name = 'super_admin' AND r.realm_scope = 'workforce'
              AND p.key = 'admin:docs:delete') AS protected_grants,
          (SELECT count(*)::text FROM role_permissions rp
             JOIN roles r ON r.id = rp.role_id
             JOIN permissions p ON p.id = rp.permission_id
            WHERE p.key = 'admin:docs:delete'
              AND (r.name <> 'super_admin' OR r.realm_scope <> 'workforce')) AS bad_grants`);
      expect(invariant.rows).toEqual([
        {
          bad_grants: "0",
          protected_grants: "1",
          protected_permissions: "1",
          reserved_roles: "1",
        },
      ]);
    });

    it.each([
      {
        identity: "role",
        lockSql: "SELECT id FROM roles WHERE id = $1 FOR UPDATE",
        updateSql: "UPDATE roles SET name = name WHERE id = $1",
      },
      {
        identity: "permission",
        lockSql: "SELECT id FROM permissions WHERE id = $1 FOR UPDATE",
        updateSql: "UPDATE permissions SET key = key WHERE id = $1",
      },
    ])(
      "avoids parent-child deadlock during protected $identity identity and grant contention",
      async ({ identity: identityParent, lockSql, updateSql }) => {
        const fixture = await owner.query<{
          grant_id: string;
          permission_id: string;
          role_id: string;
        }>(`SELECT r.id AS role_id, p.id AS permission_id, rp.id AS grant_id
          FROM roles r
          JOIN role_permissions rp ON rp.role_id = r.id
          JOIN permissions p ON p.id = rp.permission_id
          WHERE r.name = 'super_admin' AND r.realm_scope = 'workforce'
            AND p.key = 'admin:docs:delete'`);
        expect(fixture.rows).toHaveLength(1);
        const roleId = fixture.rows[0]?.role_id;
        const permissionId = fixture.rows[0]?.permission_id;
        const grantId = fixture.rows[0]?.grant_id;
        const parentId = identityParent === "role" ? roleId : permissionId;
        const identity = await owner.connect();
        const grant = await owner.connect();
        const grantBackend = await grant.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        );
        let identityOpen = false;
        let grantOpen = false;

        try {
          await identity.query("BEGIN");
          identityOpen = true;
          await grant.query("BEGIN");
          grantOpen = true;
          await identity.query("SET LOCAL statement_timeout = '5s'");
          await identity.query("SET LOCAL deadlock_timeout = '100ms'");
          await grant.query("SET LOCAL statement_timeout = '5s'");
          await grant.query("SET LOCAL deadlock_timeout = '100ms'");
          await identity.query(lockSql, [parentId]);

          const grantUpdate = grant
            .query(
              "UPDATE role_permissions SET role_id = role_id WHERE id = $1",
              [grantId],
            )
            .then(
              (value) => ({ status: "fulfilled" as const, value }),
              (reason: unknown) => ({ status: "rejected" as const, reason }),
            );
          await waitForBackendLock(owner, grantBackend.rows[0]?.pid ?? -1);

          const identityOutcome = await identity
            .query(updateSql, [parentId])
            .then(
              (value) => ({ status: "fulfilled" as const, value }),
              (reason: unknown) => ({ status: "rejected" as const, reason }),
            );
          if (identityOutcome.status === "fulfilled") {
            await identity.query("COMMIT");
          } else {
            await identity.query("ROLLBACK");
          }
          identityOpen = false;

          const grantOutcome = await grantUpdate;
          if (grantOutcome.status === "fulfilled") {
            await grant.query("COMMIT");
          } else {
            await grant.query("ROLLBACK");
          }
          grantOpen = false;

          const rejected = [identityOutcome, grantOutcome].filter(
            (outcome) => outcome.status === "rejected",
          );
          const rejectedCodes = rejected.map((outcome) =>
            "reason" in outcome &&
            typeof outcome.reason === "object" &&
            outcome.reason !== null &&
            "code" in outcome.reason
              ? outcome.reason.code
              : undefined,
          );
          expect(rejectedCodes).not.toContain("40P01");
          expect(identityOutcome).toMatchObject({ status: "fulfilled" });
          expect(grantOutcome).toMatchObject({ status: "fulfilled" });
        } finally {
          if (identityOpen) await identity.query("ROLLBACK");
          if (grantOpen) await grant.query("ROLLBACK");
          identity.release();
          grant.release();
        }

        const invariant = await owner.query<{ protected_grants: string }>(
          `SELECT count(*)::text AS protected_grants
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE r.name = 'super_admin' AND r.realm_scope = 'workforce'
           AND p.key = 'admin:docs:delete'`,
        );
        expect(invariant.rows).toEqual([{ protected_grants: "1" }]);
      },
    );

    it("reports the exact restricted runtime grants", async () => {
      const grants = await owner.query<{
        column_name: string | null;
        privilege_type: string;
        table_name: string;
      }>(`SELECT table_name, privilege_type, column_name
          FROM information_schema.column_privileges
          WHERE table_schema = 'public'
            AND grantee = 'ai_agent_runtime'
            AND table_name = 'content_routes'
            AND privilege_type = 'UPDATE'
          ORDER BY column_name`);

      expect(grants.rows).toEqual([
        {
          table_name: "content_routes",
          privilege_type: "UPDATE",
          column_name: "state",
        },
      ]);
    });
  },
);
