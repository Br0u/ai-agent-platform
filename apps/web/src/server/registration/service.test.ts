import { describe, expect, it, vi } from "vitest";

import {
  RegistrationError,
  createRegistrationService,
  mapDatabaseRegistrationStatus,
  mapPublicRegistrationStatus,
  type RegistrationRepository,
  type RegistrationTransaction,
} from "./service";

function transaction(
  overrides: Partial<RegistrationTransaction> = {},
): RegistrationTransaction {
  return {
    createUserAndCredential: vi.fn().mockResolvedValue("customer-1"),
    createRequest: vi.fn().mockResolvedValue("request-1"),
    appendAudit: vi.fn().mockResolvedValue(undefined),
    assertActiveWorkforcePermission: vi.fn().mockResolvedValue(undefined),
    lockRequest: vi.fn().mockResolvedValue({
      id: "request-1",
      userId: "customer-1",
      status: "pending_review",
    }),
    createOrFindOrganization: vi
      .fn()
      .mockResolvedValue({ id: "org-1", memberCount: 0 }),
    findActiveOrganization: vi
      .fn()
      .mockResolvedValue({ id: "org-1", memberCount: 1 }),
    findCustomerRole: vi.fn().mockResolvedValue("role-1"),
    addMembershipAndRole: vi.fn().mockResolvedValue(undefined),
    approveRequestAndActivateUser: vi.fn().mockResolvedValue(true),
    rejectRequestAndUser: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function harness(overrides: Partial<RegistrationTransaction> = {}) {
  const tx = transaction(overrides);
  const repository: RegistrationRepository = {
    transaction: vi.fn(async (work) => work(tx)),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getStatusForCustomer: vi
      .fn()
      .mockResolvedValue({ status: "pending_review" }),
  };
  const limiter = { consume: vi.fn().mockResolvedValue(undefined) };
  const service = createRegistrationService({
    repository,
    limiter,
    hashPassword: vi.fn().mockResolvedValue("argon-hash"),
  });
  return { service, repository, limiter, tx };
}

const validRegistration = {
  applicantName: "  Alice  ",
  email: "  Ａlice@Example.COM ",
  password: "correct horse battery staple",
  companyName: "  ACME  ",
  acceptedTerms: true,
};

const context = { ipAddress: "203.0.113.7", userAgent: "browser" };
const reviewer = {
  userId: "reviewer-1",
  realm: "workforce" as const,
  status: "active" as const,
  permissions: ["admin:registrations"],
};

describe("registration status boundary", () => {
  it("maps public active to database approved and back", () => {
    expect(mapPublicRegistrationStatus("active")).toBe("approved");
    expect(mapDatabaseRegistrationStatus("approved")).toBe("active");
  });

  it("fails fast for unknown database status", () => {
    expect(() => mapDatabaseRegistrationStatus("cancelled")).toThrow(
      "Unsupported registration status: cancelled",
    );
  });

  it("fails fast for unknown public status", () => {
    expect(() => mapPublicRegistrationStatus("approved" as "active")).toThrow(
      "Unsupported public registration status: approved",
    );
  });
});

describe("submitRegistration", () => {
  it("limits normalized identifier and IP before account writes", async () => {
    const { service, limiter, tx } = harness();

    await service.submitRegistration(validRegistration, context);

    expect(limiter.consume).toHaveBeenCalledWith({
      identifier: "alice@example.com",
      ipAddress: "203.0.113.7",
    });
    expect(limiter.consume.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(tx.createUserAndCredential).mock.invocationCallOrder[0]!,
    );
    expect(tx.createUserAndCredential).toHaveBeenCalledWith({
      applicantName: "Alice",
      email: "alice@example.com",
      passwordHash: "argon-hash",
      realm: "customer",
      status: "pending_review",
    });
  });

  it("creates request and submitted audit in one transaction", async () => {
    const { service, tx } = harness();

    await expect(
      service.submitRegistration(validRegistration, context),
    ).resolves.toEqual({
      requestId: "request-1",
      userId: "customer-1",
      email: "alice@example.com",
    });
    expect(tx.createRequest).toHaveBeenCalledWith({
      userId: "customer-1",
      companyName: "ACME",
    });
    expect(tx.appendAudit).toHaveBeenCalledWith({
      event: "registration.submitted",
      actor: { realm: "customer", userId: "customer-1" },
      target: { type: "registration", id: "request-1" },
      metadata: { source: "self_service" },
      ipAddress: "203.0.113.7",
      userAgent: "browser",
    });
  });

  it("normalizes company names before persistence", async () => {
    const { service, tx } = harness();
    await service.submitRegistration(
      { ...validRegistration, companyName: "  ＡＣＭＥ　 Corp  " },
      context,
    );
    expect(tx.createRequest).toHaveBeenCalledWith({
      userId: "customer-1",
      companyName: "ACME Corp",
    });
  });

  it.each([
    "__aap_legacy_missing_company_name_v1__",
    "  __ａａｐ_reserved_for_future_use  ",
  ])(
    "rejects the reserved internal company-name prefix: %s",
    async (companyName) => {
      const { service, repository } = harness();
      await expect(
        service.submitRegistration(
          { ...validRegistration, companyName },
          context,
        ),
      ).rejects.toMatchObject({
        code: "REGISTRATION_VALIDATION_FAILED",
        field: "companyName",
      });
      expect(repository.transaction).not.toHaveBeenCalled();
    },
  );

  it("preserves a literal legacy-looking company name that is not reserved", async () => {
    const { service, tx } = harness();
    await service.submitRegistration(
      { ...validRegistration, companyName: "[legacy-unavailable]" },
      context,
    );
    expect(tx.createRequest).toHaveBeenCalledWith({
      userId: "customer-1",
      companyName: "[legacy-unavailable]",
    });
  });

  it.each([
    [{ ...validRegistration, acceptedTerms: false }, "acceptedTerms"],
    [{ ...validRegistration, password: "too-short" }, "password"],
    [{ ...validRegistration, companyName: "　" }, "companyName"],
  ])("rejects invalid input before repository writes", async (input, field) => {
    const { service, repository } = harness();
    await expect(
      service.submitRegistration(input, context),
    ).rejects.toMatchObject({
      code: "REGISTRATION_VALIDATION_FAILED",
      field,
    });
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it("maps duplicate email to a generic domain code", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "23505",
      constraint: "users_email_lower_unique",
    });
    const { service } = harness({
      createUserAndCredential: vi.fn().mockRejectedValue(duplicate),
    });
    await expect(
      service.submitRegistration(validRegistration, context),
    ).rejects.toMatchObject({
      code: "REGISTRATION_NOT_ACCEPTED",
    });
  });

  it.each([
    Object.assign(new Error("other unique"), {
      code: "23505",
      constraint: "accounts_provider_id_account_id_unique",
    }),
    Object.assign(new Error("constraint missing"), { code: "23505" }),
  ])("does not swallow a non-email unique failure", async (failure) => {
    const { service } = harness({
      createUserAndCredential: vi.fn().mockRejectedValue(failure),
    });
    await expect(
      service.submitRegistration(validRegistration, context),
    ).rejects.toBe(failure);
  });

  it("maps a wrapped email constraint failure", async () => {
    const duplicate = new Error("wrapped", {
      cause: {
        code: "23505",
        constraint: "users_email_lower_unique",
      },
    });
    const { service } = harness({
      createUserAndCredential: vi.fn().mockRejectedValue(duplicate),
    });
    await expect(
      service.submitRegistration(validRegistration, context),
    ).rejects.toMatchObject({ code: "REGISTRATION_NOT_ACCEPTED" });
  });
});

describe("registration review", () => {
  it("rechecks reviewer permission inside the write transaction", async () => {
    const { service, tx } = harness();
    await service.approveRegistration(
      {
        requestId: "request-1",
        organization: { kind: "create", legalName: " ACME " },
      },
      reviewer,
      context,
    );
    expect(tx.assertActiveWorkforcePermission).toHaveBeenCalledWith(
      "reviewer-1",
      "admin:registrations",
    );
  });

  it("forces the first organization member to customer_admin", async () => {
    const { service, tx } = harness();
    await service.approveRegistration(
      {
        requestId: "request-1",
        organization: { kind: "create", legalName: " ＡＣＭＥ Corp " },
        initialRole: "customer_member",
      },
      reviewer,
      context,
    );
    expect(tx.createOrFindOrganization).toHaveBeenCalledWith({
      legalName: "ＡＣＭＥ Corp",
      legalNameKey: "acme corp",
    });
    expect(tx.findCustomerRole).toHaveBeenCalledWith("customer_admin");
    expect(tx.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "registration.approved",
        metadata: { role: "customer_admin" },
      }),
    );
  });

  it("rejects stale or concurrently reviewed requests generically", async () => {
    const { service } = harness({
      lockRequest: vi.fn().mockResolvedValue({
        id: "request-1",
        userId: "customer-1",
        status: "approved",
      }),
    });
    await expect(
      service.approveRegistration(
        {
          requestId: "request-1",
          organization: { kind: "link", organizationId: "org-1" },
        },
        reviewer,
        context,
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_ALREADY_REVIEWED" });
  });

  it("stores free-text rejection note but audits only a category", async () => {
    const { service, tx } = harness();
    await service.rejectRegistration(
      "request-1",
      reviewer,
      "  Not eligible  ",
      context,
    );
    expect(tx.rejectRequestAndUser).toHaveBeenCalledWith({
      requestId: "request-1",
      userId: "customer-1",
      reviewerUserId: "reviewer-1",
      reviewNote: "Not eligible",
    });
    expect(tx.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "registration.rejected",
        metadata: { category: "other" },
      }),
    );
  });

  it("rejects an oversized internal review note before writes", async () => {
    const { service, repository } = harness();
    await expect(
      service.rejectRegistration(
        "request-1",
        reviewer,
        "x".repeat(2001),
        context,
      ),
    ).rejects.toMatchObject({
      code: "REGISTRATION_VALIDATION_FAILED",
      field: "reviewNote",
    });
    expect(repository.transaction).not.toHaveBeenCalled();
  });
});

describe("registration reads", () => {
  it("uses safe pagination and maps active only at the repository boundary", async () => {
    const { service, repository } = harness();
    await service.listRegistrationRequests(
      { status: "active", page: 2, pageSize: 20 },
      reviewer,
    );
    expect(repository.list).toHaveBeenCalledWith(
      {
        status: "active",
        page: 2,
        pageSize: 20,
      },
      "reviewer-1",
    );
  });

  it("does not trust a stale permission snapshot when the repository denies", async () => {
    const { service, repository } = harness();
    vi.mocked(repository.list).mockRejectedValue(
      new RegistrationError("REGISTRATION_PERMISSION_DENIED"),
    );
    await expect(
      service.listRegistrationRequests(
        { status: "pending_review", page: 1, pageSize: 10 },
        reviewer,
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_PERMISSION_DENIED" });
  });

  it("rejects runtime pagination values outside the exact query union", async () => {
    const { service, repository } = harness();
    await expect(
      service.listRegistrationRequests(
        { status: "active", page: 0, pageSize: 20 },
        reviewer,
      ),
    ).rejects.toMatchObject({
      code: "REGISTRATION_VALIDATION_FAILED",
      field: "page",
    });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("loads status only by the current customer user id", async () => {
    const { service, repository } = harness();
    await service.getRegistrationStatus({
      userId: "customer-1",
      realm: "customer",
    });
    expect(repository.getStatusForCustomer).toHaveBeenCalledWith("customer-1");
  });
});
