import "server-only";

import type {
  AssistantProviderReply,
  AssistantRequest,
} from "@/features/assistant/assistant-contract";

export type { AssistantProviderReply } from "@/features/assistant/assistant-contract";

export type AssistantProviderInvocation = {
  request: AssistantRequest;
  session:
    | { kind: "persistent"; internalSessionId: string }
    | { kind: "ephemeral" };
  signal?: AbortSignal;
};

export interface AssistantProvider {
  reply(
    invocation: AssistantProviderInvocation,
  ): Promise<AssistantProviderReply>;
}
