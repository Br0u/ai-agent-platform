import { fileURLToPath } from "node:url";
import path from "node:path";

import { Pool, type PoolClient } from "pg";

import { hashPassword } from "./credentials/password";

export type E2EEnvironment = {
  customerPassword: string;
  staffPassword: string;
  adminPassword: string;
  pendingCustomerSessionToken: string;
  disabledCustomerSessionToken: string;
  staffSessionToken: string;
  roleTargetSessionToken: string;
  adminSessionToken: string;
  noTotpAdminSessionToken: string;
  revokedSessionToken: string;
  replacementPassword: string;
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
  pendingCustomer: {
    id: "10000000-0000-4000-8000-000000000004",
    email: "pending.fixture@example.invalid",
    username: null,
    realm: "customer",
    status: "pending_review",
    role: "customer_member",
  },
  disabledCustomer: {
    id: "10000000-0000-4000-8000-000000000005",
    email: "disabled.fixture@example.invalid",
    username: null,
    realm: "customer",
    status: "disabled",
    role: "customer_member",
  },
  staff: {
    id: "10000000-0000-4000-8000-000000000002",
    email: "staff.fixture@example.invalid",
    username: "staff.fixture",
    realm: "workforce",
    status: "active",
    role: "employee",
  },
  roleTarget: {
    id: "10000000-0000-4000-8000-000000000006",
    email: "role-target.fixture@example.invalid",
    username: "role-target.fixture",
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
  },
  noTotpAdmin: {
    id: "10000000-0000-4000-8000-000000000007",
    email: "no-totp-admin.fixture@example.invalid",
    username: "no-totp-admin.fixture",
    realm: "workforce",
    status: "active",
    role: "admin",
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
    [
      "E2E_PENDING_CUSTOMER_SESSION_TOKEN",
      env.E2E_PENDING_CUSTOMER_SESSION_TOKEN,
    ],
    [
      "E2E_DISABLED_CUSTOMER_SESSION_TOKEN",
      env.E2E_DISABLED_CUSTOMER_SESSION_TOKEN,
    ],
    ["E2E_STAFF_SESSION_TOKEN", env.E2E_STAFF_SESSION_TOKEN],
    ["E2E_ROLE_TARGET_SESSION_TOKEN", env.E2E_ROLE_TARGET_SESSION_TOKEN],
    ["E2E_ADMIN_SESSION_TOKEN", env.E2E_ADMIN_SESSION_TOKEN],
    ["E2E_NO_TOTP_ADMIN_SESSION_TOKEN", env.E2E_NO_TOTP_ADMIN_SESSION_TOKEN],
    ["E2E_REVOKED_SESSION_TOKEN", env.E2E_REVOKED_SESSION_TOKEN],
    ["E2E_REPLACEMENT_PASSWORD", env.E2E_REPLACEMENT_PASSWORD],
  ] as const;
  for (const [name, value] of values) {
    if (!value) throw new Error(`${name} is required`);
  }
  return {
    customerPassword: env.E2E_CUSTOMER_PASSWORD!,
    staffPassword: env.E2E_STAFF_PASSWORD!,
    adminPassword: env.E2E_ADMIN_PASSWORD!,
    pendingCustomerSessionToken: env.E2E_PENDING_CUSTOMER_SESSION_TOKEN!,
    disabledCustomerSessionToken: env.E2E_DISABLED_CUSTOMER_SESSION_TOKEN!,
    staffSessionToken: env.E2E_STAFF_SESSION_TOKEN!,
    roleTargetSessionToken: env.E2E_ROLE_TARGET_SESSION_TOKEN!,
    adminSessionToken: env.E2E_ADMIN_SESSION_TOKEN!,
    noTotpAdminSessionToken: env.E2E_NO_TOTP_ADMIN_SESSION_TOKEN!,
    revokedSessionToken: env.E2E_REVOKED_SESSION_TOKEN!,
    replacementPassword: env.E2E_REPLACEMENT_PASSWORD!,
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
       name = EXCLUDED.name, email = EXCLUDED.email, email_verified = true,
       image = NULL, two_factor_enabled = false, identity_realm = EXCLUDED.identity_realm,
       status = EXCLUDED.status, email_verification_status = 'verified',
       username = EXCLUDED.username, display_username = EXCLUDED.display_username,
       must_change_password = false, last_login_at = NULL, updated_at = now()`,
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
     ON CONFLICT (provider_id, account_id) DO UPDATE SET
       user_id = EXCLUDED.user_id, password = EXCLUDED.password,
       access_token = NULL, refresh_token = NULL, id_token = NULL,
       access_token_expires_at = NULL, refresh_token_expires_at = NULL,
       scope = NULL, updated_at = now()`,
    [identity.id, identity.id, passwordHash],
  );
  await client.query("DELETE FROM user_roles WHERE user_id = $1", [
    identity.id,
  ]);
  await client.query(
    `INSERT INTO user_roles (id, user_id, role_id)
     SELECT gen_random_uuid(), $1, id FROM roles WHERE name = $2 AND realm_scope = $3
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [identity.id, identity.role, identity.realm],
  );
}

export async function seedAuthE2EFixtures(
  client: PoolClient,
  credentials: E2EEnvironment,
): Promise<void> {
  const fixtureUserIds = Object.values(fixtureIdentities).map(
    (identity) => identity.id,
  );

  await client.query("BEGIN");
  try {
    await client.query(
      "DELETE FROM two_factors WHERE user_id = ANY($1::uuid[])",
      [fixtureUserIds],
    );
    await upsertIdentity(
      client,
      fixtureIdentities.customer,
      credentials.customerPassword,
    );
    await upsertIdentity(
      client,
      fixtureIdentities.pendingCustomer,
      credentials.customerPassword,
    );
    await client.query(
      "UPDATE users SET email_verified = false, email_verification_status = 'pending' WHERE id = $1",
      [fixtureIdentities.pendingCustomer.id],
    );
    await upsertIdentity(
      client,
      fixtureIdentities.disabledCustomer,
      credentials.customerPassword,
    );
    await upsertIdentity(
      client,
      fixtureIdentities.staff,
      credentials.staffPassword,
    );
    await upsertIdentity(
      client,
      fixtureIdentities.roleTarget,
      credentials.staffPassword,
    );
    await client.query(
      `INSERT INTO user_roles (id, user_id, role_id)
       SELECT gen_random_uuid(), $1, id FROM roles
       WHERE name = 'support_operator' AND realm_scope = 'workforce'
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [fixtureIdentities.roleTarget.id],
    );
    await upsertIdentity(
      client,
      fixtureIdentities.admin,
      credentials.adminPassword,
    );
    await upsertIdentity(
      client,
      fixtureIdentities.noTotpAdmin,
      credentials.adminPassword,
    );
    await client.query(
      "DELETE FROM organization_memberships WHERE user_id = ANY($1::uuid[])",
      [fixtureUserIds],
    );
    await client.query(
      `DELETE FROM sessions
       WHERE (user_id = ANY($1::uuid[]) OR id = '10000000-0000-4000-8000-000000000020')
         AND token <> $2`,
      [fixtureUserIds, credentials.adminSessionToken],
    );
    await client.query(
      "UPDATE users SET two_factor_enabled = false WHERE id = $1",
      [fixtureIdentities.admin.id],
    );
    await client.query(
      "UPDATE users SET two_factor_enabled = true WHERE id = $1",
      [fixtureIdentities.staff.id],
    );
    await client.query(
      "UPDATE users SET two_factor_enabled = true WHERE id = $1",
      [fixtureIdentities.roleTarget.id],
    );
    // Model a real revocation edge: the session exists first, then the account
    // is disabled. The database correctly forbids creating a new disabled-user
    // session.
    await client.query("UPDATE users SET status = 'active' WHERE id = $1", [
      fixtureIdentities.disabledCustomer.id,
    ]);
    await client.query(
      `INSERT INTO sessions
        (id, token, user_id, expires_at, ip_address, user_agent, realm, mfa_verified_at)
        VALUES
         ('10000000-0000-4000-8000-000000000020', $1, $3, now() + interval '1 day', NULL, 'auth-e2e-admin-fixture', 'workforce', now()),
         ('10000000-0000-4000-8000-000000000021', $2, $3, now() + interval '1 day', NULL, 'auth-e2e-revoked-fixture', 'workforce', now()),
         ('10000000-0000-4000-8000-000000000022', $4, $5, now() + interval '1 day', NULL, 'auth-e2e-staff-fixture', 'workforce', now()),
         ('10000000-0000-4000-8000-000000000023', $6, $7, now() + interval '1 day', NULL, 'auth-e2e-pending-customer-fixture', 'customer', NULL),
         ('10000000-0000-4000-8000-000000000024', $8, $9, now() + interval '1 day', NULL, 'auth-e2e-disabled-customer-fixture', 'customer', NULL)
         ,('10000000-0000-4000-8000-000000000025', $10, $11, now() + interval '1 day', NULL, 'auth-e2e-role-target-fixture', 'workforce', now())
         ,('10000000-0000-4000-8000-000000000026', $12, $13, now() + interval '1 day', NULL, 'auth-e2e-no-totp-admin-fixture', 'workforce', NULL)
       ON CONFLICT (token) DO UPDATE SET
         id = EXCLUDED.id, user_id = EXCLUDED.user_id, realm = EXCLUDED.realm,
         expires_at = EXCLUDED.expires_at, ip_address = EXCLUDED.ip_address,
         user_agent = EXCLUDED.user_agent,
         mfa_verified_at = EXCLUDED.mfa_verified_at, updated_at = now()`,
      [
        credentials.adminSessionToken,
        credentials.revokedSessionToken,
        fixtureIdentities.admin.id,
        credentials.staffSessionToken,
        fixtureIdentities.staff.id,
        credentials.pendingCustomerSessionToken,
        fixtureIdentities.pendingCustomer.id,
        credentials.disabledCustomerSessionToken,
        fixtureIdentities.disabledCustomer.id,
        credentials.roleTargetSessionToken,
        fixtureIdentities.roleTarget.id,
        credentials.noTotpAdminSessionToken,
        fixtureIdentities.noTotpAdmin.id,
      ],
    );
    await client.query("UPDATE users SET status = 'disabled' WHERE id = $1", [
      fixtureIdentities.disabledCustomer.id,
    ]);
    await client.query(
      `INSERT INTO customer_registrations
        (id, user_id, company_name, status)
       VALUES ('10000000-0000-4000-8000-000000000030', $1, 'E2E Pending Fixture Company', 'pending_review')
       ON CONFLICT (id) DO UPDATE SET
         user_id = EXCLUDED.user_id, company_name = EXCLUDED.company_name,
         status = EXCLUDED.status, reviewer_user_id = NULL,
         review_note = NULL, reviewed_at = NULL, updated_at = now()`,
      [fixtureIdentities.pendingCustomer.id],
    );
    await client.query(
      `INSERT INTO organizations (id, legal_name, legal_name_key, status)
       VALUES ('10000000-0000-4000-8000-000000000010', 'E2E Fixture Company', 'e2e fixture company', 'active')
       ON CONFLICT (id) DO UPDATE SET
         legal_name = EXCLUDED.legal_name, legal_name_key = EXCLUDED.legal_name_key,
         status = EXCLUDED.status, updated_at = now()`,
    );
    await client.query(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role)
       VALUES ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000010', $1, 'owner')
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner', updated_at = now()`,
      [fixtureIdentities.customer.id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  const credentials = assertE2EEnvironment(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await seedAuthE2EFixtures(client, credentials);
    console.log("Auth E2E fixtures seeded.");
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
