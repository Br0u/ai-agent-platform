import { describe, expect, it, vi } from "vitest";

import {
  AdminModelConfigCommandError,
  type AuthorizedModelCommand,
} from "@/server/assistant/admin-model-config-commands";
import { MutationRequestError } from "@/server/http/require-trusted-mutation";
import { createAdminModelConfigTestAndActivateHandler } from "../../handler";

const CONTEXT = {
  requestId: "55555555-5555-4555-8555-555555555555",
} as AuthorizedModelCommand;

function request(body: string) {
  return new Request(
    "https://portal.example.com/api/v1/admin/assistant/model-configs/openai/test-and-activate",
    {
      method: "POST",
      headers: {
        origin: "https://portal.example.com",
        "content-type": "application/json",
      },
      body,
    },
  );
}

function dependencies() {
  const authorize = vi.fn(async () => CONTEXT);
  const testAndActivate = vi.fn(async () => ({
    requestId: CONTEXT.requestId,
    activation: {
      version: "1" as const,
      provider: "openai" as const,
      configRevision: 4,
      activationVersion: 9,
    },
  }));
  return {
    commands: {
      authorize,
      save: vi.fn(),
      testAndActivate,
      reveal: vi.fn(),
    },
    authorize,
    testAndActivate,
  };
}

describe("POST /api/v1/admin/assistant/model-configs/[provider]/test-and-activate", () => {
  it("authorizes before an 8 KiB read and delegates exactly once with revision only", async () => {
    const order: string[] = [];
    const deps = dependencies();
    deps.authorize.mockImplementation(async () => {
      order.push("authorize");
      return CONTEXT;
    });
    const readJson = vi.fn(async () => {
      order.push("body");
      return { ok: true as const, value: { revision: 4 } };
    });
    const POST = createAdminModelConfigTestAndActivateHandler({
      commands: deps.commands,
      readJson,
    });

    const response = await POST(request("{}"), {
      params: Promise.resolve({ provider: "openai" }),
    });

    expect(order).toEqual(["authorize", "body"]);
    expect(deps.authorize).toHaveBeenCalledExactlyOnceWith(
      expect.any(Request),
      "test_and_activate",
    );
    expect(readJson).toHaveBeenCalledExactlyOnceWith(expect.any(Request), 8192);
    expect(deps.testAndActivate).toHaveBeenCalledExactlyOnceWith(
      CONTEXT,
      "openai",
      { revision: 4 },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: CONTEXT.requestId,
      activation: {
        provider: "openai",
        configRevision: 4,
        activationVersion: 9,
      },
    });
  });

  it.each([
    { revision: 4, apiKey: "TOP-SECRET" },
    { revision: 4, modelId: "gpt-5" },
    { revision: 4, endpointId: "openai-default" },
    { revision: 4, extra: true },
    { revision: 0 },
  ])("rejects a non-exact revision body %#", async (value) => {
    const deps = dependencies();
    const POST = createAdminModelConfigTestAndActivateHandler({
      commands: deps.commands,
      readJson: vi.fn(async () => ({ ok: true as const, value })),
    });

    const response = await POST(request("{}"), {
      params: Promise.resolve({ provider: "openai" }),
    });
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(deps.testAndActivate).not.toHaveBeenCalled();
    expect(text).not.toMatch(/TOP-SECRET|gpt-5|openai-default/iu);
  });

  it("does not read the body when trusted-origin/content-type authorization fails", async () => {
    const deps = dependencies();
    deps.authorize.mockRejectedValue(new MutationRequestError());
    const readJson = vi.fn();
    const POST = createAdminModelConfigTestAndActivateHandler({
      commands: deps.commands,
      readJson,
    });

    const response = await POST(request("{}"), {
      params: Promise.resolve({ provider: "openai" }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(readJson).not.toHaveBeenCalled();
  });

  it.each([
    ["configuration_conflict", 409],
    ["credential_rejected", 422],
    ["model_not_found", 422],
    ["provider_unreachable", 503],
    ["provider_timeout", 503],
    ["assistant_unavailable", 503],
  ] as const)(
    "maps the 55-second downstream outcome %s to one safe schema",
    async (code, status) => {
      const deps = dependencies();
      deps.testAndActivate.mockRejectedValue(
        new AdminModelConfigCommandError(code),
      );
      const POST = createAdminModelConfigTestAndActivateHandler({
        commands: deps.commands,
      });

      const response = await POST(request(JSON.stringify({ revision: 4 })), {
        params: Promise.resolve({ provider: "openai" }),
      });
      const text = await response.text();

      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.parse(text)).toEqual({
        version: "1",
        requestId: CONTEXT.requestId,
        error: {
          code,
          message: expect.any(String),
          retryable: expect.any(Boolean),
        },
      });
      expect(text).not.toMatch(/agent:7777|private|raw response/iu);
    },
  );

  it("normalizes the local 55-second transport timeout to safe unavailable", async () => {
    const deps = dependencies();
    deps.testAndActivate.mockRejectedValue(
      new AdminModelConfigCommandError("timeout"),
    );
    const POST = createAdminModelConfigTestAndActivateHandler({
      commands: deps.commands,
    });

    const response = await POST(request(JSON.stringify({ revision: 4 })), {
      params: Promise.resolve({ provider: "openai" }),
    });
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({
      error: { code: "assistant_unavailable" },
    });
    expect(text).not.toContain("timeout");
  });

  it("rejects the wrong Provider slug after authorization", async () => {
    const deps = dependencies();
    const readJson = vi.fn();
    const POST = createAdminModelConfigTestAndActivateHandler({
      commands: deps.commands,
      readJson,
    });

    const response = await POST(request("{}"), {
      params: Promise.resolve({ provider: "openai%2Fother" }),
    });

    expect(response.status).toBe(400);
    expect(deps.authorize).toHaveBeenCalledOnce();
    expect(readJson).not.toHaveBeenCalled();
  });

  it("exports only POST from the route module", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["POST"]);
  });
});
