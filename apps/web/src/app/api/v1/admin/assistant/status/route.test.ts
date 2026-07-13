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
  createAdminAssistantStatusHandler,
  loadPlaceholderAdminAssistantStatus,
} from "./handler";
import * as route from "./route";

const request = () =>
  new Request("http://localhost/api/v1/admin/assistant/status");

describe("GET /api/v1/admin/assistant/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requirePermission.mockResolvedValue({ realm: "workforce" });
  });

  it("keeps helper exports outside the Next route module", () => {
    const source = readFileSync(
      "src/app/api/v1/admin/assistant/status/route.ts",
      "utf8",
    );
    expect(source).not.toContain("createAdminAssistantStatusHandler");
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
  ] as const)(
    "returns %s before reading service status",
    async (code, status) => {
      const loadStatus = vi.fn().mockResolvedValue({ secret: "must-not-load" });
      const GET = createAdminAssistantStatusHandler({
        authorize: vi
          .fn()
          .mockRejectedValue(new auth.AuthAccessError(code, status)),
        loadStatus,
      });

      const response = await GET(request());
      expect(response.status).toBe(status);
      expect(loadStatus).not.toHaveBeenCalled();
    },
  );

  it("returns four safe placeholder states without connection material", async () => {
    const GET = createAdminAssistantStatusHandler({
      authorize: vi.fn().mockResolvedValue({ realm: "workforce" }),
      loadStatus: loadPlaceholderAdminAssistantStatus,
    });

    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ version: "1", mode: "placeholder" });
    expect(body.services).toHaveLength(4);
    expect(JSON.stringify(body)).not.toMatch(
      /https?:|database_url|api.?key|secret|token/iu,
    );
  });
});
