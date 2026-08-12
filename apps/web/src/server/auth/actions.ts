import "server-only";

import { and, eq, ne } from "drizzle-orm";
import { cookies as nextCookies, headers as nextHeaders } from "next/headers";
import { ResponseCookies } from "next/dist/server/web/spec-extension/cookies";
import { z } from "zod";

import {
  auditLogs,
  getDatabase,
  normalizeIdentityEmail,
  normalizeWorkforceUsername,
  sessions,
  users,
  type IdentityRealm,
  type UserStatus,
} from "@ai-agent-platform/database";

import type {
  AuthActionState,
  StaffSecurityActionState,
} from "@/contracts/auth-action-state";

export {
  AUTH_ACTION_INITIAL_STATE,
  STAFF_SECURITY_ACTION_INITIAL_STATE,
  type AuthActionState,
  type StaffSecurityActionState,
} from "@/contracts/auth-action-state";

import { createAuditWriter, type AuditWriteInput } from "./audit";
import { createCustomerAuth } from "./customer-auth";
import {
  AuthRateLimitError,
  createDatabaseAuthRateLimiter,
  type AuthRateLimiter,
} from "./rate-limit";
import { resolveTrustedRequestIp } from "./shared-options";
import { createStaffAuth } from "./staff-auth";

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
};

type SignInResult = { user: { id: string }; token: string };
type StagedResponse<T> = { response: T; headers: Headers };

type CustomerGateway = {
  signInEmail(input: {
    email: string;
    password: string;
    rememberMe: true;
    headers: Headers;
  }): Promise<StagedResponse<SignInResult>>;
  signOut(input: {
    headers: Headers;
  }): Promise<StagedResponse<{ success: boolean }>>;
  revokeNewSession(token: string): Promise<void>;
};

type StaffGateway = {
  signInEmail(input: {
    email: string;
    password: string;
    rememberMe: false;
    headers: Headers;
  }): Promise<StagedResponse<SignInResult>>;
  signInUsername(input: {
    username: string;
    password: string;
    rememberMe: false;
    headers: Headers;
  }): Promise<StagedResponse<SignInResult>>;
  signOut(input: {
    headers: Headers;
  }): Promise<StagedResponse<{ success: boolean }>>;
  revokeNewSession(token: string): Promise<void>;
};

type LoginUserRepository = {
  findById(id: string): Promise<LoginUser | null>;
  hasExactWorkforceUsername(username: string): Promise<boolean>;
};

type AuditWriter = { write(input: AuditWriteInput): Promise<void> };
type CookieStore = Pick<
  Awaited<ReturnType<typeof nextCookies>>,
  "set" | "delete"
>;

export type AuthActionDependencies = {
  customer: CustomerGateway;
  staff: StaffGateway;
  users: LoginUserRepository;
  audit: AuditWriter;
  reportInternalError(error: AggregateError): void;
  commitCookies(realm: IdentityRealm, headers: Headers): Promise<void>;
  getHeaders(): Promise<Headers>;
  getCookieStore(): Promise<CookieStore>;
  rateLimiter: AuthRateLimiter;
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
  identifier: z.string().min(1).max(320).transform(normalizeWorkforceUsername),
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

function isRateLimited(error: unknown): error is AuthRateLimitError {
  return error instanceof AuthRateLimitError;
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
  const ipAddress = resolveTrustedRequestIp(headers);
  const userAgent = headers.get("user-agent") ?? undefined;
  return { ipAddress, userAgent };
}

function realmCookieName(realm: IdentityRealm): string {
  return realm === "customer" ? CUSTOMER_COOKIE : STAFF_COOKIE;
}

async function clearRealmCookies(
  getCookieStore: AuthActionDependencies["getCookieStore"],
  realm: IdentityRealm,
): Promise<void> {
  const store = await getCookieStore();
  store.delete(realmCookieName(realm));
}

export async function commitResponseCookies(
  realm: IdentityRealm,
  headers: Headers,
  getCookieStore: AuthActionDependencies["getCookieStore"],
): Promise<void> {
  const expected = realmCookieName(realm);
  const cookie = new ResponseCookies(headers)
    .getAll()
    .find(({ name }) => name === expected);
  if (!cookie) {
    throw new Error(`Authentication response is missing a ${realm} cookie`);
  }
  (await getCookieStore()).set(cookie);
}

async function cleanNewSession(
  gateway: Pick<CustomerGateway, "revokeNewSession">,
  token: string,
  getCookieStore: AuthActionDependencies["getCookieStore"],
  realm: IdentityRealm,
  reportInternalError: AuthActionDependencies["reportInternalError"],
) {
  const errors: Error[] = [];
  await gateway.revokeNewSession(token).catch(() => {
    errors.push(new Error("Session revocation failed"));
  });
  await clearRealmCookies(getCookieStore, realm).catch(() => {
    errors.push(new Error("Session cookie cleanup failed"));
  });
  if (errors.length > 0) {
    try {
      reportInternalError(
        new AggregateError(errors, "Authentication cleanup failed"),
      );
    } catch {
      // Diagnostics must never leak a rejected session.
    }
  }
}

export function createAuthActions(dependencies: AuthActionDependencies) {
  async function auditFailure(
    headers: Headers,
    reason:
      | "invalid_credentials"
      | "account_disabled"
      | "account_not_active"
      | "realm_mismatch",
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
      await auditFailure(headers, "invalid_credentials").catch(() => undefined);
      return invalidCredentials();
    }
    try {
      await dependencies.rateLimiter.consume({
        realm: "customer",
        operation: "login",
        identifier: parsed.data.email,
        ipAddress: resolveTrustedRequestIp(headers),
      });
    } catch (error) {
      return isRateLimited(error)
        ? { kind: "error", code: "AUTH_RATE_LIMITED" }
        : invalidCredentials();
    }
    let staged: StagedResponse<SignInResult>;
    try {
      staged = await dependencies.customer.signInEmail({
        email: parsed.data.email,
        password: parsed.data.password,
        rememberMe: true,
        headers,
      });
    } catch {
      await auditFailure(headers, "invalid_credentials").catch(() => undefined);
      return invalidCredentials();
    }
    try {
      const user = await dependencies.users.findById(staged.response.user.id);
      if (!user || user.realm !== "customer" || user.status === "disabled") {
        await cleanNewSession(
          dependencies.customer,
          staged.response.token,
          dependencies.getCookieStore,
          "customer",
          dependencies.reportInternalError,
        );
        await auditFailure(
          headers,
          user?.status === "disabled" ? "account_disabled" : "realm_mismatch",
        ).catch(() => undefined);
        return invalidCredentials();
      }
      await dependencies.audit.write({
        event: "auth.login_success",
        actor: { realm: "customer", userId: user.id },
        target: { type: "session" },
        metadata: { method: "email" },
        ...requestAuditContext(headers),
      });
      await dependencies.commitCookies("customer", staged.headers);
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
        staged.response.token,
        dependencies.getCookieStore,
        "customer",
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
      await auditFailure(headers, "invalid_credentials").catch(() => undefined);
      return invalidCredentials();
    }
    const rawIdentifier = parsed.data.identifier;
    const exactUsername = await dependencies.users
      .hasExactWorkforceUsername(rawIdentifier)
      .catch(() => false);
    const method =
      exactUsername || !rawIdentifier.includes("@")
        ? ("username" as const)
        : ("email" as const);
    const identifier =
      method === "email"
        ? normalizeIdentityEmail(rawIdentifier)
        : normalizeWorkforceUsername(rawIdentifier);
    try {
      await dependencies.rateLimiter.consume({
        realm: "workforce",
        operation: "login",
        identifier,
        ipAddress: resolveTrustedRequestIp(headers),
      });
    } catch (error) {
      return isRateLimited(error)
        ? { kind: "error", code: "AUTH_RATE_LIMITED" }
        : invalidCredentials();
    }
    let staged: StagedResponse<SignInResult>;
    try {
      staged = await (method === "email"
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
      await auditFailure(headers, "invalid_credentials").catch(() => undefined);
      return invalidCredentials();
    }
    try {
      const user = await dependencies.users.findById(staged.response.user.id);
      if (!user || user.realm !== "workforce" || user.status !== "active") {
        await cleanNewSession(
          dependencies.staff,
          staged.response.token,
          dependencies.getCookieStore,
          "workforce",
          dependencies.reportInternalError,
        );
        await auditFailure(
          headers,
          user?.status === "disabled"
            ? "account_disabled"
            : user?.realm !== "workforce"
              ? "realm_mismatch"
              : "account_not_active",
        ).catch(() => undefined);
        return invalidCredentials();
      }
      await dependencies.audit.write({
        event: "auth.login_success",
        actor: { realm: "workforce", userId: user.id },
        target: { type: "session" },
        metadata: { method },
        ...requestAuditContext(headers),
      });
      await dependencies.commitCookies("workforce", staged.headers);
      const returnTo = safeReturnPath("workforce", parsed.data.returnTo);
      return {
        kind: "success",
        redirectTo: user.mustChangePassword
          ? `/staff/change-password?returnTo=${encodeURIComponent(returnTo)}`
          : returnTo,
      };
    } catch {
      await cleanNewSession(
        dependencies.staff,
        staged.response.token,
        dependencies.getCookieStore,
        "workforce",
        dependencies.reportInternalError,
      );
      return invalidCredentials();
    }
  }

  async function logout(realm: IdentityRealm): Promise<AuthActionState> {
    const headers = await dependencies.getHeaders();
    const gateway =
      realm === "customer" ? dependencies.customer : dependencies.staff;
    let serverRevoked = false;
    let cleared = false;
    try {
      const result = await gateway.signOut({ headers });
      serverRevoked = result.response.success === true;
      await dependencies.commitCookies(realm, result.headers);
      cleared = true;
    } catch {
      // A local clear still ends browser access when server revocation fails.
    }
    try {
      await clearRealmCookies(dependencies.getCookieStore, realm);
      cleared = true;
    } catch {
      // Report the public failure below.
    }
    if (serverRevoked) {
      await dependencies.audit
        .write({
          event: "auth.logout",
          target: { type: "session" },
          ...requestAuditContext(headers),
        })
        .catch(() => undefined);
    }
    if (!serverRevoked || !cleared) {
      return { kind: "error", code: "AUTH_LOGOUT_FAILED" };
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
  return {
    async findById(id) {
      const found = await database.query.users.findFirst({
        where: eq(users.id, id),
      });
      return found
        ? {
            id: found.id,
            realm: found.identityRealm,
            status: found.status,
            mustChangePassword: found.mustChangePassword,
          }
        : null;
    },
    async hasExactWorkforceUsername(username) {
      return Boolean(
        await database.query.users.findFirst({
          where: and(
            eq(users.identityRealm, "workforce"),
            eq(users.username, username),
          ),
          columns: { id: true },
        }),
      );
    },
  };
}

type StaffSecurityGateway = {
  changePassword(input: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: true;
    headers: Headers;
  }): Promise<StagedResponse<{ token: string | null }>>;
  revokeNewSession(token: string): Promise<void>;
};

type StaffSecurityRepository = {
  current(): Promise<{ userId: string } | null>;
  finalizePasswordChange(userId: string, sessionToken: string): Promise<void>;
};

export function createStaffSecurityActions(dependencies: {
  gateway: StaffSecurityGateway;
  repository: StaffSecurityRepository;
  commitCookies(headers: Headers): Promise<void>;
  getHeaders(): Promise<Headers>;
  clearCookies(): Promise<void>;
}) {
  return {
    async changePassword(
      formData: FormData,
    ): Promise<StaffSecurityActionState> {
      const currentPassword = stringField(formData, "currentPassword");
      const newPassword = stringField(formData, "newPassword");
      if (!currentPassword || !newPassword) {
        return { kind: "error", code: "AUTH_INVALID_INPUT" };
      }
      const session = await dependencies.repository.current().catch(() => null);
      if (!session) {
        return { kind: "error", code: "AUTH_INVALID_CREDENTIALS" };
      }
      let staged: StagedResponse<{ token: string | null }>;
      try {
        staged = await dependencies.gateway.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
          headers: await dependencies.getHeaders(),
        });
      } catch {
        return { kind: "error", code: "AUTH_INVALID_CREDENTIALS" };
      }
      try {
        if (!staged.response.token) {
          throw new Error("Password change did not create a session");
        }
        await dependencies.repository.finalizePasswordChange(
          session.userId,
          staged.response.token,
        );
        await dependencies.commitCookies(staged.headers);
        return {
          kind: "success",
          redirectTo: safeReturnPath(
            "workforce",
            stringField(formData, "returnTo"),
          ),
        };
      } catch {
        if (staged.response.token) {
          await dependencies.gateway
            .revokeNewSession(staged.response.token)
            .catch(() => undefined);
        }
        await dependencies.clearCookies().catch(() => undefined);
        return { kind: "error", code: "AUTH_INFRASTRUCTURE_FAILURE" };
      }
    },
  };
}

let customerActionAuth: ReturnType<typeof createCustomerAuth> | undefined;
let staffActionAuth: ReturnType<typeof createStaffAuth> | undefined;

function getCustomerActionAuth() {
  customerActionAuth ??= createCustomerAuth({ forwardCookies: false });
  return customerActionAuth;
}

function getStaffActionAuth() {
  staffActionAuth ??= createStaffAuth({ forwardCookies: false });
  return staffActionAuth;
}

function createDefaultCustomerGateway(): CustomerGateway {
  return {
    async signInEmail(input) {
      const result = await getCustomerActionAuth().api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
          rememberMe: true,
        },
        headers: input.headers,
        returnHeaders: true,
      });
      return {
        response: parseSignInResult(result.response),
        headers: result.headers,
      };
    },
    async signOut({ headers }) {
      const result = await getCustomerActionAuth().api.signOut({
        headers,
        returnHeaders: true,
      });
      return { response: result.response, headers: result.headers };
    },
    async revokeNewSession(token) {
      (await getCustomerActionAuth().$context).internalAdapter.deleteSession(
        token,
      );
    },
  };
}

function createDefaultStaffGateway(): StaffGateway {
  return {
    async signInEmail(input) {
      const result = await getStaffActionAuth().api.signInEmail({
        body: {
          email: input.email,
          password: input.password,
          rememberMe: false,
        },
        headers: input.headers,
        returnHeaders: true,
      });
      return {
        response: parseSignInResult(result.response),
        headers: result.headers,
      };
    },
    async signInUsername(input) {
      const result = await getStaffActionAuth().api.signInUsername({
        body: {
          username: input.username,
          password: input.password,
          rememberMe: false,
        },
        headers: input.headers,
        returnHeaders: true,
      });
      return {
        response: parseSignInResult(result.response),
        headers: result.headers,
      };
    },
    async signOut({ headers }) {
      const result = await getStaffActionAuth().api.signOut({
        headers,
        returnHeaders: true,
      });
      return { response: result.response, headers: result.headers };
    },
    async revokeNewSession(token) {
      (await getStaffActionAuth().$context).internalAdapter.deleteSession(
        token,
      );
    },
  };
}

export function createDefaultStaffSecurityActions() {
  const database = getDatabase();
  const auth = getStaffActionAuth();
  return createStaffSecurityActions({
    gateway: {
      async changePassword(input) {
        const result = await auth.api.changePassword({
          body: {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
            revokeOtherSessions: true,
          },
          headers: input.headers,
          returnHeaders: true,
        });
        return { response: result.response, headers: result.headers };
      },
      async revokeNewSession(token) {
        (await auth.$context).internalAdapter.deleteSession(token);
      },
    },
    repository: {
      async current() {
        const value = await auth.api.getSession({
          headers: await nextHeaders(),
        });
        const user =
          value && typeof value === "object"
            ? (value as Record<string, unknown>).user
            : null;
        return user &&
          typeof user === "object" &&
          typeof (user as { id?: unknown }).id === "string"
          ? { userId: (user as { id: string }).id }
          : null;
      },
      async finalizePasswordChange(userId, sessionToken) {
        await database.transaction(async (tx) => {
          await tx
            .update(users)
            .set({ mustChangePassword: false, updatedAt: new Date() })
            .where(
              and(eq(users.id, userId), eq(users.identityRealm, "workforce")),
            );
          const revoked = await tx
            .delete(sessions)
            .where(
              and(
                eq(sessions.userId, userId),
                ne(sessions.token, sessionToken),
              ),
            )
            .returning({ id: sessions.id });
          await tx.insert(auditLogs).values({
            actorRealm: "workforce",
            actorUserId: userId,
            action: "auth.password_changed",
            targetType: "user",
            targetId: userId,
            metadata: { sessionsRevoked: revoked.length },
          });
        });
      },
    },
    commitCookies: (headers) =>
      commitResponseCookies("workforce", headers, nextCookies),
    getHeaders: nextHeaders,
    clearCookies: () => clearRealmCookies(nextCookies, "workforce"),
  });
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
    commitCookies: (realm, headers) =>
      commitResponseCookies(realm, headers, nextCookies),
    getHeaders: nextHeaders,
    getCookieStore: nextCookies,
    rateLimiter: createDatabaseAuthRateLimiter(),
  });
}
