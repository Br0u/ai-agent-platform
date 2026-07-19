import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import { ACCESS_CONTROL_PERMISSION_MUTATION_LOCK_KEY } from "./access-control-locks";
import {
  permissions as permissionTable,
  rolePermissions,
  roles as roleTable,
} from "./schema";

export type RoleRealm = "customer" | "workforce";

export interface PermissionSeed {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
}

export interface RoleSeed {
  readonly name: string;
  readonly realmScope: RoleRealm;
  readonly description?: string;
}

export interface AccessControlSeedRepository {
  transaction<T>(
    work: (repository: AccessControlSeedRepository) => Promise<T>,
  ): Promise<T>;
  upsertPermission(permission: PermissionSeed): Promise<void>;
  upsertRole(role: RoleSeed): Promise<void>;
  lockRoles(roles: readonly RoleSeed[]): Promise<void>;
  replaceRolePermissions(
    roleName: string,
    realmScope: RoleRealm,
    permissionKeys: readonly string[],
  ): Promise<void>;
  acquireSeedLock(): Promise<void>;
}

// Catalog retirement requires a reviewed forward migration. This seed owns only
// the manifest entries below and never deletes unknown roles or permissions.
const permissions: readonly PermissionSeed[] = [
  { key: "console:access", name: "访问客户控制台" },
  { key: "console:team", name: "管理客户团队" },
  { key: "admin:site", name: "管理站点" },
  { key: "admin:assistant", name: "管理 AI 助理" },
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
  { key: "admin:navigation", name: "管理导航" },
  { key: "admin:products", name: "管理产品" },
  { key: "admin:releases", name: "管理版本" },
  { key: "admin:docs", name: "管理文档" },
  {
    key: "admin:docs:delete",
    name: "删除和恢复文档",
    description: "软删除和恢复文档，仅限超级管理员",
  },
  { key: "admin:blog", name: "管理资讯" },
  { key: "admin:cases", name: "管理案例" },
  { key: "admin:faq", name: "管理常见问题" },
  { key: "admin:compatibility", name: "管理兼容性" },
  { key: "admin:marketplace", name: "管理生态市场" },
  { key: "admin:analytics", name: "查看运营分析" },
  { key: "admin:registrations", name: "审核客户注册" },
  { key: "admin:users", name: "管理用户" },
  { key: "admin:roles", name: "管理角色" },
  { key: "admin:audit", name: "查看审计日志" },
];

const superAdminOnlyPermissionKeys = new Set([
  "admin:assistant:configure",
  "admin:assistant:secret:reveal",
  "admin:docs:delete",
]);

const adminPermissionKeys = permissions
  .map(({ key }) => key)
  .filter(
    (key) => key.startsWith("admin:") && !superAdminOnlyPermissionKeys.has(key),
  );

const superAdminPermissionKeys = permissions
  .map(({ key }) => key)
  .filter((key) => key.startsWith("admin:"));

const contentPermissionKeys = [
  "admin:site",
  "admin:navigation",
  "admin:products",
  "admin:releases",
  "admin:docs",
  "admin:blog",
  "admin:cases",
  "admin:faq",
  "admin:compatibility",
  "admin:marketplace",
] as const;

const roles: readonly (RoleSeed & {
  readonly permissionKeys: readonly string[];
})[] = [
  {
    name: "customer_member",
    realmScope: "customer",
    permissionKeys: ["console:access"],
  },
  {
    name: "customer_admin",
    realmScope: "customer",
    permissionKeys: ["console:access", "console:team"],
  },
  {
    name: "employee",
    realmScope: "workforce",
    permissionKeys: [],
  },
  {
    name: "content_operator",
    realmScope: "workforce",
    permissionKeys: contentPermissionKeys,
  },
  {
    name: "support_operator",
    realmScope: "workforce",
    permissionKeys: ["admin:registrations"],
  },
  {
    name: "admin",
    realmScope: "workforce",
    permissionKeys: adminPermissionKeys,
  },
  {
    name: "super_admin",
    realmScope: "workforce",
    permissionKeys: superAdminPermissionKeys,
  },
];

export async function seedAccessControl(
  repository: AccessControlSeedRepository,
): Promise<void> {
  await repository.transaction(async (transaction) => {
    await transaction.acquireSeedLock();
    const orderedRoles = [...roles].sort((left, right) => {
      const leftKey = `${left.realmScope}:${left.name}`;
      const rightKey = `${right.realmScope}:${right.name}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });

    for (const role of orderedRoles) {
      await transaction.upsertRole({
        name: role.name,
        realmScope: role.realmScope,
        description: role.description,
      });
    }
    await transaction.lockRoles(orderedRoles);

    for (const permission of [...permissions].sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
    )) {
      await transaction.upsertPermission(permission);
    }

    for (const { permissionKeys, ...role } of orderedRoles) {
      await transaction.replaceRolePermissions(
        role.name,
        role.realmScope,
        permissionKeys,
      );
    }
  });
}

type SeedExecutor = Pick<
  NodePgDatabase<typeof schema>,
  "delete" | "execute" | "insert" | "select"
>;

type TransactionRunner = <T>(
  work: (executor: SeedExecutor) => Promise<T>,
) => Promise<T>;

function createRepository(
  executor: SeedExecutor,
  runTransaction?: TransactionRunner,
): AccessControlSeedRepository {
  return {
    async transaction<T>(
      work: (repository: AccessControlSeedRepository) => Promise<T>,
    ): Promise<T> {
      if (!runTransaction) {
        return work(createRepository(executor));
      }

      return runTransaction((transaction) =>
        work(createRepository(transaction)),
      );
    },

    async upsertPermission(permission: PermissionSeed): Promise<void> {
      await executor
        .insert(permissionTable)
        .values(permission)
        .onConflictDoUpdate({
          target: permissionTable.key,
          set: {
            name: permission.name,
            description: permission.description ?? null,
            updatedAt: new Date(),
          },
        });
    },

    async upsertRole(role: RoleSeed): Promise<void> {
      await executor
        .insert(roleTable)
        .values(role)
        .onConflictDoUpdate({
          target: [roleTable.name, roleTable.realmScope],
          set: {
            description: role.description ?? null,
            updatedAt: new Date(),
          },
        });
    },

    async lockRoles(roles: readonly RoleSeed[]): Promise<void> {
      if (!roles.length) return;
      const locked = await executor
        .select({ id: roleTable.id })
        .from(roleTable)
        .where(
          or(
            ...roles.map((role) =>
              and(
                eq(roleTable.name, role.name),
                eq(roleTable.realmScope, role.realmScope),
              ),
            ),
          ),
        )
        .orderBy(asc(roleTable.realmScope), asc(roleTable.name))
        .for("update");
      if (locked.length !== roles.length) {
        throw new Error("Seed target role lock set is incomplete");
      }
    },

    async replaceRolePermissions(
      roleName: string,
      realmScope: RoleRealm,
      permissionKeys: readonly string[],
    ): Promise<void> {
      const [role] = await executor
        .select({ id: roleTable.id })
        .from(roleTable)
        .where(
          and(
            eq(roleTable.name, roleName),
            eq(roleTable.realmScope, realmScope),
          ),
        )
        .for("update");

      if (!role) {
        throw new Error(`Seed role not found: ${realmScope}:${roleName}`);
      }

      const lockedPermissions = await executor
        .select({ id: permissionTable.id, key: permissionTable.key })
        .from(permissionTable)
        .leftJoin(
          rolePermissions,
          and(
            eq(rolePermissions.permissionId, permissionTable.id),
            eq(rolePermissions.roleId, role.id),
          ),
        )
        .where(
          permissionKeys.length
            ? or(
                inArray(permissionTable.key, [...permissionKeys]),
                isNotNull(rolePermissions.id),
              )
            : isNotNull(rolePermissions.id),
        )
        .orderBy(asc(permissionTable.id))
        .for("share", { of: permissionTable });
      const requestedKeys = new Set(permissionKeys);
      const seededPermissions = lockedPermissions.filter(({ key }) =>
        requestedKeys.has(key),
      );

      if (seededPermissions.length !== permissionKeys.length) {
        const found = new Set(seededPermissions.map(({ key }) => key));
        const missing = permissionKeys.filter((key) => !found.has(key));
        throw new Error(`Seed permissions not found: ${missing.join(", ")}`);
      }

      await executor.delete(rolePermissions).where(
        seededPermissions.length
          ? and(
              eq(rolePermissions.roleId, role.id),
              notInArray(
                rolePermissions.permissionId,
                seededPermissions.map(({ id }) => id),
              ),
            )
          : eq(rolePermissions.roleId, role.id),
      );

      if (seededPermissions.length) {
        await executor
          .insert(rolePermissions)
          .values(
            seededPermissions.map(({ id }) => ({
              roleId: role.id,
              permissionId: id,
            })),
          )
          .onConflictDoNothing({
            target: [rolePermissions.roleId, rolePermissions.permissionId],
          });
      }
    },

    async acquireSeedLock(): Promise<void> {
      await executor.execute(
        sql`select pg_advisory_xact_lock(${sql.raw(
          String(ACCESS_CONTROL_PERMISSION_MUTATION_LOCK_KEY),
        )})`,
      );
    },
  };
}

export function createDrizzleAccessControlRepository(
  database: NodePgDatabase<typeof schema>,
): AccessControlSeedRepository {
  return createRepository(database, (work) =>
    database.transaction((transaction) => work(transaction)),
  );
}

export async function runSeedAccessControl(
  repository: AccessControlSeedRepository,
  close: () => Promise<void>,
): Promise<void> {
  try {
    await seedAccessControl(repository);
  } finally {
    await close();
  }
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required");
  }
  return value;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl() });
  const database = drizzle(pool, { schema });

  await runSeedAccessControl(
    createDrizzleAccessControlRepository(database),
    () => pool.end(),
  );
}

const entryPoint = process.argv[1];
if (entryPoint && fileURLToPath(import.meta.url) === path.resolve(entryPoint)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Access-control seed failed: ${message}`);
    process.exitCode = 1;
  });
}
