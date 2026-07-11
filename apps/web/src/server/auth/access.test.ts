import { describe, expect, it, vi } from "vitest";

import {
  createAccessService,
  roleIdsForRealm,
  toCustomerSessionDto,
  toStaffSessionDto,
  type AccessRepository,
  type AuthenticatedSession,
  type AuthoritativeUser,
  type CustomerOrganization,
  type IdentityRealm,
} from "./access";

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
}) {
  let currentUser: AuthoritativeUser | null =
    options?.currentUser === undefined ? user() : options.currentUser;
  let permissions = options?.permissions ?? [];
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
    findCustomerOrganization: vi.fn(
      async (userId): Promise<CustomerOrganization | null> => ({
        organizationId: `org-for-${userId}`,
        legalName: "Acme Corp",
        status: "active",
        role: "owner",
      }),
    ),
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
  it("rejects global and opposite-realm roles for permission grants", () => {
    expect(
      roleIdsForRealm(
        [
          { id: "workforce-role", realmScope: "workforce" },
          { id: "customer-role", realmScope: "customer" },
          { id: "global-role", realmScope: "global" },
        ],
        "workforce",
      ),
    ).toEqual(["workforce-role"]);
  });

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
    expect(fixture.repository.findCustomerOrganization).toHaveBeenCalledWith(
      "user-1",
    );
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
      currentUser: user({ realm: "workforce", status: "active" }),
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

  it("requires a current database permission and observes role removal next check", async () => {
    const fixture = createFixture({
      currentUser: user({ realm: "workforce", status: "active" }),
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
    const staff = await staffFixture.service.requireWorkforce();
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
