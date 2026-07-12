import "server-only";

import {
  createHash,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";

import { and, eq, ne } from "drizzle-orm";
import { cookies as nextCookies, headers as nextHeaders } from "next/headers";
import { ResponseCookies } from "next/dist/server/web/spec-extension/cookies";
import { z } from "zod";

import {
  getDatabase,
  auditLogs,
  normalizeIdentityEmail,
  normalizeWorkforceUsername,
  sessions,
  twoFactors,
  users,
  type IdentityRealm,
  type UserStatus,
} from "@ai-agent-platform/database";

import type { AuthActionState } from "@/contracts/auth-action-state";

export {
  AUTH_ACTION_INITIAL_STATE,
  type AuthActionState,
} from "@/contracts/auth-action-state";

import { createAuditWriter, type AuditWriteInput } from "./audit";
import { createCustomerAuth } from "./customer-auth";
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
  twoFactorEnabled: boolean;
};

type SignInResult =
  | { user: { id: string }; token: string }
  | { twoFactorRedirect: true; twoFactorMethods: string[] };

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

type RecoveryCodeRepository = {
  read(userId: string): Promise<string>;
  write(userId: string, serializedHashes: string): Promise<void>;
  writeUsedAudit?(userId: string): Promise<void>;
};

function recoveryCodeHash(code: string): string {
  return createHash("sha256")
    .update(code.normalize("NFKC").trim(), "utf8")
    .digest("hex");
}

function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createRecoveryCodeService(dependencies: {
  randomBytes?: () => Buffer;
  transaction<T>(
    work: (repository: RecoveryCodeRepository) => Promise<T>,
  ): Promise<T>;
}) {
  const randomBytes = dependencies.randomBytes ?? (() => nodeRandomBytes(10));
  return {
    async generate(userId: string, count = 10): Promise<string[]> {
      if (!Number.isSafeInteger(count) || count < 1 || count > 20)
        throw new Error("Invalid recovery code count");
      const codes = Array.from({ length: count }, () => {
        const value = randomBytes()
          .toString("hex")
          .toUpperCase()
          .slice(0, 20)
          .padEnd(20, "0");
        return `${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}-${value.slice(15, 20)}`;
      });
      await dependencies.transaction((repository) =>
        repository.write(userId, JSON.stringify(codes.map(recoveryCodeHash))),
      );
      return codes;
    },
    async verifyAndConsume(userId: string, code: string): Promise<boolean> {
      const candidate = recoveryCodeHash(code);
      return dependencies.transaction(async (repository) => {
        let hashes: unknown;
        try {
          hashes = JSON.parse(await repository.read(userId));
        } catch {
          return false;
        }
        if (
          !Array.isArray(hashes) ||
          !hashes.every(
            (value) =>
              typeof value === "string" && /^[a-f0-9]{64}$/u.test(value),
          )
        )
          return false;
        const index = hashes.findIndex((hash) => hashesEqual(hash, candidate));
        if (index < 0) return false;
        hashes.splice(index, 1);
        await repository.write(userId, JSON.stringify(hashes));
        await repository.writeUsedAudit?.(userId);
        return true;
      });
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
  enableTwoFactor(input: {
    password: string;
    headers: Headers;
  }): Promise<StagedResponse<{ totpURI: string; backupCodes: string[] }>>;
  verifyTOTP(input: {
    code: string;
    trustDevice: false;
    headers: Headers;
  }): Promise<StagedResponse<{ token: string; user: { id: string } }>>;
  disableTwoFactor(input: {
    password: string;
    headers: Headers;
  }): Promise<StagedResponse<{ status: boolean }>>;
  signIn(input: {
    identifier: string;
    password: string;
    rememberMe: false;
    headers: Headers;
  }): Promise<StagedResponse<SignInResult>>;
  revokeNewSession(token: string): Promise<void>;
};

type StaffSecurityRepository = {
  current(): Promise<{
    userId: string;
    sessionId: string;
    mustChangePassword: boolean;
  } | null>;
  clearMustChangePasswordAndRevokeOthers(
    userId: string,
    sessionToken: string,
  ): Promise<number>;
  revokeSession(sessionId: string): Promise<void>;
  readMustChangePassword(userId: string): Promise<boolean>;
  writeAudit(
    event: "auth.password_changed" | "auth.totp_enabled" | "auth.totp_disabled",
    userId: string,
    metadata?: { sessionsRevoked: number },
  ): Promise<void>;
};

export type StaffSecurityActionState =
  | { kind: "idle" }
  | { kind: "error"; code: "AUTH_INVALID_INPUT" | "AUTH_INVALID_CREDENTIALS" }
  | { kind: "success"; redirectTo: string }
  | {
      kind: "enrollment";
      totpURI: string;
      recoveryCodes: string[];
      qrDataUrl?: string;
    };

export const STAFF_SECURITY_ACTION_INITIAL_STATE: StaffSecurityActionState = {
  kind: "idle",
};

function stagedChallengeHeaders(request: Headers, response: Headers): Headers {
  const result = new Headers(request);
  const responseCookies = new ResponseCookies(response).getAll();
  const cookiePairs = responseCookies.map(
    ({ name, value }) => `${name}=${value}`,
  );
  if (cookiePairs.length > 0)
    result.set(
      "cookie",
      [request.get("cookie"), ...cookiePairs].filter(Boolean).join("; "),
    );
  return result;
}

function createDefaultRecoveryCodeService() {
  const database = getDatabase();
  return createRecoveryCodeService({
    transaction: (work) =>
      database.transaction(async (transaction) =>
        work({
          async read(userId) {
            const [row] = await transaction
              .select({ backupCodes: twoFactors.backupCodes })
              .from(twoFactors)
              .where(eq(twoFactors.userId, userId))
              .for("update")
              .limit(1);
            return row?.backupCodes ?? "[]";
          },
          async write(userId, serializedHashes) {
            const updated = await transaction
              .update(twoFactors)
              .set({ backupCodes: serializedHashes })
              .where(eq(twoFactors.userId, userId))
              .returning({ id: twoFactors.id });
            if (updated.length !== 1)
              throw new Error("TOTP enrollment is missing");
          },
          async writeUsedAudit(userId) {
            await transaction.insert(auditLogs).values({
              actorRealm: "workforce",
              actorUserId: userId,
              action: "auth.recovery_code_used",
              targetType: "user",
              targetId: userId,
              metadata: {},
            });
          },
        }),
      ),
  });
}

let recoveryCodeServiceSingleton:
  | ReturnType<typeof createRecoveryCodeService>
  | undefined;

function getDefaultRecoveryCodeService() {
  recoveryCodeServiceSingleton ??= createDefaultRecoveryCodeService();
  return recoveryCodeServiceSingleton;
}

export async function generateRecoveryCodes(userId: string): Promise<string[]> {
  return getDefaultRecoveryCodeService().generate(userId);
}

export async function verifyAndConsumeRecoveryCode(
  userId: string,
  code: string,
): Promise<boolean> {
  return getDefaultRecoveryCodeService().verifyAndConsume(userId, code);
}

export function createDefaultStaffSecurityActions() {
  const database = getDatabase();
  const auth = getStaffActionAuth();
  const audit = createAuditWriter();
  async function currentHeaders() {
    return nextHeaders();
  }
  const repository: StaffSecurityRepository = {
    async current() {
      const value = await auth.api.getSession({
        headers: await currentHeaders(),
      });
      if (!value || typeof value !== "object") return null;
      const envelope = value as Record<string, unknown>;
      const session = envelope.session as Record<string, unknown> | undefined;
      const user = envelope.user as Record<string, unknown> | undefined;
      if (
        !session ||
        !user ||
        typeof session.id !== "string" ||
        typeof user.id !== "string"
      )
        return null;
      return {
        userId: user.id,
        sessionId: session.id,
        mustChangePassword: user.mustChangePassword === true,
      };
    },
    async clearMustChangePasswordAndRevokeOthers(userId, sessionToken) {
      return database.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ mustChangePassword: false, updatedAt: new Date() })
          .where(
            and(eq(users.id, userId), eq(users.identityRealm, "workforce")),
          );
        const revoked = await tx
          .delete(sessions)
          .where(
            and(eq(sessions.userId, userId), ne(sessions.token, sessionToken)),
          )
          .returning({ id: sessions.id });
        return revoked.length;
      });
    },
    async revokeSession(sessionId) {
      await database.delete(sessions).where(eq(sessions.id, sessionId));
    },
    async readMustChangePassword(userId) {
      const [row] = await database
        .select({ value: users.mustChangePassword })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.identityRealm, "workforce")))
        .limit(1);
      if (!row) throw new Error("Workforce identity not found");
      return row.value;
    },
    async writeAudit(event, userId, metadata) {
      await audit.write({
        event,
        actor: { realm: "workforce", userId },
        target: { type: "user", id: userId },
        ...(event === "auth.password_changed"
          ? { metadata: metadata ?? { sessionsRevoked: 0 } }
          : {}),
      } as AuditWriteInput);
    },
  };
  const gateway: StaffSecurityGateway = {
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
    async enableTwoFactor(input) {
      const result = await auth.api.enableTwoFactor({
        body: { password: input.password },
        headers: input.headers,
        returnHeaders: true,
      });
      return { response: result.response, headers: result.headers };
    },
    async verifyTOTP(input) {
      const result = await auth.api.verifyTOTP({
        body: { code: input.code, trustDevice: false },
        headers: input.headers,
        returnHeaders: true,
      });
      return {
        response: result.response as { token: string; user: { id: string } },
        headers: result.headers,
      };
    },
    async disableTwoFactor(input) {
      const result = await auth.api.disableTwoFactor({
        body: { password: input.password },
        headers: input.headers,
        returnHeaders: true,
      });
      return { response: result.response, headers: result.headers };
    },
    async signIn(input) {
      const identifier = input.identifier;
      const result = identifier.includes("@")
        ? await auth.api.signInEmail({
            body: {
              email: normalizeIdentityEmail(identifier),
              password: input.password,
              rememberMe: false,
            },
            headers: input.headers,
            returnHeaders: true,
          })
        : await auth.api.signInUsername({
            body: {
              username: normalizeWorkforceUsername(identifier),
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
    async revokeNewSession(token) {
      const context = await auth.$context;
      await context.internalAdapter.deleteSession(token);
    },
  };
  return createStaffSecurityActions({
    gateway,
    repository,
    recovery: getDefaultRecoveryCodeService(),
    commitCookies: (headers) =>
      commitResponseCookies("workforce", headers, nextCookies),
    getHeaders: currentHeaders,
  });
}

export function createStaffSecurityActions(dependencies: {
  gateway: StaffSecurityGateway;
  repository: StaffSecurityRepository;
  recovery: { generate(userId: string): Promise<string[]> };
  commitCookies(headers: Headers): Promise<void>;
  getHeaders(): Promise<Headers>;
}) {
  async function current() {
    const value = await dependencies.repository.current();
    if (!value) throw new Error("No staff session");
    return value;
  }
  return {
    async changePassword(
      formData: FormData,
    ): Promise<StaffSecurityActionState> {
      const currentPassword = stringField(formData, "currentPassword");
      const newPassword = stringField(formData, "newPassword");
      if (!currentPassword || !newPassword)
        return { kind: "error", code: "AUTH_INVALID_INPUT" };
      try {
        const session = await current();
        const staged = await dependencies.gateway.changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
          headers: await dependencies.getHeaders(),
        });
        if (typeof staged.response.token !== "string")
          throw new Error(
            "Password change did not create a replacement session",
          );
        const revoked =
          await dependencies.repository.clearMustChangePasswordAndRevokeOthers(
            session.userId,
            staged.response.token,
          );
        await dependencies.repository.writeAudit(
          "auth.password_changed",
          session.userId,
          { sessionsRevoked: revoked },
        );
        await dependencies.commitCookies(staged.headers);
        return { kind: "success", redirectTo: "/staff/two-factor" };
      } catch {
        return { kind: "error", code: "AUTH_INVALID_CREDENTIALS" };
      }
    },
    async enrollTwoFactor(
      formData: FormData,
    ): Promise<StaffSecurityActionState> {
      const password = stringField(formData, "password");
      if (!password) return { kind: "error", code: "AUTH_INVALID_INPUT" };
      try {
        const session = await current();
        const staged = await dependencies.gateway.enableTwoFactor({
          password,
          headers: await dependencies.getHeaders(),
        });
        if (
          staged.response.backupCodes.length !== 0 ||
          !staged.response.totpURI.startsWith("otpauth://")
        )
          throw new Error("Unexpected two-factor enrollment response");
        const recoveryCodes = await dependencies.recovery.generate(
          session.userId,
        );
        return {
          kind: "enrollment",
          totpURI: staged.response.totpURI,
          recoveryCodes,
        };
      } catch {
        return { kind: "error", code: "AUTH_INVALID_CREDENTIALS" };
      }
    },
    async verifyTwoFactor(
      formData: FormData,
    ): Promise<StaffSecurityActionState> {
      const code = stringField(formData, "code");
      if (!code || !/^\d{6}$/u.test(code))
        return { kind: "error", code: "AUTH_INVALID_INPUT" };
      let staged:
        | StagedResponse<{ token: string; user: { id: string } }>
        | undefined;
      try {
        const enrollmentSession = await dependencies.repository
          .current()
          .catch(() => null);
        staged = await dependencies.gateway.verifyTOTP({
          code,
          trustDevice: false,
          headers: await dependencies.getHeaders(),
        });
        const mustChange = await dependencies.repository.readMustChangePassword(
          staged.response.user.id,
        );
        if (enrollmentSession?.userId === staged.response.user.id) {
          await dependencies.repository.writeAudit(
            "auth.totp_enabled",
            staged.response.user.id,
          );
        }
        await dependencies.commitCookies(staged.headers);
        return {
          kind: "success",
          redirectTo: mustChange
            ? "/staff/change-password"
            : safeReturnPath("workforce", stringField(formData, "returnTo")),
        };
      } catch {
        if (staged)
          await dependencies.gateway
            .revokeNewSession(staged.response.token)
            .catch(() => undefined);
        return { kind: "error", code: "AUTH_INVALID_CREDENTIALS" };
      }
    },
    async reauthenticate(
      formData: FormData,
    ): Promise<StaffSecurityActionState> {
      const identifier = stringField(formData, "identifier");
      const password = stringField(formData, "password");
      const code = stringField(formData, "code");
      if (!identifier || !password || !code || !/^\d{6}$/u.test(code))
        return { kind: "error", code: "AUTH_INVALID_INPUT" };
      let newSessionToken: string | undefined;
      try {
        const old = await current();
        await dependencies.repository.revokeSession(old.sessionId);
        const requestHeaders = await dependencies.getHeaders();
        const passwordStage = await dependencies.gateway.signIn({
          identifier: identifier.normalize("NFKC").trim().toLowerCase(),
          password,
          rememberMe: false,
          headers: requestHeaders,
        });
        if (isFullSession(passwordStage.response))
          throw new Error("Re-authentication requires TOTP");
        const totpStage = await dependencies.gateway.verifyTOTP({
          code,
          trustDevice: false,
          headers: stagedChallengeHeaders(
            requestHeaders,
            passwordStage.headers,
          ),
        });
        newSessionToken = totpStage.response.token;
        await dependencies.repository.readMustChangePassword(
          totpStage.response.user.id,
        );
        await dependencies.commitCookies(totpStage.headers);
        return {
          kind: "success",
          redirectTo: safeReturnPath(
            "workforce",
            stringField(formData, "returnTo"),
          ),
        };
      } catch {
        if (newSessionToken)
          await dependencies.gateway
            .revokeNewSession(newSessionToken)
            .catch(() => undefined);
        return { kind: "error", code: "AUTH_INVALID_CREDENTIALS" };
      }
    },
  };
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

const STAFF_CHALLENGE_COOKIES = [
  "better-auth.two_factor",
  "__Secure-better-auth.two_factor",
] as const;

function realmCookieNames(realm: IdentityRealm): readonly string[] {
  return realm === "customer"
    ? [CUSTOMER_COOKIE]
    : [STAFF_COOKIE, ...STAFF_CHALLENGE_COOKIES];
}

async function clearRealmCookies(
  getCookieStore: AuthActionDependencies["getCookieStore"],
  realm: IdentityRealm,
): Promise<void> {
  const store = await getCookieStore();
  const errors: Error[] = [];
  for (const name of realmCookieNames(realm)) {
    try {
      store.delete(name);
    } catch {
      errors.push(new Error(`Failed to clear ${realm} cookie`));
    }
  }
  if (errors.length > 0)
    throw new AggregateError(errors, "Cookie clear failed");
}

export async function commitResponseCookies(
  realm: IdentityRealm,
  headers: Headers,
  getCookieStore: AuthActionDependencies["getCookieStore"],
): Promise<void> {
  const allowed = new Set(realmCookieNames(realm));
  const cookies = new ResponseCookies(headers)
    .getAll()
    .filter((cookie) => allowed.has(cookie.name));
  if (cookies.length === 0) {
    throw new Error(`Authentication response is missing a ${realm} cookie`);
  }
  const store = await getCookieStore();
  for (const cookie of cookies) store.set(cookie);
}

async function cleanNewSession(
  gateway: Pick<CustomerGateway, "revokeNewSession">,
  token: string,
  getCookieStore: AuthActionDependencies["getCookieStore"],
  realm: IdentityRealm,
  reportInternalError: AuthActionDependencies["reportInternalError"],
) {
  const cleanupErrors: Error[] = [];
  try {
    await gateway.revokeNewSession(token);
  } catch {
    cleanupErrors.push(new Error("Session revocation failed"));
  }
  try {
    await clearRealmCookies(getCookieStore, realm);
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
  function reportInternal(errors: Error[], message: string) {
    if (errors.length === 0) return;
    try {
      dependencies.reportInternalError(new AggregateError(errors, message));
    } catch {
      // Diagnostics must never change a public authentication result.
    }
  }
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

    let staged: StagedResponse<SignInResult>;
    try {
      staged = await dependencies.customer.signInEmail({
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

    const result = staged.response;
    if (!isFullSession(result)) {
      return invalidCredentials();
    }

    try {
      const user = await dependencies.users.findById(result.user.id);
      if (!user || user.realm !== "customer" || user.status === "disabled") {
        await cleanNewSession(
          dependencies.customer,
          result.token,
          dependencies.getCookieStore,
          "customer",
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
        result.token,
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
      try {
        await auditFailure(headers, "invalid_credentials");
      } catch {
        // Do not leak raw Better Auth or audit errors.
      }
      return invalidCredentials();
    }

    const result = staged.response;
    const returnTo = safeReturnPath("workforce", parsed.data.returnTo);
    if (!isFullSession(result)) {
      try {
        await dependencies.commitCookies("workforce", staged.headers);
        return {
          kind: "success",
          redirectTo: `/staff/two-factor?returnTo=${encodeURIComponent(returnTo)}`,
        };
      } catch {
        try {
          await clearRealmCookies(dependencies.getCookieStore, "workforce");
        } catch {
          // No staged cookie was intentionally committed.
        }
        return invalidCredentials();
      }
    }

    try {
      const user = await dependencies.users.findById(result.user.id);
      if (!user || user.realm !== "workforce" || user.status !== "active") {
        await cleanNewSession(
          dependencies.staff,
          result.token,
          dependencies.getCookieStore,
          "workforce",
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

      await dependencies.commitCookies("workforce", staged.headers);

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
    const errors: Error[] = [];
    let stagedHeaders: Headers | undefined;
    let serverRevoked = false;
    try {
      const result = await gateway.signOut({ headers });
      stagedHeaders = result.headers;
      if (result.response.success === true) {
        serverRevoked = true;
      } else {
        errors.push(new Error("Server session revocation was not confirmed"));
      }
    } catch {
      errors.push(new Error("Server session revocation failed"));
    }
    let committedExpiry = false;
    if (stagedHeaders) {
      try {
        await dependencies.commitCookies(realm, stagedHeaders);
        committedExpiry = true;
      } catch {
        errors.push(new Error("Logout cookie commit failed"));
      }
    }
    let clearedLocally = false;
    try {
      await clearRealmCookies(dependencies.getCookieStore, realm);
      clearedLocally = true;
    } catch {
      errors.push(new Error("Local logout cookie clear failed"));
    }
    if (serverRevoked) {
      try {
        await dependencies.audit.write({
          event: "auth.logout",
          target: { type: "session" },
          ...requestAuditContext(headers),
        });
      } catch {
        errors.push(new Error("Logout audit failed"));
      }
    }
    reportInternal(errors, "Logout completed with failures");
    if (!serverRevoked || (!committedExpiry && !clearedLocally)) {
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

  function toLoginUser(
    found: typeof users.$inferSelect | undefined,
  ): LoginUser | null {
    if (!found) return null;
    return {
      id: found.id,
      realm: found.identityRealm,
      status: found.status,
      mustChangePassword: found.mustChangePassword,
      twoFactorEnabled: found.twoFactorEnabled,
    };
  }

  return {
    async findById(id) {
      return toLoginUser(
        await database.query.users.findFirst({
          where: eq(users.id, id),
        }),
      );
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
      const context = await getCustomerActionAuth().$context;
      await context.internalAdapter.deleteSession(token);
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
      const context = await getStaffActionAuth().$context;
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
    commitCookies: (realm, headers) =>
      commitResponseCookies(realm, headers, nextCookies),
    getHeaders: nextHeaders,
    getCookieStore: nextCookies,
  });
}
