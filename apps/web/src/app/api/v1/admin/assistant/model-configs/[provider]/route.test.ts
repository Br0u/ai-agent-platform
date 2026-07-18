import { describe, expect, it, vi } from "vitest";

import { AuthAccessError } from "@/server/auth/access";
import {
  AdminModelConfigCommandError,
  type AuthorizedModelCommand,
} from "@/server/assistant/admin-model-config-commands";
import { MutationRequestError } from "@/server/http/require-trusted-mutation";
import { SensitiveActionError } from "@/server/auth/sensitive-action";
import { createAdminModelConfigSaveHandler } from "../handler";

const CONTEXT = {
  requestId: "44444444-4444-4444-8444-444444444444",
} as AuthorizedModelCommand;

function request(body: string, headers: Record<string, string> = {}) {
  return new Request(
    "https://portal.example.com/api/v1/admin/assistant/model-configs/openai",
    {
      method: "PUT",
      headers: {
        origin: "https://portal.example.com",
        "content-type": "application/json",
        ...headers,
      },
      body,
    },
  );
}

function dependencies() {
  const authorize = vi.fn(async () => CONTEXT);
  const save = vi.fn(async () => ({
    requestId: CONTEXT.requestId,
    config: {
      provider: "openai" as const,
      modelId: "gpt-5",
      endpointId: "openai-default",
      apiKeyLastFour: "CRET",
      revision: 1,
      testStatus: "untested" as const,
    },
  }));
  return {
    commands: {
      authorize,
      save,
      testAndActivate: vi.fn(),
      reveal: vi.fn(),
    },
    authorize,
    save,
  };
}

describe("PUT /api/v1/admin/assistant/model-configs/[provider]", () => {
  it("authorizes before the bounded body read and delegates one exact save", async () => {
    const order: string[] = [];
    const deps = dependencies();
    deps.authorize.mockImplementation(async () => {
      order.push("authorize");
      return CONTEXT;
    });
    const readJson = vi.fn(async () => {
      order.push("body");
      return {
        ok: true as const,
        value: {
          modelId: "gpt-5",
          endpointId: "openai-default",
          apiKey: "TOP-SECRET",
          expectedRevision: 0,
        },
      };
    });
    const PUT = createAdminModelConfigSaveHandler({
      commands: deps.commands,
      readJson,
    });

    const response = await PUT(request("{}"), {
      params: Promise.resolve({ provider: "openai" }),
    });

    expect(order).toEqual(["authorize", "body"]);
    expect(deps.authorize).toHaveBeenCalledExactlyOnceWith(
      expect.any(Request),
      "save",
    );
    expect(readJson).toHaveBeenCalledExactlyOnceWith(expect.any(Request), 8192);
    expect(deps.save).toHaveBeenCalledExactlyOnceWith(CONTEXT, "openai", {
      modelId: "gpt-5",
      endpointId: "openai-default",
      apiKey: "TOP-SECRET",
      expectedRevision: 0,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      version: "1",
      requestId: CONTEXT.requestId,
      config: {
        provider: "openai",
        displayName: "OpenAI",
        modelId: "gpt-5",
        endpointId: "openai-default",
        revision: 1,
        testStatus: "untested",
        lastTestedAt: null,
        apiKey: { configured: true, lastFour: "CRET" },
        activeRevision: null,
      },
    });
    expect(text).not.toContain("TOP-SECRET");
  });

  it("rejects a non-exact provider slug after authorization and before body read", async () => {
    const deps = dependencies();
    const readJson = vi.fn();
    const PUT = createAdminModelConfigSaveHandler({
      commands: deps.commands,
      readJson,
    });

    const response = await PUT(request("{}"), {
      params: Promise.resolve({ provider: "OpenAI" }),
    });

    expect(response.status).toBe(400);
    expect(deps.authorize).toHaveBeenCalledOnce();
    expect(readJson).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    [
      {
        modelId: "gpt-5",
        endpointId: "openai-default",
        expectedRevision: 0,
        extra: true,
      },
      400,
    ],
    [
      {
        modelId: "https://private",
        endpointId: "openai-default",
        expectedRevision: 0,
      },
      400,
    ],
    [
      { modelId: "gpt-5", endpointId: "openai-default", expectedRevision: -1 },
      400,
    ],
  ] as const)("rejects non-exact or unsafe input %#", async (value, status) => {
    const deps = dependencies();
    const PUT = createAdminModelConfigSaveHandler({
      commands: deps.commands,
      readJson: vi.fn(async () => ({ ok: true as const, value })),
    });

    const response = await PUT(request("{}"), {
      params: Promise.resolve({ provider: "openai" }),
    });

    expect(response.status).toBe(status);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 400],
    [String(8193), 413],
  ] as const)(
    "maps an unreadable body with content-length %s safely",
    async (contentLength, status) => {
      const deps = dependencies();
      const PUT = createAdminModelConfigSaveHandler({
        commands: deps.commands,
        readJson: vi.fn(async () => ({ ok: false as const })),
      });
      const response = await PUT(
        request("{}", {
          ...(contentLength === undefined
            ? {}
            : { "content-length": contentLength }),
        }),
        { params: Promise.resolve({ provider: "openai" }) },
      );

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        version: "1",
        requestId: CONTEXT.requestId,
        error: {
          code: status === 413 ? "validation_error" : "validation_error",
        },
      });
      expect(deps.save).not.toHaveBeenCalled();
    },
  );

  it.each([
    [new MutationRequestError(), 400, "validation_error"],
    [
      new AuthAccessError("AUTH_SESSION_REQUIRED", 401),
      401,
      "authentication_required",
    ],
    [
      new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
      403,
      "permission_denied",
    ],
    [new SensitiveActionError("AUTH_REAUTH_REQUIRED"), 401, "reauth_required"],
    [new SensitiveActionError("AUTH_MFA_REQUIRED"), 401, "reauth_required"],
  ] as const)(
    "maps authorization failure %# before reading the body",
    async (error, status, code) => {
      const deps = dependencies();
      deps.authorize.mockRejectedValue(error);
      const readJson = vi.fn();
      const PUT = createAdminModelConfigSaveHandler({
        commands: deps.commands,
        readJson,
      });

      const response = await PUT(request("{}"), {
        params: Promise.resolve({ provider: "openai" }),
      });

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({
        version: "1",
        error: { code },
      });
      expect(readJson).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["endpoint_not_allowed", 400],
    ["configuration_conflict", 409],
    ["credential_rejected", 422],
    ["model_not_found", 422],
    ["provider_unreachable", 503],
    ["provider_timeout", 503],
    ["control_disabled", 503],
    ["storage_unavailable", 503],
    ["encryption_unavailable", 503],
    ["assistant_unavailable", 503],
  ] as const)("maps %s without echoing input", async (code, status) => {
    const deps = dependencies();
    deps.save.mockRejectedValue(new AdminModelConfigCommandError(code));
    const PUT = createAdminModelConfigSaveHandler({ commands: deps.commands });

    const response = await PUT(
      request(
        JSON.stringify({
          modelId: "gpt-5",
          endpointId: "openai-default",
          apiKey: "TOP-SECRET",
          expectedRevision: 0,
        }),
      ),
      { params: Promise.resolve({ provider: "openai" }) },
    );
    const text = await response.text();

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toMatchObject({
      version: "1",
      requestId: CONTEXT.requestId,
      error: { code },
    });
    expect(text).not.toMatch(/TOP-SECRET|gpt-5|openai-default/iu);
  });

  it.each([
    "invalid_response",
    "transport_error",
    "response_too_large",
    "authentication_failed",
    "authorization_failed",
  ] as const)(
    "normalizes internal %s without exposing it",
    async (internalCode) => {
      const deps = dependencies();
      deps.save.mockRejectedValue(
        new AdminModelConfigCommandError(internalCode),
      );
      const PUT = createAdminModelConfigSaveHandler({
        commands: deps.commands,
      });

      const response = await PUT(
        request(
          JSON.stringify({
            modelId: "gpt-5",
            endpointId: "openai-default",
            expectedRevision: 0,
          }),
        ),
        { params: Promise.resolve({ provider: "openai" }) },
      );
      const text = await response.text();

      expect(response.status).toBe(503);
      expect(JSON.parse(text)).toMatchObject({
        error: { code: "assistant_unavailable" },
      });
      expect(text).not.toContain(internalCode);
    },
  );

  it("runs the trusted-mutation guard before lazy control environment setup", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "auth-secret-0123456789abcdef0123456789");
    vi.stubEnv("BETTER_AUTH_URL", "https://portal.example.com");
    vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "https://portal.example.com");
    vi.stubEnv("AGENT_CONFIG_CONTROL_KEY", "invalid");
    vi.stubEnv("AGENTOS_INTERNAL_URL", "not-a-url");
    try {
      const PUT = createAdminModelConfigSaveHandler({
        requestIdFactory: () => "default-order-request",
      });
      const untrusted = new Request(
        "https://portal.example.com/api/v1/admin/assistant/model-configs/openai",
        {
          method: "PUT",
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: "{}",
        },
      );

      const response = await PUT(untrusted, {
        params: Promise.resolve({ provider: "openai" }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        version: "1",
        requestId: "default-order-request",
        error: { code: "validation_error" },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("exports only PUT from the route module", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["PUT"]);
  });
});
