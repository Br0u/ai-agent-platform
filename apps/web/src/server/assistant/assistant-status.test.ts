import { describe, expect, it } from "vitest";

import { createPlaceholderAssistantStatus } from "./assistant-status";

describe("createPlaceholderAssistantStatus", () => {
  it("returns the exact placeholder capability envelope", () => {
    expect(createPlaceholderAssistantStatus("req-2")).toEqual({
      version: "1",
      requestId: "req-2",
      live: true,
      ready: false,
      capability: "placeholder",
      message: "模型尚未配置，当前为安全占位模式。",
    });
  });
});
