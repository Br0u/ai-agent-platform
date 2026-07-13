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
  createAdminAssistantStatusHandler,
  loadPlaceholderAdminAssistantStatus,
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
    "returns a correlated %s envelope before reading status",
    async (authCode, status, errorCode) => {
      const loadStatus = vi.fn();
      const GET = createAdminAssistantStatusHandler({
        authorize: vi
          .fn()
          .mockRejectedValue(new auth.AuthAccessError(authCode, status)),
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
      authorize: vi.fn().mockResolvedValue({ realm: "workforce" }),
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

  it("returns a correlated safe status snapshot", async () => {
    const requestIdFactory = vi.fn(() => "unused-fallback");
    const GET = createAdminAssistantStatusHandler({
      authorize: vi.fn().mockResolvedValue({ realm: "workforce" }),
      loadStatus: loadPlaceholderAdminAssistantStatus,
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
    expect(JSON.stringify(body)).not.toMatch(
      /https?:|database_url|api.?key|secret|token/iu,
    );
  });

  it("uses the factory for a 65-character incoming id", async () => {
    const requestIdFactory = vi.fn(() => "generated-status-id");
    const GET = createAdminAssistantStatusHandler({
      authorize: vi.fn().mockResolvedValue({ realm: "workforce" }),
      loadStatus: loadPlaceholderAdminAssistantStatus,
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
