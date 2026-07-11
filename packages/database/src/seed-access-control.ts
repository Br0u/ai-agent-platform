import { fileURLToPath } from "node:url";
import path from "node:path";

import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
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
  readonly managedBySystem: boolean;
}

export interface RoleSeed {
  readonly name: string;
  readonly realmScope: RoleRealm;
  readonly description?: string;
  readonly isSystem: boolean;
}

export interface AccessControlSeedRepository {
  transaction<T>(
    work: (repository: AccessControlSeedRepository) => Promise<T>,
  ): Promise<T>;
  upsertPermission(permission: PermissionSeed): Promise<void>;
  upsertRole(role: RoleSeed): Promise<void>;
  replaceRolePermissions(
    roleName: string,
    realmScope: RoleRealm,
    permissionKeys: readonly string[],
  ): Promise<void>;
  acquireSeedLock(): Promise<void>;
  deleteSystemRolesExcept(
    manifest: readonly { name: string; realmScope: RoleRealm }[],
  ): Promise<void>;
  deleteSystemPermissionsExcept(manifestKeys: readonly string[]): Promise<void>;
}

const permissions: readonly PermissionSeed[] = [
  { key: "console:access", name: "访问客户控制台", managedBySystem: true },
  { key: "console:team", name: "管理客户团队", managedBySystem: true },
  { key: "admin:site", name: "管理站点", managedBySystem: true },
  { key: "admin:navigation", name: "管理导航", managedBySystem: true },
  { key: "admin:products", name: "管理产品", managedBySystem: true },
  { key: "admin:releases", name: "管理版本", managedBySystem: true },
  { key: "admin:docs", name: "管理文档", managedBySystem: true },
  { key: "admin:blog", name: "管理资讯", managedBySystem: true },
  { key: "admin:cases", name: "管理案例", managedBySystem: true },
  { key: "admin:faq", name: "管理常见问题", managedBySystem: true },
  {
    key: "admin:compatibility",
    name: "管理兼容性",
    managedBySystem: true,
  },
  { key: "admin:marketplace", name: "管理生态市场", managedBySystem: true },
  { key: "admin:analytics", name: "查看运营分析", managedBySystem: true },
  {
    key: "admin:registrations",
    name: "审核客户注册",
    managedBySystem: true,
  },
  { key: "admin:users", name: "管理用户", managedBySystem: true },
  { key: "admin:roles", name: "管理角色", managedBySystem: true },
  { key: "admin:audit", name: "查看审计日志", managedBySystem: true },
];

const adminPermissionKeys = permissions
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
    isSystem: true,
    permissionKeys: ["console:access"],
  },
  {
    name: "customer_admin",
    realmScope: "customer",
    isSystem: true,
    permissionKeys: ["console:access", "console:team"],
  },
  {
    name: "employee",
    realmScope: "workforce",
    isSystem: true,
    permissionKeys: [],
  },
  {
    name: "content_operator",
    realmScope: "workforce",
    isSystem: true,
    permissionKeys: contentPermissionKeys,
  },
  {
    name: "support_operator",
    realmScope: "workforce",
    isSystem: true,
    permissionKeys: ["admin:registrations"],
  },
  {
    name: "admin",
    realmScope: "workforce",
    isSystem: true,
    permissionKeys: adminPermissionKeys,
  },
  {
    name: "super_admin",
    realmScope: "workforce",
    isSystem: true,
    permissionKeys: adminPermissionKeys,
  },
];

export async function seedAccessControl(
  repository: AccessControlSeedRepository,
): Promise<void> {
  await repository.transaction(async (transaction) => {
    await transaction.acquireSeedLock();
    for (const permission of permissions) {
      await transaction.upsertPermission(permission);
    }

    for (const { permissionKeys, ...role } of roles) {
      await transaction.upsertRole(role);
      await transaction.replaceRolePermissions(
        role.name,
        role.realmScope,
        permissionKeys,
      );
    }

    await transaction.deleteSystemRolesExcept(
      roles.map(({ name, realmScope }) => ({ name, realmScope })),
    );
    await transaction.deleteSystemPermissionsExcept(
      permissions.map(({ key }) => key),
    );
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
            managedBySystem: true,
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
            isSystem: true,
            updatedAt: new Date(),
          },
        });
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
        );

      if (!role) {
        throw new Error(`Seed role not found: ${realmScope}:${roleName}`);
      }

      await executor
        .delete(rolePermissions)
        .where(eq(rolePermissions.roleId, role.id));

      if (permissionKeys.length === 0) {
        return;
      }

      const seededPermissions = await executor
        .select({ id: permissionTable.id, key: permissionTable.key })
        .from(permissionTable)
        .where(inArray(permissionTable.key, [...permissionKeys]));

      if (seededPermissions.length !== permissionKeys.length) {
        const found = new Set(seededPermissions.map(({ key }) => key));
        const missing = permissionKeys.filter((key) => !found.has(key));
        throw new Error(`Seed permissions not found: ${missing.join(", ")}`);
      }

      await executor.insert(rolePermissions).values(
        seededPermissions.map(({ id }) => ({
          roleId: role.id,
          permissionId: id,
        })),
      );
    },

    async acquireSeedLock(): Promise<void> {
      await executor.execute(sql`select pg_advisory_xact_lock(72134878)`);
    },

    async deleteSystemRolesExcept(manifest): Promise<void> {
      const retained = new Set(
        manifest.map(({ name, realmScope }) => `${realmScope}:${name}`),
      );
      const systemRoles = await executor
        .select({
          id: roleTable.id,
          name: roleTable.name,
          realmScope: roleTable.realmScope,
        })
        .from(roleTable)
        .where(eq(roleTable.isSystem, true));
      const retiredIds = systemRoles
        .filter(
          ({ name, realmScope }) => !retained.has(`${realmScope}:${name}`),
        )
        .map(({ id }) => id);
      if (retiredIds.length > 0) {
        await executor
          .delete(roleTable)
          .where(inArray(roleTable.id, retiredIds));
      }
    },

    async deleteSystemPermissionsExcept(manifestKeys): Promise<void> {
      const systemPermissions = await executor
        .select({ id: permissionTable.id, key: permissionTable.key })
        .from(permissionTable)
        .where(eq(permissionTable.managedBySystem, true));
      const retained = new Set(manifestKeys);
      const retiredIds = systemPermissions
        .filter(({ key }) => !retained.has(key))
        .map(({ id }) => id);
      if (retiredIds.length > 0) {
        await executor
          .delete(permissionTable)
          .where(inArray(permissionTable.id, retiredIds));
      }
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
