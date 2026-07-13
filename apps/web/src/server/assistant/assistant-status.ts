import type { AssistantStatusResponse } from "@/features/assistant/assistant-contract";

export function createPlaceholderAssistantStatus(
  requestId: string,
): AssistantStatusResponse {
  return {
    version: "1",
    requestId,
    live: true,
    ready: false,
    capability: "placeholder",
    message: "模型尚未配置，当前为安全占位模式。",
  };
}
