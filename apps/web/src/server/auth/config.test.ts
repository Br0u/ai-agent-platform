import { existsSync } from "node:fs";

import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";

import { hashPassword } from "@ai-agent-platform/database";

import {
  createCustomerAuth,
  createCustomerAuthOptions,
  customerRealm,
} from "./customer-auth";
import { mapAuthError } from "./errors";
import {
  createRealmSessionGuard,
  resolveAuthEnvironment,
  type AuthEnvironment,
} from "./shared-options";
import {
  createStaffAuth,
  createStaffAuthOptions,
  staffRealm,
  staffTwoFactorPolicy,
} from "./staff-auth";

const TEST_SECRET = "test-only-better-auth-secret-32-characters";

function authEnvironment(
  overrides: Partial<AuthEnvironment> = {},
): AuthEnvironment {
  return {
    NODE_ENV: "test",
    BETTER_AUTH_SECRET: TEST_SECRET,
    BETTER_AUTH_URL: "http://auth.example.test",
    BETTER_AUTH_TRUSTED_ORIGINS: "http://auth.example.test",
    ...overrides,
  };
}

async function authMemoryDatabase(
  realm: "customer" | "workforce",
): Promise<MemoryDB> {
  const now = new Date();
  const userId = `${realm}-user-id`;

  return {
    user: [
      {
        id: userId,
        name: `${realm} user`,
        email: `${realm}@example.test`,
        emailVerified: true,
        image: null,
        createdAt: now,
        updatedAt: now,
        twoFactorEnabled: false,
        identityRealm: realm,
        status: "active",
        emailVerificationStatus: "verified",
        username: realm === "workforce" ? "workforce-user" : null,
        displayUsername: realm === "workforce" ? "Workforce User" : null,
        mustChangePassword: false,
        lastLoginAt: null,
      },
    ],
    account: [
      {
        id: `${realm}-account-id`,
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
}

async function signIn(
  auth: { handler(request: Request): Promise<Response> },
  realm: "customer" | "workforce",
  baseURL: string,
): Promise<Response> {
  return auth.handler(
    new Request(
      `${baseURL}/api/auth/${realm === "customer" ? "customer" : "staff"}/sign-in/email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: baseURL,
        },
        body: JSON.stringify({
          email: `${realm}@example.test`,
          password: "ValidPass#12",
        }),
      },
    ),
  );
}

describe("realm descriptors", () => {
  it("defines exact customer and staff session boundaries", () => {
    expect(customerRealm.basePath).toBe("/api/auth/customer");
    expect(customerRealm.cookieName).toBe("aap_customer_session");
    expect(customerRealm.maxAgeSeconds).toBe(7 * 24 * 60 * 60);
    expect(staffRealm.basePath).toBe("/api/auth/staff");
    expect(staffRealm.cookieName).toBe("aap_staff_session");
    expect(staffRealm.maxAgeSeconds).toBe(8 * 60 * 60);
  });

  it("keeps raw and built-in recovery endpoints outside project exposure", () => {
    expect(customerRealm.endpoints.denied).toContain("/sign-up/email");
    expect(staffRealm.endpoints.denied).toEqual(
      expect.arrayContaining([
        "/sign-up/email",
        "/two-factor/generate-backup-codes",
        "/two-factor/view-backup-codes",
        "/two-factor/verify-backup-code",
      ]),
    );
    expect(staffRealm.builtInBackupCodesDisabled).toBe(true);
    expect(staffRealm.generateBuiltInBackupCodes()).toEqual([]);
    expect(staffRealm.projectActionsTrustDevice).toBe(false);
    expect(customerRealm.mountGenericRouteHandler).toBe(false);
    expect(staffRealm.mountGenericRouteHandler).toBe(false);
    expect(existsSync("src/app/api/auth")).toBe(false);
  });
});

describe("shared auth security options", () => {
  it("fails fast for invalid production secrets and origins", () => {
    expect(() =>
      resolveAuthEnvironment(
        authEnvironment({
          NODE_ENV: "production",
          BETTER_AUTH_SECRET: "too-short",
          BETTER_AUTH_URL: "http://portal.example.com",
          BETTER_AUTH_TRUSTED_ORIGINS: "https://portal.example.com/path",
        }),
      ),
    ).toThrow();
  });

  it("trusts x-real-ip only with an explicit Nginx proxy boundary", () => {
    const direct = resolveAuthEnvironment(authEnvironment());
    expect(direct.ipAddressHeaders).toEqual([]);
    expect(direct.trustedProxies).toEqual([]);

    expect(() =>
      resolveAuthEnvironment(authEnvironment({ TRUST_NGINX_PROXY: "true" })),
    ).toThrow("NGINX_TRUSTED_PROXY_CIDRS");

    const proxied = resolveAuthEnvironment(
      authEnvironment({
        TRUST_NGINX_PROXY: "true",
        NGINX_TRUSTED_PROXY_CIDRS: "172.20.0.0/24,192.0.2.10",
      }),
    );
    expect(proxied.ipAddressHeaders).toEqual(["x-real-ip"]);
    expect(proxied.trustedProxies).toEqual(["172.20.0.0/24", "192.0.2.10"]);
  });

  it("keeps database sessions/rate limits and all origin protections enabled", () => {
    const options = createCustomerAuthOptions({
      env: authEnvironment(),
      adapter: memoryAdapter({}),
    });

    expect(options.session?.cookieCache?.enabled).toBe(false);
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      storage: "database",
    });
    expect(options.advanced?.disableCSRFCheck).not.toBe(true);
    expect(options.advanced?.disableOriginCheck).not.toBe(true);
    expect(options.advanced?.trustedProxyHeaders).toBe(false);
    expect(options.emailAndPassword?.disableSignUp).toBe(true);
  });

  it("installs realm plugins only where needed and keeps nextCookies last", () => {
    const customerOptions = createCustomerAuthOptions({
      env: authEnvironment(),
      adapter: memoryAdapter({}),
    });
    const staffOptions = createStaffAuthOptions({
      env: authEnvironment(),
      adapter: memoryAdapter({}),
    });

    expect(customerOptions.plugins?.map((plugin) => plugin.id)).toEqual([
      "next-cookies",
    ]);
    expect(staffOptions.plugins?.map((plugin) => plugin.id)).toEqual([
      "username",
      "two-factor",
      "next-cookies",
    ]);
  });

  it("requires verified TOTP with account lockout and no built-in backup codes", () => {
    expect(staffTwoFactorPolicy.skipVerificationOnEnable).toBe(false);
    expect(staffTwoFactorPolicy.accountLockout).toEqual({
      enabled: true,
      maxFailedAttempts: 10,
      durationSeconds: 15 * 60,
    });
    expect(
      staffTwoFactorPolicy.backupCodeOptions.customBackupCodesGenerate(),
    ).toEqual([]);
    expect(staffTwoFactorPolicy.backupCodeOptions.storeBackupCodes).toBe(
      "encrypted",
    );
  });
});

describe("realm session guard", () => {
  it("loads the authoritative customer and overwrites a caller-supplied realm", async () => {
    const guard = createRealmSessionGuard("customer", async () => ({
      id: "customer-user-id",
      identityRealm: "customer",
      status: "pending_review",
    }));

    await expect(
      guard({ userId: "customer-user-id", realm: "workforce" }),
    ).resolves.toMatchObject({ realm: "customer" });
  });

  it("rejects missing, cross-realm, disabled, and non-active workforce users", async () => {
    const scenarios = [
      ["customer", undefined],
      ["customer", { id: "u", identityRealm: "workforce", status: "active" }],
      ["customer", { id: "u", identityRealm: "customer", status: "disabled" }],
      [
        "workforce",
        { id: "u", identityRealm: "workforce", status: "pending_review" },
      ],
    ] as const;

    for (const [realm, user] of scenarios) {
      const guard = createRealmSessionGuard(realm, async () => user);
      await expect(guard({ userId: "u", realm })).rejects.toMatchObject({
        code: expect.stringMatching(/^AUTH_/),
      });
    }
  });
});

describe("real Better Auth handlers", () => {
  it("sets the exact secure customer session cookie", async () => {
    const database = await authMemoryDatabase("customer");
    const baseURL = "https://portal.example.com";
    const auth = createCustomerAuth({
      env: authEnvironment({
        NODE_ENV: "production",
        BETTER_AUTH_URL: baseURL,
        BETTER_AUTH_TRUSTED_ORIGINS: baseURL,
      }),
      adapter: memoryAdapter(database),
    });

    const response = await signIn(auth, "customer", baseURL);
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain("aap_customer_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toContain("aap_staff_session=");
  });

  it("sets a non-secure staff cookie in local HTTP and never a customer cookie", async () => {
    const database = await authMemoryDatabase("workforce");
    const baseURL = "http://auth.example.test";
    const auth = createStaffAuth({
      env: authEnvironment(),
      adapter: memoryAdapter(database),
    });

    const response = await signIn(auth, "workforce", baseURL);
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain("aap_staff_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("aap_customer_session=");

    const session = database.session[0] as Record<string, unknown>;
    expect(session.realm).toBe("workforce");
  });

  it("rejects raw sign-up and an untrusted origin", async () => {
    const database = await authMemoryDatabase("customer");
    const auth = createCustomerAuth({
      env: authEnvironment(),
      adapter: memoryAdapter(database),
    });

    const signUp = await auth.handler(
      new Request("http://auth.example.test/api/auth/customer/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://auth.example.test",
        },
        body: JSON.stringify({
          name: "Unreviewed user",
          email: "new@example.test",
          password: "ValidPass#12",
        }),
      }),
    );
    const untrustedOrigin = await auth.handler(
      new Request("http://auth.example.test/api/auth/customer/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({
          email: "customer@example.test",
          password: "ValidPass#12",
        }),
      }),
    );

    expect(signUp.status).toBe(400);
    expect(untrustedOrigin.status).toBe(403);
  });

  it.each([
    "/two-factor/generate-backup-codes",
    "/two-factor/view-backup-codes",
    "/two-factor/verify-backup-code",
  ])("blocks the built-in recovery endpoint %s", async (path) => {
    const database = await authMemoryDatabase("workforce");
    const auth = createStaffAuth({
      env: authEnvironment(),
      adapter: memoryAdapter(database),
    });

    const response = await auth.handler(
      new Request(`http://auth.example.test/api/auth/staff${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://auth.example.test",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(404);
  });
});

describe("auth error mapping", () => {
  it("maps unknown errors without leaking input or credential details", () => {
    const publicError = mapAuthError(
      new Error("password=ValidPass#12 secret=database-token"),
    );

    expect(publicError).toEqual({
      code: "AUTH_UNEXPECTED_ERROR",
      message: "Authentication request failed",
    });
  });
});
