import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertSafeIdentityMigrationTestDatabaseUrl,
  createDrizzleAccessControlRepository,
  databaseSchema,
  seedAccessControl,
} from "@ai-agent-platform/database";

import {
  createDatabaseRolePermissionRepository,
  createRolePermissionService,
  type RolePermissionTransactionRepository,
} from "./roles";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeTestDatabaseUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeTestDatabaseUrl
  ? describe.sequential
  : describe.skip;

const ACTOR_ID = "00000000-0000-4000-8000-000000000701";
const SUPER_ROLE_ID = "00000000-0000-4000-8000-000000000702";
const TARGET_ROLE_ID = "00000000-0000-4000-8000-000000000703";
const USERS_PERMISSION_ID = "00000000-0000-4000-8000-000000000704";
const SITE_PERMISSION_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const migrationsFolder = resolve(
  process.cwd(),
  "../../packages/database/drizzle",
);

type Database = NodePgDatabase<typeof databaseSchema>;

function deferred() {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describePostgres("PostgreSQL role permission replacement", () => {
  const setupPool = new Pool({ connectionString: safeTestDatabaseUrl });
  const firstPool = new Pool({
    connectionString: safeTestDatabaseUrl,
    application_name: "role-replace-first",
    max: 1,
  });
  const secondPool = new Pool({
    connectionString: safeTestDatabaseUrl,
    application_name: "role-replace-second",
    max: 1,
  });
  const seedPool = new Pool({
    connectionString: safeTestDatabaseUrl,
    application_name: "role-seed",
    max: 1,
  });
  const setupDatabase = drizzle(setupPool, { schema: databaseSchema });
  const firstDatabase = drizzle(firstPool, { schema: databaseSchema });
  const secondQueries: string[] = [];
  const secondDatabase = drizzle(secondPool, {
    schema: databaseSchema,
    logger: { logQuery: (query) => secondQueries.push(query) },
  });
  const seedDatabase = drizzle(seedPool, { schema: databaseSchema });

  beforeAll(async () => {
    await setupPool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await setupPool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await setupPool.query("CREATE SCHEMA public");
    await migrate(setupDatabase, { migrationsFolder });
  });

  beforeEach(async () => {
    secondQueries.length = 0;
    await setupPool.query(
      "TRUNCATE audit_logs, role_permissions, user_roles, permissions, roles, users CASCADE",
    );
    await setupPool.query(
      `INSERT INTO roles (id, name, realm_scope) VALUES
         ($1, 'super_admin', 'workforce'),
         ($2, 'custom_operator', 'workforce')`,
      [SUPER_ROLE_ID, TARGET_ROLE_ID],
    );
    await setupPool.query(
      `INSERT INTO permissions (key, name) VALUES
         ('admin:roles', 'Roles'),
         ('admin:permission:a', 'A'),
         ('admin:permission:b', 'B'),
         ('admin:permission:c', 'C')`,
    );
    await setupPool.query(
      `INSERT INTO permissions (id, key, name) VALUES
         ($1, 'admin:users', 'Users'),
         ($2, 'admin:site', 'Site')`,
      [USERS_PERMISSION_ID, SITE_PERMISSION_ID],
    );
    await setupPool.query(
      `INSERT INTO users
         (id, name, email, identity_realm, status, email_verification_status)
       VALUES ($1, 'Root', 'role-lock-root@example.test', 'workforce', 'active', 'verified')`,
      [ACTOR_ID],
    );
    await setupPool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [ACTOR_ID, SUPER_ROLE_ID],
    );
    await setupPool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1::uuid, id FROM permissions WHERE key = 'admin:roles'
       UNION ALL
       SELECT $2::uuid, id FROM permissions WHERE key = 'admin:permission:a'`,
      [SUPER_ROLE_ID, TARGET_ROLE_ID],
    );
  });

  afterAll(async () => {
    await Promise.all([
      firstPool.end(),
      secondPool.end(),
      seedPool.end(),
      setupPool.end(),
    ]);
  });

  function transactionRepository(
    database: Database,
    afterWork?: () => Promise<void>,
  ): RolePermissionTransactionRepository {
    return {
      transaction: (work) =>
        database.transaction(async (transaction) => {
          const executor = transaction as unknown as Parameters<
            typeof createDatabaseRolePermissionRepository
          >[0];
          const result = await work(
            createDatabaseRolePermissionRepository(executor),
          );
          await afterWork?.();
          return result;
        }),
    };
  }

  function service(repository: RolePermissionTransactionRepository) {
    return createRolePermissionService({
      repository,
      requireSensitiveAction: async () => ({ userId: ACTOR_ID }),
    });
  }

  async function waitForSecondRoleLock(): Promise<void> {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const activity = await setupPool.query<{ waiting: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_stat_activity
           WHERE application_name = 'role-replace-second'
             AND state = 'active'
             AND wait_event_type = 'Lock'
         ) AS waiting`,
      );
      if (activity.rows[0]?.waiting) return;
      await delay(20);
    }
    throw new Error("second replacement did not block on the target role");
  }

  async function waitForSeedLock(): Promise<string> {
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      const activity = await setupPool.query<{ wait_event: string }>(
        `SELECT wait_event FROM pg_stat_activity
         WHERE application_name = 'role-seed'
           AND state = 'active'
           AND wait_event_type = 'Lock'`,
      );
      if (activity.rows[0]?.wait_event) return activity.rows[0].wait_event;
      await delay(20);
    }
    throw new Error("seed did not wait for permission mutation serialization");
  }

  it("serializes exact concurrent replacements on the target role", async () => {
    const firstReadyToCommit = deferred();
    const releaseFirstCommit = deferred();
    const first = service(
      transactionRepository(firstDatabase, async () => {
        firstReadyToCommit.resolve();
        await releaseFirstCommit.promise;
      }),
    ).replacePermissions(TARGET_ROLE_ID, [
      "admin:permission:a",
      "admin:permission:b",
    ]);
    await firstReadyToCommit.promise;

    const second = service(
      transactionRepository(secondDatabase),
    ).replacePermissions(TARGET_ROLE_ID, [
      "admin:permission:a",
      "admin:permission:c",
    ]);

    let lockWaitError: unknown;
    try {
      await waitForSecondRoleLock();
    } catch (error) {
      lockWaitError = error;
    } finally {
      releaseFirstCommit.resolve();
    }

    const results = await Promise.allSettled([first, second]);
    const finalPermissions = await setupPool.query<{ key: string }>(
      `SELECT p.key
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1
       ORDER BY p.key`,
      [TARGET_ROLE_ID],
    );
    expect(finalPermissions.rows.map(({ key }) => key)).toEqual([
      "admin:permission:a",
      "admin:permission:c",
    ]);
    expect(lockWaitError).toBeUndefined();
    expect(results).toEqual([
      { status: "fulfilled", value: undefined },
      { status: "fulfilled", value: undefined },
    ]);
    const permissionLock = secondQueries.findIndex(
      (query) =>
        /from "permissions" left join "role_permissions"/u.test(query) &&
        /for share of "permissions"/u.test(query),
    );
    const childMutation = secondQueries.findIndex((query) =>
      /delete from "role_permissions"/u.test(query),
    );
    expect(permissionLock).toBeGreaterThan(-1);
    expect(childMutation).toBeGreaterThan(permissionLock);
  });

  it("serializes seed against a custom-role replacement before reversed permission locks", async () => {
    const adminReadyToCommit = deferred();
    const releaseAdminCommit = deferred();
    const admin = service(
      transactionRepository(firstDatabase, async () => {
        adminReadyToCommit.resolve();
        await releaseAdminCommit.promise;
      }),
    ).replacePermissions(TARGET_ROLE_ID, ["admin:site", "admin:users"]);
    await adminReadyToCommit.promise;

    const seed = seedAccessControl(
      createDrizzleAccessControlRepository(seedDatabase),
    );
    let waitEvent: string | undefined;
    try {
      waitEvent = await waitForSeedLock();
    } finally {
      releaseAdminCommit.resolve();
    }

    await expect(Promise.all([admin, seed])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(waitEvent).toBe("advisory");
    const finalPermissions = await setupPool.query<{ key: string }>(
      `SELECT p.key
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1
       ORDER BY p.key`,
      [TARGET_ROLE_ID],
    );
    expect(finalPermissions.rows.map(({ key }) => key)).toEqual([
      "admin:site",
      "admin:users",
    ]);
  });
});
