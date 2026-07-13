import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => {
  class AuthAccessError extends Error {
    constructor(
      readonly code: string,
      readonly status: 401 | 403,
    ) {
      super("private-auth-detail");
      this.name = "AuthAccessError";
    }
  }
  return { AuthAccessError, requirePermission: vi.fn() };
});

vi.mock("@/server/auth/access", () => ({
  AuthAccessError: auth.AuthAccessError,
  requirePermission: auth.requirePermission,
}));

import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import { createAdminAssistantChatHandler } from "./handler";

function request(requestId?: string) {
  return new Request("http://localhost/api/v1/admin/assistant/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(requestId === undefined ? {} : { "x-request-id": requestId }),
    },
    body: JSON.stringify({
      message: "检查占位合同",
      context: { pathname: "/admin/assistant" },
    }),
  });
}

const provider = (): AssistantProvider => ({
  reply: vi.fn(async () => ({ content: "占位响应", suggestedActions: [] })),
});

describe("POST /api/v1/admin/assistant/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requirePermission.mockResolvedValue({ realm: "workforce" });
  });

  it("exports only POST and requires exactly admin:assistant", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["POST"]);

    const response = await route.POST(request("route-correlation"));
    expect(response.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
  });

  it.each([
    ["AUTH_SESSION_REQUIRED", 401, "authentication_required"],
    ["AUTH_PERMISSION_DENIED", 403, "permission_denied"],
  ] as const)(
    "returns a correlated %s envelope without invoking the provider",
    async (authCode, status, errorCode) => {
      const assistantProvider = provider();
      const POST = createAdminAssistantChatHandler({
        authorize: vi
          .fn()
          .mockRejectedValue(new auth.AuthAccessError(authCode, status)),
        provider: assistantProvider,
        requestIdFactory: () => "unused-fallback",
      });

      const response = await POST(request(`correlation-${status}`));

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        version: "1",
        requestId: `correlation-${status}`,
        error: {
          code: errorCode,
          message:
            status === 401 ? "Authentication required" : "Permission denied",
        },
      });
      expect(assistantProvider.reply).not.toHaveBeenCalled();
    },
  );

  it("returns a safe correlated unavailable envelope for an unexpected error", async () => {
    const POST = createAdminAssistantChatHandler({
      authorize: vi.fn().mockRejectedValue(new Error("private-secret")),
      provider: provider(),
      requestIdFactory: () => "fallback-request",
    });

    const response = await POST(request("unexpected-correlation"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      version: "1",
      requestId: "unexpected-correlation",
      error: {
        code: "assistant_unavailable",
        message: "AI assistant service is unavailable",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/private|secret/iu);
  });

  it("preserves a valid incoming request id through the base v1 contract", async () => {
    const requestIdFactory = vi.fn(() => "unused-fallback");
    const POST = createAdminAssistantChatHandler({
      authorize: vi.fn().mockResolvedValue({ realm: "workforce" }),
      provider: provider(),
      requestIdFactory,
      messageIdFactory: () => "admin-message",
      clock: () => 0,
    });

    const response = await POST(request("incoming-correlation"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(requestIdFactory).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: "incoming-correlation",
      mode: "placeholder",
      message: {
        id: "admin-message",
        role: "assistant",
        content: "占位响应",
      },
      suggestedActions: [],
    });
  });

  it("uses one generated correlation for a 65-character incoming id", async () => {
    const requestIdFactory = vi.fn(() => "generated-correlation");
    const POST = createAdminAssistantChatHandler({
      authorize: vi.fn().mockResolvedValue({ realm: "workforce" }),
      provider: provider(),
      requestIdFactory,
      messageIdFactory: () => "admin-message",
      clock: () => 0,
    });

    const response = await POST(request("a".repeat(65)));

    expect(requestIdFactory).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      version: "1",
      requestId: "generated-correlation",
    });
  });
});
