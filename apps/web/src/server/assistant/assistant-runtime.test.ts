import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAssistantRuntime,
  getAssistantRuntime,
  readSafeAssistantRuntimeStatus,
} from "./assistant-runtime";

const VALID_ENVIRONMENT = {
  ASSISTANT_PUBLIC_ORIGIN: "https://portal.example.com",
  ASSISTANT_SESSION_SECRET: "session-secret-0123456789abcdef0123456789",
  ASSISTANT_RATE_LIMIT_SECRET: "rate-secret-0123456789abcdef0123456789",
  ASSISTANT_PROVIDER_MODE: "placeholder",
  ASSISTANT_AGENTOS_DEFAULT_AGENT_ID: "support-agent",
  ASSISTANT_AGENTOS_READINESS_TTL_MS: "5000",
  ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS: "1500",
  ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD: "3",
  ASSISTANT_AGENTOS_CIRCUIT_RESET_MS: "30000",
  AGENTOS_INTERNAL_URL: "http://agent:7777",
  OS_SECURITY_KEY: "agentos-internal-security-key-32-bytes",
  TRUST_NGINX_PROXY: "false",
} as const;

const RUNTIME_KEY = Symbol.for("ai-agent-platform:assistant:runtime:v1");

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_KEY];
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("assistant server runtime", () => {
  it.each([
    ["invalid provider mode", "ASSISTANT_PROVIDER_MODE", "raw-auto-mode"],
    ["invalid proxy mode", "TRUST_NGINX_PROXY", "raw-maybe-proxy"],
    ["missing AgentOS setting", "ASSISTANT_AGENTOS_READINESS_TTL_MS", ""],
  ])(
    "returns an exact safe degraded default status for %s",
    async (_name, key, value) => {
      for (const [environmentKey, environmentValue] of Object.entries(
        VALID_ENVIRONMENT,
      )) {
        vi.stubEnv(environmentKey, environmentValue);
      }
      vi.stubEnv(key, value);

      const status = await readSafeAssistantRuntimeStatus();

      expect(status).toEqual({
        live: false,
        ready: false,
        capability: "degraded",
        message: "助手基础服务暂不可用。",
      });
      expect(JSON.stringify(status)).not.toMatch(
        /raw-auto-mode|raw-maybe-proxy|agent:7777|security-key/iu,
      );
    },
  );

  it("preserves injected success and sanitizes injected failure", async () => {
    const healthy = {
      live: true,
      ready: true,
      capability: "placeholder" as const,
      message: "模型尚未配置，当前为安全占位模式。",
    };

    await expect(
      readSafeAssistantRuntimeStatus({ status: async () => healthy }),
    ).resolves.toEqual(healthy);
    await expect(
      readSafeAssistantRuntimeStatus({
        status: async () => {
          throw new Error("raw http://agent:7777 secret");
        },
      }),
    ).resolves.toEqual({
      live: false,
      ready: false,
      capability: "degraded",
      message: "助手基础服务暂不可用。",
    });
  });

  it("does not probe AgentOS while Provider mode is disabled", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const runtime = createAssistantRuntime({
      environment: VALID_ENVIRONMENT,
      fetcher,
      createRateLimiter: () => ({ consume: vi.fn(async () => undefined) }),
    });

    await expect(runtime.resolveProvider()).resolves.toMatchObject({
      mode: "placeholder",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports healthy AgentOS placeholder capability without exposing internals", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          live: true,
          ready: true,
          capability: "placeholder",
          message: "internal database detail",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ ready: true, capability: "placeholder" }),
      );
    const runtime = createAssistantRuntime({
      environment: {
        ...VALID_ENVIRONMENT,
        ASSISTANT_PROVIDER_MODE: "agentos",
      },
      fetcher,
      createRateLimiter: () => ({ consume: vi.fn(async () => undefined) }),
    });

    const status = await runtime.status();

    expect(status).toEqual({
      live: true,
      ready: true,
      capability: "placeholder",
      message: "模型尚未配置，当前为安全占位模式。",
    });
    expect(JSON.stringify(status)).not.toMatch(
      /agent:7777|database detail|security-key/iu,
    );
    await expect(runtime.resolveProvider()).resolves.toMatchObject({
      mode: "placeholder",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns one safe degraded snapshot for malformed AgentOS responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ready: "yes", internal: "secret" }));
    const runtime = createAssistantRuntime({
      environment: VALID_ENVIRONMENT,
      fetcher,
      createRateLimiter: () => ({ consume: vi.fn(async () => undefined) }),
    });

    await expect(runtime.status()).resolves.toEqual({
      live: false,
      ready: false,
      capability: "degraded",
      message: "助手基础服务暂不可用。",
    });
  });

  it("fails closed only when explicit AgentOS mode cannot become ready", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ broken: "private" }));
    const runtime = createAssistantRuntime({
      environment: {
        ...VALID_ENVIRONMENT,
        ASSISTANT_PROVIDER_MODE: "agentos",
      },
      fetcher,
      createRateLimiter: () => ({ consume: vi.fn(async () => undefined) }),
    });

    await expect(runtime.resolveProvider()).rejects.toMatchObject({
      code: "ASSISTANT_RUNTIME_UNAVAILABLE",
    });
  });

  it("shares the default runtime across route bundles without reading env at import", () => {
    for (const [name, value] of Object.entries(VALID_ENVIRONMENT)) {
      vi.stubEnv(name, value);
    }
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://runtime:runtime@127.0.0.1:5432/runtime",
    );

    expect(getAssistantRuntime()).toBe(getAssistantRuntime());
  });
});
