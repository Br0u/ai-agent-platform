import { describe, expect, it, vi } from "vitest";

import {
  AgentOSAssistantProvider,
  AgentOSAssistantProviderError,
} from "./agentos-assistant-provider";

describe("AgentOS assistant provider before a real Agent exists", () => {
  it("throws a typed not-configured error without guessing or calling a run endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new AgentOSAssistantProvider();

    await expect(
      provider.reply({
        message: "private customer question",
        context: { pathname: "/" },
      }),
    ).rejects.toEqual(new AgentOSAssistantProviderError());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(new AgentOSAssistantProviderError())).toBe(
      '{"code":"assistant_not_configured"}',
    );
  });
});
