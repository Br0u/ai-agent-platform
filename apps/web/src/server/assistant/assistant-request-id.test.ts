import { describe, expect, it, vi } from "vitest";

import { resolveAssistantRequestId } from "./assistant-request-id";

function request(requestId?: string) {
  return new Request("http://localhost/api/v1/assistant/status", {
    headers:
      requestId === undefined ? undefined : { "x-request-id": requestId },
  });
}

describe("resolveAssistantRequestId", () => {
  it("accepts exactly 64 safe header characters", () => {
    const factory = vi.fn(() => "fallback");
    expect(resolveAssistantRequestId(request("a".repeat(64)), factory)).toBe(
      "a".repeat(64),
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it.each(["a".repeat(65), "unsafe value", "bad/character", ""])(
    "uses the factory for an invalid header: %s",
    (header) => {
      const factory = vi.fn(() => "fallback");
      expect(resolveAssistantRequestId(request(header), factory)).toBe(
        "fallback",
      );
      expect(factory).toHaveBeenCalledOnce();
    },
  );

  it("uses the factory when the header is absent", () => {
    expect(resolveAssistantRequestId(request(), () => "fallback")).toBe(
      "fallback",
    );
  });

  it("allows a 128-code-point generated id without widening the header limit", () => {
    const generated = "😀".repeat(128);
    expect(
      resolveAssistantRequestId(request("a".repeat(65)), () => generated),
    ).toBe(generated);
  });

  it("replaces an invalid generated id with a safe UUID", () => {
    expect(
      resolveAssistantRequestId(request(), () => "😀".repeat(129)),
    ).toMatch(/^[0-9a-f-]{36}$/u);
  });
});
