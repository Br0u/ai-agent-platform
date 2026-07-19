import { describe, expect, it, vi } from "vitest";

import {
  AdminRoleError,
  createRolePermissionService,
  createRoleQueryService,
  createRoleSearchRepository,
  resolvePrivilegedActorRole,
  type RolePermissionRepository,
} from "./roles";

const actor = {
  userId: "super-1",
  realm: "workforce" as const,
  status: "active" as const,
  displayName: "Root",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: ["admin:roles"],
};

describe("role administration", () => {
  it("resolves the most privileged actor role independently of database row order", () => {
    expect(resolvePrivilegedActorRole(["admin", "super_admin"])).toBe(
      "super_admin",
    );
    expect(resolvePrivilegedActorRole(["super_admin", "admin"])).toBe(
      "super_admin",
    );
    expect(resolvePrivilegedActorRole(["employee", "admin"])).toBe("admin");
    expect(resolvePrivilegedActorRole(["employee"])).toBeNull();
  });

  it("loads permissions for the current role page in one deterministic batch", async () => {
    const listPermissions = vi.fn(async () => [
      { roleId: "role-2", key: "admin:users" },
      { roleId: "role-1", key: "support:tickets" },
      { roleId: "role-1", key: "admin:audit" },
    ]);
    const repository = createRoleSearchRepository({
      countRoles: vi.fn(async () => 7),
      listRoles: vi.fn(async () => [
        {
          id: "role-1",
          name: "admin",
          description: null,
          realmScope: "workforce" as const,
        },
        {
          id: "role-2",
          name: "support",
          description: "Support",
          realmScope: "workforce" as const,
        },
      ]),
      listPermissions,
    });

    await expect(
      repository.search({ realm: "workforce", page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "role-1",
          permissionKeys: ["admin:audit", "support:tickets"],
        }),
        expect.objectContaining({
          id: "role-2",
          permissionKeys: ["admin:users"],
        }),
      ],
      total: 7,
    });
    expect(listPermissions).toHaveBeenCalledTimes(1);
    expect(listPermissions).toHaveBeenCalledWith(["role-1", "role-2"]);
  });

  it("searches and paginates safe role DTOs after checking permission", async () => {
    const search = vi.fn(async () => ({
      items: [
        {
          id: "role-1",
          name: "support_operator",
          description: "Support",
          realmScope: "workforce" as const,
          permissionKeys: ["admin:tickets"],
        },
      ],
      total: 21,
    }));
    const service = createRoleQueryService({ search });
    await expect(
      service.list(actor, {
        search: "support",
        realm: "workforce",
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual(expect.objectContaining({ page: 2, pageSize: 10 }));
    expect(search).toHaveBeenCalledWith({
      search: "support",
      realm: "workforce",
      page: 2,
      pageSize: 10,
    });
  });

  it("rejects callers without role permission and invalid realm filters", async () => {
    const service = createRoleQueryService({ search: vi.fn() });
    await expect(
      service.list({ ...actor, permissions: [] }, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ code: "AUTH_PERMISSION_DENIED" });
    await expect(
      service.list(actor, {
        realm: "customer" as "workforce",
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toMatchObject({ code: "ROLE_REALM_INVALID" });
  });

  it("guards and transactionally rechecks permission and realm before replacing permissions", async () => {
    const operations: string[] = [];
    const tx: RolePermissionRepository & {
      acquirePermissionMutationLock(): Promise<void>;
    } = {
      acquirePermissionMutationLock: vi.fn(async () => {
        operations.push("mutation-lock");
      }),
      hasPermission: vi.fn(async () => {
        operations.push("authorize");
        return true;
      }),
      findActorRole: vi.fn(async () => {
        operations.push("actor-role");
        return "super_admin" as const;
      }),
      lockRole: vi.fn(async () => {
        operations.push("lock");
        return {
          id: "role-1",
          name: "support_operator",
          realmScope: "workforce" as const,
        };
      }),
      replacePermissions: vi.fn(async () => {
        operations.push("replace");
      }),
      writeAudit: vi.fn(async () => {
        operations.push("audit");
      }),
    };
    const requireSensitiveAction = vi.fn(async () => actor);
    const service = createRolePermissionService({
      requireSensitiveAction,
      repository: {
        transaction: async (work) => {
          operations.push("tx");
          return work(tx);
        },
      },
    });
    await service.replacePermissions("role-1", ["admin:tickets"]);
    expect(requireSensitiveAction).toHaveBeenCalledWith("admin:roles");
    expect(operations).toEqual([
      "tx",
      "mutation-lock",
      "authorize",
      "actor-role",
      "lock",
      "replace",
      "audit",
    ]);
    expect(tx.writeAudit).toHaveBeenCalledWith({
      actorId: "super-1",
      targetId: "role-1",
      permissionKeys: ["admin:tickets"],
    });
  });

  it("rejects cross-realm permission mutation inside the authoritative transaction", async () => {
    const tx: RolePermissionRepository = {
      acquirePermissionMutationLock: vi.fn(),
      hasPermission: vi.fn(async () => true),
      findActorRole: vi.fn(async () => "super_admin" as const),
      lockRole: vi.fn(async () => ({
        id: "role-customer",
        name: "customer_admin",
        realmScope: "customer" as const,
      })),
      replacePermissions: vi.fn(),
      writeAudit: vi.fn(),
    };
    const service = createRolePermissionService({
      requireSensitiveAction: vi.fn(async () => actor),
      repository: { transaction: (work) => work(tx) },
    });
    await expect(
      service.replacePermissions("role-customer", ["admin:tickets"]),
    ).rejects.toBeInstanceOf(AdminRoleError);
    expect(tx.replacePermissions).not.toHaveBeenCalled();
  });

  it("requires an authoritative super admin for permission changes", async () => {
    const tx: RolePermissionRepository = {
      acquirePermissionMutationLock: vi.fn(),
      hasPermission: vi.fn(async () => true),
      findActorRole: vi.fn(async () => "admin" as const),
      lockRole: vi.fn(async () => ({
        id: "role-1",
        name: "employee",
        realmScope: "workforce" as const,
      })),
      replacePermissions: vi.fn(),
      writeAudit: vi.fn(),
    };
    const service = createRolePermissionService({
      requireSensitiveAction: vi.fn(async () => actor),
      repository: { transaction: (work) => work(tx) },
    });
    await expect(
      service.replacePermissions("role-1", ["admin:users"]),
    ).rejects.toMatchObject({ code: "ROLE_SUPER_ADMIN_REQUIRED" });
    expect(tx.replacePermissions).not.toHaveBeenCalled();
  });

  it("keeps admin:roles in the immutable super_admin permission baseline", async () => {
    const tx: RolePermissionRepository = {
      acquirePermissionMutationLock: vi.fn(),
      hasPermission: vi.fn(async () => true),
      findActorRole: vi.fn(async () => "super_admin" as const),
      lockRole: vi.fn(async () => ({
        id: "super-role",
        name: "super_admin",
        realmScope: "workforce" as const,
      })),
      replacePermissions: vi.fn(),
      writeAudit: vi.fn(),
    };
    const service = createRolePermissionService({
      requireSensitiveAction: vi.fn(async () => actor),
      repository: { transaction: (work) => work(tx) },
    });

    await expect(
      service.replacePermissions("super-role", ["admin:users"]),
    ).rejects.toMatchObject({ code: "ROLE_SUPER_ADMIN_BASELINE_REQUIRED" });
    expect(tx.replacePermissions).not.toHaveBeenCalled();
    expect(tx.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects delegating admin:docs:delete to a non-super-admin role", async () => {
    const tx: RolePermissionRepository = {
      acquirePermissionMutationLock: vi.fn(),
      hasPermission: vi.fn(async () => true),
      findActorRole: vi.fn(async () => "super_admin" as const),
      lockRole: vi.fn(async () => ({
        id: "admin-role",
        name: "admin",
        realmScope: "workforce" as const,
      })),
      replacePermissions: vi.fn(),
      writeAudit: vi.fn(),
    };
    const service = createRolePermissionService({
      requireSensitiveAction: vi.fn(async () => actor),
      repository: { transaction: (work) => work(tx) },
    });

    await expect(
      service.replacePermissions("admin-role", [
        "admin:roles",
        "admin:docs:delete",
      ]),
    ).rejects.toMatchObject({ code: "ROLE_PERMISSION_NON_DELEGABLE" });
    expect(tx.replacePermissions).not.toHaveBeenCalled();
    expect(tx.writeAudit).not.toHaveBeenCalled();
  });

  it("keeps admin:docs:delete in the immutable super_admin permission baseline", async () => {
    const tx: RolePermissionRepository = {
      acquirePermissionMutationLock: vi.fn(),
      hasPermission: vi.fn(async () => true),
      findActorRole: vi.fn(async () => "super_admin" as const),
      lockRole: vi.fn(async () => ({
        id: "super-role",
        name: "super_admin",
        realmScope: "workforce" as const,
      })),
      replacePermissions: vi.fn(),
      writeAudit: vi.fn(),
    };
    const service = createRolePermissionService({
      requireSensitiveAction: vi.fn(async () => actor),
      repository: { transaction: (work) => work(tx) },
    });

    await expect(
      service.replacePermissions("super-role", ["admin:roles"]),
    ).rejects.toMatchObject({ code: "ROLE_SUPER_ADMIN_BASELINE_REQUIRED" });
    expect(tx.replacePermissions).not.toHaveBeenCalled();
    expect(tx.writeAudit).not.toHaveBeenCalled();
  });
});
