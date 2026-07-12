import "server-only";

import { and, asc, count, eq, ilike, inArray } from "drizzle-orm";

import {
  auditLogs,
  getDatabase,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@ai-agent-platform/database";

import type { WorkforceActor } from "../auth/access";
import { requireSensitiveWorkforceAction } from "../auth/sensitive-action";

export type RoleRealm = "workforce";
export type RoleQuery = {
  search?: string;
  realm?: RoleRealm;
  page: number;
  pageSize: number;
};
export type RoleDto = {
  id: string;
  name: string;
  description: string | null;
  realmScope: "customer" | "workforce" | "global";
  permissionKeys: string[];
};
export type RoleQueryRepository = {
  search(query: RoleQuery): Promise<{ items: RoleDto[]; total: number }>;
};

export class AdminRoleError extends Error {
  constructor(
    readonly code:
      | "AUTH_PERMISSION_DENIED"
      | "ROLE_REALM_INVALID"
      | "ROLE_NOT_FOUND"
      | "ROLE_SUPER_ADMIN_REQUIRED"
      | "ROLE_SUPER_ADMIN_BASELINE_REQUIRED",
  ) {
    super(code);
    this.name = "AdminRoleError";
  }
}

export function createRoleQueryService(repository: RoleQueryRepository) {
  return {
    async list(actor: WorkforceActor, query: RoleQuery) {
      if (!actor.permissions.includes("admin:roles"))
        throw new AdminRoleError("AUTH_PERMISSION_DENIED");
      if (query.realm && query.realm !== "workforce")
        throw new AdminRoleError("ROLE_REALM_INVALID");
      const result = await repository.search({ ...query, realm: "workforce" });
      return { ...result, page: query.page, pageSize: query.pageSize };
    },
  };
}

export type RolePermissionRepository = {
  hasPermission(userId: string, permission: string): Promise<boolean>;
  findActorRole(userId: string): Promise<"admin" | "super_admin" | null>;
  findRole(id: string): Promise<{
    id: string;
    name: string;
    realmScope: "customer" | "workforce" | "global";
  } | null>;
  replacePermissions(roleId: string, permissionKeys: string[]): Promise<void>;
  writeAudit(input: {
    actorId: string;
    targetId: string;
    permissionKeys: string[];
  }): Promise<void>;
};
export type RolePermissionTransactionRepository = {
  transaction<T>(
    work: (repository: RolePermissionRepository) => Promise<T>,
  ): Promise<T>;
};

export function createRolePermissionService(dependencies: {
  repository: RolePermissionTransactionRepository;
  requireSensitiveAction: (
    permission: "admin:roles",
  ) => Promise<{ userId: string }>;
}) {
  return {
    async replacePermissions(roleId: string, permissionKeys: string[]) {
      const actor = await dependencies.requireSensitiveAction("admin:roles");
      const normalized = [...new Set(permissionKeys.map((key) => key.trim()))]
        .filter(Boolean)
        .sort();
      await dependencies.repository.transaction(async (repository) => {
        if (!(await repository.hasPermission(actor.userId, "admin:roles")))
          throw new AdminRoleError("AUTH_PERMISSION_DENIED");
        if ((await repository.findActorRole(actor.userId)) !== "super_admin")
          throw new AdminRoleError("ROLE_SUPER_ADMIN_REQUIRED");
        const role = await repository.findRole(roleId);
        if (!role) throw new AdminRoleError("ROLE_NOT_FOUND");
        if (role.realmScope !== "workforce")
          throw new AdminRoleError("ROLE_REALM_INVALID");
        if (role.name === "super_admin" && !normalized.includes("admin:roles"))
          throw new AdminRoleError("ROLE_SUPER_ADMIN_BASELINE_REQUIRED");
        await repository.replacePermissions(roleId, normalized);
        await repository.writeAudit({
          actorId: actor.userId,
          targetId: roleId,
          permissionKeys: normalized,
        });
      });
    },
  };
}

export function resolvePrivilegedActorRole(
  roleNames: readonly string[],
): "admin" | "super_admin" | null {
  if (roleNames.includes("super_admin")) return "super_admin";
  if (roleNames.includes("admin")) return "admin";
  return null;
}

function createRolePermissionRepository(
  executor: ReturnType<typeof getDatabase>,
): RolePermissionRepository {
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
    async findRole(id) {
      const [row] = await executor
        .select({
          id: roles.id,
          name: roles.name,
          realmScope: roles.realmScope,
        })
        .from(roles)
        .where(eq(roles.id, id))
        .limit(1);
      return row ?? null;
    },
    async findActorRole(userId) {
      const rows = await executor
        .select({ name: roles.name })
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
        .where(eq(userRoles.userId, userId));
      return resolvePrivilegedActorRole(rows.map(({ name }) => name));
    },
    async replacePermissions(roleId, permissionKeys) {
      const found = permissionKeys.length
        ? await executor
            .select({ id: permissions.id })
            .from(permissions)
            .where(inArray(permissions.key, permissionKeys))
        : [];
      if (found.length !== permissionKeys.length)
        throw new AdminRoleError("AUTH_PERMISSION_DENIED");
      await executor
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId));
      if (found.length)
        await executor
          .insert(rolePermissions)
          .values(found.map(({ id }) => ({ roleId, permissionId: id })));
    },
    async writeAudit(input) {
      await executor.insert(auditLogs).values({
        actorRealm: "workforce",
        actorUserId: input.actorId,
        action: "role.permissions_changed",
        targetType: "role",
        targetId: input.targetId,
        metadata: { permissionCount: input.permissionKeys.length },
      });
    },
  };
}

type RoleRow = Omit<RoleDto, "permissionKeys">;
export type RoleSearchDataSource = {
  countRoles(query: RoleQuery): Promise<number>;
  listRoles(query: RoleQuery): Promise<RoleRow[]>;
  listPermissions(
    roleIds: string[],
  ): Promise<{ roleId: string; key: string }[]>;
};

export function createRoleSearchRepository(
  source: RoleSearchDataSource,
): RoleQueryRepository {
  return {
    async search(query) {
      const [total, rows] = await Promise.all([
        source.countRoles(query),
        source.listRoles(query),
      ]);
      const roleIds = rows.map(({ id }) => id);
      const permissionRows = roleIds.length
        ? await source.listPermissions(roleIds)
        : [];
      const permissionsByRole = new Map<string, Set<string>>();
      for (const { roleId, key } of permissionRows) {
        const keys = permissionsByRole.get(roleId) ?? new Set<string>();
        keys.add(key);
        permissionsByRole.set(roleId, keys);
      }
      return {
        items: rows.map((role) => ({
          ...role,
          permissionKeys: [...(permissionsByRole.get(role.id) ?? [])].sort(),
        })),
        total,
      };
    },
  };
}

export function createDefaultRoleQueryService() {
  const database = getDatabase();
  return createRoleQueryService(
    createRoleSearchRepository({
      async countRoles(query) {
        const filter = and(
          eq(roles.realmScope, "workforce"),
          query.search ? ilike(roles.name, `%${query.search}%`) : undefined,
        );
        const [totalRow] = await database
          .select({ value: count() })
          .from(roles)
          .where(filter);
        return totalRow?.value ?? 0;
      },
      async listRoles(query) {
        const filter = and(
          eq(roles.realmScope, "workforce"),
          query.search ? ilike(roles.name, `%${query.search}%`) : undefined,
        );
        return database
          .select({
            id: roles.id,
            name: roles.name,
            description: roles.description,
            realmScope: roles.realmScope,
          })
          .from(roles)
          .where(filter)
          .orderBy(asc(roles.name))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize);
      },
      async listPermissions(roleIds) {
        return database
          .select({ roleId: rolePermissions.roleId, key: permissions.key })
          .from(rolePermissions)
          .innerJoin(
            permissions,
            eq(permissions.id, rolePermissions.permissionId),
          )
          .where(inArray(rolePermissions.roleId, roleIds))
          .orderBy(asc(rolePermissions.roleId), asc(permissions.key));
      },
    }),
  );
}

export function createDefaultRolePermissionService() {
  const database = getDatabase();
  return createRolePermissionService({
    requireSensitiveAction: requireSensitiveWorkforceAction,
    repository: {
      transaction: (work) =>
        database.transaction((tx) =>
          work(
            createRolePermissionRepository(
              tx as unknown as ReturnType<typeof getDatabase>,
            ),
          ),
        ),
    },
  });
}
