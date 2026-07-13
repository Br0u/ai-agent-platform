import { describe, expect, it } from "vitest";

import type { AssistantProvider } from "./assistant-provider";
import {
  resolveAssistantProviderSettings,
  selectAssistantProvider,
} from "./assistant-provider-selector";

const placeholder = {
  reply: async () => ({ content: "p", suggestedActions: [] }),
};
const agentos = { reply: async () => ({ content: "a", suggestedActions: [] }) };

describe("assistant provider selector", () => {
  it.each([
    {
      mode: "placeholder" as const,
      ready: true,
      defaultAgentId: "support-agent",
      capability: "available" as const,
    },
    {
      mode: "agentos" as const,
      ready: false,
      defaultAgentId: "support-agent",
      capability: "available" as const,
    },
    {
      mode: "agentos" as const,
      ready: true,
      defaultAgentId: undefined,
      capability: "available" as const,
    },
    {
      mode: "agentos" as const,
      ready: true,
      defaultAgentId: " ",
      capability: "available" as const,
    },
    {
      mode: "agentos" as const,
      ready: true,
      defaultAgentId: "support-agent",
      capability: "placeholder" as const,
    },
    {
      mode: "agentos" as const,
      ready: true,
      defaultAgentId: "support-agent",
      capability: "degraded" as const,
    },
  ])("returns placeholder unless every non-secret gate is true", (state) => {
    expect(
      selectAssistantProvider({
        ...state,
        placeholder: placeholder as AssistantProvider,
        agentos: agentos as AssistantProvider,
      }),
    ).toBe(placeholder);
  });

  it("selects AgentOS only when explicit mode, readiness, agent ID and capability agree", () => {
    expect(
      selectAssistantProvider({
        mode: "agentos",
        ready: true,
        defaultAgentId: "support-agent",
        capability: "available",
        placeholder: placeholder as AssistantProvider,
        agentos: agentos as AssistantProvider,
      }),
    ).toBe(agentos);
  });

  it("strictly parses the non-sensitive selector configuration", () => {
    expect(
      resolveAssistantProviderSettings({
        ASSISTANT_PROVIDER_MODE: "placeholder",
        ASSISTANT_AGENTOS_DEFAULT_AGENT_ID: "support-agent",
      }),
    ).toEqual({ mode: "placeholder", defaultAgentId: "support-agent" });
    expect(() =>
      resolveAssistantProviderSettings({ ASSISTANT_PROVIDER_MODE: "auto" }),
    ).toThrow("ASSISTANT_PROVIDER_MODE");
    expect(() =>
      resolveAssistantProviderSettings({
        ASSISTANT_PROVIDER_MODE: "agentos",
        ASSISTANT_AGENTOS_DEFAULT_AGENT_ID: " Support Agent ",
      }),
    ).toThrow("ASSISTANT_AGENTOS_DEFAULT_AGENT_ID");
  });
});
