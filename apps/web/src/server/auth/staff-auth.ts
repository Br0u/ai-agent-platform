import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  betterAuth,
  type BetterAuthOptions,
  type DBAdapterInstance,
} from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";

import {
  betterAuthAdapterSchema,
  getDatabase,
} from "@ai-agent-platform/database";

import {
  createSharedAuthOptions,
  type AuthEnvironment,
} from "./shared-options";

export const staffRealm = {
  realm: "workforce",
  basePath: "/api/auth/staff",
  cookieName: "aap_staff_session",
  maxAgeSeconds: 8 * 60 * 60,
  mountGenericRouteHandler: false,
  endpoints: {
    allowed: [
      "/sign-in/email",
      "/sign-in/username",
      "/sign-out",
      "/get-session",
    ],
    denied: ["/sign-up/email"],
  },
} as const;

type StaffAuthDependencies = {
  env?: AuthEnvironment;
  db?: ReturnType<typeof getDatabase>;
  adapter?: DBAdapterInstance;
  forwardCookies?: boolean;
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
        usernameNormalization: false,
        usernameValidator: (value) => /^[A-Za-z0-9_.@-]+$/.test(value),
      }),
      ...(dependencies.forwardCookies === false ? [] : [nextCookies()]),
    ],
  } satisfies BetterAuthOptions;
}

export function createStaffAuth(dependencies: StaffAuthDependencies = {}) {
  return betterAuth(createStaffAuthOptions(dependencies));
}

let staffAuthSingleton: ReturnType<typeof createStaffAuth> | undefined;

export function getStaffAuth(): ReturnType<typeof createStaffAuth> {
  staffAuthSingleton ??= createStaffAuth();
  return staffAuthSingleton;
}
