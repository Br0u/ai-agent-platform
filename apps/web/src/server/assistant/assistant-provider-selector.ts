import "server-only";

import type { AgentOSCapability } from "./agentos-client";
import type { AssistantProvider } from "./assistant-provider";

export type AssistantProviderMode = "placeholder" | "agentos";

export type AssistantProviderEnvironment = {
  ASSISTANT_PROVIDER_MODE?: string;
  ASSISTANT_AGENTOS_DEFAULT_AGENT_ID?: string | null;
};

export type AssistantProviderSettings =
  | { mode: "placeholder"; defaultAgentId?: never }
  | { mode: "agentos"; defaultAgentId: string };

export function resolveAssistantProviderSettings(
  environment: AssistantProviderEnvironment,
): AssistantProviderSettings {
  const mode = environment.ASSISTANT_PROVIDER_MODE;
  if (mode !== "placeholder" && mode !== "agentos") {
    throw new Error("ASSISTANT_PROVIDER_MODE must be placeholder or agentos");
  }
  if (mode === "placeholder") return { mode };

  const rawAgentId = environment.ASSISTANT_AGENTOS_DEFAULT_AGENT_ID;
  if (
    typeof rawAgentId !== "string" ||
    rawAgentId !== rawAgentId.trim() ||
    !/^[a-z0-9][a-z0-9_-]{0,127}$/u.test(rawAgentId)
  ) {
    throw new Error("ASSISTANT_AGENTOS_DEFAULT_AGENT_ID is invalid");
  }
  return { mode, defaultAgentId: rawAgentId };
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
