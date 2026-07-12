import "server-only";

import { and, asc, eq } from "drizzle-orm";

import {
  auditLogs,
  getDatabase,
  permissions,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "@ai-agent-platform/database";

import { requireSensitiveWorkforceAction } from "../auth/sensitive-action";

type SessionRealm = "customer" | "workforce";
type StoredSession = {
  id: string;
  realm: SessionRealm;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  token?: string;
};
export type CustomerSessionRepository = {
  findByUser(userId: string, realm: "customer"): Promise<StoredSession[]>;
  revokeOwned(userId: string, sessionId: string): Promise<boolean>;
  writeAudit(input: {
    actorId: string;
    targetUserId: string;
    targetSessionId: string | null;
    revokedCount: number;
  }): Promise<void>;
};
export class AdminSessionError extends Error {
  constructor(
    readonly code:
      | "AUTH_PERMISSION_DENIED"
      | "SESSION_NOT_FOUND"
      | "SESSION_REALM_INVALID",
  ) {
    super(code);
    this.name = "AdminSessionError";
  }
}

function safeSession(session: StoredSession) {
  return {
    id: session.id,
    realm: session.realm,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
  };
}

export function createCustomerSessionService(dependencies: {
  repository: {
    read: CustomerSessionRepository;
    transaction<T>(
      work: (repository: CustomerSessionRepository) => Promise<T>,
    ): Promise<T>;
  };
}) {
  return {
    async list(userId: string) {
      return (
        await dependencies.repository.read.findByUser(userId, "customer")
      ).map(safeSession);
    },
    async revoke(userId: string, sessionId: string) {
      await dependencies.repository.transaction(async (repository) => {
        if (!(await repository.revokeOwned(userId, sessionId)))
          throw new AdminSessionError("SESSION_NOT_FOUND");
        await repository.writeAudit({
          actorId: userId,
          targetUserId: userId,
          targetSessionId: sessionId,
          revokedCount: 1,
        });
      });
    },
  };
}

export type SessionMutationRepository = {
  hasPermission(userId: string, permission: string): Promise<boolean>;
  findTargetUser(userId: string): Promise<{ realm: SessionRealm } | null>;
  revokeOne(userId: string, sessionId: string): Promise<boolean>;
  revokeAll(userId: string): Promise<number>;
  writeAudit(input: {
    actorId: string;
    targetUserId: string;
    targetSessionId: string | null;
    revokedCount: number;
  }): Promise<void>;
};

export function createAdminSessionService(dependencies: {
  repository: {
    transaction<T>(
      work: (repository: SessionMutationRepository) => Promise<T>,
    ): Promise<T>;
  };
  requireSensitiveAction: (
    permission: "admin:users",
  ) => Promise<{ userId: string }>;
}) {
  async function mutate(
    targetUserId: string,
    expectedRealm: SessionRealm,
    targetSessionId: string | null,
  ) {
    const actor = await dependencies.requireSensitiveAction("admin:users");
    return dependencies.repository.transaction(async (repository) => {
      if (!(await repository.hasPermission(actor.userId, "admin:users")))
        throw new AdminSessionError("AUTH_PERMISSION_DENIED");
      const target = await repository.findTargetUser(targetUserId);
      if (!target) throw new AdminSessionError("SESSION_NOT_FOUND");
      if (target.realm !== expectedRealm)
        throw new AdminSessionError("SESSION_REALM_INVALID");
      const revokedCount = targetSessionId
        ? (await repository.revokeOne(targetUserId, targetSessionId))
          ? 1
          : 0
        : await repository.revokeAll(targetUserId);
      if (targetSessionId && revokedCount === 0)
        throw new AdminSessionError("SESSION_NOT_FOUND");
      await repository.writeAudit({
        actorId: actor.userId,
        targetUserId,
        targetSessionId,
        revokedCount,
      });
      return revokedCount;
    });
  }
  return {
    revokeOne: (userId: string, realm: SessionRealm, sessionId: string) =>
      mutate(userId, realm, sessionId),
    revokeAll: (userId: string, realm: SessionRealm) =>
      mutate(userId, realm, null),
  };
}

function writeSessionAudit(
  executor: ReturnType<typeof getDatabase>,
  input: {
    actorId: string;
    targetUserId: string;
    targetSessionId: string | null;
    revokedCount: number;
  },
  realm: SessionRealm,
) {
  return executor.insert(auditLogs).values({
    actorRealm: realm,
    actorUserId: input.actorId,
    action: "session.revoked",
    targetType: "session",
    targetId: input.targetSessionId ?? input.targetUserId,
    metadata: { revokedCount: input.revokedCount },
  });
}

export function createDefaultCustomerSessionService() {
  const database = getDatabase();
  function repository(
    executor: ReturnType<typeof getDatabase>,
  ): CustomerSessionRepository {
    return {
      async findByUser(userId) {
        return executor
          .select({
            id: sessions.id,
            realm: sessions.realm,
            createdAt: sessions.createdAt,
            expiresAt: sessions.expiresAt,
            ipAddress: sessions.ipAddress,
            userAgent: sessions.userAgent,
          })
          .from(sessions)
          .where(
            and(eq(sessions.userId, userId), eq(sessions.realm, "customer")),
          )
          .orderBy(asc(sessions.createdAt));
      },
      async revokeOwned(userId, sessionId) {
        const deleted = await executor
          .delete(sessions)
          .where(
            and(
              eq(sessions.id, sessionId),
              eq(sessions.userId, userId),
              eq(sessions.realm, "customer"),
            ),
          )
          .returning({ id: sessions.id });
        return deleted.length === 1;
      },
      writeAudit: (input) =>
        writeSessionAudit(executor, input, "customer").then(() => undefined),
    };
  }
  return createCustomerSessionService({
    repository: {
      read: repository(database),
      transaction: (work) =>
        database.transaction((tx) =>
          work(repository(tx as unknown as ReturnType<typeof getDatabase>)),
        ),
    },
  });
}

function createSessionMutationRepository(
  executor: ReturnType<typeof getDatabase>,
): SessionMutationRepository {
  return {
    async hasPermission(userId, permission) {
      const rows = await executor
        .select({ id: userRoles.id })
        .from(userRoles)
        .innerJoin(
          users,
          and(
            eq(users.id, userRoles.userId),
            eq(users.identityRealm, "workforce"),
            eq(users.status, "active"),
          ),
        )
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
      return rows.length === 1;
    },
    async findTargetUser(userId) {
      const [row] = await executor
        .select({ realm: users.identityRealm })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row ?? null;
    },
    async revokeOne(userId, sessionId) {
      const rows = await executor
        .delete(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
        .returning({ id: sessions.id });
      return rows.length === 1;
    },
    async revokeAll(userId) {
      return (
        await executor
          .delete(sessions)
          .where(eq(sessions.userId, userId))
          .returning({ id: sessions.id })
      ).length;
    },
    writeAudit: (input) =>
      writeSessionAudit(executor, input, "workforce").then(() => undefined),
  };
}

export function createDefaultAdminSessionService() {
  const database = getDatabase();
  return createAdminSessionService({
    requireSensitiveAction: requireSensitiveWorkforceAction,
    repository: {
      transaction: (work) =>
        database.transaction((tx) =>
          work(
            createSessionMutationRepository(
              tx as unknown as ReturnType<typeof getDatabase>,
            ),
          ),
        ),
    },
  });
}
