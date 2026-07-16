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
  it("returns placeholder only when placeholder mode is explicit", () => {
    expect(
      selectAssistantProvider({
        mode: "placeholder",
        ready: true,
        capability: "available",
        placeholder: placeholder as AssistantProvider,
        agentos: agentos as AssistantProvider,
      }),
    ).toBe(placeholder);
  });

  it.each([
    {
      mode: "agentos" as const,
      ready: false,
      capability: "available" as const,
    },
    {
      mode: "agentos" as const,
      ready: true,
      capability: "placeholder" as const,
    },
    {
      mode: "agentos" as const,
      ready: true,
      capability: "degraded" as const,
    },
  ])("fails closed when explicit AgentOS mode is unavailable", (state) => {
    const error = (() => {
      try {
        return selectAssistantProvider({
          ...state,
          placeholder: placeholder as AssistantProvider,
          agentos: agentos as AssistantProvider,
        });
      } catch (value) {
        return value;
      }
    })();

    expect(error).toMatchObject({
      name: "AssistantProviderSelectionUnavailableError",
      code: "ASSISTANT_PROVIDER_SELECTION_UNAVAILABLE",
      message: "Assistant provider selection unavailable",
    });
    expect(JSON.stringify(error)).toBe(
      '{"code":"ASSISTANT_PROVIDER_SELECTION_UNAVAILABLE"}',
    );
  });

  it("selects AgentOS only when explicit mode, readiness, and capability agree", () => {
    expect(
      selectAssistantProvider({
        mode: "agentos",
        ready: true,
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
      }),
    ).toEqual({ mode: "placeholder" });
    expect(() =>
      resolveAssistantProviderSettings({ ASSISTANT_PROVIDER_MODE: "auto" }),
    ).toThrow("ASSISTANT_PROVIDER_MODE");
    expect(
      resolveAssistantProviderSettings({ ASSISTANT_PROVIDER_MODE: "agentos" }),
    ).toEqual({ mode: "agentos" });
  });

  it("has no environment-controlled Agent ID in its server contract", () => {
    expect(
      resolveAssistantProviderSettings({ ASSISTANT_PROVIDER_MODE: "agentos" }),
    ).toEqual({ mode: "agentos" });
  });
});
