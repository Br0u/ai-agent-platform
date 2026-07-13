import "server-only";

import { createAccessService, type Actor } from "@/server/auth/access";

export type AssistantActor =
  | { kind: "anonymous" }
  | { kind: "customer"; userId: string };

type GetCurrentCustomer = (headers: Headers) => Promise<Actor | null>;

type AssistantActorResolverDependencies = {
  getCurrentCustomer?: GetCurrentCustomer;
};

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
    const actor = await resolveCurrentCustomer(request.headers);
    if (actor === null) return { kind: "anonymous" };
    if (actor.realm !== "customer") {
      throw new TypeError("Assistant actor must belong to the customer realm");
    }
    return { kind: "customer", userId: actor.userId };
  };
}

export const resolveAssistantActor = createAssistantActorResolver();
