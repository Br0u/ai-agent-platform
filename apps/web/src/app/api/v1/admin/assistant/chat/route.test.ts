import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => {
  class AuthAccessError extends Error {
    constructor(
      readonly code: string,
      readonly status: 401 | 403,
    ) {
      super(
        code === "AUTH_SESSION_REQUIRED"
          ? "Authentication required"
          : "Permission denied",
      );
      this.name = "AuthAccessError";
    }
  }
  return { AuthAccessError, requirePermission: vi.fn() };
});

vi.mock("@/server/auth/access", () => ({
  AuthAccessError: auth.AuthAccessError,
  authAccessErrorBody: (error: InstanceType<typeof auth.AuthAccessError>) => ({
    error: { code: error.code, message: error.message },
  }),
  requirePermission: auth.requirePermission,
}));

import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import { createAdminAssistantChatHandler } from "./handler";
import * as route from "./route";

const validRequest = () =>
  new Request("http://localhost/api/v1/admin/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "检查占位合同",
      context: { pathname: "/admin/assistant" },
    }),
  });

const provider = (): AssistantProvider => ({
  reply: vi.fn(async () => ({ content: "占位响应", suggestedActions: [] })),
});

describe("POST /api/v1/admin/assistant/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requirePermission.mockResolvedValue({ realm: "workforce" });
  });

  it("keeps helper exports outside the Next route module", () => {
    const source = readFileSync(
      "src/app/api/v1/admin/assistant/chat/route.ts",
      "utf8",
    );
    expect(source).not.toContain("createAdminAssistantChatHandler");
  });

  it("requires exactly admin:assistant in the exported route", async () => {
    const response = await route.POST(validRequest());

    expect(response.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
  });

  it.each([
    ["AUTH_SESSION_REQUIRED", 401],
    ["AUTH_PERMISSION_DENIED", 403],
  ] as const)(
    "returns %s without invoking the provider",
    async (code, status) => {
      const assistantProvider = provider();
      const authorize = vi
        .fn()
        .mockRejectedValue(new auth.AuthAccessError(code, status));
      const POST = createAdminAssistantChatHandler({
        authorize,
        provider: assistantProvider,
      });

      const response = await POST(validRequest());

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(assistantProvider.reply).not.toHaveBeenCalled();
    },
  );

  it("reuses the versioned placeholder response boundary after authorization", async () => {
    const assistantProvider = provider();
    const POST = createAdminAssistantChatHandler({
      authorize: vi.fn().mockResolvedValue({ realm: "workforce" }),
      provider: assistantProvider,
      requestIdFactory: () => "admin-request",
      messageIdFactory: () => "admin-message",
      clock: () => 0,
    });

    const response = await POST(validRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: "admin-request",
      mode: "placeholder",
      session: { temporary: true },
      message: {
        id: "admin-message",
        role: "assistant",
        content: "占位响应",
      },
      suggestedActions: [],
    });
  });
});
