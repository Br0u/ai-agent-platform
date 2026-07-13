import "server-only";

import type {
  AssistantProvider,
  AssistantProviderReply,
} from "./assistant-provider";
import type { AssistantRequest } from "@/features/assistant/assistant-contract";

export class AgentOSAssistantProviderError extends Error {
  readonly code = "assistant_not_configured";

  constructor() {
    super("Assistant is not configured");
    Object.defineProperty(this, "name", {
      value: "AgentOSAssistantProviderError",
      configurable: true,
    });
  }
}

export class AgentOSAssistantProvider implements AssistantProvider {
  async reply(request: AssistantRequest): Promise<AssistantProviderReply> {
    void request;
    throw new AgentOSAssistantProviderError();
  }
}
