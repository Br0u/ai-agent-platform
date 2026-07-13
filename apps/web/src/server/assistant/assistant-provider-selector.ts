import "server-only";

import type { AgentOSCapability } from "./agentos-client";
import type { AssistantProvider } from "./assistant-provider";

export type AssistantProviderMode = "placeholder" | "agentos";

export type AssistantProviderEnvironment = {
  ASSISTANT_PROVIDER_MODE?: string;
  ASSISTANT_AGENTOS_DEFAULT_AGENT_ID?: string;
};

export type AssistantProviderSettings = {
  mode: AssistantProviderMode;
  defaultAgentId?: string;
};

export function resolveAssistantProviderSettings(
  environment: AssistantProviderEnvironment,
): AssistantProviderSettings {
  const mode = environment.ASSISTANT_PROVIDER_MODE;
  if (mode !== "placeholder" && mode !== "agentos") {
    throw new Error("ASSISTANT_PROVIDER_MODE must be placeholder or agentos");
  }
  const rawAgentId = environment.ASSISTANT_AGENTOS_DEFAULT_AGENT_ID;
  if (rawAgentId !== undefined && rawAgentId !== rawAgentId.trim()) {
    throw new Error("ASSISTANT_AGENTOS_DEFAULT_AGENT_ID is invalid");
  }
  if (
    rawAgentId !== undefined &&
    (!/^[a-z0-9][a-z0-9_-]{0,127}$/u.test(rawAgentId) ||
      rawAgentId.length > 128)
  ) {
    throw new Error("ASSISTANT_AGENTOS_DEFAULT_AGENT_ID is invalid");
  }
  return {
    mode,
    ...(rawAgentId ? { defaultAgentId: rawAgentId } : {}),
  };
}

export function selectAssistantProvider(input: {
  mode: AssistantProviderMode;
  ready: boolean;
  defaultAgentId?: string;
  capability: AgentOSCapability;
  placeholder: AssistantProvider;
  agentos: AssistantProvider;
}): AssistantProvider {
  return input.mode === "agentos" &&
    input.ready &&
    typeof input.defaultAgentId === "string" &&
    /^[a-z0-9][a-z0-9_-]{0,127}$/u.test(input.defaultAgentId) &&
    input.capability === "available"
    ? input.agentos
    : input.placeholder;
}
