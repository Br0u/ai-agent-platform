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

const runtime = vi.hoisted(() => ({
  getAssistantRuntime: vi.fn(),
  consume: vi.fn(),
  resolveProvider: vi.fn(),
  reply: vi.fn(),
}));

vi.mock("@/server/auth/access", () => ({
  AuthAccessError: auth.AuthAccessError,
  requirePermission: auth.requirePermission,
}));

vi.mock("@/server/assistant/assistant-runtime", () => ({
  getAssistantRuntime: runtime.getAssistantRuntime,
}));

import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import { AssistantRateLimitExceededError } from "@/server/assistant/assistant-rate-limit";
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
    auth.requirePermission.mockResolvedValue({
      userId: "admin-1",
      realm: "workforce",
    });
    runtime.consume.mockResolvedValue(undefined);
    runtime.reply.mockResolvedValue({
      content: "占位响应",
      suggestedActions: [],
    });
    runtime.resolveProvider.mockResolvedValue({
      provider: { reply: runtime.reply },
      mode: "placeholder",
    });
    runtime.getAssistantRuntime.mockReturnValue({
      rateLimiter: { consume: runtime.consume },
      resolveProvider: runtime.resolveProvider,
    });
  });

  it("exports only POST and requires exactly admin:assistant", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["POST"]);

    const response = await route.POST(request("route-correlation"));
    expect(response.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
    expect(runtime.consume).toHaveBeenCalledExactlyOnceWith({
      scope: "admin-test",
      actorId: "admin-1",
    });
    expect(runtime.resolveProvider).toHaveBeenCalledOnce();
    expect(runtime.reply).toHaveBeenCalledOnce();
  });

  it.each([
    ["AUTH_SESSION_REQUIRED", 401, "authentication_required"],
    ["AUTH_PERMISSION_DENIED", 403, "permission_denied"],
  ] as const)(
    "returns a correlated %s envelope without invoking the provider",
    async (authCode, status, errorCode) => {
      const assistantProvider = provider();
      const limiter = { consume: vi.fn() };
      const POST = createAdminAssistantChatHandler({
        access: {
          requirePermission: vi
            .fn()
            .mockRejectedValue(new auth.AuthAccessError(authCode, status)),
        },
        provider: assistantProvider,
        rateLimiter: limiter,
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
      expect(limiter.consume).not.toHaveBeenCalled();
    },
  );

  it("returns a safe correlated unavailable envelope for an unexpected error", async () => {
    const POST = createAdminAssistantChatHandler({
      access: {
        requirePermission: vi
          .fn()
          .mockRejectedValue(new Error("private-secret")),
      },
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

  it("orders access, actor-scoped limiter, and Provider while ignoring a body actor", async () => {
    const callOrder: string[] = [];
    const assistantProvider = provider();
    vi.mocked(assistantProvider.reply).mockImplementation(async () => {
      callOrder.push("provider");
      return { content: "占位响应", suggestedActions: [] };
    });
    const POST = createAdminAssistantChatHandler({
      access: {
        requirePermission: vi.fn(async () => {
          callOrder.push("access");
          return {
            userId: "authoritative-admin",
            realm: "workforce",
          } as never;
        }),
      },
      rateLimiter: {
        consume: vi.fn(async (input) => {
          callOrder.push("limiter");
          expect(input).toEqual({
            scope: "admin-test",
            actorId: "authoritative-admin",
          });
        }),
      },
      provider: assistantProvider,
      requestIdFactory: () => "ordered-request",
      messageIdFactory: () => "ordered-message",
      clock: () => 0,
    });
    const forged = new Request("http://localhost/api/v1/admin/assistant/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actorId: "forged-admin",
        message: "检查占位合同",
        context: { pathname: "/admin/assistant" },
      }),
    });

    const response = await POST(forged);

    expect(response.status).toBe(200);
    expect(callOrder).toEqual(["access", "limiter", "provider"]);
  });

  it("returns safe versioned 429 before Provider work", async () => {
    const assistantProvider = provider();
    const limiter = {
      consume: vi
        .fn()
        .mockRejectedValue(new AssistantRateLimitExceededError(17)),
    };
    const POST = createAdminAssistantChatHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({
          userId: "admin-1",
          realm: "workforce",
        }),
      },
      rateLimiter: limiter,
      provider: assistantProvider,
      requestIdFactory: () => "rate-request",
    });

    const response = await POST(request("rate-request"));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: "rate-request",
      error: {
        code: "rate_limited",
        message: "Too many assistant test requests",
      },
    });
    expect(assistantProvider.reply).not.toHaveBeenCalled();
  });

  it("maps limiter infrastructure failure to safe 503 before Provider work", async () => {
    const assistantProvider = provider();
    const POST = createAdminAssistantChatHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({
          userId: "admin-1",
          realm: "workforce",
        }),
      },
      rateLimiter: {
        consume: vi.fn().mockRejectedValue(new Error("raw database URL")),
      },
      provider: assistantProvider,
      requestIdFactory: () => "limit-failure",
    });

    const response = await POST(request("limit-failure"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("assistant_unavailable");
    expect(JSON.stringify(body)).not.toMatch(/database|url|raw/iu);
    expect(assistantProvider.reply).not.toHaveBeenCalled();
  });

  it("preserves a valid incoming request id through the base v1 contract", async () => {
    const requestIdFactory = vi.fn(() => "unused-fallback");
    const POST = createAdminAssistantChatHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({
          userId: "admin-1",
          realm: "workforce",
        }),
      },
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
      access: {
        requirePermission: vi.fn().mockResolvedValue({
          userId: "admin-1",
          realm: "workforce",
        }),
      },
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
