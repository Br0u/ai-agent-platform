import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { databaseSchema } from "@ai-agent-platform/database";

import { assertSafeIdentityMigrationTestDatabaseUrl } from "@ai-agent-platform/database";
import {
  createDatabaseRegistrationRateLimiter,
  createDatabaseRegistrationRepository,
} from "./repository";
import {
  createRegistrationService,
  type RegistrationRepository,
} from "./service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const safeUrl = testDatabaseUrl
  ? assertSafeIdentityMigrationTestDatabaseUrl(testDatabaseUrl)
  : undefined;
const describePostgres = safeUrl ? describe.sequential : describe.skip;

const context = { ipAddress: "203.0.113.9", userAgent: "integration-browser" };

describePostgres("registration PostgreSQL repository", () => {
  const pool = new Pool({ connectionString: safeUrl });
  const database = drizzle(pool, { schema: databaseSchema });
  const repository = createDatabaseRegistrationRepository(database);
  const limiter = createDatabaseRegistrationRateLimiter(database, {
    maximumAttempts: 3,
    windowMs: 60_000,
  });
  const service = createRegistrationService({
    repository,
    limiter,
    hashPassword: async (password) => `test-hash:${password}`,
  });
  let reviewerId: string;

  async function seedReviewer() {
    reviewerId = randomUUID();
    const roleId = randomUUID();
    const permissionId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, name, email, identity_realm, status)
       VALUES ($1, 'Reviewer', $2, 'workforce', 'active')`,
      [reviewerId, `${reviewerId}@example.test`],
    );
    await pool.query(
      `INSERT INTO roles (id, name, realm_scope) VALUES ($1, 'registration-reviewer', 'workforce')`,
      [roleId],
    );
    await pool.query(
      `INSERT INTO permissions (id, key, name) VALUES ($1, 'admin:registrations', 'Review registrations')`,
      [permissionId],
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [reviewerId, roleId],
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`,
      [roleId, permissionId],
    );
    for (const name of ["customer_admin", "customer_member"]) {
      await pool.query(
        `INSERT INTO roles (name, realm_scope) VALUES ($1, 'customer')`,
        [name],
      );
    }
  }

  function registration(
    email = `${randomUUID()}@example.test`,
    companyName = "ACME",
  ) {
    return {
      applicantName: "Customer",
      email,
      password: "correct horse battery staple",
      companyName,
      acceptedTerms: true,
    };
  }

  const actor = () => ({
    userId: reviewerId,
    realm: "workforce" as const,
    status: "active" as const,
    permissions: ["admin:registrations"],
  });

  beforeAll(async () => {
    await pool.query("select 1");
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE audit_logs, customer_registrations, organization_memberships, organizations, role_permissions, user_roles, permissions, roles, rate_limits, sessions, accounts, users CASCADE",
    );
    await seedReviewer();
  });

  afterAll(async () => pool.end());

  it("commits the pending customer, credential, request, and audit atomically", async () => {
    const submitted = await service.submitRegistration(
      registration("pending@example.test"),
      context,
    );
    const result = await pool.query(
      `SELECT u.identity_realm::text AS realm, u.status::text AS user_status,
              a.provider_id, r.status::text AS request_status, r.company_name,
              l.action, l.metadata
       FROM users u
       JOIN accounts a ON a.user_id = u.id
       JOIN customer_registrations r ON r.user_id = u.id
       JOIN audit_logs l ON l.target_id = r.id::text
       WHERE u.id = $1`,
      [submitted.userId],
    );
    expect(result.rows).toEqual([
      expect.objectContaining({
        realm: "customer",
        user_status: "pending_review",
        provider_id: "credential",
        request_status: "pending_review",
        company_name: "ACME",
        action: "registration.submitted",
        metadata: { source: "self_service" },
      }),
    ]);
  });

  it("rolls back partial identity writes when the transaction fails", async () => {
    const email = "rollback@example.test";
    await expect(
      repository.transaction(async (tx) => {
        await tx.createUserAndCredential({
          applicantName: "Rollback",
          email,
          passwordHash: "hash",
          realm: "customer",
          status: "pending_review",
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    const found = await pool.query("SELECT 1 FROM users WHERE email = $1", [
      email,
    ]);
    expect(found.rowCount).toBe(0);
  });

  it("maps a normalized unique-email race to one generic rejection", async () => {
    const results = await Promise.allSettled([
      service.submitRegistration(registration("Race@Example.test"), context),
      service.submitRegistration(registration(" race@example.TEST "), context),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: expect.objectContaining({ code: "REGISTRATION_NOT_ACCEPTED" }),
    });
  });

  it("atomically limits both normalized identifier and IP before account creation", async () => {
    for (let index = 0; index < 3; index += 1) {
      await service.submitRegistration(
        registration(`limit-${index}@example.test`),
        { ...context, ipAddress: "203.0.113.20" },
      );
    }
    await expect(
      service.submitRegistration(registration("limit-3@example.test"), {
        ...context,
        ipAddress: "203.0.113.20",
      }),
    ).rejects.toMatchObject({ code: "REGISTRATION_RATE_LIMITED" });
    const found = await pool.query(
      "SELECT 1 FROM users WHERE email = 'limit-3@example.test'",
    );
    expect(found.rowCount).toBe(0);
  });

  it("cleans only expired registration buckets and preserves auth and fresh buckets", async () => {
    const expired = Date.now() - 25 * 60 * 60 * 1000;
    const fresh = Date.now();
    await pool.query(
      `INSERT INTO rate_limits (key, count, last_request) VALUES
       ('registration:expired-test', 1, $1),
       ('sign-in:expired-auth-test', 1, $1),
       ('registration:fresh-test', 1, $2)`,
      [expired, fresh],
    );
    await limiter.consume({
      identifier: `${randomUUID()}@example.test`,
      ipAddress: "203.0.113.31",
    });
    const keys = await pool.query<{ key: string }>(
      `SELECT key FROM rate_limits
       WHERE key IN ('registration:expired-test', 'sign-in:expired-auth-test', 'registration:fresh-test')
       ORDER BY key`,
    );
    expect(keys.rows).toEqual([
      { key: "registration:fresh-test" },
      { key: "sign-in:expired-auth-test" },
    ]);
  });

  it("cleans expired registration buckets in batches of at most 100", async () => {
    const expired = Date.now() - 25 * 60 * 60 * 1000;
    await pool.query(
      `INSERT INTO rate_limits (key, count, last_request)
       SELECT 'registration:expired-batch-' || value, 1, $1
       FROM generate_series(1, 150) AS value`,
      [expired],
    );
    await limiter.consume({ identifier: `${randomUUID()}@example.test` });
    const afterFirst = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM rate_limits
       WHERE key LIKE 'registration:expired-batch-%'`,
    );
    expect(afterFirst.rows).toEqual([{ count: "50" }]);

    await limiter.consume({ identifier: `${randomUUID()}@example.test` });
    const afterSecond = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM rate_limits
       WHERE key LIKE 'registration:expired-batch-%'`,
    );
    expect(afterSecond.rows).toEqual([{ count: "0" }]);
  });

  it("creates one active organization and forces its first member to customer_admin", async () => {
    const submitted = await service.submitRegistration(registration(), context);
    await service.approveRegistration(
      {
        requestId: submitted.requestId,
        organization: { kind: "create", legalName: " ＡＣＭＥ Corp " },
        initialRole: "customer_member",
      },
      actor(),
      context,
    );
    const approved = await pool.query(
      `SELECT o.legal_name_key, o.status::text AS organization_status,
              om.role::text AS membership_role, roles.name AS role_name,
              r.status::text AS request_status, u.status::text AS user_status
       FROM customer_registrations r
       JOIN users u ON u.id = r.user_id
       JOIN organizations o ON o.id = r.organization_id
       JOIN organization_memberships om ON om.user_id = u.id
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles ON roles.id = ur.role_id
       WHERE r.id = $1`,
      [submitted.requestId],
    );
    expect(approved.rows).toEqual([
      expect.objectContaining({
        legal_name_key: "acme corp",
        organization_status: "active",
        membership_role: "admin",
        role_name: "customer_admin",
        request_status: "approved",
        user_status: "active",
      }),
    ]);
  });

  it("allows an explicit customer_admin role for a subsequent member", async () => {
    const first = await service.submitRegistration(registration(), context);
    await service.approveRegistration(
      {
        requestId: first.requestId,
        organization: { kind: "create", legalName: "Linked Co" },
      },
      actor(),
      context,
    );
    const organization = await pool.query<{ id: string }>(
      "SELECT id FROM organizations WHERE legal_name_key = 'linked co'",
    );
    const second = await service.submitRegistration(registration(), context);
    await service.approveRegistration(
      {
        requestId: second.requestId,
        organization: {
          kind: "link",
          organizationId: organization.rows[0]!.id,
        },
        initialRole: "customer_admin",
      },
      actor(),
      context,
    );
    const role = await pool.query<{ name: string }>(
      `SELECT roles.name FROM user_roles JOIN roles ON roles.id = user_roles.role_id
       WHERE user_roles.user_id = $1`,
      [second.userId],
    );
    expect(role.rows).toEqual([{ name: "customer_admin" }]);
  });

  it("converges concurrent create decisions from different requests on one organization", async () => {
    const first = await service.submitRegistration(registration(), context);
    const second = await service.submitRegistration(registration(), context);
    await Promise.all([
      service.approveRegistration(
        {
          requestId: first.requestId,
          organization: { kind: "create", legalName: " Converged Co " },
        },
        actor(),
        context,
      ),
      service.approveRegistration(
        {
          requestId: second.requestId,
          organization: { kind: "create", legalName: "Ｃonverged　Co" },
        },
        actor(),
        context,
      ),
    ]);
    const organizations = await pool.query<{ id: string; requests: string }>(
      `SELECT o.id, count(r.id)::text AS requests
       FROM organizations o
       JOIN customer_registrations r ON r.organization_id = o.id
       WHERE o.legal_name_key = 'converged co'
       GROUP BY o.id`,
    );
    expect(organizations.rows).toEqual([
      { id: expect.any(String), requests: "2" },
    ]);
  });

  it("serializes two first-member links so only one becomes customer_admin", async () => {
    const organizationId = randomUUID();
    await pool.query(
      `INSERT INTO organizations (id, legal_name, legal_name_key, status)
       VALUES ($1, 'Empty Co', 'empty co', 'active')`,
      [organizationId],
    );
    const first = await service.submitRegistration(registration(), context);
    const second = await service.submitRegistration(registration(), context);
    await Promise.all([
      service.approveRegistration(
        {
          requestId: first.requestId,
          organization: { kind: "link", organizationId },
        },
        actor(),
        context,
      ),
      service.approveRegistration(
        {
          requestId: second.requestId,
          organization: { kind: "link", organizationId },
        },
        actor(),
        context,
      ),
    ]);
    const roles = await pool.query<{ name: string }>(
      `SELECT roles.name FROM user_roles
       JOIN roles ON roles.id = user_roles.role_id
       WHERE user_roles.user_id IN ($1, $2)
       ORDER BY roles.name`,
      [first.userId, second.userId],
    );
    expect(roles.rows).toEqual([
      { name: "customer_admin" },
      { name: "customer_member" },
    ]);
  });

  it("allows only one concurrent approval and returns the stable conflict", async () => {
    const submitted = await service.submitRegistration(registration(), context);
    const decision = {
      requestId: submitted.requestId,
      organization: { kind: "create" as const, legalName: "Concurrent Co" },
    };
    const results = await Promise.allSettled([
      service.approveRegistration(decision, actor(), context),
      service.approveRegistration(decision, actor(), context),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      reason: expect.objectContaining({
        code: "REGISTRATION_ALREADY_REVIEWED",
      }),
    });
  });

  it("returns the stable conflict for a sequential repeated approval", async () => {
    const submitted = await service.submitRegistration(registration(), context);
    const decision = {
      requestId: submitted.requestId,
      organization: { kind: "create" as const, legalName: "Repeated Co" },
    };
    await service.approveRegistration(decision, actor(), context);
    await expect(
      service.approveRegistration(decision, actor(), context),
    ).rejects.toMatchObject({ code: "REGISTRATION_ALREADY_REVIEWED" });
  });

  it("rolls back identity and request writes when submitted audit insertion fails", async () => {
    const email = "audit-submit-rollback@example.test";
    await pool.query(`
      CREATE FUNCTION fail_registration_submitted_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.action = 'registration.submitted' THEN
          RAISE EXCEPTION 'forced submitted audit failure';
        END IF;
        RETURN NEW;
      END $$
    `);
    await pool.query(`
      CREATE TRIGGER fail_registration_submitted_audit
      BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION fail_registration_submitted_audit()
    `);
    try {
      await expect(
        service.submitRegistration(registration(email), context),
      ).rejects.toThrow();
    } finally {
      await pool.query(
        "DROP TRIGGER fail_registration_submitted_audit ON audit_logs",
      );
      await pool.query("DROP FUNCTION fail_registration_submitted_audit() ");
    }
    const state = await pool.query<{
      users: string;
      accounts: string;
      requests: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM users WHERE email = $1) AS users,
        (SELECT count(*)::text FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = $1) AS accounts,
        (SELECT count(*)::text FROM customer_registrations r JOIN users u ON u.id = r.user_id WHERE u.email = $1) AS requests`,
      [email],
    );
    expect(state.rows).toEqual([{ users: "0", accounts: "0", requests: "0" }]);
  });

  it("rolls back approval writes when approved audit insertion fails", async () => {
    const submitted = await service.submitRegistration(registration(), context);
    await pool.query(`
      CREATE FUNCTION fail_registration_approved_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.action = 'registration.approved' THEN
          RAISE EXCEPTION 'forced approved audit failure';
        END IF;
        RETURN NEW;
      END $$
    `);
    await pool.query(`
      CREATE TRIGGER fail_registration_approved_audit
      BEFORE INSERT ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION fail_registration_approved_audit()
    `);
    try {
      await expect(
        service.approveRegistration(
          {
            requestId: submitted.requestId,
            organization: { kind: "create", legalName: "Audit Rollback Co" },
          },
          actor(),
          context,
        ),
      ).rejects.toThrow();
    } finally {
      await pool.query(
        "DROP TRIGGER fail_registration_approved_audit ON audit_logs",
      );
      await pool.query("DROP FUNCTION fail_registration_approved_audit() ");
    }
    const state = await pool.query<{
      request_status: string;
      user_status: string;
      organizations: string;
      memberships: string;
      grants: string;
    }>(
      `SELECT r.status::text AS request_status, u.status::text AS user_status,
        (SELECT count(*)::text FROM organizations WHERE legal_name_key = 'audit rollback co') AS organizations,
        (SELECT count(*)::text FROM organization_memberships WHERE user_id = u.id) AS memberships,
        (SELECT count(*)::text FROM user_roles WHERE user_id = u.id) AS grants
       FROM customer_registrations r JOIN users u ON u.id = r.user_id
       WHERE r.id = $1`,
      [submitted.requestId],
    );
    expect(state.rows).toEqual([
      {
        request_status: "pending_review",
        user_status: "pending_review",
        organizations: "0",
        memberships: "0",
        grants: "0",
      },
    ]);
  });

  it("rejects atomically without putting free text in audit metadata", async () => {
    const submitted = await service.submitRegistration(registration(), context);
    await service.rejectRegistration(
      submitted.requestId,
      actor(),
      "Sensitive internal review note",
      context,
    );
    const rejected = await pool.query(
      `SELECT r.status::text AS request_status, r.review_note,
              u.status::text AS user_status, l.metadata
       FROM customer_registrations r JOIN users u ON u.id = r.user_id
       JOIN audit_logs l ON l.target_id = r.id::text AND l.action = 'registration.rejected'
       WHERE r.id = $1`,
      [submitted.requestId],
    );
    expect(rejected.rows).toEqual([
      {
        request_status: "rejected",
        review_note: "Sensitive internal review note",
        user_status: "rejected",
        metadata: { category: "other" },
      },
    ]);
  });

  it("rejects review after the authoritative permission is revoked", async () => {
    const submitted = await service.submitRegistration(registration(), context);
    await pool.query("DELETE FROM user_roles WHERE user_id = $1", [reviewerId]);
    await expect(
      service.approveRegistration(
        {
          requestId: submitted.requestId,
          organization: { kind: "create", legalName: "Denied Co" },
        },
        actor(),
        context,
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_PERMISSION_DENIED" });
    const request = await pool.query<{ status: string }>(
      "SELECT status::text FROM customer_registrations WHERE id = $1",
      [submitted.requestId],
    );
    expect(request.rows).toEqual([{ status: "pending_review" }]);
  });

  it("rejects list access after revocation even with a stale actor snapshot", async () => {
    await expect(
      service.listRegistrationRequests(
        { status: "pending_review", page: 1, pageSize: 10 },
        actor(),
      ),
    ).resolves.toMatchObject({ page: 1, pageSize: 10 });
    const staleActor = actor();
    await pool.query("DELETE FROM user_roles WHERE user_id = $1", [reviewerId]);
    await expect(
      service.listRegistrationRequests(
        { status: "pending_review", page: 1, pageSize: 10 },
        staleActor,
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_PERMISSION_DENIED" });
  });

  it("holds authoritative list permission locks until the read transaction completes", async () => {
    await service.submitRegistration(registration(), context);
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "LOCK TABLE customer_registrations IN ACCESS EXCLUSIVE MODE",
      );
      const listing = repository.list(
        { status: "pending_review", page: 1, pageSize: 10 },
        reviewerId,
      );
      await delay(50);

      let revocationSettled = false;
      const revocation = pool
        .query("DELETE FROM user_roles WHERE user_id = $1", [reviewerId])
        .then(() => {
          revocationSettled = true;
        });
      await delay(50);
      expect(revocationSettled).toBe(false);

      await blocker.query("COMMIT");
      await expect(listing).resolves.toMatchObject({ total: 1 });
      await revocation;
      await expect(
        repository.list(
          { status: "pending_review", page: 1, pageSize: 10 },
          reviewerId,
        ),
      ).rejects.toMatchObject({ code: "REGISTRATION_PERMISSION_DENIED" });
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      blocker.release();
    }
  });

  it("accepts a reviewer who receives the permission through multiple roles", async () => {
    const duplicateRoleId = randomUUID();
    await pool.query(
      `INSERT INTO roles (id, name, realm_scope)
       VALUES ($1, 'second-registration-reviewer', 'workforce')`,
      [duplicateRoleId],
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [reviewerId, duplicateRoleId],
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE key = 'admin:registrations'`,
      [duplicateRoleId],
    );
    const submitted = await service.submitRegistration(registration(), context);
    await expect(
      service.approveRegistration(
        {
          requestId: submitted.requestId,
          organization: { kind: "create", legalName: "Multi Role Co" },
        },
        actor(),
        context,
      ),
    ).resolves.toBeUndefined();
  });

  it("serializes permission revocation after the in-transaction authorization check", async () => {
    const submitted = await service.submitRegistration(registration(), context);
    let markChecked!: () => void;
    let allowReview!: () => void;
    const checked = new Promise<void>((resolve) => {
      markChecked = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      allowReview = resolve;
    });
    const pausedRepository: RegistrationRepository = {
      ...repository,
      transaction: (work) =>
        repository.transaction((tx) =>
          work({
            ...tx,
            async assertActiveWorkforcePermission(userId, permission) {
              await tx.assertActiveWorkforcePermission(userId, permission);
              markChecked();
              await resume;
            },
          }),
        ),
    };
    const pausedService = createRegistrationService({
      repository: pausedRepository,
      limiter,
      hashPassword: async (password) => `test-hash:${password}`,
    });

    const approval = pausedService.approveRegistration(
      {
        requestId: submitted.requestId,
        organization: { kind: "create", legalName: "Permission Race Co" },
      },
      actor(),
      context,
    );
    await checked;
    let revocationSettled = false;
    const revocation = pool
      .query("DELETE FROM user_roles WHERE user_id = $1", [reviewerId])
      .then(() => {
        revocationSettled = true;
      });
    await delay(50);
    expect(revocationSettled).toBe(false);
    allowReview();
    await approval;
    await revocation;
  });

  it("rolls back approval when the customer is no longer pending", async () => {
    const submitted = await service.submitRegistration(registration(), context);
    await pool.query("UPDATE users SET status = 'rejected' WHERE id = $1", [
      submitted.userId,
    ]);
    await expect(
      service.approveRegistration(
        {
          requestId: submitted.requestId,
          organization: { kind: "create", legalName: "Stale Customer Co" },
        },
        actor(),
        context,
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_ALREADY_REVIEWED" });
    const state = await pool.query<{ status: string }>(
      "SELECT status::text FROM customer_registrations WHERE id = $1",
      [submitted.requestId],
    );
    expect(state.rows).toEqual([{ status: "pending_review" }]);
  });
});
