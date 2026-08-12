import "server-only";

import type {
  AssistantProviderReply,
  AssistantRequest,
} from "@/features/assistant/assistant-contract";

export type { AssistantProviderReply } from "@/features/assistant/assistant-contract";

export type AssistantProviderInvocation = {
  request: AssistantRequest;
  signal?: AbortSignal;
};

export interface AssistantProvider {
  reply(
    invocation: AssistantProviderInvocation,
  ): Promise<AssistantProviderReply>;
  streamReply?(invocation: AssistantProviderInvocation): AsyncIterable<string>;
}
