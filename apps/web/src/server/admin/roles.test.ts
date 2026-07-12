import { describe, expect, it, vi } from "vitest";

import {
  AdminRoleError,
  createRolePermissionService,
  createRoleQueryService,
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
    const tx: RolePermissionRepository = {
      hasPermission: vi.fn(async () => true),
      findActorRole: vi.fn(async () => "super_admin" as const),
      findRole: vi.fn(async () => ({
        id: "role-1",
        name: "support_operator",
        realmScope: "workforce" as const,
      })),
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
    expect(operations).toEqual(["tx", "replace", "audit"]);
    expect(tx.writeAudit).toHaveBeenCalledWith({
      actorId: "super-1",
      targetId: "role-1",
      permissionKeys: ["admin:tickets"],
    });
  });

  it("rejects cross-realm permission mutation inside the authoritative transaction", async () => {
    const tx: RolePermissionRepository = {
      hasPermission: vi.fn(async () => true),
      findActorRole: vi.fn(async () => "super_admin" as const),
      findRole: vi.fn(async () => ({
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
      hasPermission: vi.fn(async () => true),
      findActorRole: vi.fn(async () => "admin" as const),
      findRole: vi.fn(async () => ({
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
});
