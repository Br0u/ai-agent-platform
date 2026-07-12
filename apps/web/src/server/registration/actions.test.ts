import { describe, expect, it, vi } from "vitest";

import { commitResponseCookies } from "../auth/actions";
import { AuthAccessError } from "../auth/access";
import { SensitiveActionError } from "../auth/sensitive-action";
import { RegistrationError } from "./service";
import {
  approveRegistrationAction,
  createRegistrationActions,
  rejectRegistrationAction,
  resendVerificationAction,
  submitRegistrationAction,
} from "./actions";

const requestId = "00000000-0000-4000-8000-000000000701";

it("exports the single Server Action layer", () => {
  expect([
    submitRegistrationAction,
    approveRegistrationAction,
    rejectRegistrationAction,
    resendVerificationAction,
  ]).toEqual([
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
    expect.any(Function),
  ]);
});

function registrationForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const values = {
    applicantName: "Alice",
    email: "alice@example.com",
    password: "correct horse battery staple",
    companyName: "ACME",
    acceptedTerms: "true",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function harness() {
  const service = {
    submitRegistration: vi.fn().mockResolvedValue({
      requestId,
      userId: "customer-1",
      email: "alice@example.com",
    }),
    approveRegistration: vi.fn().mockResolvedValue(undefined),
    rejectRegistration: vi.fn().mockResolvedValue(undefined),
  };
  const customerAuth = {
    signInEmail: vi.fn().mockResolvedValue({
      response: { token: "session-token", user: { id: "customer-1" } },
      headers: new Headers({
        "set-cookie": "aap_customer_session=abc; Path=/; HttpOnly",
      }),
    }),
    revokeNewSession: vi.fn().mockResolvedValue(undefined),
  };
  const access = {
    requireSensitiveAction: vi.fn().mockResolvedValue({
      userId: "reviewer-1",
      realm: "workforce",
      status: "active",
      permissions: ["admin:registrations"],
    }),
    requirePermission: vi.fn().mockResolvedValue({
      userId: "reviewer-1",
      realm: "workforce",
      status: "active",
      permissions: ["admin:registrations"],
    }),
  };
  const commitCookies = vi.fn().mockResolvedValue(undefined);
  const clearCustomerCookies = vi.fn().mockResolvedValue(undefined);
  const reportInternalError = vi.fn();
  const getClientIp = vi.fn().mockReturnValue("203.0.113.7");
  const provider = {
    getStatus: () => ({ enabled: false, mode: "placeholder" as const }),
    requestVerification: vi.fn(),
    verifyToken: vi.fn(),
    resendVerification: vi.fn().mockResolvedValue({
      ok: false,
      status: 501,
      code: "EMAIL_VERIFICATION_DISABLED",
    }),
  };
  const actions = createRegistrationActions({
    service,
    customerAuth,
    access,
    provider,
    commitCookies,
    clearCustomerCookies,
    reportInternalError,
    getClientIp,
    getHeaders: vi.fn().mockResolvedValue(
      new Headers({
        "x-real-ip": "203.0.113.7",
        "user-agent": "browser",
      }),
    ),
  });
  return {
    actions,
    service,
    customerAuth,
    access,
    commitCookies,
    clearCustomerCookies,
    reportInternalError,
    getClientIp,
    provider,
  };
}

describe("submitRegistrationAction", () => {
  it("returns stable field errors without calling the service", async () => {
    const { actions, service } = harness();
    const result = await actions.submitRegistrationAction(
      { kind: "success", redirectTo: "/console/onboarding" },
      registrationForm({ password: "short", acceptedTerms: "false" }),
    );
    expect(result).toEqual({
      kind: "validation_error",
      fieldErrors: expect.objectContaining({
        password: ["密码至少需要 12 个字符"],
        acceptedTerms: ["请同意平台服务条款与隐私规则"],
      }),
    });
    expect(service.submitRegistration).not.toHaveBeenCalled();
  });

  it("commits only staged customer cookies after session confirmation", async () => {
    const { actions, customerAuth, commitCookies } = harness();
    const store = { set: vi.fn(), delete: vi.fn() };
    const stagedHeaders = new Headers();
    stagedHeaders.append(
      "set-cookie",
      "aap_customer_session=customer; Path=/; HttpOnly",
    );
    stagedHeaders.append(
      "set-cookie",
      "aap_staff_session=staff; Path=/; HttpOnly",
    );
    customerAuth.signInEmail.mockResolvedValue({
      response: { token: "session-token", user: { id: "customer-1" } },
      headers: stagedHeaders,
    });
    commitCookies.mockImplementation((realm, headers) =>
      commitResponseCookies(realm, headers, async () => store),
    );
    await expect(
      actions.submitRegistrationAction(
        { kind: "success", redirectTo: "/console/onboarding" },
        registrationForm(),
      ),
    ).resolves.toEqual({ kind: "success", redirectTo: "/console/onboarding" });
    expect(customerAuth.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice@example.com",
        password: "correct horse battery staple",
        rememberMe: false,
      }),
    );
    expect(store.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "aap_customer_session",
        value: "customer",
      }),
    );
    expect(store.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "aap_staff_session" }),
    );
  });

  it("normalizes email and accepts a native checkbox value", async () => {
    const { actions, service } = harness();
    await actions.submitRegistrationAction(
      { kind: "success", redirectTo: "/console/onboarding" },
      registrationForm({
        email: "  Ａlice@Example.COM  ",
        acceptedTerms: "on",
      }),
    );
    expect(service.submitRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice@example.com",
        acceptedTerms: true,
      }),
      expect.any(Object),
    );
  });

  it("returns a company field error for the reserved internal prefix", async () => {
    const { actions, service } = harness();
    await expect(
      actions.submitRegistrationAction(
        { kind: "success", redirectTo: "/console/onboarding" },
        registrationForm({
          companyName: "  __ａａｐ_legacy_missing_company_name_v1__  ",
        }),
      ),
    ).resolves.toEqual({
      kind: "validation_error",
      fieldErrors: { companyName: expect.any(Array) },
    });
    expect(service.submitRegistration).not.toHaveBeenCalled();
  });

  it("revokes a new session if cookie commit fails while retaining registration", async () => {
    const {
      actions,
      service,
      customerAuth,
      commitCookies,
      clearCustomerCookies,
      reportInternalError,
    } = harness();
    const clientCookies = new Map([
      ["aap_customer_session", "old-customer"],
      ["aap_staff_session", "staff-must-survive"],
    ]);
    commitCookies.mockImplementation(async () => {
      clientCookies.set("aap_customer_session", "partially-committed");
      throw new Error("cookie failed");
    });
    clearCustomerCookies.mockImplementation(async () => {
      clientCookies.delete("aap_customer_session");
    });
    await expect(
      actions.submitRegistrationAction(
        { kind: "success", redirectTo: "/console/onboarding" },
        registrationForm(),
      ),
    ).resolves.toEqual({
      kind: "session_issue_failed",
      code: "AUTH_SESSION_ISSUE_FAILED",
      retryPath: "/login",
    });
    expect(service.submitRegistration).toHaveBeenCalledOnce();
    expect(customerAuth.revokeNewSession).toHaveBeenCalledWith("session-token");
    expect(clearCustomerCookies).toHaveBeenCalledOnce();
    expect(reportInternalError).toHaveBeenCalledWith(
      expect.any(AggregateError),
    );
    expect(clientCookies.has("aap_customer_session")).toBe(false);
    expect(clientCookies.get("aap_staff_session")).toBe("staff-must-survive");
  });

  it("reports every failed compensation step without changing the public result", async () => {
    const {
      actions,
      customerAuth,
      commitCookies,
      clearCustomerCookies,
      reportInternalError,
    } = harness();
    commitCookies.mockRejectedValue(new Error("partial commit"));
    customerAuth.revokeNewSession.mockRejectedValue(new Error("revoke failed"));
    clearCustomerCookies.mockRejectedValue(new Error("clear failed"));

    await expect(
      actions.submitRegistrationAction(
        { kind: "success", redirectTo: "/console/onboarding" },
        registrationForm(),
      ),
    ).resolves.toEqual({
      kind: "session_issue_failed",
      code: "AUTH_SESSION_ISSUE_FAILED",
      retryPath: "/login",
    });
    const reported = reportInternalError.mock.calls[0]?.[0];
    expect(reported).toBeInstanceOf(AggregateError);
    expect((reported as AggregateError).errors).toHaveLength(3);
  });

  it("revokes a staged session when it belongs to the wrong user", async () => {
    const { actions, customerAuth, commitCookies, clearCustomerCookies } =
      harness();
    customerAuth.signInEmail.mockResolvedValue({
      response: { token: "wrong-session", user: { id: "other-user" } },
      headers: new Headers({ "set-cookie": "aap_customer_session=wrong" }),
    });
    await expect(
      actions.submitRegistrationAction(
        { kind: "success", redirectTo: "/console/onboarding" },
        registrationForm(),
      ),
    ).resolves.toEqual({
      kind: "session_issue_failed",
      code: "AUTH_SESSION_ISSUE_FAILED",
      retryPath: "/login",
    });
    expect(customerAuth.revokeNewSession).toHaveBeenCalledWith("wrong-session");
    expect(clearCustomerCookies).toHaveBeenCalledOnce();
    expect(commitCookies).not.toHaveBeenCalled();
  });

  it("does not expose whether a normalized email already exists", async () => {
    const { actions, service, reportInternalError } = harness();
    service.submitRegistration.mockRejectedValue(
      new RegistrationError("REGISTRATION_NOT_ACCEPTED"),
    );
    await expect(
      actions.submitRegistrationAction(
        { kind: "success", redirectTo: "/console/onboarding" },
        registrationForm(),
      ),
    ).resolves.toEqual({
      kind: "domain_error",
      code: "REGISTRATION_NOT_ACCEPTED",
    });
    expect(reportInternalError).not.toHaveBeenCalled();
  });

  it("reports an infrastructure error while keeping the public result generic", async () => {
    const { actions, service, reportInternalError } = harness();
    const failure = Object.assign(new Error("unrelated unique failure"), {
      code: "23505",
      constraint: "accounts_provider_id_account_id_unique",
    });
    service.submitRegistration.mockRejectedValue(failure);
    reportInternalError.mockImplementation(() => {
      throw new Error("reporter unavailable");
    });
    await expect(
      actions.submitRegistrationAction(
        { kind: "success", redirectTo: "/console/onboarding" },
        registrationForm(),
      ),
    ).resolves.toEqual({
      kind: "domain_error",
      code: "REGISTRATION_SUBMISSION_FAILED",
    });
    expect(reportInternalError).toHaveBeenCalledWith(failure);
  });
});

describe("review actions", () => {
  it("gates approval and delegates to the transactionally rechecking service", async () => {
    const { actions, access, service } = harness();
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("organizationKind", "create");
    form.set("legalName", "ACME");
    form.set("initialRole", "customer_member");
    await expect(actions.approveRegistrationAction(form)).resolves.toEqual({
      kind: "success",
    });
    expect(access.requireSensitiveAction).toHaveBeenCalledWith(
      "admin:registrations",
    );
    expect(access.requirePermission).not.toHaveBeenCalled();
    expect(service.approveRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        organization: { kind: "create", legalName: "ACME" },
      }),
      expect.objectContaining({ userId: "reviewer-1" }),
      expect.any(Object),
    );
  });

  it("requires a rejection note", async () => {
    const { actions, service } = harness();
    const form = new FormData();
    form.set("requestId", requestId);
    await expect(actions.rejectRegistrationAction(form)).resolves.toEqual({
      kind: "validation_error",
      fieldErrors: { reviewNote: ["请输入拒绝说明"] },
    });
    expect(service.rejectRegistration).not.toHaveBeenCalled();
  });

  it("returns stable Chinese errors for approval fields", async () => {
    const { actions, service } = harness();
    const createForm = new FormData();
    createForm.set("requestId", requestId);
    createForm.set("organizationKind", "create");
    await expect(
      actions.approveRegistrationAction(createForm),
    ).resolves.toEqual({
      kind: "validation_error",
      fieldErrors: { legalName: ["请输入组织法定名称"] },
    });

    const linkForm = new FormData();
    linkForm.set("requestId", requestId);
    linkForm.set("organizationKind", "link");
    linkForm.set("organizationId", "not-a-uuid");
    await expect(actions.approveRegistrationAction(linkForm)).resolves.toEqual({
      kind: "validation_error",
      fieldErrors: { organizationId: ["请输入有效的组织 ID"] },
    });
    expect(service.approveRegistration).not.toHaveBeenCalled();
  });

  it("reports an unexpected review failure without exposing it", async () => {
    const { actions, service, reportInternalError } = harness();
    const failure = new Error("transaction unavailable");
    service.approveRegistration.mockRejectedValue(failure);
    reportInternalError.mockImplementation(() => {
      throw new Error("reporter unavailable");
    });
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("organizationKind", "create");
    form.set("legalName", "ACME");

    await expect(actions.approveRegistrationAction(form)).resolves.toEqual({
      kind: "domain_error",
      code: "REGISTRATION_REVIEW_FAILED",
    });
    expect(reportInternalError).toHaveBeenCalledWith(failure);
  });

  it("keeps a known authorization denial distinct and does not report it", async () => {
    const { actions, access, reportInternalError } = harness();
    access.requireSensitiveAction.mockRejectedValue(
      new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
    );
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("organizationKind", "create");
    form.set("legalName", "ACME");

    await expect(actions.approveRegistrationAction(form)).resolves.toEqual({
      kind: "domain_error",
      code: "REGISTRATION_PERMISSION_DENIED",
    });
    expect(reportInternalError).not.toHaveBeenCalled();
  });

  it("denies review before mutation when central sensitive assurance fails", async () => {
    const { actions, access, service } = harness();
    access.requireSensitiveAction.mockRejectedValueOnce(
      new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
    );
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("organizationKind", "create");
    form.set("legalName", "ACME");

    await expect(actions.approveRegistrationAction(form)).resolves.toEqual({
      kind: "domain_error",
      code: "REGISTRATION_PERMISSION_DENIED",
    });
    expect(service.approveRegistration).not.toHaveBeenCalled();
  });

  it("returns the re-auth route when sensitive assurance is stale", async () => {
    const { actions, access, service } = harness();
    access.requireSensitiveAction.mockRejectedValueOnce(
      new SensitiveActionError("AUTH_REAUTH_REQUIRED"),
    );
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("reviewNote", "资料不完整");

    await expect(actions.rejectRegistrationAction(form)).resolves.toEqual({
      kind: "reauth_required",
      redirectTo: "/staff/re-auth?returnTo=%2Fadmin%2Fregistrations",
    });
    expect(service.rejectRegistration).not.toHaveBeenCalled();
  });
});

describe("resendVerificationAction", () => {
  it("returns the provider's disabled result", async () => {
    const { actions } = harness();
    await expect(actions.resendVerificationAction()).resolves.toEqual({
      ok: false,
      status: 501,
      code: "EMAIL_VERIFICATION_DISABLED",
    });
  });
});
