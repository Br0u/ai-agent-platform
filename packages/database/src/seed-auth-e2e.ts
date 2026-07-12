import { fileURLToPath } from "node:url";
import path from "node:path";

import { Pool, type PoolClient } from "pg";

import { hashPassword } from "./credentials/password";

type E2EEnvironment = {
  customerPassword: string;
  staffPassword: string;
  adminPassword: string;
};

export const fixtureIdentities = {
  customer: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "customer.fixture@example.invalid",
    username: null,
    realm: "customer",
    status: "active",
    role: "customer_admin",
  },
  staff: {
    id: "10000000-0000-4000-8000-000000000002",
    email: "staff.fixture@example.invalid",
    username: "staff.fixture",
    realm: "workforce",
    status: "active",
    role: "employee",
  },
  admin: {
    id: "10000000-0000-4000-8000-000000000003",
    email: "admin.fixture@example.invalid",
    username: "admin.fixture",
    realm: "workforce",
    status: "active",
    role: "admin",
    sessionToken: "e2e-admin-session",
  },
} as const;

export function assertE2EEnvironment(
  env: Record<string, string | undefined>,
): E2EEnvironment {
  if (env.NODE_ENV !== "test") throw new Error("Auth E2E seed is test-only");
  const values = [
    ["E2E_CUSTOMER_PASSWORD", env.E2E_CUSTOMER_PASSWORD],
    ["E2E_STAFF_PASSWORD", env.E2E_STAFF_PASSWORD],
    ["E2E_ADMIN_PASSWORD", env.E2E_ADMIN_PASSWORD],
  ] as const;
  for (const [name, value] of values) {
    if (!value) throw new Error(`${name} is required`);
  }
  return {
    customerPassword: env.E2E_CUSTOMER_PASSWORD!,
    staffPassword: env.E2E_STAFF_PASSWORD!,
    adminPassword: env.E2E_ADMIN_PASSWORD!,
  };
}

async function upsertIdentity(
  client: PoolClient,
  identity: (typeof fixtureIdentities)[keyof typeof fixtureIdentities],
  password: string,
): Promise<void> {
  const username = identity.username;
  await client.query(
    `INSERT INTO users
      (id, name, email, email_verified, identity_realm, status,
       email_verification_status, username, display_username, must_change_password)
     VALUES ($1, $2, $3, true, $4, $5, 'verified', $6, $6, false)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, email = EXCLUDED.email, identity_realm = EXCLUDED.identity_realm,
       status = EXCLUDED.status, email_verification_status = 'verified',
       username = EXCLUDED.username, display_username = EXCLUDED.display_username,
       must_change_password = false, updated_at = now()`,
    [
      identity.id,
      username ?? identity.email,
      identity.email,
      identity.realm,
      identity.status,
      username,
    ],
  );
  const passwordHash = await hashPassword(password);
  await client.query(
    `INSERT INTO accounts (id, account_id, provider_id, user_id, password)
      VALUES (gen_random_uuid(), $1, 'credential', $2::uuid, $3)
     ON CONFLICT (provider_id, account_id) DO UPDATE SET password = EXCLUDED.password, updated_at = now()`,
    [identity.id, identity.id, passwordHash],
  );
  await client.query(
    `INSERT INTO user_roles (id, user_id, role_id)
     SELECT gen_random_uuid(), $1, id FROM roles WHERE name = $2 AND realm_scope = $3
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [identity.id, identity.role, identity.realm],
  );
}

async function main(): Promise<void> {
  const credentials = assertE2EEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await upsertIdentity(
      client,
      fixtureIdentities.customer,
      credentials.customerPassword,
    );
    await upsertIdentity(
      client,
      fixtureIdentities.staff,
      credentials.staffPassword,
    );
    await upsertIdentity(
      client,
      fixtureIdentities.admin,
      credentials.adminPassword,
    );
    await client.query(
      "UPDATE users SET two_factor_enabled = true WHERE id = $1",
      [fixtureIdentities.admin.id],
    );
    await client.query(
      `INSERT INTO sessions (id, token, user_id, expires_at, realm, mfa_verified_at)
       VALUES ('10000000-0000-4000-8000-000000000020', $1, $2, now() + interval '1 day', 'workforce', now())
       ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at, mfa_verified_at = now()`,
      [fixtureIdentities.admin.sessionToken, fixtureIdentities.admin.id],
    );
    await client.query(
      `INSERT INTO organizations (id, legal_name, legal_name_key, status)
       VALUES ('10000000-0000-4000-8000-000000000010', 'E2E Fixture Company', 'e2e fixture company', 'active')
       ON CONFLICT (id) DO UPDATE SET status = 'active', updated_at = now()`,
    );
    await client.query(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role)
       VALUES ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000010', $1, 'owner')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', updated_at = now()`,
      [fixtureIdentities.customer.id],
    );
    await client.query("COMMIT");
    console.log("Auth E2E fixtures seeded.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const entryPoint = process.argv[1];
if (entryPoint && fileURLToPath(import.meta.url) === path.resolve(entryPoint)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "E2E seed failed");
    process.exitCode = 1;
  });
}
