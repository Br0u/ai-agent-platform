import { describe, expect, it, vi } from "vitest";

import { AuthAccessError, type WorkforceActor } from "@/server/auth/access";
import {
  AgentModelControlClientError,
  type AgentModelControlClient,
} from "@/server/assistant/agent-model-control-client";
import {
  createAdminModelConfigListHandler,
  loadAdminModelConfigSnapshot,
} from "./handler";

const ACTOR: WorkforceActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  realm: "workforce",
  status: "active",
  displayName: "Admin",
  mustChangePassword: false,
  twoFactorEnabled: true,
  permissions: [
    "admin:assistant",
    "admin:assistant:configure",
    "admin:assistant:secret:reveal",
  ],
};

function client(): AgentModelControlClient {
  return {
    listModelConfigs: vi.fn(async () => ({
      version: "1" as const,
      configs: [
        {
          provider: "openai" as const,
          modelId: "gpt-5",
          endpointId: "openai-default",
          apiKeyLastFour: "1234",
          revision: 2,
          testStatus: "untested" as const,
          lastTestedAt: null,
        },
        {
          provider: "deepseek" as const,
          modelId: "deepseek-chat",
          endpointId: "deepseek-default",
          apiKeyLastFour: "5678",
          revision: 3,
          testStatus: "passed" as const,
          lastTestedAt: "2026-07-18T01:02:03.000Z",
        },
      ],
      endpoints: [
        {
          id: "openai-default",
          label: "OpenAI 官方",
          provider: "openai" as const,
        },
        {
          id: "deepseek-default",
          label: "DeepSeek 官方",
          provider: "deepseek" as const,
        },
      ],
      bootstrap: null,
      controlEnabled: true,
    })),
    runtimeStatus: vi.fn(async () => ({
      version: "1" as const,
      capability: "available" as const,
      source: "dynamic" as const,
      provider: "deepseek" as const,
      modelId: "deepseek-chat",
      configRevision: 3,
      activationVersion: 8,
    })),
    saveModelConfig: vi.fn(),
    testAndActivate: vi.fn(),
    revealKey: vi.fn(),
  };
}

describe("GET /api/v1/admin/assistant/model-configs", () => {
  it("loads one metadata-only fixed-order snapshot and derives capabilities", async () => {
    const controlClient = client();

    const snapshot = await loadAdminModelConfigSnapshot(ACTOR, {
      client: controlClient,
      requestIdFactory: () => "22222222-2222-4222-8222-222222222222",
    });

    expect(controlClient.listModelConfigs).toHaveBeenCalledExactlyOnceWith({
      requestId: "22222222-2222-4222-8222-222222222222",
    });
    expect(controlClient.runtimeStatus).toHaveBeenCalledExactlyOnceWith({
      requestId: "22222222-2222-4222-8222-222222222222",
    });
    expect(snapshot).toEqual({
      version: "1",
      configs: [
        {
          provider: "openai",
          displayName: "OpenAI",
          modelId: "gpt-5",
          endpointId: "openai-default",
          revision: 2,
          testStatus: "untested",
          lastTestedAt: null,
          apiKey: { configured: true, lastFour: "1234" },
          activeRevision: null,
        },
        {
          provider: "anthropic",
          displayName: "Claude",
          modelId: null,
          endpointId: null,
          revision: null,
          testStatus: "not_configured",
          lastTestedAt: null,
          apiKey: null,
          activeRevision: null,
        },
        {
          provider: "google",
          displayName: "Gemini",
          modelId: null,
          endpointId: null,
          revision: null,
          testStatus: "not_configured",
          lastTestedAt: null,
          apiKey: null,
          activeRevision: null,
        },
        {
          provider: "dashscope",
          displayName: "Qwen / DashScope",
          modelId: null,
          endpointId: null,
          revision: null,
          testStatus: "not_configured",
          lastTestedAt: null,
          apiKey: null,
          activeRevision: null,
        },
        {
          provider: "deepseek",
          displayName: "DeepSeek",
          modelId: "deepseek-chat",
          endpointId: "deepseek-default",
          revision: 3,
          testStatus: "passed",
          lastTestedAt: "2026-07-18T01:02:03.000Z",
          apiKey: { configured: true, lastFour: "5678" },
          activeRevision: 3,
        },
        {
          provider: "minimax",
          displayName: "MiniMax",
          modelId: null,
          endpointId: null,
          revision: null,
          testStatus: "not_configured",
          lastTestedAt: null,
          apiKey: null,
          activeRevision: null,
        },
      ],
      endpoints: {
        openai: [{ id: "openai-default", label: "OpenAI 官方" }],
        anthropic: [],
        google: [],
        dashscope: [],
        deepseek: [{ id: "deepseek-default", label: "DeepSeek 官方" }],
        minimax: [],
      },
      runtime: {
        capability: "available",
        source: "dynamic",
        provider: "deepseek",
        modelId: "deepseek-chat",
        configRevision: 3,
        activationVersion: 8,
      },
      canConfigure: true,
      canReveal: true,
      controlEnabled: true,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /key-value|ciphertext|nonce|https?:\/\//iu,
    );
  });

  it("requires only admin:assistant and returns a no-store versioned response", async () => {
    const requirePermission = vi.fn(async () => ACTOR);
    const loadSnapshot = vi.fn(async () =>
      loadAdminModelConfigSnapshot(ACTOR, {
        client: client(),
        requestIdFactory: () => "33333333-3333-4333-8333-333333333333",
      }),
    );
    const GET = createAdminModelConfigListHandler({
      access: { requirePermission },
      loadSnapshot,
      requestIdFactory: () => "public-request",
    });

    const response = await GET(
      new Request(
        "https://portal.example.com/api/v1/admin/assistant/model-configs",
      ),
    );

    expect(requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
    expect(loadSnapshot).toHaveBeenCalledExactlyOnceWith(ACTOR);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      version: "1",
      requestId: "public-request",
      configs: expect.any(Array),
    });
  });

  it.each([
    ["authentication_failed", 401, "authentication_required"],
    ["authorization_failed", 403, "permission_denied"],
  ] as const)(
    "returns safe auth failure for %s without loading metadata",
    async (_label, status, code) => {
      const loadSnapshot = vi.fn();
      const requirePermission = vi.fn(async () => {
        throw new AuthAccessError(
          status === 401 ? "AUTH_SESSION_REQUIRED" : "AUTH_PERMISSION_DENIED",
          status,
        );
      });
      const GET = createAdminModelConfigListHandler({
        access: { requirePermission },
        loadSnapshot,
        requestIdFactory: () => "public-request",
      });

      const response = await GET(new Request("https://portal.example.com"));
      const text = await response.text();

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.parse(text)).toMatchObject({
        version: "1",
        requestId: "public-request",
        error: { code },
      });
      expect(loadSnapshot).not.toHaveBeenCalled();
      expect(text).not.toMatch(
        /AUTH_SESSION_REQUIRED|AUTH_PERMISSION_DENIED/iu,
      );
    },
  );

  it("maps private Agent failure to a safe 503 without internal detail", async () => {
    const GET = createAdminModelConfigListHandler({
      access: { requirePermission: vi.fn(async () => ACTOR) },
      loadSnapshot: vi.fn(async () => {
        throw new AgentModelControlClientError("invalid_response");
      }),
      requestIdFactory: () => "public-request",
    });

    const response = await GET(new Request("https://portal.example.com"));
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toMatchObject({
      version: "1",
      requestId: "public-request",
      error: { code: "assistant_unavailable", retryable: true },
    });
    expect(text).not.toMatch(/invalid_response|agent:7777|private/iu);
  });

  it("exports only GET from the route module", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
