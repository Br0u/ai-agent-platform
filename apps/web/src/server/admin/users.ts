import "server-only";

import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";

import {
  accounts,
  auditLogs,
  getDatabase,
  hashPassword,
  normalizeIdentityEmail,
  normalizeWorkforceUsername,
  permissions,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "@ai-agent-platform/database";

import { requireSensitiveWorkforceAction } from "../auth/sensitive-action";

type AdminUserQuery = {
  search?: string;
  realm?: "customer" | "workforce";
  status?: "pending_review" | "active" | "disabled" | "rejected";
  page: number;
  pageSize: number;
};
type AdminUserQueryRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  realm: "customer" | "workforce";
  status: "pending_review" | "active" | "disabled" | "rejected";
};
type AdminUserRoleRow = {
  userId: string;
  name: string;
  scope: "customer" | "workforce" | "global";
};
const ROLE_SCOPE_ORDER = ["customer", "workforce", "global"] as const;
type AdminUserSessionRow = {
  userId: string;
  id: string;
  createdAt: Date;
  expiresAt: Date;
  token?: string;
};
export type WorkforceUserQueryRepository = {
  searchUsers(query: AdminUserQuery): Promise<{
    items: AdminUserQueryRow[];
    total: number;
  }>;
  findRolesByUserIds(userIds: string[]): Promise<AdminUserRoleRow[]>;
  findSessionsByUserIds(userIds: string[]): Promise<AdminUserSessionRow[]>;
};

export function createWorkforceUserQueryService(
  repository: WorkforceUserQueryRepository,
) {
  return {
    async list(actor: { permissions: string[] }, query: AdminUserQuery) {
      if (!actor.permissions.includes("admin:users"))
        throw new WorkforceMutationError("AUTH_PERMISSION_DENIED");
      const result = await repository.searchUsers(query);
      const userIds = result.items.map(({ id }) => id);
      const [roleRows, sessionRows] = userIds.length
        ? await Promise.all([
            repository.findRolesByUserIds(userIds),
            repository.findSessionsByUserIds(userIds),
          ])
        : [[], []];
      const rolesByUser = new Map<string, AdminUserRoleRow[]>();
      for (const role of roleRows) {
        const assigned = rolesByUser.get(role.userId) ?? [];
        assigned.push(role);
        rolesByUser.set(role.userId, assigned);
      }
      const sessionsByUser = new Map<string, AdminUserSessionRow[]>();
      for (const session of sessionRows) {
        const assigned = sessionsByUser.get(session.userId) ?? [];
        assigned.push(session);
        sessionsByUser.set(session.userId, assigned);
      }
      return {
        items: result.items.map((item) => {
          const assignedRoles = (rolesByUser.get(item.id) ?? [])
            .map(({ name, scope }) => ({ name, scope }))
            .sort(
              (left, right) =>
                ROLE_SCOPE_ORDER.indexOf(left.scope) -
                  ROLE_SCOPE_ORDER.indexOf(right.scope) ||
                (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
            );
          return {
            ...item,
            roles: assignedRoles,
            role: assignedRoles[0]?.name ?? null,
            sessions: (sessionsByUser.get(item.id) ?? []).map((session) => ({
              id: session.id,
              createdAt: session.createdAt.toISOString(),
              expiresAt: session.expiresAt.toISOString(),
            })),
          };
        }),
        total: result.total,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
  };
}

export function createDefaultWorkforceUserQueryService() {
  const database = getDatabase();
  return createWorkforceUserQueryService({
    async searchUsers(query) {
      const filter = and(
        query.realm ? eq(users.identityRealm, query.realm) : undefined,
        query.status ? eq(users.status, query.status) : undefined,
        query.search
          ? or(
              ilike(users.name, `%${query.search}%`),
              ilike(users.email, `%${query.search}%`),
              ilike(users.username, `%${query.search}%`),
            )
          : undefined,
      );
      const [totalRow] = await database
        .select({ value: count() })
        .from(users)
        .where(filter);
      const rows = await database
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          username: users.username,
          realm: users.identityRealm,
          status: users.status,
        })
        .from(users)
        .where(filter)
        .orderBy(asc(users.name), asc(users.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return { items: rows, total: totalRow?.value ?? 0 };
    },
    async findRolesByUserIds(userIds) {
      return database
        .select({
          userId: userRoles.userId,
          name: roles.name,
          scope: roles.realmScope,
        })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(inArray(userRoles.userId, userIds))
        .orderBy(asc(userRoles.userId), asc(roles.realmScope), asc(roles.name));
    },
    async findSessionsByUserIds(userIds) {
      return database
        .select({
          userId: sessions.userId,
          id: sessions.id,
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .where(inArray(sessions.userId, userIds))
        .orderBy(asc(sessions.userId), asc(sessions.createdAt));
    },
  });
}

export const WORKFORCE_ROLES = [
  "employee",
  "content_operator",
  "support_operator",
  "admin",
  "super_admin",
] as const;

export type WorkforceRole = (typeof WORKFORCE_ROLES)[number];
export type WorkforceAdminActor = {
  userId: string;
  role: "admin" | "super_admin";
  permissions: string[];
};
type WorkforceTarget = {
  id: string;
  realm: "customer" | "workforce";
  status: "pending_review" | "active" | "disabled" | "rejected";
  role: WorkforceRole | null;
};

export type WorkforceMutationErrorCode =
  | "AUTH_PERMISSION_DENIED"
  | "WORKFORCE_ROLE_INVALID"
  | "WORKFORCE_SUPER_ADMIN_REQUIRED"
  | "WORKFORCE_SELF_MUTATION_FORBIDDEN"
  | "WORKFORCE_LAST_SUPER_ADMIN"
  | "WORKFORCE_LAST_ROLE"
  | "WORKFORCE_ROLE_ALREADY_ASSIGNED"
  | "WORKFORCE_ROLE_NOT_ASSIGNED"
  | "WORKFORCE_TARGET_REALM_INVALID"
  | "WORKFORCE_TARGET_NOT_FOUND"
  | "WORKFORCE_REACTIVATION_INVALID";

export class WorkforceMutationError extends Error {
  constructor(readonly code: WorkforceMutationErrorCode) {
    super(code);
    this.name = "WorkforceMutationError";
  }
}

type CreateIdentityInput = {
  name: string;
  email: string;
  username: string;
  realm: "workforce";
  status: "active";
  mustChangePassword: true;
  passwordHash: string;
};

type WorkforceAudit =
  | {
      event: "workforce.user_created";
      actorId: string;
      targetId: string;
      initialRole: WorkforceRole;
    }
  | {
      event: "workforce.user_updated";
      actorId: string;
      targetId: string;
      change:
        | "disabled"
        | "reactivated"
        | "password_replaced"
        | "role_added"
        | "role_removed"
        | "role_changed";
      fromRole?: WorkforceRole;
      toRole?: WorkforceRole;
      role?: WorkforceRole;
    };

export type WorkforceMutationRepository = {
  findTarget(id: string): Promise<WorkforceTarget | null>;
  countActiveSuperAdmins(): Promise<number>;
  hasPermission(userId: string, permission: string): Promise<boolean>;
  createWorkforceIdentity(input: CreateIdentityInput): Promise<{ id: string }>;
  assignOnlyRole(
    userId: string,
    role: WorkforceRole,
    assignedBy?: string,
  ): Promise<void>;
  listRoles(userId: string): Promise<WorkforceRole[]>;
  addRole(
    userId: string,
    role: WorkforceRole,
    assignedBy?: string,
  ): Promise<void>;
  removeRole(userId: string, role: WorkforceRole): Promise<void>;
  setStatus(userId: string, status: "active" | "disabled"): Promise<void>;
  replacePassword(
    userId: string,
    passwordHash: string,
    mustChangePassword: true,
  ): Promise<void>;
  revokeSessions(userId: string): Promise<number>;
  writeAudit(event: WorkforceAudit): Promise<void>;
};

export type WorkforceMutationTransactionRepository = {
  transaction<T>(
    work: (repository: WorkforceMutationRepository) => Promise<T>,
  ): Promise<T>;
};

function isWorkforceRole(value: string): value is WorkforceRole {
  return (WORKFORCE_ROLES as readonly string[]).includes(value);
}

function requirePermission(
  actor: WorkforceAdminActor,
  permission: "admin:users" | "admin:roles",
  repository: WorkforceMutationRepository,
) {
  return repository.hasPermission(actor.userId, permission).then((allowed) => {
    if (!allowed) throw new WorkforceMutationError("AUTH_PERMISSION_DENIED");
  });
}

async function requireTarget(
  repository: WorkforceMutationRepository,
  targetId: string,
): Promise<WorkforceTarget> {
  const target = await repository.findTarget(targetId);
  if (!target) throw new WorkforceMutationError("WORKFORCE_TARGET_NOT_FOUND");
  if (target.realm !== "workforce")
    throw new WorkforceMutationError("WORKFORCE_TARGET_REALM_INVALID");
  return target;
}

async function authoritativeActorRole(
  repository: WorkforceMutationRepository,
  actorId: string,
): Promise<"admin" | "super_admin"> {
  const actor = await repository.findTarget(actorId);
  const actorRoles = actor ? await repository.listRoles(actorId) : [];
  if (
    !actor ||
    actor.realm !== "workforce" ||
    actor.status !== "active" ||
    (!actorRoles.includes("admin") && !actorRoles.includes("super_admin"))
  ) {
    throw new WorkforceMutationError("AUTH_PERMISSION_DENIED");
  }
  return actorRoles.includes("super_admin") ? "super_admin" : "admin";
}

async function protectAdministrativeTarget(
  actorId: string,
  actorRole: "admin" | "super_admin",
  target: WorkforceTarget,
  repository: WorkforceMutationRepository,
) {
  if (actorId === target.id)
    throw new WorkforceMutationError("WORKFORCE_SELF_MUTATION_FORBIDDEN");
  const targetRoles = await repository.listRoles(target.id);
  if (
    actorRole !== "super_admin" &&
    (targetRoles.includes("admin") || targetRoles.includes("super_admin"))
  ) {
    throw new WorkforceMutationError("WORKFORCE_SUPER_ADMIN_REQUIRED");
  }
}

export function createWorkforceUserService(dependencies: {
  repository: WorkforceMutationTransactionRepository;
  hashPassword: (password: string) => Promise<string>;
  requireSensitiveAction: (
    permission: "admin:users" | "admin:roles",
  ) => Promise<{ userId: string }>;
}) {
  return {
    async createUser(
      actor: WorkforceAdminActor,
      input: {
        name: string;
        email: string;
        username: string;
        temporaryPassword: string;
        initialRole: string;
      },
    ): Promise<{ id: string }> {
      const initialRole = input.initialRole;
      if (!isWorkforceRole(initialRole))
        throw new WorkforceMutationError("WORKFORCE_ROLE_INVALID");
      const guardedActor =
        await dependencies.requireSensitiveAction("admin:users");
      actor = { ...actor, userId: guardedActor.userId };
      const passwordHash = await dependencies.hashPassword(
        input.temporaryPassword,
      );
      return dependencies.repository.transaction(async (repository) => {
        await requirePermission(actor, "admin:users", repository);
        const actorRole = await authoritativeActorRole(
          repository,
          actor.userId,
        );
        if (
          (initialRole === "admin" || initialRole === "super_admin") &&
          actorRole !== "super_admin"
        )
          throw new WorkforceMutationError("WORKFORCE_SUPER_ADMIN_REQUIRED");
        const created = await repository.createWorkforceIdentity({
          name: input.name.normalize("NFKC").trim(),
          email: normalizeIdentityEmail(input.email),
          username: normalizeWorkforceUsername(input.username),
          realm: "workforce",
          status: "active",
          mustChangePassword: true,
          passwordHash,
        });
        await repository.assignOnlyRole(created.id, initialRole, actor.userId);
        await repository.writeAudit({
          event: "workforce.user_created",
          actorId: actor.userId,
          targetId: created.id,
          initialRole,
        });
        return { id: created.id };
      });
    },

    async setRole(
      actor: WorkforceAdminActor,
      targetId: string,
      role: string,
    ): Promise<void> {
      if (!isWorkforceRole(role))
        throw new WorkforceMutationError("WORKFORCE_ROLE_INVALID");
      const guardedActor =
        await dependencies.requireSensitiveAction("admin:roles");
      actor = { ...actor, userId: guardedActor.userId };
      await dependencies.repository.transaction(async (repository) => {
        await requirePermission(actor, "admin:roles", repository);
        const actorRole = await authoritativeActorRole(
          repository,
          actor.userId,
        );
        if (
          (role === "admin" || role === "super_admin") &&
          actorRole !== "super_admin"
        )
          throw new WorkforceMutationError("WORKFORCE_SUPER_ADMIN_REQUIRED");
        const target = await requireTarget(repository, targetId);
        if (!target.role)
          throw new WorkforceMutationError("WORKFORCE_ROLE_INVALID");
        await protectAdministrativeTarget(
          actor.userId,
          actorRole,
          target,
          repository,
        );
        const assignedRoles = await repository.listRoles(targetId);
        if (
          assignedRoles.includes("super_admin") &&
          role !== "super_admin" &&
          (await repository.countActiveSuperAdmins()) <= 1
        ) {
          throw new WorkforceMutationError("WORKFORCE_LAST_SUPER_ADMIN");
        }
        if (assignedRoles.length !== 1)
          throw new WorkforceMutationError("WORKFORCE_ROLE_INVALID");
        const fromRole = assignedRoles[0]!;
        await repository.assignOnlyRole(targetId, role, actor.userId);
        await repository.revokeSessions(targetId);
        await repository.writeAudit({
          event: "workforce.user_updated",
          actorId: actor.userId,
          targetId,
          change: "role_changed",
          fromRole,
          toRole: role,
        });
      });
    },

    async addRole(
      actor: WorkforceAdminActor,
      targetId: string,
      role: string,
    ): Promise<void> {
      if (!isWorkforceRole(role))
        throw new WorkforceMutationError("WORKFORCE_ROLE_INVALID");
      const guardedActor =
        await dependencies.requireSensitiveAction("admin:roles");
      actor = { ...actor, userId: guardedActor.userId };
      await dependencies.repository.transaction(async (repository) => {
        await requirePermission(actor, "admin:roles", repository);
        const actorRole = await authoritativeActorRole(
          repository,
          actor.userId,
        );
        const target = await requireTarget(repository, targetId);
        await protectAdministrativeTarget(
          actor.userId,
          actorRole,
          target,
          repository,
        );
        if (
          actorRole !== "super_admin" &&
          (role === "admin" || role === "super_admin")
        )
          throw new WorkforceMutationError("WORKFORCE_SUPER_ADMIN_REQUIRED");
        const assignedRoles = await repository.listRoles(targetId);
        if (assignedRoles.includes(role))
          throw new WorkforceMutationError("WORKFORCE_ROLE_ALREADY_ASSIGNED");
        await repository.addRole(targetId, role, actor.userId);
        await repository.revokeSessions(targetId);
        await repository.writeAudit({
          event: "workforce.user_updated",
          actorId: actor.userId,
          targetId,
          change: "role_added",
          role,
        });
      });
    },

    async removeRole(
      actor: WorkforceAdminActor,
      targetId: string,
      role: string,
    ): Promise<void> {
      if (!isWorkforceRole(role))
        throw new WorkforceMutationError("WORKFORCE_ROLE_INVALID");
      const guardedActor =
        await dependencies.requireSensitiveAction("admin:roles");
      actor = { ...actor, userId: guardedActor.userId };
      await dependencies.repository.transaction(async (repository) => {
        await requirePermission(actor, "admin:roles", repository);
        const actorRole = await authoritativeActorRole(
          repository,
          actor.userId,
        );
        const target = await requireTarget(repository, targetId);
        await protectAdministrativeTarget(
          actor.userId,
          actorRole,
          target,
          repository,
        );
        if (
          actorRole !== "super_admin" &&
          (role === "admin" || role === "super_admin")
        )
          throw new WorkforceMutationError("WORKFORCE_SUPER_ADMIN_REQUIRED");
        const assignedRoles = await repository.listRoles(targetId);
        if (!assignedRoles.includes(role))
          throw new WorkforceMutationError("WORKFORCE_ROLE_NOT_ASSIGNED");
        if (assignedRoles.length <= 1)
          throw new WorkforceMutationError("WORKFORCE_LAST_ROLE");
        if (
          role === "super_admin" &&
          target.status === "active" &&
          (await repository.countActiveSuperAdmins()) <= 1
        )
          throw new WorkforceMutationError("WORKFORCE_LAST_SUPER_ADMIN");
        await repository.removeRole(targetId, role);
        await repository.revokeSessions(targetId);
        await repository.writeAudit({
          event: "workforce.user_updated",
          actorId: actor.userId,
          targetId,
          change: "role_removed",
          role,
        });
      });
    },

    async disableUser(
      actor: WorkforceAdminActor,
      targetId: string,
    ): Promise<void> {
      const guardedActor =
        await dependencies.requireSensitiveAction("admin:users");
      actor = { ...actor, userId: guardedActor.userId };
      await dependencies.repository.transaction(async (repository) => {
        await requirePermission(actor, "admin:users", repository);
        const actorRole = await authoritativeActorRole(
          repository,
          actor.userId,
        );
        const target = await requireTarget(repository, targetId);
        await protectAdministrativeTarget(
          actor.userId,
          actorRole,
          target,
          repository,
        );
        const targetRoles = await repository.listRoles(targetId);
        if (
          targetRoles.includes("super_admin") &&
          (await repository.countActiveSuperAdmins()) <= 1
        )
          throw new WorkforceMutationError("WORKFORCE_LAST_SUPER_ADMIN");
        await repository.setStatus(targetId, "disabled");
        await repository.revokeSessions(targetId);
        await repository.writeAudit({
          event: "workforce.user_updated",
          actorId: actor.userId,
          targetId,
          change: "disabled",
        });
      });
    },

    async reactivateUser(
      actor: WorkforceAdminActor,
      targetId: string,
    ): Promise<void> {
      const guardedActor =
        await dependencies.requireSensitiveAction("admin:users");
      actor = { ...actor, userId: guardedActor.userId };
      await dependencies.repository.transaction(async (repository) => {
        await requirePermission(actor, "admin:users", repository);
        const actorRole = await authoritativeActorRole(
          repository,
          actor.userId,
        );
        const target = await requireTarget(repository, targetId);
        if (target.status !== "disabled")
          throw new WorkforceMutationError("WORKFORCE_REACTIVATION_INVALID");
        await protectAdministrativeTarget(
          actor.userId,
          actorRole,
          target,
          repository,
        );
        await repository.setStatus(targetId, "active");
        await repository.writeAudit({
          event: "workforce.user_updated",
          actorId: actor.userId,
          targetId,
          change: "reactivated",
        });
      });
    },

    async replaceTemporaryPassword(
      actor: WorkforceAdminActor,
      targetId: string,
      password: string,
    ): Promise<void> {
      const guardedActor =
        await dependencies.requireSensitiveAction("admin:users");
      actor = { ...actor, userId: guardedActor.userId };
      const passwordHash = await dependencies.hashPassword(password);
      await dependencies.repository.transaction(async (repository) => {
        await requirePermission(actor, "admin:users", repository);
        const actorRole = await authoritativeActorRole(
          repository,
          actor.userId,
        );
        const target = await requireTarget(repository, targetId);
        await protectAdministrativeTarget(
          actor.userId,
          actorRole,
          target,
          repository,
        );
        await repository.replacePassword(targetId, passwordHash, true);
        await repository.revokeSessions(targetId);
        await repository.writeAudit({
          event: "workforce.user_updated",
          actorId: actor.userId,
          targetId,
          change: "password_replaced",
        });
      });
    },
  };
}

function createDrizzleMutationRepository(
  executor: ReturnType<typeof getDatabase>,
): WorkforceMutationRepository {
  return {
    async findTarget(id) {
      const [row] = await executor
        .select({
          id: users.id,
          realm: users.identityRealm,
          status: users.status,
          role: roles.name,
        })
        .from(users)
        .leftJoin(userRoles, eq(userRoles.userId, users.id))
        .leftJoin(roles, eq(roles.id, userRoles.roleId))
        .where(eq(users.id, id))
        .limit(1);
      return row
        ? {
            ...row,
            role: row.role && isWorkforceRole(row.role) ? row.role : null,
          }
        : null;
    },
    async countActiveSuperAdmins() {
      const [row] = await executor
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .innerJoin(
          roles,
          and(eq(roles.id, userRoles.roleId), eq(roles.name, "super_admin")),
        )
        .where(
          and(eq(users.identityRealm, "workforce"), eq(users.status, "active")),
        );
      return row?.count ?? 0;
    },
    async hasPermission(userId, permission) {
      const [row] = await executor
        .select({ one: sql<number>`1` })
        .from(userRoles)
        .innerJoin(
          roles,
          and(
            eq(roles.id, userRoles.roleId),
            eq(roles.realmScope, "workforce"),
          ),
        )
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(
          permissions,
          and(
            eq(permissions.id, rolePermissions.permissionId),
            eq(permissions.key, permission),
          ),
        )
        .where(eq(userRoles.userId, userId))
        .limit(1);
      return Boolean(row);
    },
    async createWorkforceIdentity(input) {
      const [created] = await executor
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          username: input.username,
          displayUsername: input.username,
          identityRealm: input.realm,
          status: input.status,
          emailVerified: true,
          emailVerificationStatus: "verified",
          mustChangePassword: true,
        })
        .returning({ id: users.id });
      if (!created) throw new Error("Workforce identity was not created");
      await executor.insert(accounts).values({
        accountId: created.id,
        providerId: "credential",
        userId: created.id,
        password: input.passwordHash,
      });
      return created;
    },
    async assignOnlyRole(userId, role, assignedBy) {
      const [found] = await executor
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.name, role), eq(roles.realmScope, "workforce")))
        .limit(1);
      if (!found) throw new Error(`Missing workforce role: ${role}`);
      await executor.delete(userRoles).where(eq(userRoles.userId, userId));
      await executor
        .insert(userRoles)
        .values({ userId, roleId: found.id, assignedByUserId: assignedBy });
    },
    async listRoles(userId) {
      const rows = await executor
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(
          roles,
          and(
            eq(roles.id, userRoles.roleId),
            eq(roles.realmScope, "workforce"),
          ),
        )
        .where(eq(userRoles.userId, userId));
      return rows.flatMap((row) =>
        isWorkforceRole(row.name) ? [row.name] : [],
      );
    },
    async addRole(userId, role, assignedBy) {
      const [found] = await executor
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.name, role), eq(roles.realmScope, "workforce")))
        .limit(1);
      if (!found) throw new Error(`Missing workforce role: ${role}`);
      await executor
        .insert(userRoles)
        .values({ userId, roleId: found.id, assignedByUserId: assignedBy });
    },
    async removeRole(userId, role) {
      const [found] = await executor
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.name, role), eq(roles.realmScope, "workforce")))
        .limit(1);
      if (!found) throw new Error(`Missing workforce role: ${role}`);
      await executor
        .delete(userRoles)
        .where(
          and(eq(userRoles.userId, userId), eq(userRoles.roleId, found.id)),
        );
    },
    async setStatus(userId, status) {
      await executor
        .update(users)
        .set({ status, updatedAt: new Date() })
        .where(eq(users.id, userId));
    },
    async replacePassword(userId, passwordHash) {
      await executor
        .update(accounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.providerId, "credential"),
          ),
        );
      await executor
        .update(users)
        .set({ mustChangePassword: true, updatedAt: new Date() })
        .where(eq(users.id, userId));
    },
    async revokeSessions(userId) {
      const deleted = await executor
        .delete(sessions)
        .where(eq(sessions.userId, userId))
        .returning({ id: sessions.id });
      return deleted.length;
    },
    async writeAudit(event) {
      await executor.insert(auditLogs).values({
        actorRealm: "workforce",
        actorUserId: event.actorId,
        action: event.event,
        targetType: "user",
        targetId: event.targetId,
        metadata:
          event.event === "workforce.user_created"
            ? { initialRole: event.initialRole }
            : event.change === "role_changed"
              ? {
                  change: event.change,
                  fromRole: event.fromRole,
                  toRole: event.toRole,
                }
              : event.change === "role_added" || event.change === "role_removed"
                ? { change: event.change, role: event.role }
                : { change: event.change },
      });
    },
  };
}

export function createDefaultWorkforceUserService() {
  const database = getDatabase();
  return createWorkforceUserService({
    hashPassword,
    requireSensitiveAction: requireSensitiveWorkforceAction,
    repository: {
      transaction: (work) =>
        database.transaction(async (tx) => {
          // Serialize workforce privilege mutations so concurrent demotions
          // cannot both pass the last-super-admin check.
          await tx.execute(sql`select pg_advisory_xact_lock(72134879)`);
          return work(
            createDrizzleMutationRepository(
              tx as unknown as ReturnType<typeof getDatabase>,
            ),
          );
        }),
    },
  });
}
