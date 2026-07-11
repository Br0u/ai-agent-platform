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
  const database = drizzle(pool, { schema });

  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(database, {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  });

  beforeEach(async () => {
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
      { roles: "7", permissions: "17", grants: "44" },
    ]);
  });

  it("removes stale system data, preserves custom data, and replaces grants", async () => {
    await seedAccessControl(createDrizzleAccessControlRepository(database));
    await pool.query(
      `INSERT INTO roles (name, realm_scope, is_system)
       VALUES ('retired_system', 'workforce', true), ('custom_role', 'workforce', false)`,
    );
    await pool.query(
      `INSERT INTO permissions (key, name, managed_by_system)
       VALUES ('admin:retired', 'Retired', true), ('custom:permission', 'Custom', false)`,
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r, permissions p
       WHERE r.name = 'support_operator' AND p.key = 'admin:users'`,
    );

    await seedAccessControl(createDrizzleAccessControlRepository(database));

    const retained = await pool.query<{ name: string }>(
      `SELECT name FROM roles WHERE name IN ('retired_system', 'custom_role')
       UNION ALL
       SELECT key FROM permissions WHERE key IN ('admin:retired', 'custom:permission')
       ORDER BY name`,
    );
    expect(retained.rows).toEqual([
      { name: "custom:permission" },
      { name: "custom_role" },
    ]);
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
