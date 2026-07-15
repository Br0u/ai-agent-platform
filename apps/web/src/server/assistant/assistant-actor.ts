import "server-only";

import { createAccessService, type Actor } from "@/server/auth/access";
import { customerSessionCookieNames } from "@/server/auth/customer-realm";

export type AssistantActor =
  | { kind: "anonymous" }
  | { kind: "customer"; userId: string };

type GetCurrentCustomer = (headers: Headers) => Promise<Actor | null>;

type AssistantActorResolverDependencies = {
  getCurrentCustomer?: GetCurrentCustomer;
};

const CUSTOMER_SESSION_COOKIE_NAMES: ReadonlySet<string> = new Set(
  customerSessionCookieNames,
);

function hasCustomerSessionCookie(headers: Headers): boolean {
  return (headers.get("cookie") ?? "").split(";").some((part) => {
    const separator = part.indexOf("=");
    return (
      separator > 0 &&
      CUSTOMER_SESSION_COOKIE_NAMES.has(part.slice(0, separator).trim())
    );
  });
}

async function getCurrentCustomer(headers: Headers): Promise<Actor | null> {
  return createAccessService({
    getHeaders: async () => headers,
  }).getCurrentActor("customer");
}

export function createAssistantActorResolver(
  dependencies: AssistantActorResolverDependencies = {},
) {
  const resolveCurrentCustomer =
    dependencies.getCurrentCustomer ?? getCurrentCustomer;

  return async function resolveAssistantActor(
    request: Request,
  ): Promise<AssistantActor> {
    if (!hasCustomerSessionCookie(request.headers)) {
      return { kind: "anonymous" };
    }
    const actor = await resolveCurrentCustomer(request.headers);
    if (actor === null) return { kind: "anonymous" };
    if (actor.realm !== "customer") {
      throw new TypeError("Assistant actor must belong to the customer realm");
    }
    return { kind: "customer", userId: actor.userId };
  };
}

export const resolveAssistantActor = createAssistantActorResolver();
