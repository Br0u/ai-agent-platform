import { isIP } from "node:net";

import type { BetterAuthOptions, DBAdapterInstance } from "better-auth";

import {
  betterAuthModels,
  hashPassword,
  verifyPassword,
} from "@ai-agent-platform/database";

import { AuthGuardError } from "./errors";

export type AuthEnvironment = {
  NODE_ENV?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  TRUST_NGINX_PROXY?: string;
  NGINX_TRUSTED_PROXY_CIDRS?: string;
};

export type IdentityRealm = "customer" | "workforce";

export type RealmDescriptor = {
  realm: IdentityRealm;
  basePath: string;
  cookieName: string;
  maxAgeSeconds: number;
};

export type ResolvedAuthEnvironment = {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  secureCookies: boolean;
  ipAddressHeaders: string[];
  trustedProxies: string[];
};

export type AuthOptionsDependencies = {
  env?: AuthEnvironment;
  adapter: DBAdapterInstance;
};

type SessionInput = {
  userId: string;
  [key: string]: unknown;
};

type AuthoritativeUser = {
  id: string;
  identityRealm: IdentityRealm;
  status: "pending_review" | "active" | "disabled" | "rejected";
};

function parseOrigin(value: string, name: string, production: boolean): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must contain an origin without a path`);
  }
  if (production && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }

  return url.origin;
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function parseTrustedProxyEntry(entry: string, index: number): string {
  const name = `NGINX_TRUSTED_PROXY_CIDRS[${index}]`;
  const parts = entry.split("/");
  if (parts.length > 2) throw new Error(`${name} is not a valid IP or CIDR`);

  const address = parts[0];
  const version = isIP(address);
  if (version === 0) throw new Error(`${name} is not a valid IP or CIDR`);

  const prefix = parts[1];
  if (prefix === undefined) return entry;

  const maxPrefix = version === 4 ? 32 : 128;
  if (!/^\d+$/.test(prefix) || Number(prefix) > maxPrefix) {
    throw new Error(`${name} has an invalid CIDR prefix`);
  }

  return entry;
}

function parseTrustedProxies(value: string): string[] {
  return value.split(",").map((rawEntry, index) => {
    const entry = rawEntry.trim();
    if (!entry) {
      throw new Error(`NGINX_TRUSTED_PROXY_CIDRS[${index}] is empty`);
    }
    return parseTrustedProxyEntry(entry, index);
  });
}

export function resolveAuthEnvironment(
  env: AuthEnvironment = process.env,
): ResolvedAuthEnvironment {
  const production = env.NODE_ENV === "production";
  const secret = required(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET");
  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }

  const baseURL = parseOrigin(
    required(env.BETTER_AUTH_URL, "BETTER_AUTH_URL"),
    "BETTER_AUTH_URL",
    production,
  );
  const rawTrustedOrigins = required(
    env.BETTER_AUTH_TRUSTED_ORIGINS,
    "BETTER_AUTH_TRUSTED_ORIGINS",
  );
  const trustedOrigins = rawTrustedOrigins
    .split(",")
    .map((origin, index) =>
      parseOrigin(
        origin.trim(),
        `BETTER_AUTH_TRUSTED_ORIGINS[${index}]`,
        production,
      ),
    );

  const trustNginxProxy = env.TRUST_NGINX_PROXY === "true";
  const trustedProxies = trustNginxProxy
    ? parseTrustedProxies(
        required(env.NGINX_TRUSTED_PROXY_CIDRS, "NGINX_TRUSTED_PROXY_CIDRS"),
      )
    : [];

  return {
    baseURL,
    secret,
    trustedOrigins: [...new Set([baseURL, ...trustedOrigins])],
    secureCookies: production,
    ipAddressHeaders: trustNginxProxy ? ["x-real-ip"] : [],
    trustedProxies,
  };
}

function asAuthoritativeUser(value: unknown): AuthoritativeUser | undefined {
  if (!value || typeof value !== "object") return undefined;

  const user = value as Record<string, unknown>;
  if (
    typeof user.id !== "string" ||
    (user.identityRealm !== "customer" && user.identityRealm !== "workforce") ||
    (user.status !== "pending_review" &&
      user.status !== "active" &&
      user.status !== "disabled" &&
      user.status !== "rejected")
  ) {
    return undefined;
  }

  return {
    id: user.id,
    identityRealm: user.identityRealm,
    status: user.status,
  };
}

export function createRealmSessionGuard(
  realm: IdentityRealm,
  findUserById: (userId: string) => Promise<unknown>,
): (session: SessionInput) => Promise<SessionInput & { realm: IdentityRealm }> {
  return async (session) => {
    const user = asAuthoritativeUser(await findUserById(session.userId));
    if (!user) throw new AuthGuardError("AUTH_USER_NOT_FOUND");
    if (user.identityRealm !== realm) {
      throw new AuthGuardError("AUTH_REALM_MISMATCH");
    }
    if (user.status === "disabled") {
      throw new AuthGuardError("AUTH_ACCOUNT_DISABLED");
    }
    if (realm === "workforce" && user.status !== "active") {
      throw new AuthGuardError("AUTH_ACCOUNT_NOT_ACTIVE");
    }

    return { ...session, realm };
  };
}

export function createSharedAuthOptions(
  descriptor: RealmDescriptor,
  dependencies: AuthOptionsDependencies,
) {
  const resolved = resolveAuthEnvironment(dependencies.env);

  return {
    appName: "AI Agent Platform",
    baseURL: resolved.baseURL,
    basePath: descriptor.basePath,
    secret: resolved.secret,
    database: dependencies.adapter,
    trustedOrigins: resolved.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }: { hash: string; password: string }) =>
          verifyPassword(hash, password),
      },
    },
    user: {
      modelName: "user",
      fields: {
        name: betterAuthModels.user.fields.name,
        email: betterAuthModels.user.fields.email,
        emailVerified: betterAuthModels.user.fields.emailVerified,
        image: betterAuthModels.user.fields.image,
        createdAt: betterAuthModels.user.fields.createdAt,
        updatedAt: betterAuthModels.user.fields.updatedAt,
      },
      additionalFields: {
        identityRealm: {
          type: "string",
          required: true,
          input: false,
          fieldName: betterAuthModels.user.fields.identityRealm,
        },
        status: {
          type: "string",
          required: true,
          input: false,
          fieldName: betterAuthModels.user.fields.status,
        },
        emailVerificationStatus: {
          type: "string",
          required: true,
          input: false,
          fieldName: betterAuthModels.user.fields.emailVerificationStatus,
        },
        mustChangePassword: {
          type: "boolean",
          required: true,
          input: false,
          fieldName: betterAuthModels.user.fields.mustChangePassword,
        },
        lastLoginAt: {
          type: "date",
          required: false,
          input: false,
          fieldName: betterAuthModels.user.fields.lastLoginAt,
        },
      },
    },
    session: {
      modelName: "session",
      expiresIn: descriptor.maxAgeSeconds,
      cookieCache: { enabled: false },
      fields: {
        expiresAt: betterAuthModels.session.fields.expiresAt,
        token: betterAuthModels.session.fields.token,
        createdAt: betterAuthModels.session.fields.createdAt,
        updatedAt: betterAuthModels.session.fields.updatedAt,
        ipAddress: betterAuthModels.session.fields.ipAddress,
        userAgent: betterAuthModels.session.fields.userAgent,
        userId: betterAuthModels.session.fields.userId,
      },
      additionalFields: {
        realm: {
          type: "string",
          required: true,
          input: false,
          fieldName: betterAuthModels.session.fields.realm,
        },
        mfaVerifiedAt: {
          type: "date",
          required: false,
          input: false,
          fieldName: betterAuthModels.session.fields.mfaVerifiedAt,
        },
      },
    },
    account: {
      modelName: "account",
      fields: {
        accountId: betterAuthModels.account.fields.accountId,
        providerId: betterAuthModels.account.fields.providerId,
        userId: betterAuthModels.account.fields.userId,
        accessToken: betterAuthModels.account.fields.accessToken,
        refreshToken: betterAuthModels.account.fields.refreshToken,
        idToken: betterAuthModels.account.fields.idToken,
        accessTokenExpiresAt:
          betterAuthModels.account.fields.accessTokenExpiresAt,
        refreshTokenExpiresAt:
          betterAuthModels.account.fields.refreshTokenExpiresAt,
        scope: betterAuthModels.account.fields.scope,
        password: betterAuthModels.account.fields.password,
        createdAt: betterAuthModels.account.fields.createdAt,
        updatedAt: betterAuthModels.account.fields.updatedAt,
      },
    },
    verification: {
      modelName: "verification",
      fields: {
        identifier: betterAuthModels.verification.fields.identifier,
        value: betterAuthModels.verification.fields.value,
        expiresAt: betterAuthModels.verification.fields.expiresAt,
        createdAt: betterAuthModels.verification.fields.createdAt,
        updatedAt: betterAuthModels.verification.fields.updatedAt,
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      fields: {
        key: betterAuthModels.rateLimit.fields.key,
        count: betterAuthModels.rateLimit.fields.count,
        lastRequest: betterAuthModels.rateLimit.fields.lastRequest,
      },
    },
    advanced: {
      useSecureCookies: resolved.secureCookies,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      trustedProxyHeaders: false,
      ipAddress: {
        ipAddressHeaders: resolved.ipAddressHeaders,
        trustedProxies: resolved.trustedProxies,
      },
      cookies: {
        session_token: {
          name: descriptor.cookieName,
          attributes: {
            httpOnly: true,
            sameSite: "lax",
            secure: resolved.secureCookies,
            path: "/",
          },
        },
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: resolved.secureCookies,
        path: "/",
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            if (!context) throw new AuthGuardError("AUTH_USER_NOT_FOUND");
            const guard = createRealmSessionGuard(descriptor.realm, (userId) =>
              context.context.internalAdapter.findUserById(userId),
            );
            return { data: await guard(session) };
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}
