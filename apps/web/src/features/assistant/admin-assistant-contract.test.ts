import { describe, expect, it } from "vitest";

import { isAdminAssistantChatResponse } from "./admin-assistant-contract";

function adminResponse(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    requestId: "request-1",
    mode: "placeholder",
    message: {
      id: "message-1",
      role: "assistant",
      content: "测试回复",
    },
    suggestedActions: [],
    ...overrides,
  };
}

describe("admin assistant test contract", () => {
  it("accepts the exact protected test response without a public session", () => {
    expect(isAdminAssistantChatResponse(adminResponse())).toBe(true);
  });

  it("rejects public or forged session metadata", () => {
    expect(
      isAdminAssistantChatResponse(
        adminResponse({
          session: {
            temporary: true,
            expiresAt: "2026-07-13T12:00:00.000Z",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isAdminAssistantChatResponse(
        adminResponse({ expiresAt: "2026-07-13T12:00:00.000Z" }),
      ),
    ).toBe(false);
  });
});
