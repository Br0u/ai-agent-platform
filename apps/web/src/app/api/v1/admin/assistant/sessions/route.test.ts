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

import {
  createAdminAssistantSessionsHandler,
  loadPlaceholderAdminAssistantSessions,
} from "./handler";
import * as route from "./route";

const request = () =>
  new Request("http://localhost/api/v1/admin/assistant/sessions");

describe("GET /api/v1/admin/assistant/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requirePermission.mockResolvedValue({ realm: "workforce" });
  });

  it("keeps helper exports outside the Next route module", () => {
    const source = readFileSync(
      "src/app/api/v1/admin/assistant/sessions/route.ts",
      "utf8",
    );
    expect(source).not.toContain("createAdminAssistantSessionsHandler");
  });

  it("requires exactly admin:assistant in the exported route", async () => {
    const response = await route.GET(request());
    expect(response.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
  });

  it.each([
    ["AUTH_SESSION_REQUIRED", 401],
    ["AUTH_PERMISSION_DENIED", 403],
  ] as const)("returns %s before reading sessions", async (code, status) => {
    const loadSessions = vi
      .fn()
      .mockResolvedValue([{ content: "customer secret" }]);
    const GET = createAdminAssistantSessionsHandler({
      authorize: vi
        .fn()
        .mockRejectedValue(new auth.AuthAccessError(code, status)),
      loadSessions,
    });

    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(loadSessions).not.toHaveBeenCalled();
  });

  it("returns an explicit versioned non-persisted empty collection", async () => {
    const GET = createAdminAssistantSessionsHandler({
      authorize: vi.fn().mockResolvedValue({ realm: "workforce" }),
      loadSessions: loadPlaceholderAdminAssistantSessions,
    });

    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      version: "1",
      persisted: false,
      items: [],
      message: "占位模式不持久化会话；会话审计将在存储接入后开放。",
    });
    expect(JSON.stringify(body)).not.toMatch(
      /customer|messageText|secret|token/iu,
    );
  });
});
