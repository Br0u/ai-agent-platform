import { describe, expect, it, vi } from "vitest";

import { AuthAccessError } from "@/server/auth/access";
import { SensitiveActionError } from "@/server/auth/sensitive-action";
import {
  AdminModelConfigCommandError,
  type AuthorizedModelCommand,
} from "@/server/assistant/admin-model-config-commands";
import {
  AssistantRateLimitExceededError,
  AssistantRateLimitUnavailableError,
} from "@/server/assistant/assistant-rate-limit";
import { MutationRequestError } from "@/server/http/require-trusted-mutation";
import { createAdminModelConfigRevealHandler } from "../../handler";

const CONTEXT = {
  requestId: "66666666-6666-4666-8666-666666666666",
} as AuthorizedModelCommand;
const KEY = "ULTRA-SECRET-KEY";

function request(body: string) {
  return new Request(
    "https://portal.example.com/api/v1/admin/assistant/model-configs/openai/reveal-key",
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

function secretResponse() {
  return Response.json(
    { version: "1", requestId: CONTEXT.requestId, key: KEY },
    {
      headers: {
        "Cache-Control": "no-store, private",
        Pragma: "no-cache",
      },
    },
  );
}

function dependencies() {
  const authorize = vi.fn(async () => CONTEXT);
  const reveal = vi.fn(async () => secretResponse());
  return {
    commands: {
      authorize,
      save: vi.fn(),
      testAndActivate: vi.fn(),
      reveal,
    },
    authorize,
    reveal,
  };
}

function expectSecretHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store, private");
  expect(response.headers.get("pragma")).toBe("no-cache");
}

describe("POST /api/v1/admin/assistant/model-configs/[provider]/reveal-key", () => {
  it("authorizes before reading revision and returns the Task14 response directly", async () => {
    const order: string[] = [];
    const deps = dependencies();
    deps.authorize.mockImplementation(async () => {
      order.push("authorize");
      return CONTEXT;
    });
    const readJson = vi.fn(async () => {
      order.push("body");
      return { ok: true as const, value: { revision: 7 } };
    });
    const POST = createAdminModelConfigRevealHandler({
      commands: deps.commands,
      readJson,
    });

    const response = await POST(request("{}"), {
      params: Promise.resolve({ provider: "openai" }),
    });

    expect(order).toEqual(["authorize", "body"]);
    expect(deps.authorize).toHaveBeenCalledExactlyOnceWith(
      expect.any(Request),
      "reveal",
    );
    expect(readJson).toHaveBeenCalledExactlyOnceWith(expect.any(Request), 8192);
    expect(deps.reveal).toHaveBeenCalledExactlyOnceWith(CONTEXT, "openai", {
      revision: 7,
    });
    expect(response.status).toBe(200);
    expectSecretHeaders(response);
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: CONTEXT.requestId,
      key: KEY,
    });
  });

  it.each([
    [new SensitiveActionError("AUTH_REAUTH_REQUIRED"), 401],
    [new SensitiveActionError("AUTH_MFA_REQUIRED"), 401],
  ] as const)(
    "maps %s to exact versioned re-auth without body read",
    async (error, status) => {
      const deps = dependencies();
      deps.authorize.mockRejectedValue(error);
      const readJson = vi.fn();
      const POST = createAdminModelConfigRevealHandler({
        commands: deps.commands,
        readJson,
        requestIdFactory: () => "reveal-public-request",
      });

      const response = await POST(request("{}"), {
        params: Promise.resolve({ provider: "openai" }),
      });

      expect(response.status).toBe(status);
      expectSecretHeaders(response);
      await expect(response.json()).resolves.toEqual({
        version: "1",
        requestId: "reveal-public-request",
        error: {
          code: "reauth_required",
          message: "Recent password and MFA verification required",
          retryable: false,
        },
        redirectTo: "/staff/re-auth",
      });
      expect(readJson).not.toHaveBeenCalled();
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
  ] as const)(
    "maps trusted/auth boundary failure %# before body read",
    async (error, status, code) => {
      const deps = dependencies();
      deps.authorize.mockRejectedValue(error);
      const readJson = vi.fn();
      const POST = createAdminModelConfigRevealHandler({
        commands: deps.commands,
        readJson,
      });

      const response = await POST(request("{}"), {
        params: Promise.resolve({ provider: "openai" }),
      });

      expect(response.status).toBe(status);
      expectSecretHeaders(response);
      await expect(response.json()).resolves.toMatchObject({
        version: "1",
        error: { code },
      });
      expect(readJson).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ revision: 7, apiKey: KEY }, 400],
    [{ revision: 7, extra: true }, 400],
    [{ revision: -1 }, 400],
  ] as const)(
    "rejects a non-exact revision without echo %#",
    async (value, status) => {
      const deps = dependencies();
      const POST = createAdminModelConfigRevealHandler({
        commands: deps.commands,
        readJson: vi.fn(async () => ({ ok: true as const, value })),
      });

      const response = await POST(request("{}"), {
        params: Promise.resolve({ provider: "openai" }),
      });
      const text = await response.text();

      expect(response.status).toBe(status);
      expectSecretHeaders(response);
      expect(text).not.toContain(KEY);
      expect(deps.reveal).not.toHaveBeenCalled();
    },
  );

  it.each([
    [new AssistantRateLimitExceededError(317), 429, "rate_limited"],
    [new AssistantRateLimitUnavailableError(), 503, "storage_unavailable"],
    [
      new AdminModelConfigCommandError("configuration_conflict"),
      409,
      "configuration_conflict",
    ],
    [
      new AdminModelConfigCommandError("storage_unavailable"),
      503,
      "storage_unavailable",
    ],
    [new Error(`private failure ${KEY}`), 503, "assistant_unavailable"],
  ] as const)(
    "maps limiter/preflight/audit failure %# without exposing the key",
    async (error, status, code) => {
      const deps = dependencies();
      deps.reveal.mockRejectedValue(error);
      const POST = createAdminModelConfigRevealHandler({
        commands: deps.commands,
      });

      const response = await POST(request(JSON.stringify({ revision: 7 })), {
        params: Promise.resolve({ provider: "openai" }),
      });
      const text = await response.text();

      expect(deps.reveal).toHaveBeenCalledOnce();
      expect(response.status).toBe(status);
      expectSecretHeaders(response);
      expect(JSON.parse(text)).toMatchObject({
        version: "1",
        requestId: CONTEXT.requestId,
        error: { code },
      });
      if (status === 429) {
        expect(response.headers.get("retry-after")).toBe("317");
      }
      expect(text).not.toMatch(/ULTRA-SECRET-KEY|private failure/iu);
    },
  );

  it("uses private no-store headers for invalid Provider and unreadable body", async () => {
    const deps = dependencies();
    const readJson = vi.fn(async () => ({ ok: false as const }));
    const POST = createAdminModelConfigRevealHandler({
      commands: deps.commands,
      readJson,
    });

    const invalidProvider = await POST(request("{}"), {
      params: Promise.resolve({ provider: "OpenAI" }),
    });
    expect(invalidProvider.status).toBe(400);
    expectSecretHeaders(invalidProvider);
    expect(readJson).not.toHaveBeenCalled();

    const invalidBody = await POST(request("{}"), {
      params: Promise.resolve({ provider: "openai" }),
    });
    expect(invalidBody.status).toBe(400);
    expectSecretHeaders(invalidBody);
  });

  it("exports only POST from the route module", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["POST"]);
  });
});
