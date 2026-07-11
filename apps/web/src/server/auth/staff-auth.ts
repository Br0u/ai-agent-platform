import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  betterAuth,
  type BetterAuthOptions,
  type DBAdapterInstance,
} from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { twoFactor, username } from "better-auth/plugins";

import {
  betterAuthAdapterSchema,
  betterAuthModels,
  getDatabase,
} from "@ai-agent-platform/database";

import {
  createSharedAuthOptions,
  type AuthEnvironment,
} from "./shared-options";

const DISABLED_BACKUP_CODE_ENDPOINTS = [
  "/two-factor/generate-backup-codes",
  "/two-factor/view-backup-codes",
  "/two-factor/verify-backup-code",
] as const;

function generateNoBuiltInBackupCodes(): string[] {
  return [];
}

export const staffTwoFactorPolicy = {
  issuer: "AI Agent Platform",
  skipVerificationOnEnable: false,
  accountLockout: {
    enabled: true,
    maxFailedAttempts: 10,
    durationSeconds: 15 * 60,
  },
  backupCodeOptions: {
    // Better Auth 1.6.23 cannot hash backup codes. An encrypted empty array
    // satisfies its internal schema while project-owned hashed recovery codes
    // are implemented in Task 9.
    storeBackupCodes: "encrypted",
    customBackupCodesGenerate: generateNoBuiltInBackupCodes,
  },
  schema: {
    twoFactor: {
      modelName: "twoFactor",
      fields: {
        secret: betterAuthModels.twoFactor.fields.secret,
        backupCodes: betterAuthModels.twoFactor.fields.backupCodes,
        userId: betterAuthModels.twoFactor.fields.userId,
        verified: betterAuthModels.twoFactor.fields.verified,
        failedVerificationCount:
          betterAuthModels.twoFactor.fields.failedVerificationCount,
        lockedUntil: betterAuthModels.twoFactor.fields.lockedUntil,
      },
    },
  },
} satisfies NonNullable<Parameters<typeof twoFactor>[0]>;

export const staffRealm = {
  realm: "workforce",
  basePath: "/api/auth/staff",
  cookieName: "aap_staff_session",
  maxAgeSeconds: 8 * 60 * 60,
  mountGenericRouteHandler: false,
  builtInBackupCodesDisabled: true,
  generateBuiltInBackupCodes: generateNoBuiltInBackupCodes,
  projectActionsTrustDevice: false,
  blockedAuthPaths: DISABLED_BACKUP_CODE_ENDPOINTS,
  endpoints: {
    allowed: [
      "/sign-in/email",
      "/sign-in/username",
      "/sign-out",
      "/get-session",
      "/two-factor/enable",
      "/two-factor/verify-totp",
      "/two-factor/disable",
    ],
    denied: ["/sign-up/email", ...DISABLED_BACKUP_CODE_ENDPOINTS],
  },
} as const;

type StaffAuthDependencies = {
  env?: AuthEnvironment;
  db?: ReturnType<typeof getDatabase>;
  adapter?: DBAdapterInstance;
};

function resolveAdapter(
  dependencies: StaffAuthDependencies,
): DBAdapterInstance {
  return (
    dependencies.adapter ??
    drizzleAdapter(dependencies.db ?? getDatabase(), {
      provider: "pg",
      schema: betterAuthAdapterSchema,
      usePlural: false,
    })
  );
}

export function createStaffAuthOptions(
  dependencies: StaffAuthDependencies = {},
) {
  const shared = createSharedAuthOptions(staffRealm, {
    env: dependencies.env,
    adapter: resolveAdapter(dependencies),
  });
  return {
    ...shared,
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 128,
      }),
      twoFactor(staffTwoFactorPolicy),
      nextCookies(),
    ],
  } satisfies BetterAuthOptions;
}

export function createStaffAuth(dependencies: StaffAuthDependencies = {}) {
  const auth = betterAuth(createStaffAuthOptions(dependencies));
  const {
    generateBackupCodes,
    verifyBackupCode,
    viewBackupCodes,
    ...projectApi
  } = auth.api;
  void generateBackupCodes;
  void verifyBackupCode;
  void viewBackupCodes;

  return { ...auth, api: projectApi };
}

let staffAuthSingleton: ReturnType<typeof createStaffAuth> | undefined;

export function getStaffAuth(): ReturnType<typeof createStaffAuth> {
  staffAuthSingleton ??= createStaffAuth();
  return staffAuthSingleton;
}
