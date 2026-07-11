import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  betterAuth,
  type BetterAuthOptions,
  type DBAdapterInstance,
} from "better-auth";
import { nextCookies } from "better-auth/next-js";

import {
  betterAuthAdapterSchema,
  getDatabase,
} from "@ai-agent-platform/database";

import {
  createSharedAuthOptions,
  type AuthEnvironment,
} from "./shared-options";

export const customerRealm = {
  realm: "customer",
  basePath: "/api/auth/customer",
  cookieName: "aap_customer_session",
  maxAgeSeconds: 7 * 24 * 60 * 60,
  mountGenericRouteHandler: false,
  endpoints: {
    allowed: ["/sign-in/email", "/sign-out", "/get-session"],
    denied: ["/sign-up/email"],
  },
} as const;

type CustomerAuthDependencies = {
  env?: AuthEnvironment;
  db?: ReturnType<typeof getDatabase>;
  adapter?: DBAdapterInstance;
};

function resolveAdapter(
  dependencies: CustomerAuthDependencies,
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

export function createCustomerAuthOptions(
  dependencies: CustomerAuthDependencies = {},
) {
  const shared = createSharedAuthOptions(customerRealm, {
    env: dependencies.env,
    adapter: resolveAdapter(dependencies),
  });

  return {
    ...shared,
    plugins: [nextCookies()],
  } satisfies BetterAuthOptions;
}

export function createCustomerAuth(
  dependencies: CustomerAuthDependencies = {},
) {
  return betterAuth(createCustomerAuthOptions(dependencies));
}

let customerAuthSingleton: ReturnType<typeof createCustomerAuth> | undefined;

export function getCustomerAuth(): ReturnType<typeof createCustomerAuth> {
  customerAuthSingleton ??= createCustomerAuth();
  return customerAuthSingleton;
}
