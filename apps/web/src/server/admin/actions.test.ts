import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sensitive: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../auth/sensitive-action", () => ({
  requireSensitiveWorkforceAction: mocks.sensitive,
}));
vi.mock("../auth/workspace-route-guards", () => ({
  requireConsolePage: vi.fn(),
}));
vi.mock("./roles", () => ({ createDefaultRolePermissionService: vi.fn() }));
vi.mock("./sessions", () => ({
  createDefaultAdminSessionService: vi.fn(),
  createDefaultCustomerSessionService: vi.fn(),
}));
vi.mock("./users", () => ({ createDefaultWorkforceUserService: vi.fn() }));
vi.mock("@ai-agent-platform/database", () => ({
  getDatabase: () => ({ transaction: mocks.transaction }),
  permissions: { id: "permission.id", key: "permission.key" },
  rolePermissions: {
    roleId: "role_permission.role_id",
    permissionId: "role_permission.permission_id",
  },
  roles: { id: "role.id", realmScope: "role.realm_scope" },
  userRoles: {
    id: "user_role.id",
    roleId: "user_role.role_id",
    userId: "user_role.user_id",
  },
  users: { id: "user.id", identityRealm: "user.realm", status: "user.status" },
}));

import { updateSiteSettingsAction } from "./actions";

beforeEach(() => vi.clearAllMocks());

describe("site settings action boundary", () => {
  it("requires sensitive assurance before opening the authoritative transaction", async () => {
    mocks.sensitive.mockRejectedValueOnce(new Error("AUTH_MFA_REQUIRED"));
    const form = new FormData();
    form.set("field", "supportMessage");
    await expect(updateSiteSettingsAction(form)).rejects.toThrow(
      "AUTH_MFA_REQUIRED",
    );
    expect(mocks.sensitive).toHaveBeenCalledWith("admin:site");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
