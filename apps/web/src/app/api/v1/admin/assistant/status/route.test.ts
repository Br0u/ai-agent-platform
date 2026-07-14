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
  readSafeAssistantRuntimeStatus: vi.fn(
    async (value: { status: () => Promise<unknown> }) => value.status(),
  ),
  status: vi.fn(),
  inspect: vi.fn(),
}));

vi.mock("@/server/auth/access", () => ({
  AuthAccessError: auth.AuthAccessError,
  requirePermission: auth.requirePermission,
}));

vi.mock("@/server/assistant/assistant-runtime", () => ({
  getAssistantRuntime: runtime.getAssistantRuntime,
  readSafeAssistantRuntimeStatus: runtime.readSafeAssistantRuntimeStatus,
}));

import {
  createAdminAssistantStatusHandler,
  loadAdminAssistantStatus,
} from "./handler";

function request(requestId?: string) {
  return new Request("http://localhost/api/v1/admin/assistant/status", {
    headers:
      requestId === undefined ? undefined : { "x-request-id": requestId },
  });
}

describe("GET /api/v1/admin/assistant/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requirePermission.mockResolvedValue({
      userId: "admin-1",
      realm: "workforce",
    });
    runtime.status.mockResolvedValue({
      live: true,
      ready: true,
      capability: "placeholder",
      message: "模型尚未配置，当前为安全占位模式。",
    });
    runtime.inspect.mockReturnValue({
      providerMode: "placeholder",
      persistence: "disabled",
      circuit: { state: "closed", consecutiveFailures: 0 },
    });
    runtime.getAssistantRuntime.mockReturnValue({
      status: runtime.status,
      inspect: runtime.inspect,
    });
  });

  it("exports only GET and requires exactly admin:assistant", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["GET"]);

    const response = await route.GET(request("route-correlation"));
    expect(response.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
    expect(runtime.status).toHaveBeenCalledOnce();
    expect(runtime.inspect).toHaveBeenCalledOnce();
  });

  it.each([
    ["AUTH_SESSION_REQUIRED", 401, "authentication_required"],
    ["AUTH_PERMISSION_DENIED", 403, "permission_denied"],
  ] as const)(
    "returns a correlated %s envelope before reading status",
    async (authCode, status, errorCode) => {
      const loadStatus = vi.fn();
      const GET = createAdminAssistantStatusHandler({
        access: {
          requirePermission: vi
            .fn()
            .mockRejectedValue(new auth.AuthAccessError(authCode, status)),
        },
        loadStatus,
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
        },
      });
      expect(loadStatus).not.toHaveBeenCalled();
    },
  );

  it("returns a safe correlated unavailable envelope for source failure", async () => {
    const GET = createAdminAssistantStatusHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadStatus: vi.fn().mockRejectedValue(new Error("private-url-secret")),
      requestIdFactory: () => "fallback-request",
    });

    const response = await GET(request("status-error"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      version: "1",
      requestId: "status-error",
      error: {
        code: "assistant_unavailable",
        message: "AI assistant service is unavailable",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/private|url|secret/iu);
  });

  it("returns a correlated safe status snapshot with circuit metadata", async () => {
    const requestIdFactory = vi.fn(() => "unused-fallback");
    const GET = createAdminAssistantStatusHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadStatus: async () => ({
        mode: "placeholder",
        runtime: {
          live: true,
          ready: true,
          capability: "placeholder",
          providerMode: "placeholder",
          persistence: "disabled",
          circuit: { state: "closed", consecutiveFailures: 2 },
        },
        services: [
          {
            id: "agentos",
            label: "AgentOS",
            state: "ready",
            detail: "基础服务已就绪",
          },
          {
            id: "database",
            label: "会话数据库",
            state: "not_configured",
            detail: "持久化未启用",
          },
          {
            id: "model",
            label: "模型",
            state: "not_configured",
            detail: "尚未配置",
          },
          {
            id: "public_entry",
            label: "公开入口",
            state: "placeholder",
            detail: "占位模式可用",
          },
        ],
        configuration: {
          defaultAgent: "M 企业助理（占位）",
          model: "未配置",
          skills: "未接入",
          sessionStorage: "未启用",
        },
        message: "模型尚未配置，当前为安全占位模式。",
      }),
      requestIdFactory,
    });

    const response = await GET(request("status-correlation"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requestIdFactory).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      version: "1",
      requestId: "status-correlation",
      status: { mode: "placeholder" },
    });
    expect(body.status.services).toHaveLength(4);
    expect(body.status.runtime).toEqual({
      live: true,
      ready: true,
      capability: "placeholder",
      providerMode: "placeholder",
      persistence: "disabled",
      circuit: { state: "closed", consecutiveFailures: 2 },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /https?:|database_url|api.?key|secret|token|openedAt|monotonic|cookie|session.?id|user.?agent/iu,
    );
  });

  it("fails safely to degraded metadata when runtime configuration is invalid", async () => {
    runtime.getAssistantRuntime.mockImplementation(() => {
      throw new Error(
        "AGENTOS_INTERNAL_URL=http://agent:7777 OS_SECURITY_KEY=private",
      );
    });

    const route = await import("./route");
    const response = await route.GET(request("safe-degraded"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status.runtime).toEqual({
      live: false,
      ready: false,
      capability: "degraded",
      providerMode: "placeholder",
      persistence: "disabled",
      circuit: { state: "closed", consecutiveFailures: 0 },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /agent:7777|private|security|url/iu,
    );
  });

  it("uses the factory for a 65-character incoming id", async () => {
    const requestIdFactory = vi.fn(() => "generated-status-id");
    const GET = createAdminAssistantStatusHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadStatus: loadAdminAssistantStatus,
      requestIdFactory,
    });

    const response = await GET(request("a".repeat(65)));

    expect(requestIdFactory).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      version: "1",
      requestId: "generated-status-id",
    });
  });
});
