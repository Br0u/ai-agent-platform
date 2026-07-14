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

import {
  createAdminAssistantSessionsHandler,
  loadPlaceholderAdminAssistantSessions,
} from "./handler";

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
  });

  it("exports only GET and requires exactly admin:assistant", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["GET"]);

    const response = await route.GET(request("route-correlation"));
    expect(response.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
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
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/customer|secret/iu);
  });

  it("returns a correlated versioned non-persisted snapshot", async () => {
    const requestIdFactory = vi.fn(() => "unused-fallback");
    const GET = createAdminAssistantSessionsHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadSessions: loadPlaceholderAdminAssistantSessions,
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
        capability: "placeholder",
        items: [],
        message: "占位模式不持久化会话；会话审计将在存储接入后开放。",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /customer|messageText|secret|token|cookie|session.?id|ip|user.?agent/iu,
    );
  });

  it("uses the factory for a 65-character incoming id", async () => {
    const requestIdFactory = vi.fn(() => "generated-sessions-id");
    const GET = createAdminAssistantSessionsHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadSessions: loadPlaceholderAdminAssistantSessions,
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
