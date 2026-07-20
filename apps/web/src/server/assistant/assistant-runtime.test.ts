import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentOSClient } from "./agentos-client";
import type {
  AgentOSRunClient,
  AgentOSRunSettings,
} from "./agentos-run-client";
import { AgentOSRunClientError } from "./agentos-run-client";
import {
  createAgentOSExecutionCircuit,
  type AgentOSExecutionCircuit,
} from "./agentos-execution-circuit";
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
  ASSISTANT_AGENTOS_READINESS_TTL_MS: "5000",
  ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS: "1500",
  ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD: "3",
  ASSISTANT_AGENTOS_CIRCUIT_RESET_MS: "30000",
  ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: "55000",
  AGENTOS_INTERNAL_URL: "http://agent:7777",
  OS_SECURITY_KEY: "agentos-internal-security-key-32-bytes",
  TRUST_NGINX_PROXY: "false",
} as const;

const AGENTOS_ENVIRONMENT = {
  ...VALID_ENVIRONMENT,
  ASSISTANT_PROVIDER_MODE: "agentos",
} as const;

const RUNTIME_KEY = Symbol.for("ai-agent-platform:assistant:runtime:v1");

afterEach(() => {
  delete (globalThis as Record<PropertyKey, unknown>)[RUNTIME_KEY];
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function availableHealthClient(): AgentOSClient {
  return {
    live: vi.fn(async () => ({
      live: true,
      ready: true,
      capability: "available" as const,
      message: "private health detail",
    })),
    ready: vi.fn(async () => ({
      ready: true,
      capability: "available" as const,
    })),
    capability: vi.fn(async () => "available" as const),
  };
}

function runClient(): AgentOSRunClient {
  const runAgent = vi.fn<AgentOSRunClient["runAgent"]>(async () => ({
    content: "码多多回答",
  }));
  return {
    runAgent,
    runAgentStream: vi.fn(async function* (request) {
      const result = await runAgent(request);
      yield result.content;
    }),
    deleteSession: vi.fn(async () => undefined),
  };
}

describe("assistant server runtime", () => {
  it.each([
    ["invalid provider mode", "ASSISTANT_PROVIDER_MODE", "raw-auto-mode"],
    ["invalid proxy mode", "TRUST_NGINX_PROXY", "raw-maybe-proxy"],
    ["invalid AgentOS run timeout", "ASSISTANT_AGENTOS_RUN_TIMEOUT_MS", "1"],
  ])(
    "returns an exact safe degraded default status for %s",
    async (_name, key, value) => {
      for (const [environmentKey, environmentValue] of Object.entries(
        AGENTOS_ENVIRONMENT,
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

  it("keeps placeholder mode fully lazy and ignores every AgentOS setting", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const runtime = createAssistantRuntime({
      environment: {
        ASSISTANT_PROVIDER_MODE: "placeholder",
        TRUST_NGINX_PROXY: "false",
        ASSISTANT_AGENTOS_READINESS_TTL_MS: "broken",
        ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS: "broken",
        ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD: "broken",
        ASSISTANT_AGENTOS_CIRCUIT_RESET_MS: "broken",
        ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: "broken",
        AGENTOS_INTERNAL_URL: "not a URL",
        OS_SECURITY_KEY: "short",
      },
      fetcher,
      createRateLimiter: () => ({ consume: vi.fn(async () => undefined) }),
    });

    await expect(runtime.status()).resolves.toEqual({
      live: true,
      ready: true,
      capability: "placeholder",
      message: "模型尚未配置，当前为安全占位模式。",
    });
    expect(runtime).toHaveProperty("readinessStatus");
    await expect(runtime.readinessStatus()).resolves.toEqual({
      probed: false,
      live: false,
      ready: false,
      capability: "placeholder",
    });
    await expect(runtime.resolveProvider()).resolves.toMatchObject({
      mode: "placeholder",
    });
    await expect(runtime.deleteSession("never-sent-remotely")).resolves.toBe(
      undefined,
    );
    expect(runtime.inspect()).toEqual({
      providerMode: "placeholder",
      persistence: "disabled",
      circuits: {
        readiness: { state: "closed", consecutiveFailures: 0 },
        execution: { state: "closed", consecutiveFailures: 0 },
      },
      readiness: {
        cacheTtlMs: 0,
        probeTimeoutMs: 0,
        failureThreshold: 0,
      },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("constructs one health client and one shared run client with the exact run timeout", async () => {
    const healthClient = availableHealthClient();
    const sharedRunClient = runClient();
    const createHealthClient = vi.fn(() => healthClient);
    const createRunClient = vi.fn(
      (options: { settings: AgentOSRunSettings; fetcher?: typeof fetch }) => {
        void options;
        return sharedRunClient;
      },
    );
    const runtime = createAssistantRuntime({
      environment: {
        ...AGENTOS_ENVIRONMENT,
        ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: "51000",
      },
      createHealthClient,
      createRunClient,
      createRateLimiter: () => ({ consume: vi.fn(async () => undefined) }),
    });

    await runtime.status();
    const selected = await runtime.resolveProvider();
    await selected.provider.reply({
      request: { message: "问题", context: { pathname: "/docs" } },
      session: { kind: "persistent", internalSessionId: "shared-session" },
    });
    await runtime.deleteSession("shared-session");
    expect(runtime.inspect().persistence).toBe("agentos");

    expect(createHealthClient).toHaveBeenCalledOnce();
    expect(createRunClient).toHaveBeenCalledOnce();
    expect(createRunClient.mock.calls[0]?.[0].settings.runTimeoutMs).toBe(
      51000,
    );
    expect(sharedRunClient.deleteSession).toHaveBeenCalledExactlyOnceWith(
      "shared-session",
    );
  });

  it.each([
    [undefined, 55000],
    ["51000", 51000],
    ["55000", 55000],
  ] as const)("passes run timeout %s as %i", (raw, expected) => {
    const createRunClient = vi.fn(
      (options: { settings: AgentOSRunSettings; fetcher?: typeof fetch }) => {
        void options;
        return runClient();
      },
    );
    const runtime = createAssistantRuntime({
      environment: {
        ...AGENTOS_ENVIRONMENT,
        ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: raw,
      },
      createHealthClient: () => availableHealthClient(),
      createRunClient,
    });

    runtime.inspect();

    expect(createRunClient.mock.calls[0]?.[0].settings.runTimeoutMs).toBe(
      expected,
    );
  });

  it.each(["50999", "55001", "51000.5", "Infinity", "NaN", ""])(
    "rejects invalid run timeout %s when composing AgentOS status",
    async (raw) => {
      const runtime = createAssistantRuntime({
        environment: {
          ...AGENTOS_ENVIRONMENT,
          ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: raw,
        },
      });

      await expect(runtime.status()).rejects.toThrow(
        "ASSISTANT_AGENTOS_RUN_TIMEOUT_MS",
      );
    },
  );

  it.each([
    ["invalid URL", { AGENTOS_INTERNAL_URL: "not a URL" }],
    ["invalid security key", { OS_SECURITY_KEY: "short" }],
    [
      "invalid readiness timeout",
      { ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS: "broken" },
    ],
    ["invalid run timeout", { ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: "1" }],
  ])(
    "keeps AgentOS selected but marks persistence unavailable for %s",
    async (_name, override) => {
      const runtime = createAssistantRuntime({
        environment: { ...AGENTOS_ENVIRONMENT, ...override },
      });

      expect(runtime.inspect()).toEqual({
        providerMode: "agentos",
        persistence: "unavailable",
        circuits: {
          readiness: { state: "closed", consecutiveFailures: 0 },
          execution: { state: "closed", consecutiveFailures: 0 },
        },
        readiness: {
          cacheTtlMs: 0,
          probeTimeoutMs: 0,
          failureThreshold: 0,
        },
      });
      await expect(readSafeAssistantRuntimeStatus(runtime)).resolves.toEqual({
        live: false,
        ready: false,
        capability: "degraded",
        message: "助手基础服务暂不可用。",
      });
    },
  );

  it("does not silently select placeholder when AgentOS is healthy but capability is unavailable", async () => {
    const healthClient: AgentOSClient = {
      live: vi.fn(async () => ({
        live: true,
        ready: true,
        capability: "placeholder" as const,
        message: "private detail",
      })),
      ready: vi.fn(async () => ({
        ready: true,
        capability: "placeholder" as const,
      })),
      capability: vi.fn(async () => "placeholder" as const),
    };
    const runtime = createAssistantRuntime({
      environment: AGENTOS_ENVIRONMENT,
      createHealthClient: () => healthClient,
      createRunClient: () => runClient(),
    });

    await expect(runtime.status()).resolves.toEqual({
      live: true,
      ready: true,
      capability: "placeholder",
      message: "模型尚未配置，当前为安全占位模式。",
    });
    await expect(runtime.resolveProvider()).rejects.toMatchObject({
      code: "ASSISTANT_RUNTIME_UNAVAILABLE",
    });
  });

  it("lets the next real run become the single half-open probe after reset", async () => {
    let now = 0;
    const sharedRunClient = runClient();
    vi.mocked(sharedRunClient.runAgent)
      .mockRejectedValueOnce(new AgentOSRunClientError("timeout"))
      .mockRejectedValueOnce(new AgentOSRunClientError("timeout"))
      .mockRejectedValueOnce(new AgentOSRunClientError("timeout"))
      .mockResolvedValueOnce({ content: "恢复后的真实回答" });
    const runtime = createAssistantRuntime({
      environment: AGENTOS_ENVIRONMENT,
      createHealthClient: () => availableHealthClient(),
      createRunClient: () => sharedRunClient,
      createExecutionCircuit: (options) =>
        createAgentOSExecutionCircuit({
          ...options,
          resetAfterMs: 10,
          now: () => now,
        }),
    });
    const invocation = {
      request: { message: "问题", context: { pathname: "/" } },
      session: {
        kind: "persistent" as const,
        internalSessionId: "internal-session",
      },
    };

    const initialSelection = await runtime.resolveProvider();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        initialSelection.provider.reply(invocation),
      ).rejects.toMatchObject({ code: "ASSISTANT_EXECUTION_UNAVAILABLE" });
    }

    const openSelection = await runtime.resolveProvider();
    await expect(
      openSelection.provider.reply(invocation),
    ).rejects.toMatchObject({
      code: "ASSISTANT_EXECUTION_UNAVAILABLE",
    });
    expect(sharedRunClient.runAgent).toHaveBeenCalledTimes(3);

    now = 10;
    const recoverySelection = await runtime.resolveProvider();
    await expect(recoverySelection.provider.reply(invocation)).resolves.toEqual(
      {
        content: "恢复后的真实回答",
        suggestedActions: [],
      },
    );
    expect(sharedRunClient.runAgent).toHaveBeenCalledTimes(4);
    expect(runtime.inspect().circuits.execution).toEqual({
      state: "closed",
      consecutiveFailures: 0,
    });
  });

  it("keeps readiness and execution circuits independent and degrades status when execution opens", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/internal/health/live")) {
        return Response.json({
          live: true,
          ready: true,
          capability: "available",
          message: "private detail",
        });
      }
      if (url.endsWith("/internal/health/ready")) {
        return Response.json({ ready: true, capability: "available" });
      }
      if (url.endsWith("/agents/maduoduo/runs") && init?.method === "POST") {
        return new Response("private model failure", { status: 500 });
      }
      throw new Error("unexpected URL");
    });
    const runtime = createAssistantRuntime({
      environment: AGENTOS_ENVIRONMENT,
      fetcher,
      createRateLimiter: () => ({ consume: vi.fn(async () => undefined) }),
    });
    const selected = await runtime.resolveProvider();
    const invocation = {
      request: { message: "问题", context: { pathname: "/" } },
      session: {
        kind: "persistent" as const,
        internalSessionId: "internal-session",
      },
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(selected.provider.reply(invocation)).rejects.toMatchObject({
        code: "ASSISTANT_EXECUTION_UNAVAILABLE",
      });
    }

    expect(runtime.inspect().circuits).toEqual({
      readiness: { state: "closed", consecutiveFailures: 0 },
      execution: { state: "open", consecutiveFailures: 3 },
    });
    expect(runtime.inspect().persistence).toBe("agentos");
    await expect(runtime.status()).resolves.toEqual({
      live: true,
      ready: false,
      capability: "degraded",
      message: "助手基础服务暂不可用。",
    });
    expect(runtime).toHaveProperty("readinessStatus");
    await expect(runtime.readinessStatus()).resolves.toEqual({
      probed: true,
      live: true,
      ready: true,
      capability: "available",
    });
    const openSelection = await runtime.resolveProvider();
    await expect(
      openSelection.provider.reply(invocation),
    ).rejects.toMatchObject({
      code: "ASSISTANT_EXECUTION_UNAVAILABLE",
    });
    expect(
      fetcher.mock.calls.filter(([input]) =>
        String(input).endsWith("/agents/maduoduo/runs"),
      ),
    ).toHaveLength(3);
  });

  it("rejects a half-open execution circuit after readiness without invoking it", async () => {
    const execute = vi.fn();
    const halfOpenCircuit: AgentOSExecutionCircuit = {
      execute,
      inspect: () => ({ state: "half-open", consecutiveFailures: 3 }),
    };
    const runtime = createAssistantRuntime({
      environment: AGENTOS_ENVIRONMENT,
      createHealthClient: () => availableHealthClient(),
      createRunClient: () => runClient(),
      createExecutionCircuit: () => halfOpenCircuit,
    });

    await expect(runtime.resolveProvider()).rejects.toMatchObject({
      code: "ASSISTANT_RUNTIME_UNAVAILABLE",
    });
    await expect(runtime.status()).resolves.toEqual({
      live: true,
      ready: false,
      capability: "degraded",
      message: "助手基础服务暂不可用。",
    });
    expect(runtime.inspect().persistence).toBe("agentos");
    expect(execute).not.toHaveBeenCalled();
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
