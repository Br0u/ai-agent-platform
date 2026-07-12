import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { describe, expect, it, vi } from "vitest";

import { hashPassword } from "@ai-agent-platform/database";

import {
  createAccessService,
  createSessionAuthenticator,
  parseAuthenticatedSession,
  toCustomerSessionDto,
  toStaffSessionDto,
  type AccessRepository,
  type AuthenticatedSession,
  type AuthoritativeUser,
  type CustomerOrganization,
  type IdentityRealm,
} from "./access";
import { createCustomerAuth } from "./customer-auth";

const headers = new Headers({ cookie: "session=opaque" });

function user(overrides: Partial<AuthoritativeUser> = {}): AuthoritativeUser {
  return {
    id: "user-1",
    realm: "customer",
    status: "active",
    displayName: "Alice",
    emailVerificationStatus: "verified",
    mustChangePassword: false,
    twoFactorEnabled: false,
    ...overrides,
  };
}

function createFixture(options?: {
  requestedRealm?: IdentityRealm;
  sessionRealm?: IdentityRealm;
  currentUser?: AuthoritativeUser | null;
  permissions?: string[];
  organizations?: CustomerOrganization[];
}) {
  let currentUser: AuthoritativeUser | null =
    options?.currentUser === undefined ? user() : options.currentUser;
  let permissions = options?.permissions ?? [];
  const organizations =
    options?.organizations === undefined
      ? [
          {
            organizationId: "org-for-user-1",
            legalName: "Acme Corp",
            status: "active" as const,
            role: "owner" as const,
          },
        ]
      : options.organizations;
  const customerAuthenticate = vi.fn(
    async (): Promise<AuthenticatedSession | null> => ({
      userId: "user-1",
      realm: options?.sessionRealm ?? "customer",
    }),
  );
  const staffAuthenticate = vi.fn(
    async (): Promise<AuthenticatedSession | null> => ({
      userId: "user-1",
      realm: options?.sessionRealm ?? "workforce",
    }),
  );
  const repository: AccessRepository = {
    findUserById: vi.fn(async () => currentUser),
    findCustomerOrganizations: vi.fn(async () => organizations),
    findPermissionKeys: vi.fn(async () => permissions),
  };
  const service = createAccessService({
    authenticators: {
      customer: customerAuthenticate,
      workforce: staffAuthenticate,
    },
    repository,
    getHeaders: async () => headers,
  });

  return {
    service,
    repository,
    customerAuthenticate,
    staffAuthenticate,
    setUser(next: AuthoritativeUser | null) {
      currentUser = next;
    },
    setPermissions(next: string[]) {
      permissions = next;
    },
  };
}

async function expectAccessError(
  promise: Promise<unknown>,
  code: string,
  status: number,
) {
  await expect(promise).rejects.toMatchObject({ code, status });
}

describe("secure auth access service", () => {
  it("returns null without a current realm session", async () => {
    const fixture = createFixture();
    fixture.customerAuthenticate.mockResolvedValueOnce(null);

    await expect(
      fixture.service.getCurrentActor("customer"),
    ).resolves.toBeNull();
    expect(fixture.repository.findUserById).not.toHaveBeenCalled();
  });

  it("rejects a session whose stored realm differs from the requested realm", async () => {
    const fixture = createFixture({ sessionRealm: "workforce" });

    await expectAccessError(
      fixture.service.getCurrentActor("customer"),
      "AUTH_REALM_MISMATCH",
      403,
    );
  });

  it("rejects an authoritative user whose realm differs from the requested realm", async () => {
    const fixture = createFixture({
      currentUser: user({ realm: "workforce", status: "active" }),
    });

    await expectAccessError(
      fixture.service.getCurrentActor("customer"),
      "AUTH_REALM_MISMATCH",
      403,
    );
  });

  it("rejects disabled users in either realm", async () => {
    const customer = createFixture({
      currentUser: user({ status: "disabled" }),
    });
    const workforce = createFixture({
      currentUser: user({
        realm: "workforce",
        status: "disabled",
      }),
    });

    await expectAccessError(
      customer.service.requireCustomer(),
      "AUTH_ACCOUNT_DISABLED",
      403,
    );
    await expectAccessError(
      workforce.service.requireWorkforce(),
      "AUTH_ACCOUNT_DISABLED",
      403,
    );
  });

  it.each(["pending_review", "rejected"] as const)(
    "allows customer %s only in onboarding mode",
    async (status) => {
      const fixture = createFixture({ currentUser: user({ status }) });

      await expectAccessError(
        fixture.service.requireCustomer(),
        "AUTH_ACCOUNT_NOT_ACTIVE",
        403,
      );
      await expect(
        fixture.service.requireCustomer({ onboardingAllowed: true }),
      ).resolves.toMatchObject({ realm: "customer", status });
    },
  );

  it("allows an active customer and loads membership only by current user", async () => {
    const fixture = createFixture();

    const actor = await fixture.service.requireCustomer();

    expect(actor.organization).toEqual({
      organizationId: "org-for-user-1",
      legalName: "Acme Corp",
      status: "active",
      role: "owner",
    });
    expect(fixture.repository.findCustomerOrganizations).toHaveBeenCalledWith(
      "user-1",
    );
  });

  it("requires exactly one active organization for customer console access", async () => {
    const noMembership = createFixture({ organizations: [] });
    await expectAccessError(
      noMembership.service.requireCustomer(),
      "AUTH_ORGANIZATION_REQUIRED",
      403,
    );

    const ambiguous = createFixture({
      organizations: [
        {
          organizationId: "org-1",
          legalName: "One",
          status: "active",
          role: "member",
        },
        {
          organizationId: "org-2",
          legalName: "Two",
          status: "active",
          role: "member",
        },
      ],
    });
    await expectAccessError(
      ambiguous.service.requireCustomer(),
      "AUTH_ORGANIZATION_AMBIGUOUS",
      403,
    );

    await expect(
      createFixture().service.requireCustomer(),
    ).resolves.toMatchObject({
      organization: { legalName: "Acme Corp", status: "active" },
    });
  });

  it.each(["pending_review", "disabled", "rejected"] as const)(
    "rejects a customer organization in %s state for console access",
    async (status) => {
      const fixture = createFixture({
        organizations: [
          {
            organizationId: "org-1",
            legalName: "Not Active",
            status,
            role: "member",
          },
        ],
      });
      await expectAccessError(
        fixture.service.requireCustomer(),
        "AUTH_ORGANIZATION_NOT_ACTIVE",
        403,
      );
    },
  );

  it("allows pending/rejected onboarding without an organization", async () => {
    for (const status of ["pending_review", "rejected"] as const) {
      const fixture = createFixture({
        currentUser: user({ status }),
        organizations: [],
      });
      await expect(
        fixture.service.requireCustomer({ onboardingAllowed: true }),
      ).resolves.toMatchObject({ status, organization: null });
    }
  });

  it("allows only active workforce users", async () => {
    const pending = createFixture({
      currentUser: user({ realm: "workforce", status: "pending_review" }),
    });
    await expectAccessError(
      pending.service.requireWorkforce(),
      "AUTH_ACCOUNT_NOT_ACTIVE",
      403,
    );

    const active = createFixture({
      currentUser: user({
        realm: "workforce",
        status: "active",
        twoFactorEnabled: true,
      }),
      permissions: ["admin:users"],
    });
    await expect(active.service.requireWorkforce()).resolves.toMatchObject({
      realm: "workforce",
      status: "active",
      permissions: ["admin:users"],
    });
    expect(active.repository.findPermissionKeys).toHaveBeenCalledWith(
      "user-1",
      "workforce",
    );
  });

  it.each([
    [
      { mustChangePassword: true, twoFactorEnabled: false },
      "AUTH_PASSWORD_CHANGE_REQUIRED",
    ],
    [
      { mustChangePassword: false, twoFactorEnabled: false },
      "AUTH_TOTP_SETUP_REQUIRED",
    ],
  ] as const)(
    "denies incomplete workforce setup at the default boundary",
    async (state, code) => {
      const fixture = createFixture({
        currentUser: user({ realm: "workforce", status: "active", ...state }),
        permissions: ["admin:users"],
      });
      await expectAccessError(fixture.service.requireWorkforce(), code, 403);
      await expectAccessError(
        fixture.service.requirePermission("admin:users"),
        code,
        403,
      );
    },
  );

  it("allows only the matching explicit setup flow and admits complete actors", async () => {
    const password = createFixture({
      currentUser: user({
        realm: "workforce",
        status: "active",
        mustChangePassword: true,
        twoFactorEnabled: false,
      }),
    });
    await expect(
      password.service.requireWorkforce({ setupFlow: "change-password" }),
    ).resolves.toMatchObject({ mustChangePassword: true });
    await expectAccessError(
      password.service.requireWorkforce({ setupFlow: "two-factor" }),
      "AUTH_PASSWORD_CHANGE_REQUIRED",
      403,
    );

    const totp = createFixture({
      currentUser: user({
        realm: "workforce",
        status: "active",
        mustChangePassword: false,
        twoFactorEnabled: false,
      }),
    });
    await expect(
      totp.service.requireWorkforce({ setupFlow: "two-factor" }),
    ).resolves.toMatchObject({ twoFactorEnabled: false });

    const complete = createFixture({
      currentUser: user({
        realm: "workforce",
        status: "active",
        mustChangePassword: false,
        twoFactorEnabled: true,
      }),
    });
    await expect(complete.service.requireWorkforce()).resolves.toMatchObject({
      twoFactorEnabled: true,
    });
  });

  it("requires a current database permission and observes role removal next check", async () => {
    const fixture = createFixture({
      currentUser: user({
        realm: "workforce",
        status: "active",
        twoFactorEnabled: true,
      }),
      permissions: ["admin:users"],
    });

    await expect(
      fixture.service.requirePermission("admin:users"),
    ).resolves.toMatchObject({ permissions: ["admin:users"] });

    fixture.setPermissions([]);
    await expectAccessError(
      fixture.service.requirePermission("admin:users"),
      "AUTH_PERMISSION_DENIED",
      403,
    );
    expect(fixture.repository.findPermissionKeys).toHaveBeenCalledTimes(2);
  });

  it("re-reads authoritative user state on every access check", async () => {
    const fixture = createFixture();
    await expect(fixture.service.requireCustomer()).resolves.toBeDefined();

    fixture.setUser(user({ status: "disabled" }));
    await expectAccessError(
      fixture.service.requireCustomer(),
      "AUTH_ACCOUNT_DISABLED",
      403,
    );
    expect(fixture.repository.findUserById).toHaveBeenCalledTimes(2);
  });

  it("returns stable, sorted, secret-free DTOs", async () => {
    const customerFixture = createFixture();
    const customer = await customerFixture.service.requireCustomer();
    const customerDto = toCustomerSessionDto(customer);

    expect(customerDto).toEqual({
      realm: "customer",
      status: "active",
      displayName: "Alice",
      emailVerificationStatus: "verified",
      organization: {
        legalName: "Acme Corp",
        status: "active",
        role: "owner",
      },
    });

    const staffFixture = createFixture({
      currentUser: user({
        realm: "workforce",
        status: "active",
        mustChangePassword: true,
        twoFactorEnabled: true,
      }),
      permissions: ["support:tickets", "admin:users", "admin:users"],
    });
    const staff = await staffFixture.service.requireWorkforce({
      setupFlow: "change-password",
    });
    const staffDto = toStaffSessionDto(staff);

    expect(staffDto).toEqual({
      realm: "workforce",
      status: "active",
      displayName: "Alice",
      mustChangePassword: true,
      twoFactorEnabled: true,
      permissions: ["admin:users", "support:tickets"],
    });

    const keys = new Set<string>();
    const collectKeys = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        collectKeys(child);
      }
    };
    collectKeys(JSON.parse(JSON.stringify({ customerDto, staffDto })));
    for (const forbidden of [
      "id",
      "userId",
      "sessionId",
      "sessionToken",
      "token",
      "password",
      "passwordHash",
      "tokenHash",
      "totpSecret",
      "recoveryHashes",
      "email",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("authenticated session contract", () => {
  it.each([
    null,
    {},
    { user: { id: "" }, session: { userId: "", realm: "customer" } },
    { user: { id: "u-1" }, session: { realm: "customer" } },
    { user: { id: "u-1" }, session: { userId: "u-2", realm: "customer" } },
    { user: { id: "u-1" }, session: { userId: "u-1", realm: "unknown" } },
  ])("rejects malformed or mismatched session shape", (value) => {
    expect(parseAuthenticatedSession(value)).toBeNull();
  });

  it("accepts a real Better Auth getSession response from its session cookie", async () => {
    const now = new Date();
    const userId = "customer-real-session-user";
    const database: MemoryDB = {
      user: [
        {
          id: userId,
          name: "Real Session User",
          email: "real-session@example.test",
          emailVerified: true,
          image: null,
          createdAt: now,
          updatedAt: now,
          twoFactorEnabled: false,
          identityRealm: "customer",
          status: "active",
          emailVerificationStatus: "verified",
          username: null,
          displayUsername: null,
          mustChangePassword: false,
          lastLoginAt: null,
        },
      ],
      account: [
        {
          id: "customer-real-session-account",
          accountId: userId,
          providerId: "credential",
          userId,
          password: await hashPassword("ValidPass#12"),
          createdAt: now,
          updatedAt: now,
        },
      ],
      session: [],
      verification: [],
      rateLimit: [],
      twoFactor: [],
    };
    const auth = createCustomerAuth({
      env: {
        NODE_ENV: "test",
        BETTER_AUTH_SECRET: "test-only-better-auth-secret-32-characters",
        BETTER_AUTH_URL: "http://127.0.0.1:3000",
        BETTER_AUTH_TRUSTED_ORIGINS: "http://127.0.0.1:3000",
      },
      adapter: memoryAdapter(database),
    });
    const signIn = await auth.handler(
      new Request("http://127.0.0.1:3000/api/auth/customer/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:3000",
        },
        body: JSON.stringify({
          email: "real-session@example.test",
          password: "ValidPass#12",
        }),
      }),
    );
    const cookie = (signIn.headers.get("set-cookie") ?? "").split(";", 1)[0];
    const authenticate = createSessionAuthenticator((headers) =>
      auth.api.getSession({ headers }),
    );

    await expect(authenticate(new Headers({ cookie }))).resolves.toEqual({
      userId,
      realm: "customer",
    });
  });
});
