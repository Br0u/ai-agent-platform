import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  assertSafeIdentityMigrationTestDatabaseUrl,
  databaseSchema,
} from "@ai-agent-platform/database";

import {
  createAccessService,
  createDatabaseAccessRepository,
  type AccessRepository,
} from "./access";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeTestDatabaseUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeTestDatabaseUrl
  ? describe.sequential
  : describe.skip;

const CUSTOMER_ID = "00000000-0000-4000-8000-000000000501";
const WORKFORCE_ID = "00000000-0000-4000-8000-000000000502";
const migrationsFolder = resolve(
  process.cwd(),
  "../../packages/database/drizzle",
);

describePostgres("PostgreSQL secure access repository", () => {
  const pool = new Pool({ connectionString: safeTestDatabaseUrl });
  const database = drizzle(pool, { schema: databaseSchema });
  let repository: AccessRepository;

  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    await migrate(database, { migrationsFolder });
    repository = createDatabaseAccessRepository(database);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE audit_logs, role_permissions, user_roles, permissions, roles, organization_memberships, organizations, sessions, accounts, users CASCADE",
    );
    await pool.query(
      `INSERT INTO users
         (id, name, email, identity_realm, status, email_verification_status)
       VALUES
         ($1, 'Customer', 'access-customer@example.test', 'customer', 'active', 'verified'),
         ($2, 'Workforce', 'access-workforce@example.test', 'workforce', 'active', 'verified')`,
      [CUSTOMER_ID, WORKFORCE_ID],
    );
  });

  afterAll(async () => pool.end());

  function customerAccess() {
    return createAccessService({
      authenticators: {
        customer: async () => ({ userId: CUSTOMER_ID, realm: "customer" }),
        workforce: async () => null,
      },
      repository,
      getHeaders: async () => new Headers(),
    });
  }

  async function insertOrganization(
    legalName: string,
    status: "pending_review" | "active" | "disabled" | "rejected",
  ) {
    const organization = await pool.query<{ id: string }>(
      `INSERT INTO organizations (legal_name, legal_name_key, status)
       VALUES ($1::text, lower($1::text), $2::organization_status) RETURNING id`,
      [legalName, status],
    );
    await pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [organization.rows[0]?.id, CUSTOMER_ID],
    );
  }

  it("denies zero or ambiguous memberships and accepts exactly one active organization", async () => {
    await expect(customerAccess().requireCustomer()).rejects.toMatchObject({
      code: "AUTH_ORGANIZATION_REQUIRED",
    });

    await insertOrganization("Org One", "active");
    await expect(customerAccess().requireCustomer()).resolves.toMatchObject({
      organization: { legalName: "Org One", status: "active" },
      organizationMembershipCount: 1,
    });

    await insertOrganization("Org Two", "active");
    await expect(customerAccess().requireCustomer()).rejects.toMatchObject({
      code: "AUTH_ORGANIZATION_AMBIGUOUS",
    });
    await expect(
      repository.findCustomerOrganizations(CUSTOMER_ID),
    ).resolves.toHaveLength(2);
  });

  it.each(["pending_review", "disabled", "rejected"] as const)(
    "denies a %s organization for console access",
    async (status) => {
      await insertOrganization(`Org ${status}`, status);
      await expect(customerAccess().requireCustomer()).rejects.toMatchObject({
        code: "AUTH_ORGANIZATION_NOT_ACTIVE",
      });
    },
  );

  it("uses exact-realm distinct grants and observes role/grant deletion immediately", async () => {
    await pool.query(
      `INSERT INTO permissions (key, name) VALUES
        ('admin:users', 'Workforce'),
        ('console:team', 'Customer'),
        ('legacy:global', 'Global')`,
    );
    await pool.query(
      `INSERT INTO roles (name, realm_scope) VALUES
        ('workforce-test', 'workforce'),
        ('customer-test', 'customer'),
        ('global-test', 'global')`,
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles`,
      [WORKFORCE_ID],
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r JOIN permissions p ON
          (r.name = 'workforce-test' AND p.key = 'admin:users') OR
          (r.name = 'customer-test' AND p.key = 'console:team') OR
          (r.name = 'global-test' AND p.key = 'legacy:global')`,
    );

    await expect(
      repository.findPermissionKeys(WORKFORCE_ID, "workforce"),
    ).resolves.toEqual(["admin:users"]);

    await pool.query(
      `DELETE FROM role_permissions rp USING roles r
       WHERE rp.role_id = r.id AND r.name = 'workforce-test'`,
    );
    await expect(
      repository.findPermissionKeys(WORKFORCE_ID, "workforce"),
    ).resolves.toEqual([]);

    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r, permissions p
       WHERE r.name = 'workforce-test' AND p.key = 'admin:users'`,
    );
    await pool.query(
      `DELETE FROM user_roles ur USING roles r
       WHERE ur.role_id = r.id AND r.name = 'workforce-test'`,
    );
    await expect(
      repository.findPermissionKeys(WORKFORCE_ID, "workforce"),
    ).resolves.toEqual([]);
  });

  it("executes organization and permission joins in one roundtrip each", async () => {
    await insertOrganization("Single Query Org", "active");
    await pool.query(
      "INSERT INTO permissions (key, name) VALUES ('admin:users', 'Users')",
    );
    await pool.query(
      "INSERT INTO roles (name, realm_scope) VALUES ('single-query-role', 'workforce')",
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = 'single-query-role'`,
      [WORKFORCE_ID],
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r, permissions p
       WHERE r.name = 'single-query-role' AND p.key = 'admin:users'`,
    );
    const queries: string[] = [];
    const countedDatabase = drizzle(pool, {
      schema: databaseSchema,
      logger: { logQuery: (query) => queries.push(query) },
    });
    const countedRepository = createDatabaseAccessRepository(countedDatabase);

    await countedRepository.findCustomerOrganizations(CUSTOMER_ID);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/inner join.*organizations/iu);

    queries.length = 0;
    await countedRepository.findPermissionKeys(WORKFORCE_ID, "workforce");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/select distinct/iu);
    expect(queries[0]).toMatch(/inner join.*role_permissions/iu);
  });

  it("propagates PostgreSQL client failures", async () => {
    const endedPool = new Pool({ connectionString: safeTestDatabaseUrl });
    const endedDatabase = drizzle(endedPool, { schema: databaseSchema });
    const endedRepository = createDatabaseAccessRepository(endedDatabase);
    await endedPool.end();

    await expect(endedRepository.findUserById(CUSTOMER_ID)).rejects.toThrow();
  });
});
