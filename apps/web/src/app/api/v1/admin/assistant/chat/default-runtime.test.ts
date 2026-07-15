import { afterEach, expect, it, vi } from "vitest";

import { createAdminAssistantChatHandler } from "./handler";

const RUNTIME_KEY = Symbol.for("ai-agent-platform:assistant:runtime:v1");

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_KEY];
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("uses the real default runtime in placeholder mode without an Agent ID", async () => {
  vi.stubEnv("ASSISTANT_PROVIDER_MODE", "placeholder");
  vi.stubEnv("ASSISTANT_AGENTOS_DEFAULT_AGENT_ID", "");
  vi.stubEnv("TRUST_NGINX_PROXY", "false");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const POST = createAdminAssistantChatHandler({
    access: {
      requirePermission: vi.fn().mockResolvedValue({
        userId: "admin-default-runtime",
        realm: "workforce",
      }),
    },
    rateLimiter: { consume: vi.fn().mockResolvedValue(undefined) },
    requestIdFactory: () => "default-runtime-request",
    messageIdFactory: () => "default-runtime-message",
    clock: () => 0,
  });

  const response = await POST(
    new Request("http://localhost/api/v1/admin/assistant/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "检查默认占位 Provider",
        context: { pathname: "/admin/assistant" },
      }),
    }),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    version: "1",
    requestId: "default-runtime-request",
    mode: "placeholder",
  });
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
