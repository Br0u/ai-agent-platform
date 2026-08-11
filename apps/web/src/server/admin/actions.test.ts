import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  requirePermission: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("../auth/workspace-route-guards", () => ({
  requireConsolePage: vi.fn(),
}));
vi.mock("./users", () => ({
  WorkforceMutationError: class WorkforceMutationError extends Error {},
  createDefaultWorkforceUserService: () => ({ createUser: mocks.createUser }),
}));
vi.mock("./roles", () => ({
  AdminRoleError: class AdminRoleError extends Error {},
  createDefaultRolePermissionService: vi.fn(),
}));
vi.mock("./sessions", () => ({
  AdminSessionError: class AdminSessionError extends Error {},
  createDefaultAdminSessionService: vi.fn(),
  createDefaultCustomerSessionService: vi.fn(),
}));
vi.mock("@ai-agent-platform/database", () => ({
  getDatabase: () => ({ transaction: mocks.transaction }),
  permissions: { id: "permission.id", key: "permission.key" },
  rolePermissions: {
    roleId: "rolePermission.roleId",
    permissionId: "rolePermission.permissionId",
  },
  roles: { id: "role.id", realmScope: "role.realmScope" },
  userRoles: {
    id: "userRole.id",
    roleId: "userRole.roleId",
    userId: "userRole.userId",
  },
  users: { id: "user.id", identityRealm: "user.realm", status: "user.status" },
}));

import { createEmployeeAction, updateSiteSettingsAction } from "./actions";

beforeEach(() => vi.clearAllMocks());

describe("admin actions", () => {
  it("delegates employee creation without a password re-check", async () => {
    mocks.createUser.mockResolvedValue(undefined);
    const form = new FormData();
    form.set("name", "Admin");
    form.set("email", "admin@example.test");
    form.set("username", "Admin");
    form.set("temporaryPassword", "strong-password-123");
    form.set("initialRole", "super_admin");

    await expect(createEmployeeAction({ kind: "idle" }, form)).resolves.toEqual(
      {
        kind: "success",
      },
    );
    expect(mocks.createUser).toHaveBeenCalledOnce();
  });

  it("checks the site permission before opening its transaction", async () => {
    mocks.requirePermission.mockResolvedValue({ userId: "staff-1" });
    mocks.transaction.mockRejectedValue(
      new Error("SITE_CONFIGURATION_NOT_IMPLEMENTED"),
    );
    const form = new FormData();
    form.set("field", "supportMessage");

    await expect(
      updateSiteSettingsAction({ kind: "idle" }, form),
    ).resolves.toEqual({
      kind: "domain_error",
      code: "SITE_CONFIGURATION_NOT_IMPLEMENTED",
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith("admin:site");
  });
});
