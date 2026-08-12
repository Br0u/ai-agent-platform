import { describe, expect, it, vi } from "vitest";

import {
  AuthAccessError,
  createAccessService,
  type AccessRepository,
  type AuthoritativeUser,
} from "./access";

const workforce: AuthoritativeUser = {
  id: "staff-1",
  realm: "workforce",
  status: "active",
  displayName: "Admin",
  emailVerificationStatus: "verified",
  mustChangePassword: false,
};

function service(user: AuthoritativeUser = workforce) {
  const repository: AccessRepository = {
    findUserById: vi.fn(async () => user),
    findCustomerOrganizations: vi.fn(async () => []),
    findPermissionKeys: vi.fn(async () => ["admin:users"]),
  };
  return createAccessService({
    authenticators: {
      customer: vi.fn(async () => null),
      workforce: vi.fn(async () => ({
        userId: user.id,
        realm: "workforce" as const,
      })),
    },
    repository,
    getHeaders: vi.fn(async () => new Headers()),
  });
}

describe("workforce access", () => {
  it("requires an initial password change but no two-factor setup", async () => {
    const changing = service({ ...workforce, mustChangePassword: true });
    await expect(changing.requireWorkforce()).rejects.toMatchObject({
      code: "AUTH_PASSWORD_CHANGE_REQUIRED",
    } satisfies Partial<AuthAccessError>);
    await expect(
      changing.requireWorkforce({ setupFlow: "change-password" }),
    ).resolves.toMatchObject({ mustChangePassword: true });

    await expect(service().requireWorkforce()).resolves.toMatchObject({
      userId: "staff-1",
      permissions: ["admin:users"],
    });
  });

  it("still enforces permissions on every request", async () => {
    await expect(
      service().requirePermission("admin:roles"),
    ).rejects.toMatchObject({
      code: "AUTH_PERMISSION_DENIED",
    } satisfies Partial<AuthAccessError>);
  });
});
