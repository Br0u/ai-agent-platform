import "server-only";

import type { AgentOSCapability } from "./agentos-client";
import type { AssistantProvider } from "./assistant-provider";

export type AssistantProviderMode = "placeholder" | "agentos";

export type AssistantProviderEnvironment = {
  ASSISTANT_PROVIDER_MODE?: string;
};

export type AssistantProviderSettings = { mode: AssistantProviderMode };

export class AssistantProviderSelectionUnavailableError extends Error {
  readonly code = "ASSISTANT_PROVIDER_SELECTION_UNAVAILABLE";

  constructor() {
    super("Assistant provider selection unavailable");
    Object.defineProperty(this, "name", {
      value: "AssistantProviderSelectionUnavailableError",
      configurable: true,
    });
  }
}

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
  if (input.mode === "placeholder") return input.placeholder;
  if (input.ready && input.capability === "available") return input.agentos;
  throw new AssistantProviderSelectionUnavailableError();
}
