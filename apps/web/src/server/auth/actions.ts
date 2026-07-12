import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { cookies as nextCookies, headers as nextHeaders } from "next/headers";
import { z } from "zod";

import {
  getDatabase,
  normalizeIdentityEmail,
  normalizeWorkforceUsername,
  users,
  type IdentityRealm,
  type UserStatus,
} from "@ai-agent-platform/database";

import type { AuthActionState } from "@/contracts/auth-action-state";

export {
  AUTH_ACTION_INITIAL_STATE,
  type AuthActionState,
} from "@/contracts/auth-action-state";

import { createDatabaseAccessRepository } from "./access";
import { createAuditWriter, type AuditWriteInput } from "./audit";
import { getCustomerAuth } from "./customer-auth";
import { getStaffAuth } from "./staff-auth";

const CUSTOMER_COOKIE = "aap_customer_session";
const STAFF_COOKIE = "aap_staff_session";
const MAX_RETURN_PATH_LENGTH = 1024;
const SAFE_CUSTOMER_PATH =
  /^\/console(?:\/[A-Za-z0-9._~-]+)*(?:\?[A-Za-z0-9._~=&-]*)?(?:#[A-Za-z0-9._~-]*)?$/u;
const SAFE_STAFF_PATH =
  /^\/admin(?:\/[A-Za-z0-9._~-]+)*(?:\?[A-Za-z0-9._~=&-]*)?(?:#[A-Za-z0-9._~-]*)?$/u;

export type LoginUser = {
  id: string;
  realm: IdentityRealm;
  status: UserStatus;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  permissions: string[];
};

type SignInResult =
  | { user: { id: string }; token: string }
  | { twoFactorRedirect: true; twoFactorMethods: string[] };

type CustomerGateway = {
  signInEmail(input: {
    email: string;
    password: string;
    rememberMe: true;
    headers: Headers;
  }): Promise<SignInResult>;
  signOut(input: { headers: Headers }): Promise<{ success: boolean }>;
  revokeNewSession(token: string): Promise<void>;
};

type StaffGateway = {
  signInEmail(input: {
    email: string;
    password: string;
    rememberMe: false;
    headers: Headers;
  }): Promise<SignInResult>;
  signInUsername(input: {
    username: string;
    password: string;
    rememberMe: false;
    headers: Headers;
  }): Promise<SignInResult>;
  signOut(input: { headers: Headers }): Promise<{ success: boolean }>;
  revokeNewSession(token: string): Promise<void>;
};

type LoginUserRepository = {
  findByIdentifier(
    realm: IdentityRealm,
    method: "email" | "username",
    identifier: string,
  ): Promise<LoginUser | null>;
  findById(id: string): Promise<LoginUser | null>;
};

type AuditWriter = { write(input: AuditWriteInput): Promise<void> };
type CookieStore = { delete(name: string): void };

export type AuthActionDependencies = {
  customer: CustomerGateway;
  staff: StaffGateway;
  users: LoginUserRepository;
  audit: AuditWriter;
  reportInternalError(error: AggregateError): void;
  getHeaders(): Promise<Headers>;
  getCookieStore(): Promise<CookieStore>;
};

const customerLoginSchema = z.object({
  email: z
    .string()
    .max(320)
    .transform(normalizeIdentityEmail)
    .pipe(z.email().max(320)),
  password: z.string().min(1).max(128),
  returnTo: z.string().max(MAX_RETURN_PATH_LENGTH).optional(),
});

const staffLoginSchema = z.object({
  identifier: z
    .string()
    .min(1)
    .max(320)
    .transform((value) => value.normalize("NFKC").trim().toLowerCase()),
  password: z.string().min(1).max(128),
  returnTo: z.string().max(MAX_RETURN_PATH_LENGTH).optional(),
});

function stringField(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function invalidCredentials(): AuthActionState {
  return { kind: "error", code: "AUTH_INVALID_CREDENTIALS" };
}

export function safeReturnPath(
  realm: IdentityRealm,
  candidate: string | undefined,
): string {
  const fallback = realm === "customer" ? "/console" : "/admin";
  if (!candidate || candidate.length > MAX_RETURN_PATH_LENGTH) return fallback;
  if (
    candidate.includes("%") ||
    candidate.includes("\\") ||
    candidate.includes("..") ||
    /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    return fallback;
  }
  const pattern = realm === "customer" ? SAFE_CUSTOMER_PATH : SAFE_STAFF_PATH;
  return pattern.test(candidate) ? candidate : fallback;
}

function parseSignInResult(value: unknown): SignInResult {
  if (!value || typeof value !== "object") {
    throw new Error("Unexpected authentication response");
  }
  const result = value as Record<string, unknown>;
  if (result.twoFactorRedirect === true) {
    if (
      !Array.isArray(result.twoFactorMethods) ||
      !result.twoFactorMethods.every((method) => typeof method === "string")
    ) {
      throw new Error("Unexpected two-factor response");
    }
    return {
      twoFactorRedirect: true,
      twoFactorMethods: result.twoFactorMethods,
    };
  }
  const rawUser = result.user;
  if (
    !rawUser ||
    typeof rawUser !== "object" ||
    typeof (rawUser as Record<string, unknown>).id !== "string" ||
    typeof result.token !== "string"
  ) {
    throw new Error("Unexpected authentication response");
  }
  return {
    user: { id: (rawUser as Record<string, unknown>).id as string },
    token: result.token,
  };
}

function requestAuditContext(headers: Headers) {
  const ipAddress = headers.get("x-real-ip") ?? undefined;
  const userAgent = headers.get("user-agent") ?? undefined;
  return { ipAddress, userAgent };
}

async function clearCookie(
  getCookieStore: AuthActionDependencies["getCookieStore"],
  name: string,
) {
  (await getCookieStore()).delete(name);
}

async function cleanNewSession(
  gateway: Pick<CustomerGateway, "revokeNewSession">,
  token: string,
  getCookieStore: AuthActionDependencies["getCookieStore"],
  cookieName: string,
  reportInternalError: AuthActionDependencies["reportInternalError"],
) {
  const cleanupErrors: Error[] = [];
  try {
    await gateway.revokeNewSession(token);
  } catch {
    cleanupErrors.push(new Error("Session revocation failed"));
  }
  try {
    await clearCookie(getCookieStore, cookieName);
  } catch {
    cleanupErrors.push(new Error("Session cookie cleanup failed"));
  }
  if (cleanupErrors.length > 0) {
    try {
      reportInternalError(
        new AggregateError(cleanupErrors, "Authentication cleanup failed"),
      );
    } catch {
      // A diagnostics sink must never turn a compensated login into a leak.
    }
  }
}

function isFullSession(
  result: SignInResult,
): result is Extract<SignInResult, { token: string }> {
  return "token" in result;
}

export function createAuthActions(dependencies: AuthActionDependencies) {
  async function auditFailure(
    headers: Headers,
    reason:
      | "invalid_credentials"
      | "account_disabled"
      | "account_not_active"
      | "realm_mismatch"
      | "unknown",
  ) {
    await dependencies.audit.write({
      event: "auth.login_failure",
      target: { type: "system" },
      metadata: { reason },
      ...requestAuditContext(headers),
    });
  }

  async function customerLogin(
    _previous: AuthActionState,
    formData: FormData,
  ): Promise<AuthActionState> {
    const headers = await dependencies.getHeaders();
    const parsed = customerLoginSchema.safeParse({
      email: stringField(formData, "email"),
      password: stringField(formData, "password"),
      returnTo: stringField(formData, "returnTo"),
    });
    if (!parsed.success) {
      try {
        await auditFailure(headers, "invalid_credentials");
      } catch {
        // The action remains generic whether validation or audit storage failed.
      }
      return invalidCredentials();
    }

    let result: SignInResult;
    try {
      result = await dependencies.customer.signInEmail({
        email: parsed.data.email,
        password: parsed.data.password,
        rememberMe: true,
        headers,
      });
    } catch {
      try {
        await auditFailure(headers, "invalid_credentials");
      } catch {
        // Do not expose authentication or audit persistence details.
      }
      return invalidCredentials();
    }

    if (!isFullSession(result)) {
      await clearCookie(dependencies.getCookieStore, CUSTOMER_COOKIE);
      return invalidCredentials();
    }

    try {
      const user = await dependencies.users.findById(result.user.id);
      if (!user || user.realm !== "customer" || user.status === "disabled") {
        await cleanNewSession(
          dependencies.customer,
          result.token,
          dependencies.getCookieStore,
          CUSTOMER_COOKIE,
          dependencies.reportInternalError,
        );
        try {
          await auditFailure(
            headers,
            user?.status === "disabled" ? "account_disabled" : "realm_mismatch",
          );
        } catch {
          // The public result must remain indistinguishable.
        }
        return invalidCredentials();
      }

      await dependencies.audit.write({
        event: "auth.login_success",
        actor: { realm: "customer", userId: user.id },
        target: { type: "session" },
        metadata: { method: "email" },
        ...requestAuditContext(headers),
      });

      return {
        kind: "success",
        redirectTo:
          user.status === "pending_review" || user.status === "rejected"
            ? "/console/onboarding"
            : safeReturnPath("customer", parsed.data.returnTo),
      };
    } catch {
      await cleanNewSession(
        dependencies.customer,
        result.token,
        dependencies.getCookieStore,
        CUSTOMER_COOKIE,
        dependencies.reportInternalError,
      );
      return invalidCredentials();
    }
  }

  async function staffLogin(
    _previous: AuthActionState,
    formData: FormData,
  ): Promise<AuthActionState> {
    const headers = await dependencies.getHeaders();
    const parsed = staffLoginSchema.safeParse({
      identifier: stringField(formData, "identifier"),
      password: stringField(formData, "password"),
      returnTo: stringField(formData, "returnTo"),
    });
    if (!parsed.success) {
      try {
        await auditFailure(headers, "invalid_credentials");
      } catch {
        // Keep validation and audit failures indistinguishable.
      }
      return invalidCredentials();
    }

    const method = parsed.data.identifier.includes("@")
      ? ("email" as const)
      : ("username" as const);
    const identifier =
      method === "email"
        ? normalizeIdentityEmail(parsed.data.identifier)
        : normalizeWorkforceUsername(parsed.data.identifier);
    let preflightUser: LoginUser | null;
    try {
      preflightUser = await dependencies.users.findByIdentifier(
        "workforce",
        method,
        identifier,
      );
    } catch {
      try {
        await auditFailure(headers, "unknown");
      } catch {
        // Keep repository and audit failures indistinguishable.
      }
      return invalidCredentials();
    }
    if (preflightUser?.status === "disabled") {
      try {
        await dependencies.staff.signOut({ headers });
      } finally {
        await clearCookie(dependencies.getCookieStore, STAFF_COOKIE);
      }
      try {
        await auditFailure(headers, "account_disabled");
      } catch {
        // Keep disabled accounts indistinguishable from bad credentials.
      }
      return invalidCredentials();
    }

    let result: SignInResult;
    try {
      result = await (method === "email"
        ? dependencies.staff.signInEmail({
            email: identifier,
            password: parsed.data.password,
            rememberMe: false,
            headers,
          })
        : dependencies.staff.signInUsername({
            username: identifier,
            password: parsed.data.password,
            rememberMe: false,
            headers,
          }));
    } catch {
      try {
        await auditFailure(headers, "invalid_credentials");
      } catch {
        // Do not leak raw Better Auth or audit errors.
      }
      return invalidCredentials();
    }

    const returnTo = safeReturnPath("workforce", parsed.data.returnTo);
    if (!isFullSession(result)) {
      return {
        kind: "success",
        redirectTo: `/staff/two-factor?returnTo=${encodeURIComponent(returnTo)}`,
      };
    }

    try {
      const user = await dependencies.users.findById(result.user.id);
      if (!user || user.realm !== "workforce" || user.status !== "active") {
        await cleanNewSession(
          dependencies.staff,
          result.token,
          dependencies.getCookieStore,
          STAFF_COOKIE,
          dependencies.reportInternalError,
        );
        try {
          await auditFailure(
            headers,
            user?.status === "disabled"
              ? "account_disabled"
              : user?.realm !== "workforce"
                ? "realm_mismatch"
                : "account_not_active",
          );
        } catch {
          // The public result must remain generic.
        }
        return invalidCredentials();
      }

      await dependencies.audit.write({
        event: "auth.login_success",
        actor: { realm: "workforce", userId: user.id },
        target: { type: "session" },
        metadata: { method },
        ...requestAuditContext(headers),
      });

      return {
        kind: "success",
        redirectTo: user.mustChangePassword
          ? "/staff/change-password"
          : returnTo,
      };
    } catch {
      await cleanNewSession(
        dependencies.staff,
        result.token,
        dependencies.getCookieStore,
        STAFF_COOKIE,
        dependencies.reportInternalError,
      );
      return invalidCredentials();
    }
  }

  async function logout(realm: IdentityRealm): Promise<AuthActionState> {
    const headers = await dependencies.getHeaders();
    const gateway =
      realm === "customer" ? dependencies.customer : dependencies.staff;
    const cookieName = realm === "customer" ? CUSTOMER_COOKIE : STAFF_COOKIE;
    try {
      await gateway.signOut({ headers });
    } finally {
      await clearCookie(dependencies.getCookieStore, cookieName);
    }
    try {
      await dependencies.audit.write({
        event: "auth.logout",
        target: { type: "session" },
        ...requestAuditContext(headers),
      });
    } catch {
      // The session is already revoked; never keep a user trapped on logout.
    }
    return {
      kind: "success",
      redirectTo: realm === "customer" ? "/login" : "/staff/login",
    };
  }

  return {
    customerLogin,
    staffLogin,
    customerLogout: () => logout("customer"),
    staffLogout: () => logout("workforce"),
  };
}

export function createDatabaseLoginUserRepository(): LoginUserRepository {
  const database = getDatabase();
  const accessRepository = createDatabaseAccessRepository(database);

  async function toLoginUser(
    found: typeof users.$inferSelect | undefined,
  ): Promise<LoginUser | null> {
    if (!found) return null;
    return {
      id: found.id,
      realm: found.identityRealm,
      status: found.status,
      mustChangePassword: found.mustChangePassword,
      twoFactorEnabled: found.twoFactorEnabled,
      permissions:
        found.identityRealm === "workforce"
          ? await accessRepository.findPermissionKeys(found.id, "workforce")
          : [],
    };
  }

  return {
    async findByIdentifier(realm, method, identifier) {
      const condition =
        method === "email"
          ? sql`lower(${users.email}) = ${identifier}`
          : sql`lower(${users.username}) = ${identifier}`;
      const found = await database.query.users.findFirst({
        where: and(eq(users.identityRealm, realm), condition),
      });
      return toLoginUser(found);
    },
    async findById(id) {
      return toLoginUser(
        await database.query.users.findFirst({
          where: eq(users.id, id),
        }),
      );
    },
  };
}

function createDefaultCustomerGateway(): CustomerGateway {
  return {
    async signInEmail(input) {
      const result: unknown = await getCustomerAuth().api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
          rememberMe: true,
        },
        headers: input.headers,
      });
      return parseSignInResult(result);
    },
    signOut: ({ headers }) => getCustomerAuth().api.signOut({ headers }),
    async revokeNewSession(token) {
      const context = await getCustomerAuth().$context;
      await context.internalAdapter.deleteSession(token);
    },
  };
}

function createDefaultStaffGateway(): StaffGateway {
  return {
    async signInEmail(input) {
      const result: unknown = await getStaffAuth().api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
          rememberMe: false,
        },
        headers: input.headers,
      });
      return parseSignInResult(result);
    },
    async signInUsername(input) {
      const result: unknown = await getStaffAuth().api.signInUsername({
        body: {
          username: input.username,
          password: input.password,
          rememberMe: false,
        },
        headers: input.headers,
      });
      return parseSignInResult(result);
    },
    signOut: ({ headers }) => getStaffAuth().api.signOut({ headers }),
    async revokeNewSession(token) {
      const context = await getStaffAuth().$context;
      await context.internalAdapter.deleteSession(token);
    },
  };
}

export function createDefaultAuthActions() {
  return createAuthActions({
    customer: createDefaultCustomerGateway(),
    staff: createDefaultStaffGateway(),
    users: createDatabaseLoginUserRepository(),
    audit: createAuditWriter(),
    reportInternalError(error) {
      console.error(error);
    },
    getHeaders: nextHeaders,
    getCookieStore: nextCookies,
  });
}
