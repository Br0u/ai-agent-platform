import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sensitive: vi.fn(),
  transaction: vi.fn(),
  redirect: vi.fn(),
  createUser: vi.fn(),
  disableUser: vi.fn(),
  reactivateUser: vi.fn(),
  replaceTemporaryPassword: vi.fn(),
  setRole: vi.fn(),
  addRole: vi.fn(),
  removeRole: vi.fn(),
  replacePermissions: vi.fn(),
  revokeOne: vi.fn(),
  revokeAll: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../auth/sensitive-action", () => ({
  requireSensitiveWorkforceAction: mocks.sensitive,
  SensitiveActionError: class SensitiveActionError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "SensitiveActionError";
    }
  },
}));
vi.mock("../auth/workspace-route-guards", () => ({
  requireConsolePage: vi.fn(),
}));
vi.mock("./roles", () => ({
  AdminRoleError: class AdminRoleError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "AdminRoleError";
    }
  },
  createDefaultRolePermissionService: () => ({
    replacePermissions: mocks.replacePermissions,
  }),
}));
vi.mock("./sessions", () => ({
  AdminSessionError: class AdminSessionError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "AdminSessionError";
    }
  },
  createDefaultAdminSessionService: () => ({
    revokeOne: mocks.revokeOne,
    revokeAll: mocks.revokeAll,
  }),
  createDefaultCustomerSessionService: vi.fn(),
}));
vi.mock("./users", () => ({
  WorkforceMutationError: class WorkforceMutationError extends Error {
    constructor(readonly code: string) {
      super(code);
      this.name = "WorkforceMutationError";
    }
  },
  createDefaultWorkforceUserService: () => ({
    createUser: mocks.createUser,
    disableUser: mocks.disableUser,
    reactivateUser: mocks.reactivateUser,
    replaceTemporaryPassword: mocks.replaceTemporaryPassword,
    setRole: mocks.setRole,
    addRole: mocks.addRole,
    removeRole: mocks.removeRole,
  }),
}));
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

import {
  addUserRoleAction,
  createEmployeeAction,
  disableUserAction,
  reactivateUserAction,
  removeUserRoleAction,
  replacePasswordAction,
  replaceRolePermissionsAction,
  revokeAdminSessionAction,
  revokeAllAdminSessionsAction,
  setUserRoleAction,
  updateSiteSettingsAction,
} from "./actions";
import { SensitiveActionError } from "../auth/sensitive-action";
import { AdminRoleError } from "./roles";
import { AdminSessionError } from "./sessions";
import { WorkforceMutationError } from "./users";

beforeEach(() => vi.clearAllMocks());

describe("site settings action boundary", () => {
  it("requires sensitive assurance before opening the authoritative transaction", async () => {
    mocks.sensitive.mockRejectedValueOnce(
      new SensitiveActionError("AUTH_MFA_REQUIRED"),
    );
    const form = new FormData();
    form.set("field", "supportMessage");
    await updateSiteSettingsAction({ kind: "idle" }, form);
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/staff/re-auth?returnTo=%2Fadmin%2Fsite",
    );
    expect(mocks.sensitive).toHaveBeenCalledWith("admin:site");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    "AUTH_PERMISSION_DENIED",
    "SITE_CONFIGURATION_NOT_IMPLEMENTED",
  ] as const)("returns stable state for %s", async (code) => {
    mocks.sensitive.mockResolvedValueOnce({ userId: "staff-1" });
    mocks.transaction.mockRejectedValueOnce(new Error(code));
    const form = new FormData();
    form.set("field", "supportMessage");

    await expect(
      updateSiteSettingsAction({ kind: "idle" }, form),
    ).resolves.toEqual({ kind: "domain_error", code });
  });
});

describe("explicit workforce role actions", () => {
  it.each([
    ["add", addUserRoleAction, mocks.addRole],
    ["remove", removeUserRoleAction, mocks.removeRole],
  ] as const)(
    "delegates exact user and role for %s",
    async (_name, action, call) => {
      const form = new FormData();
      form.set("userId", "employee-1");
      form.set("role", "support_operator");

      await action({ kind: "idle" }, form);

      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "guarded-by-service" }),
        "employee-1",
        "support_operator",
      );
    },
  );
});

describe("admin mutation server-action errors", () => {
  const form = (values: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    data.set("returnTo", "https://attacker.example/steal");
    return data;
  };

  it.each([
    [
      "create employee",
      createEmployeeAction,
      mocks.createUser,
      form({
        name: "Employee",
        email: "employee@example.com",
        username: "employee",
        temporaryPassword: "temporary-password",
        initialRole: "employee",
      }),
      "/admin/users",
    ],
    [
      "disable user",
      disableUserAction,
      mocks.disableUser,
      form({ userId: "employee-1" }),
      "/admin/users",
    ],
    [
      "reactivate user",
      reactivateUserAction,
      mocks.reactivateUser,
      form({ userId: "employee-1" }),
      "/admin/users",
    ],
    [
      "replace password",
      replacePasswordAction,
      mocks.replaceTemporaryPassword,
      form({ userId: "employee-1", temporaryPassword: "replacement" }),
      "/admin/users",
    ],
    [
      "set role",
      setUserRoleAction,
      mocks.setRole,
      form({ userId: "employee-1", role: "employee" }),
      "/admin/roles",
    ],
    [
      "add role",
      addUserRoleAction,
      mocks.addRole,
      form({ userId: "employee-1", role: "employee" }),
      "/admin/roles",
    ],
    [
      "remove role",
      removeUserRoleAction,
      mocks.removeRole,
      form({ userId: "employee-1", role: "employee" }),
      "/admin/roles",
    ],
    [
      "replace permissions",
      replaceRolePermissionsAction,
      mocks.replacePermissions,
      form({ roleId: "role-1", permissionKeys: "admin:users" }),
      "/admin/roles",
    ],
    [
      "revoke one session",
      revokeAdminSessionAction,
      mocks.revokeOne,
      form({ userId: "employee-1", realm: "workforce", sessionId: "s-1" }),
      "/admin/users",
    ],
    [
      "revoke all sessions",
      revokeAllAdminSessionsAction,
      mocks.revokeAll,
      form({ userId: "employee-1", realm: "workforce" }),
      "/admin/users",
    ],
  ] as const)(
    "redirects sensitive failure for %s to its fixed page",
    async (_name, action, mutation, data, returnTo) => {
      mutation.mockRejectedValueOnce(
        new SensitiveActionError("AUTH_REAUTH_REQUIRED"),
      );

      await action({ kind: "idle" }, data);

      expect(mocks.redirect).toHaveBeenCalledWith(
        `/staff/re-auth?returnTo=${encodeURIComponent(returnTo)}`,
      );
      expect(mocks.redirect).not.toHaveBeenCalledWith(
        expect.stringContaining("attacker.example"),
      );
    },
  );

  it.each([
    [
      "workforce",
      disableUserAction,
      mocks.disableUser,
      new WorkforceMutationError("WORKFORCE_TARGET_NOT_FOUND"),
      form({ userId: "missing" }),
      "WORKFORCE_TARGET_NOT_FOUND",
    ],
    [
      "role",
      replaceRolePermissionsAction,
      mocks.replacePermissions,
      new AdminRoleError("ROLE_NOT_FOUND"),
      form({ roleId: "missing", permissionKeys: "admin:users" }),
      "ROLE_NOT_FOUND",
    ],
    [
      "session",
      revokeAdminSessionAction,
      mocks.revokeOne,
      new AdminSessionError("SESSION_NOT_FOUND"),
      form({ userId: "employee-1", realm: "workforce", sessionId: "missing" }),
      "SESSION_NOT_FOUND",
    ],
  ] as const)(
    "returns a stable action state for %s domain errors",
    async (_name, action, mutation, error, data, code) => {
      mutation.mockRejectedValueOnce(error);

      await expect(action({ kind: "idle" }, data)).resolves.toEqual({
        kind: "domain_error",
        code,
      });
    },
  );
});
