import "server-only";

import { cookies as nextCookies, headers as nextHeaders } from "next/headers";
import { z } from "zod";

import {
  hashPassword,
  normalizeIdentityEmail,
} from "@ai-agent-platform/database";
import type {
  EmailVerificationProvider,
  EmailVerificationResult,
} from "@ai-agent-platform/integrations";
import { createDisabledEmailVerificationProvider } from "@ai-agent-platform/integrations";

import {
  AuthAccessError,
  requirePermission,
  type WorkforceActor,
} from "../auth/access";
import { commitResponseCookies } from "../auth/actions";
import { createCustomerAuth, customerRealm } from "../auth/customer-auth";
import { resolveTrustedRequestIp } from "../auth/shared-options";
import {
  createDatabaseRegistrationRateLimiter,
  createDatabaseRegistrationRepository,
} from "./repository";
import { reportRegistrationInternalError } from "./internal-reporting";
import {
  RegistrationError,
  createRegistrationService,
  isReservedRegistrationCompanyName,
  type RegistrationContext,
  type RegistrationErrorCode,
  type RegistrationService,
  type ReviewDecision,
} from "./service";

export type RegistrationActionState =
  | { kind: "validation_error"; fieldErrors: Record<string, string[]> }
  | { kind: "domain_error"; code: RegistrationErrorCode }
  | { kind: "success"; redirectTo: "/console/onboarding" }
  | {
      kind: "session_issue_failed";
      code: "AUTH_SESSION_ISSUE_FAILED";
      retryPath: "/login";
    };

export type ReviewActionState =
  | { kind: "validation_error"; fieldErrors: Record<string, string[]> }
  | { kind: "domain_error"; code: RegistrationErrorCode }
  | { kind: "success" };

type SessionResult = {
  token: string;
  user: { id: string };
};

type RegistrationCustomerAuth = {
  signInEmail(input: {
    email: string;
    password: string;
    rememberMe: false;
    headers: Headers;
  }): Promise<{ response: SessionResult; headers: Headers }>;
  revokeNewSession(token: string): Promise<void>;
};

type RegistrationActionsDependencies = {
  service: Pick<
    RegistrationService,
    "submitRegistration" | "approveRegistration" | "rejectRegistration"
  >;
  customerAuth: RegistrationCustomerAuth;
  access: {
    requirePermission(
      permission: "admin:registrations",
    ): Promise<WorkforceActor>;
  };
  provider: EmailVerificationProvider;
  commitCookies(realm: "customer", headers: Headers): Promise<void>;
  clearCustomerCookies(): Promise<void>;
  reportInternalError(error: unknown): void;
  getClientIp(headers: Headers): string | undefined;
  getHeaders(): Promise<Headers>;
};

const registrationSchema = z.object({
  applicantName: z
    .string()
    .transform((input) => input.normalize("NFKC").trim())
    .pipe(z.string().min(1, "请输入姓名").max(120, "姓名不能超过 120 个字符")),
  email: z
    .string()
    .transform(normalizeIdentityEmail)
    .pipe(z.email("请输入有效的邮箱地址").max(320, "邮箱不能超过 320 个字符")),
  password: z
    .string()
    .min(12, "密码至少需要 12 个字符")
    .max(128, "密码不能超过 128 个字符"),
  companyName: z
    .string()
    .transform((input) => input.normalize("NFKC").trim())
    .pipe(
      z
        .string()
        .min(1, "请输入公司名称")
        .max(240, "公司名称不能超过 240 个字符")
        .refine(
          (value) => !isReservedRegistrationCompanyName(value),
          "该公司名称不可用于注册",
        ),
    ),
  acceptedTerms: z.literal(true, {
    error: "请同意平台服务条款与隐私规则",
  }),
});

const createReviewSchema = z.object({
  requestId: z.uuid("申请 ID 无效，请刷新列表后重试"),
  organizationKind: z.literal("create"),
  legalName: z
    .string()
    .trim()
    .min(1, "请输入组织法定名称")
    .max(240, "组织法定名称不能超过 240 个字符"),
  initialRole: z.enum(["customer_admin", "customer_member"]).optional(),
  reviewNote: z
    .string()
    .trim()
    .max(2000, "审核备注不能超过 2000 个字符")
    .optional(),
});

const linkReviewSchema = z.object({
  requestId: z.uuid("申请 ID 无效，请刷新列表后重试"),
  organizationKind: z.literal("link"),
  organizationId: z.uuid("请输入有效的组织 ID"),
  initialRole: z.enum(["customer_admin", "customer_member"]).optional(),
  reviewNote: z
    .string()
    .trim()
    .max(2000, "审核备注不能超过 2000 个字符")
    .optional(),
});

const rejectSchema = z.object({
  requestId: z.uuid("申请 ID 无效，请刷新列表后重试"),
  reviewNote: z
    .string()
    .trim()
    .min(1, "请输入拒绝说明")
    .max(2000, "拒绝说明不能超过 2000 个字符"),
});

function value(formData: FormData, name: string): string {
  const found = formData.get(name);
  return typeof found === "string" ? found : "";
}

function optionalValue(formData: FormData, name: string): string | undefined {
  const found = value(formData, name).trim();
  return found || undefined;
}

function errors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors;
}

function contextFromHeaders(
  headers: Headers,
  getClientIp: RegistrationActionsDependencies["getClientIp"],
): RegistrationContext {
  const ipAddress = getClientIp(headers);
  const userAgent = headers.get("user-agent")?.trim();
  return {
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}

function reportSafely(
  report: RegistrationActionsDependencies["reportInternalError"],
  error: unknown,
) {
  try {
    report(error);
  } catch {
    // Diagnostics must never change a stable public action result.
  }
}

async function compensateRegistrationSession(
  dependencies: RegistrationActionsDependencies,
  token: string,
  cause: unknown,
) {
  const errors: unknown[] = [cause];
  try {
    await dependencies.customerAuth.revokeNewSession(token);
  } catch (error) {
    errors.push(error);
  }
  try {
    await dependencies.clearCustomerCookies();
  } catch (error) {
    errors.push(error);
  }
  reportSafely(
    dependencies.reportInternalError,
    new AggregateError(errors, "Registration session compensation failed"),
  );
}

function domainState(
  error: unknown,
): { kind: "domain_error"; code: RegistrationErrorCode } | undefined {
  return error instanceof RegistrationError
    ? { kind: "domain_error", code: error.code }
    : undefined;
}

export function createRegistrationActions(
  dependencies: RegistrationActionsDependencies,
) {
  async function submitRegistrationAction(
    _previous: RegistrationActionState,
    formData: FormData,
  ): Promise<RegistrationActionState> {
    const parsed = registrationSchema.safeParse({
      applicantName: value(formData, "applicantName"),
      email: value(formData, "email"),
      password: value(formData, "password"),
      companyName: value(formData, "companyName"),
      acceptedTerms: ["true", "on"].includes(value(formData, "acceptedTerms")),
    });
    if (!parsed.success)
      return { kind: "validation_error", fieldErrors: errors(parsed.error) };

    const headers = await dependencies.getHeaders();
    let submitted: Awaited<
      ReturnType<RegistrationService["submitRegistration"]>
    >;
    try {
      submitted = await dependencies.service.submitRegistration(
        parsed.data,
        contextFromHeaders(headers, dependencies.getClientIp),
      );
    } catch (error) {
      const known = domainState(error);
      if (known) return known;
      reportSafely(dependencies.reportInternalError, error);
      return {
        kind: "domain_error",
        code: "REGISTRATION_SUBMISSION_FAILED",
      };
    }

    let staged: { response: SessionResult; headers: Headers };
    try {
      staged = await dependencies.customerAuth.signInEmail({
        email: submitted.email,
        password: parsed.data.password,
        rememberMe: false,
        headers,
      });
    } catch (error) {
      reportSafely(dependencies.reportInternalError, error);
      return {
        kind: "session_issue_failed",
        code: "AUTH_SESSION_ISSUE_FAILED",
        retryPath: "/login",
      };
    }

    if (
      !staged.response.token ||
      staged.response.user.id !== submitted.userId
    ) {
      await compensateRegistrationSession(
        dependencies,
        staged.response.token,
        new Error("Registration session belongs to another user"),
      );
      return {
        kind: "session_issue_failed",
        code: "AUTH_SESSION_ISSUE_FAILED",
        retryPath: "/login",
      };
    }

    try {
      await dependencies.commitCookies("customer", staged.headers);
    } catch (error) {
      await compensateRegistrationSession(
        dependencies,
        staged.response.token,
        error,
      );
      return {
        kind: "session_issue_failed",
        code: "AUTH_SESSION_ISSUE_FAILED",
        retryPath: "/login",
      };
    }
    return { kind: "success", redirectTo: "/console/onboarding" };
  }

  async function approveRegistrationAction(
    formData: FormData,
  ): Promise<ReviewActionState> {
    const raw = {
      requestId: value(formData, "requestId"),
      organizationKind: value(formData, "organizationKind"),
      legalName: value(formData, "legalName"),
      organizationId: value(formData, "organizationId"),
      initialRole: optionalValue(formData, "initialRole"),
      reviewNote: optionalValue(formData, "reviewNote"),
    };
    const parsed =
      raw.organizationKind === "create"
        ? createReviewSchema.safeParse(raw)
        : linkReviewSchema.safeParse(raw);
    if (!parsed.success)
      return { kind: "validation_error", fieldErrors: errors(parsed.error) };

    try {
      const actor = await dependencies.access.requirePermission(
        "admin:registrations",
      );
      const decision: ReviewDecision =
        parsed.data.organizationKind === "create"
          ? {
              requestId: parsed.data.requestId,
              organization: {
                kind: "create",
                legalName: parsed.data.legalName,
              },
              ...(parsed.data.initialRole
                ? { initialRole: parsed.data.initialRole }
                : {}),
              ...(parsed.data.reviewNote
                ? { reviewNote: parsed.data.reviewNote }
                : {}),
            }
          : {
              requestId: parsed.data.requestId,
              organization: {
                kind: "link",
                organizationId: parsed.data.organizationId,
              },
              ...(parsed.data.initialRole
                ? { initialRole: parsed.data.initialRole }
                : {}),
              ...(parsed.data.reviewNote
                ? { reviewNote: parsed.data.reviewNote }
                : {}),
            };
      await dependencies.service.approveRegistration(
        decision,
        actor,
        contextFromHeaders(
          await dependencies.getHeaders(),
          dependencies.getClientIp,
        ),
      );
      return { kind: "success" };
    } catch (error) {
      const known = domainState(error);
      if (known) return known;
      if (error instanceof AuthAccessError)
        return {
          kind: "domain_error",
          code: "REGISTRATION_PERMISSION_DENIED",
        };
      reportSafely(dependencies.reportInternalError, error);
      return {
        kind: "domain_error",
        code: "REGISTRATION_REVIEW_FAILED",
      };
    }
  }

  async function rejectRegistrationAction(
    formData: FormData,
  ): Promise<ReviewActionState> {
    const parsed = rejectSchema.safeParse({
      requestId: value(formData, "requestId"),
      reviewNote: value(formData, "reviewNote"),
    });
    if (!parsed.success)
      return { kind: "validation_error", fieldErrors: errors(parsed.error) };
    try {
      const actor = await dependencies.access.requirePermission(
        "admin:registrations",
      );
      await dependencies.service.rejectRegistration(
        parsed.data.requestId,
        actor,
        parsed.data.reviewNote,
        contextFromHeaders(
          await dependencies.getHeaders(),
          dependencies.getClientIp,
        ),
      );
      return { kind: "success" };
    } catch (error) {
      const known = domainState(error);
      if (known) return known;
      if (error instanceof AuthAccessError)
        return {
          kind: "domain_error",
          code: "REGISTRATION_PERMISSION_DENIED",
        };
      reportSafely(dependencies.reportInternalError, error);
      return {
        kind: "domain_error",
        code: "REGISTRATION_REVIEW_FAILED",
      };
    }
  }

  async function resendVerificationAction(): Promise<EmailVerificationResult> {
    return dependencies.provider.resendVerification({
      userId: "placeholder",
      email: "placeholder@invalid",
    });
  }

  return {
    submitRegistrationAction,
    approveRegistrationAction,
    rejectRegistrationAction,
    resendVerificationAction,
  };
}

function parseRegistrationSession(value: unknown): SessionResult {
  if (!value || typeof value !== "object")
    throw new Error("Authentication returned no registration session");
  const record = value as Record<string, unknown>;
  const user = record.user;
  if (
    typeof record.token !== "string" ||
    !user ||
    typeof user !== "object" ||
    typeof (user as Record<string, unknown>).id !== "string"
  ) {
    throw new Error("Authentication returned an invalid registration session");
  }
  return {
    token: record.token,
    user: { id: (user as Record<string, unknown>).id as string },
  };
}

let actionAuth: ReturnType<typeof createCustomerAuth> | undefined;
function getActionAuth() {
  actionAuth ??= createCustomerAuth({ forwardCookies: false });
  return actionAuth;
}

export function createDefaultRegistrationService() {
  return createRegistrationService({
    repository: createDatabaseRegistrationRepository(),
    limiter: createDatabaseRegistrationRateLimiter(),
    hashPassword,
  });
}

function createDefaultRegistrationActions() {
  const service = createDefaultRegistrationService();
  return createRegistrationActions({
    service,
    access: { requirePermission },
    provider: createDisabledEmailVerificationProvider(),
    getHeaders: nextHeaders,
    commitCookies: (realm, headers) =>
      commitResponseCookies(realm, headers, nextCookies),
    async clearCustomerCookies() {
      const store = await nextCookies();
      store.delete(customerRealm.cookieName);
    },
    reportInternalError: reportRegistrationInternalError,
    getClientIp: (headers) => resolveTrustedRequestIp(headers),
    customerAuth: {
      async signInEmail(input) {
        const result = await getActionAuth().api.signInEmail({
          body: {
            email: input.email,
            password: input.password,
            rememberMe: false,
          },
          headers: input.headers,
          returnHeaders: true,
        });
        return {
          response: parseRegistrationSession(result.response),
          headers: result.headers,
        };
      },
      async revokeNewSession(token) {
        const context = await getActionAuth().$context;
        await context.internalAdapter.deleteSession(token);
      },
    },
  });
}

export async function submitRegistrationAction(
  previous: RegistrationActionState,
  formData: FormData,
): Promise<RegistrationActionState> {
  "use server";
  return createDefaultRegistrationActions().submitRegistrationAction(
    previous,
    formData,
  );
}

export async function approveRegistrationAction(
  formData: FormData,
): Promise<ReviewActionState> {
  "use server";
  return createDefaultRegistrationActions().approveRegistrationAction(formData);
}

export async function rejectRegistrationAction(
  formData: FormData,
): Promise<ReviewActionState> {
  "use server";
  return createDefaultRegistrationActions().rejectRegistrationAction(formData);
}

export async function resendVerificationAction(): Promise<EmailVerificationResult> {
  "use server";
  return createDefaultRegistrationActions().resendVerificationAction();
}
