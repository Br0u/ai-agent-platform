import type {
  AssistantProviderReply,
  AssistantRequest,
} from "@/features/assistant/assistant-contract";

export type { AssistantProviderReply } from "@/features/assistant/assistant-contract";

export interface AssistantProvider {
  reply(request: AssistantRequest): Promise<AssistantProviderReply>;
}
