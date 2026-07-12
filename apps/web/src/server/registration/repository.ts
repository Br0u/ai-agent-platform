import "server-only";

import { createHash } from "node:crypto";

import { and, count, desc, eq, sql } from "drizzle-orm";

import {
  accounts,
  auditLogs,
  customerRegistrations,
  getDatabase,
  LEGACY_REGISTRATION_COMPANY_NAME,
  organizationMemberships,
  organizations,
  rateLimits,
  roles,
  userRoles,
  users,
} from "@ai-agent-platform/database";

import { createAuditWriter } from "../auth/audit";
import { matchesPostgresConstraint } from "./database-errors";
import {
  RegistrationError,
  mapDatabaseRegistrationStatus,
  mapPublicRegistrationStatus,
  type CustomerRole,
  type RegistrationAuditEvent,
  type RegistrationQuery,
  type RegistrationRateLimiter,
  type RegistrationRepository,
  type RegistrationTransaction,
} from "./service";

type Database = ReturnType<typeof getDatabase>;

export function presentRegistrationCompanyName(companyName: string): string {
  return companyName === LEGACY_REGISTRATION_COMPANY_NAME
    ? "历史数据（公司信息缺失）"
    : companyName;
}

const REVIEW_UNIQUE_CONSTRAINTS = new Set([
  "organization_memberships_organization_id_user_id_unique",
  "user_roles_user_id_role_id_unique",
]);

export function rethrowReviewWriteConflict(error: unknown): never {
  if (
    matchesPostgresConstraint(error, "23505", [...REVIEW_UNIQUE_CONSTRAINTS])
  ) {
    throw new RegistrationError("REGISTRATION_ALREADY_REVIEWED");
  }
  throw error;
}

function databaseTransaction(
  databaseTx: Parameters<Parameters<Database["transaction"]>[0]>[0],
): RegistrationTransaction {
  const audit = createAuditWriter({
    async insert(record) {
      await databaseTx.insert(auditLogs).values(record);
    },
  });

  async function lockActiveOrganization(organizationId: string) {
    const locked = await databaseTx.execute(sql`
      SELECT id::text
      FROM organizations
      WHERE id = ${organizationId} AND status = 'active'
      FOR UPDATE
    `);
    const found = locked.rows[0] as { id: string } | undefined;
    if (!found) return null;
    const members = await databaseTx
      .select({ total: count() })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, found.id));
    return { id: found.id, memberCount: members[0]?.total ?? 0 };
  }

  return {
    async createUserAndCredential(input) {
      const inserted = await databaseTx
        .insert(users)
        .values({
          name: input.applicantName,
          email: input.email,
          identityRealm: input.realm,
          status: input.status,
          emailVerified: false,
          emailVerificationStatus: "unverified",
          mustChangePassword: false,
        })
        .returning({ id: users.id });
      const userId = inserted[0]?.id;
      if (!userId) throw new Error("Registration user insert returned no id");
      await databaseTx.insert(accounts).values({
        accountId: userId,
        providerId: "credential",
        userId,
        password: input.passwordHash,
      });
      return userId;
    },

    async createRequest(input) {
      const inserted = await databaseTx
        .insert(customerRegistrations)
        .values({
          userId: input.userId,
          companyName: input.companyName,
          status: "pending_review",
        })
        .returning({ id: customerRegistrations.id });
      const requestId = inserted[0]?.id;
      if (!requestId)
        throw new Error("Registration request insert returned no id");
      return requestId;
    },

    async appendAudit(event: RegistrationAuditEvent) {
      await audit.write(event);
    },

    async assertActiveWorkforcePermission(userId, permission) {
      const result = await databaseTx.execute(sql`
        SELECT u.id
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id AND r.realm_scope = 'workforce'
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE u.id = ${userId}
          AND u.identity_realm = 'workforce'
          AND u.status = 'active'
          AND p.key = ${permission}
        LIMIT 1
        FOR SHARE OF u, ur, r, rp, p
      `);
      if (result.rows.length !== 1)
        throw new RegistrationError("REGISTRATION_PERMISSION_DENIED");
    },

    async lockRequest(requestId) {
      const result = await databaseTx.execute(sql`
        SELECT id::text, user_id::text, status::text
        FROM customer_registrations
        WHERE id = ${requestId}
        FOR UPDATE
      `);
      const found = result.rows[0] as
        | { id: string; user_id: string; status: string }
        | undefined;
      return found
        ? { id: found.id, userId: found.user_id, status: found.status }
        : null;
    },

    async createOrFindOrganization(input) {
      const inserted = await databaseTx
        .insert(organizations)
        .values({ ...input, status: "active" })
        .onConflictDoNothing({ target: organizations.legalNameKey })
        .returning({ id: organizations.id });
      if (inserted[0]) return lockActiveOrganization(inserted[0].id);
      const existing = await databaseTx.execute(sql`
        SELECT id::text
        FROM organizations
        WHERE legal_name_key = ${input.legalNameKey} AND status = 'active'
        FOR UPDATE
      `);
      const found = existing.rows[0] as { id: string } | undefined;
      return found ? lockActiveOrganization(found.id) : null;
    },

    async findActiveOrganization(organizationId) {
      return lockActiveOrganization(organizationId);
    },

    async findCustomerRole(role: CustomerRole) {
      const found = await databaseTx.query.roles.findFirst({
        where: and(eq(roles.name, role), eq(roles.realmScope, "customer")),
        columns: { id: true },
      });
      if (!found)
        throw new RegistrationError("REGISTRATION_ORGANIZATION_INVALID");
      return found.id;
    },

    async addMembershipAndRole(input) {
      try {
        await databaseTx.insert(organizationMemberships).values({
          organizationId: input.organizationId,
          userId: input.userId,
          role: input.membershipRole,
          assignedByUserId: input.reviewerUserId,
        });
        await databaseTx.insert(userRoles).values({
          userId: input.userId,
          roleId: input.roleId,
          assignedByUserId: input.reviewerUserId,
        });
      } catch (error) {
        rethrowReviewWriteConflict(error);
      }
    },

    async approveRequestAndActivateUser(input) {
      const updated = await databaseTx
        .update(customerRegistrations)
        .set({
          status: "approved",
          organizationId: input.organizationId,
          reviewerUserId: input.reviewerUserId,
          reviewNote: input.reviewNote,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customerRegistrations.id, input.requestId),
            eq(customerRegistrations.status, "pending_review"),
          ),
        )
        .returning({ id: customerRegistrations.id });
      if (updated.length !== 1) return false;
      const userUpdated = await databaseTx
        .update(users)
        .set({ status: "active", updatedAt: new Date() })
        .where(
          and(
            eq(users.id, input.userId),
            eq(users.identityRealm, "customer"),
            eq(users.status, "pending_review"),
          ),
        )
        .returning({ id: users.id });
      return userUpdated.length === 1;
    },

    async rejectRequestAndUser(input) {
      const updated = await databaseTx
        .update(customerRegistrations)
        .set({
          status: "rejected",
          reviewerUserId: input.reviewerUserId,
          reviewNote: input.reviewNote,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customerRegistrations.id, input.requestId),
            eq(customerRegistrations.status, "pending_review"),
          ),
        )
        .returning({ id: customerRegistrations.id });
      if (updated.length !== 1) return false;
      const userUpdated = await databaseTx
        .update(users)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(
          and(
            eq(users.id, input.userId),
            eq(users.identityRealm, "customer"),
            eq(users.status, "pending_review"),
          ),
        )
        .returning({ id: users.id });
      return userUpdated.length === 1;
    },
  };
}

export function createDatabaseRegistrationRepository(
  database: Database = getDatabase(),
): RegistrationRepository {
  return {
    transaction: (work) =>
      database.transaction((databaseTx) =>
        work(databaseTransaction(databaseTx)),
      ),

    async list(query: RegistrationQuery, actorUserId: string) {
      return database.transaction(async (databaseTx) => {
        await databaseTransaction(databaseTx).assertActiveWorkforcePermission(
          actorUserId,
          "admin:registrations",
        );
        const databaseStatus = mapPublicRegistrationStatus(query.status);
        const offset = (query.page - 1) * query.pageSize;
        const rows = await databaseTx
          .select({
            id: customerRegistrations.id,
            applicantName: users.name,
            email: users.email,
            companyName: customerRegistrations.companyName,
            status: customerRegistrations.status,
            createdAt: customerRegistrations.createdAt,
          })
          .from(customerRegistrations)
          .innerJoin(users, eq(customerRegistrations.userId, users.id))
          .where(eq(customerRegistrations.status, databaseStatus))
          .orderBy(
            desc(customerRegistrations.createdAt),
            desc(customerRegistrations.id),
          )
          .limit(query.pageSize)
          .offset(offset);
        const totals = await databaseTx
          .select({ total: count() })
          .from(customerRegistrations)
          .where(eq(customerRegistrations.status, databaseStatus));
        return {
          items: rows.map((row) => ({
            id: row.id,
            applicantName: row.applicantName,
            email: row.email,
            companyName: presentRegistrationCompanyName(row.companyName),
            status: mapDatabaseRegistrationStatus(row.status),
            createdAt: row.createdAt.toISOString(),
          })),
          total: totals[0]?.total ?? 0,
        };
      });
    },

    async getStatusForCustomer(userId) {
      const found = await database.query.customerRegistrations.findFirst({
        where: eq(customerRegistrations.userId, userId),
        orderBy: [
          desc(customerRegistrations.createdAt),
          desc(customerRegistrations.id),
        ],
        columns: { status: true },
      });
      return found
        ? { status: mapDatabaseRegistrationStatus(found.status) }
        : null;
    },
  };
}

function limiterKey(kind: "identifier" | "ip", value: string): string {
  const digest = createHash("sha256").update(value).digest("hex");
  return `registration:${kind}:${digest}`;
}

export const REGISTRATION_RATE_LIMIT_CLEANUP_BATCH_SIZE = 100;
export const REGISTRATION_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export function buildRegistrationRateLimitCleanupQuery(cutoff: number) {
  return sql`
    DELETE FROM ${rateLimits}
    WHERE ${rateLimits.id} IN (
      SELECT ${rateLimits.id}
      FROM ${rateLimits}
      WHERE ${rateLimits.key} LIKE ${"registration:%"}
        AND ${rateLimits.lastRequest} < ${cutoff}
      ORDER BY ${rateLimits.lastRequest}
      LIMIT ${REGISTRATION_RATE_LIMIT_CLEANUP_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
  `;
}

export function createDatabaseRegistrationRateLimiter(
  database: Database = getDatabase(),
  options: { maximumAttempts?: number; windowMs?: number } = {},
): RegistrationRateLimiter {
  const maximumAttempts = options.maximumAttempts ?? 5;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  return {
    async consume(input) {
      const now = Date.now();
      const windowStart = now - windowMs;
      const keys = [limiterKey("identifier", input.identifier)];
      if (input.ipAddress) keys.push(limiterKey("ip", input.ipAddress));

      await database.transaction(async (databaseTx) => {
        const retentionMs = Math.max(
          REGISTRATION_RATE_LIMIT_RETENTION_MS,
          windowMs,
        );
        await databaseTx.execute(
          buildRegistrationRateLimitCleanupQuery(now - retentionMs),
        );
        for (const key of keys) {
          const result = await databaseTx.execute(sql`
            INSERT INTO ${rateLimits} (key, count, last_request)
            VALUES (${key}, 1, ${now})
            ON CONFLICT (key) DO UPDATE SET
              count = CASE
                WHEN ${rateLimits.lastRequest} < ${windowStart} THEN 1
                ELSE ${rateLimits.count} + 1
              END,
              last_request = CASE
                WHEN ${rateLimits.lastRequest} < ${windowStart} THEN ${now}
                ELSE ${rateLimits.lastRequest}
              END
            RETURNING count
          `);
          const countValue = (result.rows[0] as { count?: number } | undefined)
            ?.count;
          if (countValue === undefined || countValue > maximumAttempts)
            throw new RegistrationError("REGISTRATION_RATE_LIMITED");
        }
      });
    },
  };
}
