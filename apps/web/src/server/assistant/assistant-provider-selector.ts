import "server-only";

import type { AgentOSCapability } from "./agentos-client";
import type { AssistantProvider } from "./assistant-provider";

export type AssistantProviderMode = "placeholder" | "agentos";

export type AssistantProviderEnvironment = {
  ASSISTANT_PROVIDER_MODE?: string;
};

export type AssistantProviderSettings = { mode: AssistantProviderMode };

export function resolveAssistantProviderSettings(
  environment: AssistantProviderEnvironment,
): AssistantProviderSettings {
  const mode = environment.ASSISTANT_PROVIDER_MODE;
  if (mode !== "placeholder" && mode !== "agentos") {
    throw new Error("ASSISTANT_PROVIDER_MODE must be placeholder or agentos");
  }
  return { mode };
}

export function selectAssistantProvider(input: {
  mode: AssistantProviderMode;
  ready: boolean;
  capability: AgentOSCapability;
  placeholder: AssistantProvider;
  agentos: AssistantProvider;
}): AssistantProvider {
  return input.mode === "agentos" &&
    input.ready &&
    input.capability === "available"
    ? input.agentos
    : input.placeholder;
}
