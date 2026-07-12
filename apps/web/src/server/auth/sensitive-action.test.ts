import { describe, expect, it, vi } from "vitest";

import {
  SensitiveActionError,
  createSensitiveActionGuard,
} from "./sensitive-action";

const now = new Date("2026-07-12T05:00:00.000Z");
const actor = {
  userId: "staff-1",
  realm: "workforce" as const,
  status: "active" as const,
  displayName: "Staff",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: ["admin:users"],
};

function fixture(overrides: Record<string, unknown> = {}) {
  const requirePermission = vi.fn(async () => actor);
  const getSession = vi.fn(async () => ({
    id: "session-new",
    userId: actor.userId,
    realm: "workforce" as const,
    createdAt: new Date(now.getTime() - 5 * 60_000),
    mfaVerifiedAt: new Date(now.getTime() - 4 * 60_000),
  }));
  return {
    getSession,
    guard: createSensitiveActionGuard({
      now: () => now,
      requirePermission,
      getSession,
      ...overrides,
    }),
    requirePermission,
  };
}

describe("sensitive workforce action guard", () => {
  it("requires the exact permission and recent password plus MFA assurance by default", async () => {
    const { getSession, guard, requirePermission } = fixture();
    await expect(guard("admin:users")).resolves.toEqual(actor);
    expect(requirePermission).toHaveBeenCalledWith("admin:users");
    expect(getSession).toHaveBeenCalledOnce();
  });

  it.each([
    [
      new Date(now.getTime() - 10 * 60_000 - 1),
      new Date(now.getTime() - 60_000),
      "AUTH_REAUTH_REQUIRED",
    ],
    [new Date(now.getTime() - 60_000), null, "AUTH_MFA_REQUIRED"],
    [
      new Date(now.getTime() - 60_000),
      new Date(now.getTime() - 10 * 60_000 - 1),
      "AUTH_MFA_REQUIRED",
    ],
  ] as const)(
    "rejects stale or absent assurance",
    async (createdAt, mfaVerifiedAt, code) => {
      const { guard } = fixture({
        getSession: async () => ({
          id: "session",
          userId: actor.userId,
          realm: "workforce",
          createdAt,
          mfaVerifiedAt,
        }),
      });
      await expect(guard("admin:users")).rejects.toMatchObject({
        code,
        redirectTo: "/staff/re-auth",
      });
    },
  );

  it("rejects a cross-realm or mismatched session", async () => {
    const { guard } = fixture({
      getSession: async () => ({
        id: "session",
        userId: "other",
        realm: "customer",
        createdAt: now,
        mfaVerifiedAt: now,
      }),
    });
    await expect(guard("admin:users")).rejects.toMatchObject({
      code: "AUTH_REAUTH_REQUIRED",
    });
  });

  it("supports narrower freshness and explicitly non-MFA actions", async () => {
    const { guard } = fixture({
      getSession: async () => ({
        id: "session",
        userId: actor.userId,
        realm: "workforce",
        createdAt: new Date(now.getTime() - 20_000),
        mfaVerifiedAt: null,
      }),
    });
    await expect(
      guard("admin:users", { recentWithinSeconds: 30, mfaRequired: false }),
    ).resolves.toEqual(actor);
  });
});

it("exposes a stable redirectable error", () => {
  expect(new SensitiveActionError("AUTH_REAUTH_REQUIRED").redirectTo).toBe(
    "/staff/re-auth",
  );
});
