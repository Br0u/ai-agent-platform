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
  inspect: vi.fn(),
}));

vi.mock("@/server/auth/access", () => ({
  AuthAccessError: auth.AuthAccessError,
  requirePermission: auth.requirePermission,
}));

vi.mock("@/server/assistant/assistant-runtime", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/assistant/assistant-runtime")
  >()),
  getAssistantRuntime: runtime.getAssistantRuntime,
}));

import {
  createAdminAssistantSessionsHandler,
  loadAdminAssistantSessions,
} from "./handler";
import { createAssistantRuntime } from "@/server/assistant/assistant-runtime";

function request(requestId?: string) {
  return new Request("http://localhost/api/v1/admin/assistant/sessions", {
    headers:
      requestId === undefined ? undefined : { "x-request-id": requestId },
  });
}

describe("GET /api/v1/admin/assistant/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requirePermission.mockResolvedValue({ realm: "workforce" });
    runtime.inspect.mockReturnValue({
      persistence: "disabled",
    });
    runtime.getAssistantRuntime.mockReturnValue({ inspect: runtime.inspect });
  });

  it("exports only GET and requires exactly admin:assistant", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["GET"]);

    const response = await route.GET(request("route-correlation"));
    expect(response.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
    expect(runtime.getAssistantRuntime).toHaveBeenCalledOnce();
    expect(runtime.inspect).toHaveBeenCalledOnce();
  });

  it.each([
    ["AUTH_SESSION_REQUIRED", 401, "authentication_required"],
    ["AUTH_PERMISSION_DENIED", 403, "permission_denied"],
  ] as const)(
    "returns a correlated %s envelope before reading sessions",
    async (authCode, status, errorCode) => {
      const loadSessions = vi.fn();
      const GET = createAdminAssistantSessionsHandler({
        access: {
          requirePermission: vi
            .fn()
            .mockRejectedValue(new auth.AuthAccessError(authCode, status)),
        },
        loadSessions,
        requestIdFactory: () => "unused-fallback",
      });

      const response = await GET(request(`correlation-${status}`));

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        version: "1",
        requestId: `correlation-${status}`,
        error: {
          code: errorCode,
          message:
            status === 401 ? "Authentication required" : "Permission denied",
          retryable: false,
        },
      });
      expect(loadSessions).not.toHaveBeenCalled();
    },
  );

  it("returns a safe correlated unavailable envelope for source failure", async () => {
    const GET = createAdminAssistantSessionsHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadSessions: vi.fn().mockRejectedValue(new Error("customer-secret")),
      requestIdFactory: () => "fallback-request",
    });

    const response = await GET(request("sessions-error"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      version: "1",
      requestId: "sessions-error",
      error: {
        code: "assistant_unavailable",
        message: "AI assistant service is unavailable",
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/customer|secret/iu);
  });

  it("does not let a malicious loader AuthAccessError impersonate an authorization failure", async () => {
    const GET = createAdminAssistantSessionsHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadSessions: vi
        .fn()
        .mockRejectedValue(
          new auth.AuthAccessError("AUTH_PERMISSION_DENIED", 403),
        ),
      requestIdFactory: () => "loader-auth-error",
    });

    const response = await GET(request("loader-auth-error"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      version: "1",
      requestId: "loader-auth-error",
      error: { code: "assistant_unavailable" },
    });
  });

  it.each([
    {
      persistence: "disabled" as const,
      expected: {
        persistence: "disabled",
        listing: "not_available",
        message: "占位模式未持久化会话；管理列表不可用。",
      },
    },
    {
      persistence: "agentos" as const,
      expected: {
        persistence: "agentos",
        listing: "not_available",
        message: "AgentOS 持久化已启用，但管理列表不在本阶段范围。",
      },
    },
    {
      persistence: "unavailable" as const,
      expected: {
        persistence: "unavailable",
        listing: "not_available",
        message: "持久化状态不可用；管理列表不可用。",
      },
    },
  ])(
    "reports $persistence persistence without fabricating a session list",
    async ({ persistence, expected }) => {
      const inspect = vi.fn(() => ({ persistence }));

      await expect(loadAdminAssistantSessions({ inspect })).resolves.toEqual(
        expected,
      );
      expect(inspect).toHaveBeenCalledOnce();
      expect(JSON.stringify(expected)).not.toMatch(
        /items|capability|session.?id|messageText|prompt|answer|reply|ip|user.?agent/iu,
      );
    },
  );

  it("returns a sanitized unavailable snapshot when runtime resolution fails", async () => {
    runtime.getAssistantRuntime.mockImplementationOnce(() => {
      throw new Error(
        "raw AGENTOS_INTERNAL_URL=http://agent:7777 OS_SECURITY_KEY=secret",
      );
    });

    const sessions = await loadAdminAssistantSessions();

    expect(sessions).toEqual({
      persistence: "unavailable",
      listing: "not_available",
      message: "持久化状态不可用；管理列表不可用。",
    });
    expect(JSON.stringify(sessions)).not.toMatch(
      /raw|agent:7777|security|key|secret/iu,
    );
    expect(runtime.inspect).not.toHaveBeenCalled();
  });

  it("returns a sanitized unavailable snapshot when inspection fails", async () => {
    const inspect = vi.fn(() => {
      throw new Error("raw private session config");
    });

    const sessions = await loadAdminAssistantSessions({ inspect });

    expect(sessions).toEqual({
      persistence: "unavailable",
      listing: "not_available",
      message: "持久化状态不可用；管理列表不可用。",
    });
    expect(JSON.stringify(sessions)).not.toMatch(
      /raw|private|session config/iu,
    );
    expect(runtime.getAssistantRuntime).not.toHaveBeenCalled();
  });

  it("does not probe the network when invalid AgentOS composition is inspected", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const realRuntime = createAssistantRuntime({
      environment: {
        ASSISTANT_PROVIDER_MODE: "agentos",
        TRUST_NGINX_PROXY: "false",
        AGENTOS_INTERNAL_URL: "not a URL",
        OS_SECURITY_KEY: "private-invalid-key",
      },
      fetcher,
    });

    await expect(loadAdminAssistantSessions(realRuntime)).resolves.toEqual({
      persistence: "unavailable",
      listing: "not_available",
      message: "持久化状态不可用；管理列表不可用。",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns a correlated versioned non-persisted snapshot", async () => {
    const requestIdFactory = vi.fn(() => "unused-fallback");
    const GET = createAdminAssistantSessionsHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadSessions: () =>
        loadAdminAssistantSessions({
          inspect: () => ({ persistence: "disabled" }),
        }),
      requestIdFactory,
    });

    const response = await GET(request("sessions-correlation"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requestIdFactory).not.toHaveBeenCalled();
    expect(body).toEqual({
      version: "1",
      requestId: "sessions-correlation",
      sessions: {
        persistence: "disabled",
        listing: "not_available",
        message: "占位模式未持久化会话；管理列表不可用。",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /customer|messageText|secret|token|cookie|session.?id|prompt|answer|reply|ip|user.?agent/iu,
    );
  });

  it("uses the factory for a 65-character incoming id", async () => {
    const requestIdFactory = vi.fn(() => "generated-sessions-id");
    const GET = createAdminAssistantSessionsHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadSessions: () =>
        loadAdminAssistantSessions({
          inspect: () => ({ persistence: "disabled" }),
        }),
      requestIdFactory,
    });

    const response = await GET(request("a".repeat(65)));

    expect(requestIdFactory).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      version: "1",
      requestId: "generated-sessions-id",
    });
  });
});
