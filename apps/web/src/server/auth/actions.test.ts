import { describe, expect, it, vi } from "vitest";

import {
  AUTH_ACTION_INITIAL_STATE,
  createAuthActions,
  safeReturnPath,
  type AuthActionDependencies,
  type LoginUser,
} from "./actions";

const activeCustomer: LoginUser = {
  id: "customer-1",
  realm: "customer",
  status: "active",
  mustChangePassword: false,
  twoFactorEnabled: false,
};

const activeStaff: LoginUser = {
  id: "staff-1",
  realm: "workforce",
  status: "active",
  mustChangePassword: false,
  twoFactorEnabled: false,
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function staged<T>(response: T): { response: T; headers: Headers } {
  return { response, headers: new Headers() };
}

function fixture(overrides: Partial<AuthActionDependencies> = {}) {
  const customer = {
    signInEmail: vi.fn().mockResolvedValue(
      staged({
        user: { id: activeCustomer.id },
        token: "new-customer-token",
      }),
    ),
    signOut: vi.fn().mockResolvedValue(staged({ success: true })),
    revokeNewSession: vi.fn().mockResolvedValue(undefined),
  };
  const staff = {
    signInEmail: vi.fn().mockResolvedValue(
      staged({
        user: { id: activeStaff.id },
        token: "new-staff-token",
      }),
    ),
    signInUsername: vi.fn().mockResolvedValue(
      staged({
        user: { id: activeStaff.id },
        token: "new-staff-token",
      }),
    ),
    signOut: vi.fn().mockResolvedValue(staged({ success: true })),
    revokeNewSession: vi.fn().mockResolvedValue(undefined),
  };
  const users = {
    findById: vi
      .fn()
      .mockImplementation(
        async (id: string): Promise<LoginUser | null> =>
          id === activeCustomer.id ? activeCustomer : activeStaff,
      ),
  };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const reportInternalError = vi.fn();
  const commitCookies = vi.fn().mockResolvedValue(undefined);
  const cookieStore = { delete: vi.fn(), set: vi.fn() };
  const dependencies: AuthActionDependencies = {
    customer,
    staff,
    users,
    audit,
    reportInternalError,
    commitCookies,
    getHeaders: async () =>
      new Headers({ "user-agent": "test-agent", "x-real-ip": "127.0.0.1" }),
    getCookieStore: async () => cookieStore,
    ...overrides,
  };

  return {
    actions: createAuthActions(dependencies),
    audit,
    cookieStore,
    customer,
    commitCookies,
    reportInternalError,
    staff,
    users,
  };
}

describe("safeReturnPath", () => {
  it.each([
    ["customer", "/console", "/console"],
    [
      "customer",
      "/console/profile?tab=security#password",
      "/console/profile?tab=security#password",
    ],
    ["workforce", "/admin/products", "/admin/products"],
    ["workforce", "/admin/site#settings", "/admin/site#settings"],
  ] as const)("allows a canonical %s path", (realm, value, expected) => {
    expect(safeReturnPath(realm, value)).toBe(expected);
  });

  it.each([
    "//evil.example/console",
    "/\\evil",
    "https://evil.example/console",
    "/console/%2e%2e/admin",
    "/console%2fprofile",
    "/console/../admin",
    "/console\\profile",
    "/login?returnTo=/console",
    "/staff/login?returnTo=/admin",
    "/console-old",
    "/admin-old",
  ])(
    "rejects an off-origin, encoded, traversal, or login-loop path: %s",
    (value) => {
      expect(safeReturnPath("customer", value)).toBe("/console");
      expect(safeReturnPath("workforce", value)).toBe("/admin");
    },
  );
});

describe("customer login action", () => {
  it("normalizes email and hard-codes the seven-day remember policy", async () => {
    const { actions, commitCookies, customer } = fixture();

    await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({
        email: "  ALICE@EXAMPLE.TEST  ",
        password: "ValidPass#12",
        rememberMe: "false",
        realm: "workforce",
      }),
    );

    expect(customer.signInEmail).toHaveBeenCalledWith({
      email: "alice@example.test",
      password: "ValidPass#12",
      rememberMe: true,
      headers: expect.any(Headers),
    });
    expect(commitCookies).toHaveBeenCalledWith("customer", expect.any(Headers));
  });

  it.each([
    { status: "pending_review", redirectTo: "/console/onboarding" },
    { status: "rejected", redirectTo: "/console/onboarding" },
    { status: "active", redirectTo: "/console/profile" },
  ] as const)(
    "redirects $status customers by authoritative status",
    async ({ status, redirectTo }) => {
      const { actions, users } = fixture();
      users.findById.mockResolvedValue({ ...activeCustomer, status });

      const result = await actions.customerLogin(
        AUTH_ACTION_INITIAL_STATE,
        form({
          email: "alice@example.test",
          password: "ValidPass#12",
          returnTo: "/console/profile",
        }),
      );

      expect(result).toEqual({ kind: "success", redirectTo });
    },
  );

  it("rejects disabled users, revokes a just-created session, and clears only the customer cookie", async () => {
    const { actions, cookieStore, customer, users } = fixture();
    users.findById.mockResolvedValue({ ...activeCustomer, status: "disabled" });

    const result = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "ValidPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(customer.revokeNewSession).toHaveBeenCalledWith(
      "new-customer-token",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
    expect(cookieStore.delete).not.toHaveBeenCalledWith("aap_staff_session");
  });

  it("compensates a post-sign-in repository failure without exposing it", async () => {
    const { actions, cookieStore, customer, users } = fixture();
    users.findById.mockRejectedValue(new Error("database connection secret"));

    const result = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "ValidPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(customer.revokeNewSession).toHaveBeenCalledWith(
      "new-customer-token",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
  });

  it("stays generic even when both compensation operations fail", async () => {
    const {
      actions,
      commitCookies,
      cookieStore,
      customer,
      reportInternalError,
      users,
    } = fixture();
    users.findById.mockRejectedValue(new Error("repository unavailable"));
    customer.revokeNewSession.mockRejectedValue(new Error("revoke failed"));
    cookieStore.delete.mockImplementation(() => {
      throw new Error("cookie store failed");
    });
    reportInternalError.mockImplementation(() => {
      throw new Error("reporter failed");
    });

    await expect(
      actions.customerLogin(
        AUTH_ACTION_INITIAL_STATE,
        form({ email: "alice@example.test", password: "ValidPass#12" }),
      ),
    ).resolves.toEqual({
      kind: "error",
      code: "AUTH_INVALID_CREDENTIALS",
    });
    expect(customer.revokeNewSession).toHaveBeenCalledWith(
      "new-customer-token",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
    expect(commitCookies).not.toHaveBeenCalled();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });
});

describe("staff login action", () => {
  it.each([
    ["STAFF@EXAMPLE.TEST", "email", "staff@example.test"],
    ["  Operator.One  ", "username", "operator.one"],
  ] as const)(
    "selects the server-owned %s method",
    async (identifier, method, normalized) => {
      const { actions, staff } = fixture();

      await actions.staffLogin(
        AUTH_ACTION_INITIAL_STATE,
        form({
          identifier,
          password: "ValidPass#12",
          rememberMe: "true",
          realm: "customer",
        }),
      );

      const expected = {
        password: "ValidPass#12",
        rememberMe: false,
        headers: expect.any(Headers),
        [method]: normalized,
      };
      expect(
        method === "email" ? staff.signInEmail : staff.signInUsername,
      ).toHaveBeenCalledWith(expected);
      expect(
        method === "email" ? staff.signInUsername : staff.signInEmail,
      ).not.toHaveBeenCalled();
    },
  );

  it("never bypasses an actual TOTP challenge for a forced-password user", async () => {
    const { actions, commitCookies, staff } = fixture();
    staff.signInUsername.mockResolvedValue(
      staged({
        twoFactorRedirect: true,
        twoFactorMethods: ["totp"],
      }),
    );

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({
        identifier: "operator.one",
        password: "ValidPass#12",
        returnTo: "/admin/products",
      }),
    );

    expect(result).toEqual({
      kind: "success",
      redirectTo: "/staff/two-factor?returnTo=%2Fadmin%2Fproducts",
    });
    expect(commitCookies).toHaveBeenCalledWith(
      "workforce",
      expect.any(Headers),
    );
  });

  it("authenticates before applying the authoritative disabled-user policy", async () => {
    const { actions, commitCookies, staff, users } = fixture();
    users.findById.mockResolvedValue({ ...activeStaff, status: "disabled" });

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ identifier: "operator.one", password: "ValidPass#12" }),
    );

    expect(staff.signInUsername).toHaveBeenCalledOnce();
    expect(staff.signOut).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(commitCookies).not.toHaveBeenCalled();
  });

  it("redirects an actual Better Auth challenge with a safe default return path", async () => {
    const { actions, staff } = fixture();
    staff.signInEmail.mockResolvedValue(
      staged({
        twoFactorRedirect: true,
        twoFactorMethods: ["totp"],
      }),
    );

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ identifier: "staff@example.test", password: "ValidPass#12" }),
    );

    expect(result).toEqual({
      kind: "success",
      redirectTo: "/staff/two-factor?returnTo=%2Fadmin",
    });
  });

  it("forces password change before CMS when no TOTP challenge is active", async () => {
    const { actions, users } = fixture();
    const forcedPasswordUser = {
      ...activeStaff,
      mustChangePassword: true,
    };
    users.findById.mockResolvedValue(forcedPasswordUser);

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({
        identifier: "operator.one",
        password: "ValidPass#12",
        returnTo: "/admin/products",
      }),
    );

    expect(result).toEqual({
      kind: "success",
      redirectTo: "/staff/change-password",
    });
  });

  it("compensates a post-sign-in workforce repository failure", async () => {
    const { actions, cookieStore, staff, users } = fixture();
    users.findById.mockRejectedValue(new Error("database unavailable"));

    const result = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ identifier: "operator.one", password: "ValidPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(staff.revokeNewSession).toHaveBeenCalledWith("new-staff-token");
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_staff_session");
    expect(cookieStore.delete).not.toHaveBeenCalledWith("aap_customer_session");
  });
});

describe("validation, errors, and audit", () => {
  it("rejects overlong passwords before either auth realm is called", async () => {
    const { actions, customer, staff } = fixture();

    const customerResult = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "x".repeat(129) }),
    );
    const staffResult = await actions.staffLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ identifier: "operator", password: "x".repeat(129) }),
    );

    expect(customerResult).toEqual({
      kind: "error",
      code: "AUTH_INVALID_CREDENTIALS",
    });
    expect(staffResult).toEqual({
      kind: "error",
      code: "AUTH_INVALID_CREDENTIALS",
    });
    expect(customer.signInEmail).not.toHaveBeenCalled();
    expect(staff.signInEmail).not.toHaveBeenCalled();
    expect(staff.signInUsername).not.toHaveBeenCalled();
  });

  it("maps raw Better Auth failures to one generic error and audits an enum reason", async () => {
    const { actions, audit, customer } = fixture();
    customer.signInEmail.mockRejectedValue(
      new Error("invalid password for alice@example.test; token=secret"),
    );

    const result = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "WrongPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(audit.write).toHaveBeenCalledWith({
      event: "auth.login_failure",
      target: { type: "system" },
      metadata: { reason: "invalid_credentials" },
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    });
    expect(JSON.stringify(audit.write.mock.calls)).not.toMatch(
      /alice@example|WrongPass|token=secret/i,
    );
  });

  it("revokes the new session when success audit persistence fails", async () => {
    const audit = {
      write: vi.fn().mockRejectedValue(new Error("db unavailable")),
    };
    const { actions, cookieStore, customer } = fixture({ audit });

    const result = await actions.customerLogin(
      AUTH_ACTION_INITIAL_STATE,
      form({ email: "alice@example.test", password: "ValidPass#12" }),
    );

    expect(result).toEqual({ kind: "error", code: "AUTH_INVALID_CREDENTIALS" });
    expect(customer.revokeNewSession).toHaveBeenCalledWith(
      "new-customer-token",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
  });
});

describe("logout actions", () => {
  it.each([
    ["customer", "aap_customer_session", "aap_staff_session"],
    ["workforce", "aap_staff_session", "aap_customer_session"],
  ] as const)(
    "revokes and clears only the %s realm",
    async (realm, ownCookie, otherCookie) => {
      const { actions, audit, cookieStore, customer, staff } = fixture();

      const result = await (realm === "customer"
        ? actions.customerLogout()
        : actions.staffLogout());

      const gateway = realm === "customer" ? customer : staff;
      const otherGateway = realm === "customer" ? staff : customer;
      expect(result).toEqual({
        kind: "success",
        redirectTo: realm === "customer" ? "/login" : "/staff/login",
      });
      expect(gateway.signOut).toHaveBeenCalledWith({
        headers: expect.any(Headers),
      });
      expect(otherGateway.signOut).not.toHaveBeenCalled();
      expect(cookieStore.delete).toHaveBeenCalledWith(ownCookie);
      expect(cookieStore.delete).not.toHaveBeenCalledWith(otherCookie);
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "auth.logout",
          target: { type: "session" },
        }),
      );
    },
  );

  it("still clears locally but fails without a success audit when server revocation throws", async () => {
    const { actions, audit, cookieStore, customer, reportInternalError } =
      fixture();
    customer.signOut.mockRejectedValue(new Error("revocation failed"));

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "error",
      code: "AUTH_LOGOUT_FAILED",
    });
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
    expect(audit.write).not.toHaveBeenCalled();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });

  it("does not audit a logout when server revocation throws and client cleanup also fails", async () => {
    const { actions, audit, cookieStore, customer, reportInternalError } =
      fixture();
    customer.signOut.mockRejectedValue(new Error("revocation failed"));
    cookieStore.delete.mockImplementation(() => {
      throw new Error("cookie clear failed");
    });

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "error",
      code: "AUTH_LOGOUT_FAILED",
    });
    expect(audit.write).not.toHaveBeenCalled();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });

  it("treats success false as a server revocation failure while attempting both client cleanups", async () => {
    const {
      actions,
      audit,
      commitCookies,
      cookieStore,
      customer,
      reportInternalError,
    } = fixture();
    customer.signOut.mockResolvedValue(staged({ success: false }));

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "error",
      code: "AUTH_LOGOUT_FAILED",
    });
    expect(commitCookies).toHaveBeenCalledWith("customer", expect.any(Headers));
    expect(cookieStore.delete).toHaveBeenCalledWith("aap_customer_session");
    expect(audit.write).not.toHaveBeenCalled();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });

  it("audits a revoked server session but reports client cleanup failure", async () => {
    const { actions, audit, commitCookies, cookieStore, reportInternalError } =
      fixture();
    commitCookies.mockRejectedValue(new Error("expiry commit failed"));
    cookieStore.delete.mockImplementation(() => {
      throw new Error("cookie clear failed");
    });

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "error",
      code: "AUTH_LOGOUT_FAILED",
    });
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({ event: "auth.logout" }),
    );
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });

  it("allows redirect after server and client cleanup even when logout audit fails", async () => {
    const audit = { write: vi.fn().mockRejectedValue(new Error("audit down")) };
    const { actions, reportInternalError } = fixture({ audit });

    await expect(actions.customerLogout()).resolves.toEqual({
      kind: "success",
      redirectTo: "/login",
    });
    expect(audit.write).toHaveBeenCalledOnce();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
  });
});
