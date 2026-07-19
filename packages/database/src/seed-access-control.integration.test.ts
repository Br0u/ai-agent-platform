import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "./migrations/migration-test-safety";
import {
  createDrizzleAccessControlRepository,
  seedAccessControl,
} from "./seed-access-control";
import * as schema from "./schema";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeTestDatabaseUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeTestDatabaseUrl
  ? describe.sequential
  : describe.skip;

describePostgres("PostgreSQL access-control seed", () => {
  const pool = new Pool({ connectionString: safeTestDatabaseUrl });
  const queries: string[] = [];
  const database = drizzle(pool, {
    schema,
    logger: { logQuery: (query) => queries.push(query) },
  });

  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(database, {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  });

  beforeEach(async () => {
    queries.length = 0;
    await pool.query(
      "TRUNCATE role_permissions, user_roles, permissions, roles CASCADE",
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("serializes concurrent seeds and leaves the exact matrix", async () => {
    await expect(
      Promise.all([
        seedAccessControl(createDrizzleAccessControlRepository(database)),
        seedAccessControl(createDrizzleAccessControlRepository(database)),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    const counts = await pool.query<{
      roles: string;
      permissions: string;
      grants: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM roles) AS roles,
        (SELECT count(*)::text FROM permissions) AS permissions,
        (SELECT count(*)::text FROM role_permissions) AS grants`,
    );
    expect(counts.rows).toEqual([
      { roles: "7", permissions: "21", grants: "49" },
    ]);
    const explicitRoleLock = queries.findIndex(
      (query) => /from "roles"/u.test(query) && /for update/u.test(query),
    );
    const firstPermissionUpsert = queries.findIndex((query) =>
      /insert into "permissions"/u.test(query),
    );
    const permissionLock = queries.findIndex(
      (query) =>
        /from "permissions" left join "role_permissions"/u.test(query) &&
        /for share of "permissions"/u.test(query),
    );
    const childMutation = queries.findIndex((query) =>
      /delete from "role_permissions"/u.test(query),
    );
    expect(explicitRoleLock).toBeGreaterThan(-1);
    expect(firstPermissionUpsert).toBeGreaterThan(explicitRoleLock);
    expect(permissionLock).toBeGreaterThan(firstPermissionUpsert);
    expect(childMutation).toBeGreaterThan(permissionLock);

    const modelPermissions = await pool.query<{
      description: string;
      key: string;
      name: string;
    }>(
      `SELECT key, name, description FROM permissions
       WHERE key IN (
         'admin:assistant:configure',
         'admin:assistant:secret:reveal'
       )
       ORDER BY key`,
    );
    expect(modelPermissions.rows).toEqual([
      {
        key: "admin:assistant:configure",
        name: "配置 AI 助理模型",
        description: "保存、替换 Key、测试和启用 AI 助理模型配置",
      },
      {
        key: "admin:assistant:secret:reveal",
        name: "查看 AI 助理模型密钥",
        description: "查看已保存的 AI 助理模型 Key",
      },
    ]);

    const workforceGrants = await pool.query<{
      name: string;
      permissionKeys: string[];
    }>(
      `SELECT r.name,
              COALESCE(
                array_agg(p.key ORDER BY p.key) FILTER (WHERE p.key IS NOT NULL),
                ARRAY[]::text[]
              ) AS "permissionKeys"
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.realm_scope = 'workforce'
       GROUP BY r.name
       ORDER BY r.name`,
    );
    expect(workforceGrants.rows).toEqual([
      {
        name: "admin",
        permissionKeys: [
          "admin:analytics",
          "admin:assistant",
          "admin:audit",
          "admin:blog",
          "admin:cases",
          "admin:compatibility",
          "admin:docs",
          "admin:faq",
          "admin:marketplace",
          "admin:navigation",
          "admin:products",
          "admin:registrations",
          "admin:releases",
          "admin:roles",
          "admin:site",
          "admin:users",
        ],
      },
      {
        name: "content_operator",
        permissionKeys: [
          "admin:blog",
          "admin:cases",
          "admin:compatibility",
          "admin:docs",
          "admin:faq",
          "admin:marketplace",
          "admin:navigation",
          "admin:products",
          "admin:releases",
          "admin:site",
        ],
      },
      { name: "employee", permissionKeys: [] },
      {
        name: "super_admin",
        permissionKeys: [
          "admin:analytics",
          "admin:assistant",
          "admin:assistant:configure",
          "admin:assistant:secret:reveal",
          "admin:audit",
          "admin:blog",
          "admin:cases",
          "admin:compatibility",
          "admin:docs",
          "admin:docs:delete",
          "admin:faq",
          "admin:marketplace",
          "admin:navigation",
          "admin:products",
          "admin:registrations",
          "admin:releases",
          "admin:roles",
          "admin:site",
          "admin:users",
        ],
      },
      {
        name: "support_operator",
        permissionKeys: ["admin:registrations"],
      },
    ]);
  });

  it("preserves unknown catalog data while replacing manifest grants", async () => {
    await seedAccessControl(createDrizzleAccessControlRepository(database));
    await pool.query(
      `INSERT INTO roles (name, realm_scope)
       VALUES ('legacy_role', 'workforce'), ('custom_role', 'workforce')`,
    );
    await pool.query(
      `INSERT INTO permissions (key, name)
       VALUES ('legacy:permission', 'Legacy'), ('custom:permission', 'Custom')`,
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r, permissions p
       WHERE r.name = 'support_operator' AND p.key = 'admin:users'`,
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r, permissions p
       WHERE r.name = 'legacy_role' AND p.key = 'legacy:permission'`,
    );

    await seedAccessControl(createDrizzleAccessControlRepository(database));

    const retained = await pool.query<{ name: string }>(
      `SELECT name FROM roles WHERE name IN ('legacy_role', 'custom_role')
       UNION ALL
       SELECT key FROM permissions WHERE key IN ('legacy:permission', 'custom:permission')
       ORDER BY name`,
    );
    expect(retained.rows).toEqual([
      { name: "custom:permission" },
      { name: "custom_role" },
      { name: "legacy:permission" },
      { name: "legacy_role" },
    ]);
    const legacyGrants = await pool.query<{ key: string }>(
      `SELECT p.key FROM roles r
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.name = 'legacy_role'`,
    );
    expect(legacyGrants.rows).toEqual([{ key: "legacy:permission" }]);
    const supportGrants = await pool.query<{ key: string }>(
      `SELECT p.key FROM roles r
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.name = 'support_operator' ORDER BY p.key`,
    );
    expect(supportGrants.rows).toEqual([{ key: "admin:registrations" }]);
  });

  it("rolls back every write when grant insertion fails", async () => {
    await pool.query(`
      CREATE FUNCTION fail_role_permission_insert() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'forced grant failure'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_role_permission_insert
      BEFORE INSERT ON role_permissions
      FOR EACH ROW EXECUTE FUNCTION fail_role_permission_insert();
    `);
    try {
      await expect(
        seedAccessControl(createDrizzleAccessControlRepository(database)),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringContaining("forced grant failure"),
        }),
      });
    } finally {
      await pool.query(
        "DROP TRIGGER fail_role_permission_insert ON role_permissions",
      );
      await pool.query("DROP FUNCTION fail_role_permission_insert()");
    }

    const counts = await pool.query<{ roles: string; permissions: string }>(
      `SELECT
        (SELECT count(*)::text FROM roles) AS roles,
        (SELECT count(*)::text FROM permissions) AS permissions`,
    );
    expect(counts.rows).toEqual([{ roles: "0", permissions: "0" }]);
  });
});
