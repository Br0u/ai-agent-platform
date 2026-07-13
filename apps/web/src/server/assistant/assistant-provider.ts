import type {
  AssistantRequest,
  AssistantSuggestedAction,
} from "@/features/assistant/assistant-contract";

export interface AssistantProviderReply {
  content: string;
  suggestedActions: AssistantSuggestedAction[];
}

export interface AssistantProvider {
  reply(request: AssistantRequest): Promise<AssistantProviderReply>;
}

export function isAssistantProviderReply(
  value: unknown,
): value is AssistantProviderReply {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const reply = value as Record<string, unknown>;
  return (
    Object.keys(reply).sort().join(",") === "content,suggestedActions" &&
    typeof reply.content === "string" &&
    Array.isArray(reply.suggestedActions) &&
    reply.suggestedActions.every((action) => {
      if (
        typeof action !== "object" ||
        action === null ||
        Array.isArray(action)
      ) {
        return false;
      }
      const candidate = action as Record<string, unknown>;
      return (
        Object.keys(candidate).sort().join(",") === "href,label" &&
        typeof candidate.href === "string" &&
        typeof candidate.label === "string"
      );
    })
  );
}
