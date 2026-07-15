import "server-only";

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
import { customerRealm } from "./customer-realm";

export { customerRealm } from "./customer-realm";

type CustomerAuthDependencies = {
  env?: AuthEnvironment;
  db?: ReturnType<typeof getDatabase>;
  adapter?: DBAdapterInstance;
  forwardCookies?: boolean;
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
    plugins: dependencies.forwardCookies === false ? [] : [nextCookies()],
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
