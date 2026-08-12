import { describe, expect, it, vi } from "vitest";

import {
  AUTH_ACTION_INITIAL_STATE,
  createAuthActions,
  createStaffSecurityActions,
  safeReturnPath,
  type LoginUser,
} from "./actions";

const workforce: LoginUser = {
  id: "staff-1",
  realm: "workforce",
  status: "active",
  mustChangePassword: false,
};

function dependencies() {
  const signInUsername = vi.fn(async () => ({
    response: { user: { id: workforce.id }, token: "token" },
    headers: new Headers(),
  }));
  const signInEmail = vi.fn(async () => ({
    response: { user: { id: workforce.id }, token: "token" },
    headers: new Headers(),
  }));
  return {
    signInUsername,
    signInEmail,
    value: {
      customer: {
        signInEmail: vi.fn(),
        signOut: vi.fn(),
        revokeNewSession: vi.fn(),
      },
      staff: {
        signInUsername,
        signInEmail,
        signOut: vi.fn(),
        revokeNewSession: vi.fn(),
      },
      users: {
        findById: vi.fn(async () => workforce),
        hasExactWorkforceUsername: vi.fn(
          async (value: string) => value === "Hkzy@admin",
        ),
      },
      audit: { write: vi.fn() },
      reportInternalError: vi.fn(),
      commitCookies: vi.fn(),
      getHeaders: vi.fn(async () => new Headers()),
      getCookieStore: vi.fn(async () => ({
        set: vi.fn(),
        delete: vi.fn(),
      })),
      rateLimiter: { consume: vi.fn() },
    },
  };
}

describe("staff authentication", () => {
  it("prefers an exact case-sensitive username even when it contains @", async () => {
    const fixture = dependencies();
    const action = createAuthActions(fixture.value);
    const form = new FormData();
    form.set("identifier", "Hkzy@admin");
    form.set("password", "Hkzy@admin2020!");

    await expect(
      action.staffLogin(AUTH_ACTION_INITIAL_STATE, form),
    ).resolves.toEqual({
      kind: "success",
      redirectTo: "/admin",
    });
    expect(fixture.signInUsername).toHaveBeenCalledWith(
      expect.objectContaining({ username: "Hkzy@admin" }),
    );
    expect(fixture.signInEmail).not.toHaveBeenCalled();
  });

  it("does not normalize username case", async () => {
    const fixture = dependencies();
    const action = createAuthActions(fixture.value);
    const form = new FormData();
    form.set("identifier", "hkzy@admin");
    form.set("password", "Hkzy@admin2020!");

    await action.staffLogin(AUTH_ACTION_INITIAL_STATE, form);
    expect(fixture.signInUsername).not.toHaveBeenCalled();
    expect(fixture.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: "hkzy@admin" }),
    );
  });

  it("returns directly to admin after a password change", async () => {
    const actions = createStaffSecurityActions({
      gateway: {
        changePassword: vi.fn(async () => ({
          response: { token: "replacement" },
          headers: new Headers(),
        })),
        revokeNewSession: vi.fn(),
      },
      repository: {
        current: vi.fn(async () => ({ userId: "staff-1" })),
        finalizePasswordChange: vi.fn(),
      },
      commitCookies: vi.fn(),
      getHeaders: vi.fn(async () => new Headers()),
      clearCookies: vi.fn(),
    });
    const form = new FormData();
    form.set("currentPassword", "old-password-123");
    form.set("newPassword", "new-password-123");
    form.set("returnTo", "/admin/users");

    await expect(actions.changePassword(form)).resolves.toEqual({
      kind: "success",
      redirectTo: "/admin/users",
    });
  });
});

describe("safeReturnPath", () => {
  it("rejects external paths", () => {
    expect(safeReturnPath("workforce", "https://example.com")).toBe("/admin");
  });
});
