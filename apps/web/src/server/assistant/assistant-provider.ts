import type {
  AssistantRequest,
  AssistantSuccessResponse,
} from "@/features/assistant/assistant-contract";

export interface AssistantProvider {
  reply(request: AssistantRequest): Promise<AssistantSuccessResponse>;
}
