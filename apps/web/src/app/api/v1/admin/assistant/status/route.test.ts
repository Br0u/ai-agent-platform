import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentOSClient } from "@/server/assistant/agentos-client";
import {
  AgentOSRunClientError,
  type AgentOSRunClient,
} from "@/server/assistant/agentos-run-client";
import type { AgentOSExecutionCircuit } from "@/server/assistant/agentos-execution-circuit";
import type {
  AgentModelControlClient,
  AgentModelRuntimeResponse,
} from "@/server/assistant/agent-model-control-client";
import type { AssistantRuntime } from "@/server/assistant/assistant-runtime";
import { isAdminAssistantStatusResponse } from "@/features/assistant/admin-assistant-contract";

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

const runtime = vi.hoisted(() => ({
  getAssistantRuntime: vi.fn(),
  status: vi.fn(),
  readinessStatus: vi.fn(),
  inspect: vi.fn(),
}));

vi.mock("@/server/auth/access", () => ({
  AuthAccessError: auth.AuthAccessError,
  requirePermission: auth.requirePermission,
}));

vi.mock("@/server/assistant/assistant-runtime", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/assistant/assistant-runtime")
  >()),
  getAssistantRuntime: runtime.getAssistantRuntime,
}));

import {
  createAdminAssistantStatusHandler,
  loadAdminAssistantStatus,
} from "./handler";

function request(requestId?: string) {
  return new Request("http://localhost/api/v1/admin/assistant/status", {
    headers:
      requestId === undefined ? undefined : { "x-request-id": requestId },
  });
}

const AGENTOS_ENVIRONMENT = {
  ASSISTANT_PUBLIC_ORIGIN: "https://portal.example.com",
  ASSISTANT_SESSION_SECRET: "session-secret-0123456789abcdef0123456789",
  ASSISTANT_RATE_LIMIT_SECRET: "rate-secret-0123456789abcdef0123456789",
  ASSISTANT_PROVIDER_MODE: "agentos",
  ASSISTANT_AGENTOS_READINESS_TTL_MS: "5000",
  ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS: "1500",
  ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD: "3",
  ASSISTANT_AGENTOS_CIRCUIT_RESET_MS: "30000",
  ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: "55000",
  AGENTOS_INTERNAL_URL: "http://agent:7777",
  OS_SECURITY_KEY: "agentos-internal-security-key-32-bytes",
  TRUST_NGINX_PROXY: "false",
} as const;

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

function runClient(runAgent?: AgentOSRunClient["runAgent"]): AgentOSRunClient {
  return {
    runAgent: vi.fn(runAgent ?? (async () => ({ content: "真实模型回答" }))),
    deleteSession: vi.fn(async () => undefined),
  };
}

const CONTROL_REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function controlRuntime(
  overrides: Partial<AgentModelRuntimeResponse> = {},
): AgentModelRuntimeResponse {
  return {
    version: "1",
    capability: "available",
    source: "dynamic",
    provider: "deepseek",
    modelId: "deepseek-chat",
    configRevision: 3,
    activationVersion: 8,
    ...overrides,
  };
}

function placeholderControlRuntime(): AgentModelRuntimeResponse {
  return controlRuntime({
    capability: "placeholder",
    source: null,
    provider: null,
    modelId: null,
    configRevision: null,
    activationVersion: null,
  });
}

function degradedControlRuntime(): AgentModelRuntimeResponse {
  return controlRuntime({
    capability: "degraded",
    source: null,
    provider: null,
    modelId: null,
    configRevision: null,
    activationVersion: null,
  });
}

function deploymentControlRuntime(): AgentModelRuntimeResponse {
  return controlRuntime({
    source: "deployment",
    provider: "openai",
    modelId: "gpt-5",
    configRevision: null,
    activationVersion: null,
  });
}

function controlClient(
  status: AgentModelRuntimeResponse = controlRuntime(),
): Pick<AgentModelControlClient, "runtimeStatus"> {
  return { runtimeStatus: vi.fn(async () => status) };
}

function runtimeSources(
  runtimeSource: Pick<AssistantRuntime, "readinessStatus" | "inspect">,
  status: AgentModelRuntimeResponse = controlRuntime(),
) {
  return {
    runtime: runtimeSource,
    controlClient: controlClient(status),
    requestIdFactory: () => CONTROL_REQUEST_ID,
  };
}

describe("GET /api/v1/admin/assistant/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requirePermission.mockResolvedValue({
      userId: "admin-1",
      realm: "workforce",
    });
    runtime.status.mockResolvedValue({
      live: true,
      ready: true,
      capability: "placeholder",
      message: "模型尚未配置，当前为安全占位模式。",
    });
    runtime.readinessStatus.mockResolvedValue({
      probed: false,
      live: false,
      ready: false,
      capability: "placeholder",
    });
    runtime.inspect.mockReturnValue({
      providerMode: "placeholder",
      persistence: "disabled",
      circuits: {
        readiness: { state: "closed", consecutiveFailures: 0 },
        execution: { state: "closed", consecutiveFailures: 0 },
      },
      readiness: {
        cacheTtlMs: 5000,
        probeTimeoutMs: 1500,
        failureThreshold: 3,
      },
    });
    runtime.getAssistantRuntime.mockReturnValue({
      status: runtime.status,
      readinessStatus: runtime.readinessStatus,
      inspect: runtime.inspect,
    });
  });

  it("merges an available dynamic slot into safe Admin-only runtime metadata", async () => {
    const runtimeStatus = vi.fn(async () =>
      controlRuntime({
        provider: "deepseek",
        modelId: "deepseek-chat",
        configRevision: 3,
        activationVersion: 8,
      }),
    );
    const result = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus: vi.fn(async () => ({
          probed: true,
          live: true,
          ready: true,
          capability: "available" as const,
        })),
        inspect: vi.fn(() => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "closed" as const, consecutiveFailures: 0 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        })),
      },
      controlClient: { runtimeStatus },
      requestIdFactory: () => CONTROL_REQUEST_ID,
    } as never);

    expect(runtimeStatus).toHaveBeenCalledExactlyOnceWith({
      requestId: CONTROL_REQUEST_ID,
    });
    expect(result.runtime).toMatchObject({
      capability: "available",
      source: "dynamic",
      provider: "deepseek",
      modelId: "deepseek-chat",
      configRevision: 3,
      activationVersion: 8,
      testStatus: "passed",
    });
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "ready",
      detail: "动态模型已启用",
    });
    expect(result.configuration.model).toBe(
      "DeepSeek / deepseek-chat（动态配置）",
    );
  });

  it("labels a deployment bootstrap as untested without a dynamic revision", async () => {
    const result = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus: async () => ({
          probed: true,
          live: true,
          ready: true,
          capability: "available" as const,
        }),
        inspect: () => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "closed" as const, consecutiveFailures: 0 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        }),
      },
      controlClient: controlClient(
        controlRuntime({
          source: "deployment",
          provider: "openai",
          modelId: "gpt-5",
          configRevision: null,
          activationVersion: null,
        }),
      ),
      requestIdFactory: () => CONTROL_REQUEST_ID,
    } as never);

    expect(result.runtime).toMatchObject({
      source: "deployment",
      provider: "openai",
      modelId: "gpt-5",
      configRevision: null,
      activationVersion: null,
      testStatus: "untested",
    });
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "ready",
      detail: "部署模型已启用",
    });
    expect(result.configuration.model).toBe("OpenAI / gpt-5（部署配置）");
  });

  it("keeps an authoritative empty slot as not configured", async () => {
    const result = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus: async () => ({
          probed: true,
          live: true,
          ready: true,
          capability: "placeholder" as const,
        }),
        inspect: () => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "closed" as const, consecutiveFailures: 0 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        }),
      },
      controlClient: controlClient(
        controlRuntime({
          capability: "placeholder",
          source: null,
          provider: null,
          modelId: null,
          configRevision: null,
          activationVersion: null,
        }),
      ),
      requestIdFactory: () => CONTROL_REQUEST_ID,
    } as never);

    expect(result.runtime).toMatchObject({
      capability: "placeholder",
      source: "none",
      provider: null,
      modelId: null,
      configRevision: null,
      activationVersion: null,
      testStatus: "not_configured",
    });
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "not_configured",
      detail: "尚未配置",
    });
    expect(result.configuration.model).toBe("未配置");
  });

  it("fails closed when control storage reports a degraded empty slot", async () => {
    const result = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus: async () => ({
          probed: true,
          live: true,
          ready: false,
          capability: "degraded" as const,
        }),
        inspect: () => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "closed" as const, consecutiveFailures: 0 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        }),
      },
      controlClient: controlClient(
        controlRuntime({
          capability: "degraded",
          source: null,
          provider: null,
          modelId: null,
          configRevision: null,
          activationVersion: null,
        }),
      ),
      requestIdFactory: () => CONTROL_REQUEST_ID,
    } as never);

    expect(result.runtime).toMatchObject({
      ready: false,
      capability: "degraded",
      source: "none",
      provider: null,
      testStatus: "unavailable",
    });
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "degraded",
      detail: "模型状态不可用",
    });
    expect(result.configuration.model).toBe("状态不可用");
  });

  it("does not display a deployment fallback when Agent control is unreachable", async () => {
    const readinessStatus = vi.fn(async () => ({
      probed: true,
      live: true,
      ready: true,
      capability: "available" as const,
    }));
    const runtimeStatus = vi.fn(async () => {
      throw new Error(
        "private deployment openai gpt-5 https://agent.internal key",
      );
    });
    const result = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus,
        inspect: () => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "closed" as const, consecutiveFailures: 0 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        }),
      },
      controlClient: { runtimeStatus },
      requestIdFactory: () => CONTROL_REQUEST_ID,
    } as never);

    expect(readinessStatus).toHaveBeenCalledOnce();
    expect(runtimeStatus).toHaveBeenCalledOnce();
    expect(result.runtime).toMatchObject({
      ready: false,
      capability: "degraded",
      source: "none",
      provider: null,
      modelId: null,
      configRevision: null,
      activationVersion: null,
      testStatus: "unavailable",
    });
    expect(result.configuration.model).toBe("状态不可用");
    expect(JSON.stringify(result)).not.toMatch(
      /deployment|openai|gpt-5|agent\.internal|private|key|fallback|回退/iu,
    );
  });

  it("still reads control status when readiness probing rejects", async () => {
    const runtimeStatus = vi.fn(async () =>
      controlRuntime({ source: "dynamic" }),
    );
    const result = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus: vi.fn(async () => {
          throw new Error("private readiness detail");
        }),
        inspect: () => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "open" as const, consecutiveFailures: 3 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        }),
      },
      controlClient: { runtimeStatus },
      requestIdFactory: () => CONTROL_REQUEST_ID,
    } as never);

    expect(runtimeStatus).toHaveBeenCalledOnce();
    expect(result.runtime).toMatchObject({
      ready: false,
      capability: "degraded",
      source: "dynamic",
      provider: "deepseek",
      testStatus: "passed",
    });
    expect(JSON.stringify(result)).not.toContain("private readiness detail");
  });

  it.each([
    {
      name: "readiness placeholder while control reports dynamic available",
      readinessCapability: "placeholder" as const,
      control: controlRuntime(),
      expected: {
        source: "dynamic",
        provider: "deepseek",
        testStatus: "passed",
      },
    },
    {
      name: "readiness available while control reports placeholder",
      readinessCapability: "available" as const,
      control: placeholderControlRuntime(),
      expected: {
        source: "none",
        provider: null,
        testStatus: "not_configured",
      },
    },
  ])("fails closed on $name", async (scenario) => {
    const result = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus: async () => ({
          probed: true,
          live: true,
          ready: true,
          capability: scenario.readinessCapability,
        }),
        inspect: () => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "closed" as const, consecutiveFailures: 0 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        }),
      },
      controlClient: controlClient(scenario.control),
      requestIdFactory: () => CONTROL_REQUEST_ID,
    });

    expect(result.runtime).toMatchObject({
      ready: false,
      capability: "degraded",
      selectedProvider: "unavailable",
      ...scenario.expected,
    });
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "degraded",
      detail: "模型状态不可用",
    });
    expect(result.message).toBe("助手基础服务暂不可用。");
  });

  it.each(["open", "half-open"] as const)(
    "fails closed when readiness probe is available but its circuit is %s",
    async (readinessCircuitState) => {
      const result = await loadAdminAssistantStatus({
        runtime: {
          readinessStatus: async () => ({
            probed: true,
            live: true,
            ready: true,
            capability: "available" as const,
          }),
          inspect: () => ({
            providerMode: "agentos" as const,
            persistence: "agentos" as const,
            circuits: {
              readiness: {
                state: readinessCircuitState,
                consecutiveFailures: 3,
              },
              execution: {
                state: "closed" as const,
                consecutiveFailures: 0,
              },
            },
            readiness: {
              cacheTtlMs: 5_000,
              probeTimeoutMs: 1_500,
              failureThreshold: 3,
            },
          }),
        },
        controlClient: controlClient(),
        requestIdFactory: () => CONTROL_REQUEST_ID,
      });

      expect(result.runtime).toMatchObject({
        live: true,
        ready: false,
        capability: "degraded",
        selectedProvider: "unavailable",
        circuits: {
          readiness: {
            state: readinessCircuitState,
            consecutiveFailures: 3,
          },
        },
      });
      expect(result.services.find(({ id }) => id === "agentos")).toMatchObject({
        state: "degraded",
        detail: "依赖尚未就绪",
      });
      expect(result.services.find(({ id }) => id === "model")).toMatchObject({
        state: "degraded",
        detail: "模型状态不可用",
      });
      expect(
        result.services.find(({ id }) => id === "public_entry"),
      ).toMatchObject({ state: "degraded", detail: "降级模式" });
      expect(result.configuration.model).toBe("状态不可用");
      expect(result.message).toBe("助手基础服务暂不可用。");
    },
  );

  it("normalizes an impossible sourced placeholder before returning from the loader", async () => {
    const result = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus: async () => ({
          probed: true,
          live: true,
          ready: true,
          capability: "placeholder" as const,
        }),
        inspect: () => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "closed" as const, consecutiveFailures: 0 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        }),
      },
      controlClient: controlClient(
        controlRuntime({ capability: "placeholder", source: "dynamic" }),
      ),
      requestIdFactory: () => CONTROL_REQUEST_ID,
    });

    expect(result.runtime).toMatchObject({
      capability: "degraded",
      source: "none",
      provider: null,
      modelId: null,
      configRevision: null,
      activationVersion: null,
      testStatus: "unavailable",
    });
    expect(
      isAdminAssistantStatusResponse({
        version: "1",
        requestId: "safe-loader-result",
        status: result,
      }),
    ).toBe(true);
  });

  it("keeps placeholder mode lazy and reports AgentOS infrastructure as unprobed", async () => {
    const actual = await vi.importActual<
      typeof import("@/server/assistant/assistant-runtime")
    >("@/server/assistant/assistant-runtime");
    const fetcher = vi.fn<typeof fetch>();
    const realRuntime = actual.createAssistantRuntime({
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
    });

    const result = await loadAdminAssistantStatus(
      runtimeSources(realRuntime, placeholderControlRuntime()),
    );

    expect(result).toMatchObject({
      mode: "placeholder",
      runtime: {
        live: true,
        ready: true,
        capability: "placeholder",
        selectedProvider: "placeholder",
        persistence: "disabled",
      },
      configuration: { model: "未配置", sessionStorage: "未启用" },
    });
    expect(result.services.find(({ id }) => id === "agentos")).toMatchObject({
      state: "not_connected",
      detail: "尚未探测",
    });
    expect(result.services.find(({ id }) => id === "database")).toMatchObject({
      state: "not_connected",
      detail: "尚未探测",
    });
    expect(result.services.find(({ id }) => id === "model")?.state).toBe(
      "not_configured",
    );
    expect(result.services.find(({ id }) => id === "public_entry")?.state).toBe(
      "placeholder",
    );
    expect(result.message).toBe(
      "公开入口使用安全占位模式；AgentOS 基础设施尚未探测。",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps configured AgentOS mode while separating healthy readiness from an open execution circuit", async () => {
    const actual = await vi.importActual<
      typeof import("@/server/assistant/assistant-runtime")
    >("@/server/assistant/assistant-runtime");
    const sharedRunClient = runClient(async () => {
      throw new AgentOSRunClientError("server_error");
    });
    const realRuntime = actual.createAssistantRuntime({
      environment: AGENTOS_ENVIRONMENT,
      createHealthClient: () => availableHealthClient(),
      createRunClient: () => sharedRunClient,
    });
    const selected = await realRuntime.resolveProvider();
    const invocation = {
      request: { message: "问题", context: { pathname: "/" } },
      session: {
        kind: "persistent" as const,
        internalSessionId: "private-session",
      },
    };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await selected.provider.reply(invocation).catch(() => undefined);
    }

    const result = await loadAdminAssistantStatus(
      runtimeSources(realRuntime, deploymentControlRuntime()),
    );

    expect(result.mode).toBe("agentos");
    expect(result.runtime.persistence).toBe("agentos");
    expect(result.runtime.selectedProvider).toBe("unavailable");
    expect(result.services.find(({ id }) => id === "agentos")?.state).toBe(
      "ready",
    );
    expect(result.services.find(({ id }) => id === "database")?.state).toBe(
      "ready",
    );
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "degraded",
      detail: "模型执行暂不可用",
    });
    expect(result.services.find(({ id }) => id === "public_entry")?.state).toBe(
      "degraded",
    );
    expect(result.configuration).toMatchObject({
      defaultAgent: "码多多（maduoduo）",
      model: "OpenAI / gpt-5（部署配置，执行暂不可用）",
      sessionStorage: "AgentOS 持久化已启用",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /fallback|回退|raw|private|https?:|key|timestamp|session.?id|prompt|answer|reply|ip|user.?agent/iu,
    );
  });

  it("does not claim a configured model when placeholder capability has an open execution circuit", async () => {
    const result = await loadAdminAssistantStatus(
      runtimeSources(
        {
          readinessStatus: async () => ({
            probed: true,
            live: true,
            ready: true,
            capability: "placeholder" as const,
          }),
          inspect: () => ({
            providerMode: "agentos" as const,
            persistence: "agentos" as const,
            circuits: {
              readiness: {
                state: "closed" as const,
                consecutiveFailures: 0,
              },
              execution: {
                state: "open" as const,
                consecutiveFailures: 3,
              },
            },
            readiness: {
              cacheTtlMs: 5000,
              probeTimeoutMs: 1500,
              failureThreshold: 3,
            },
          }),
        },
        placeholderControlRuntime(),
      ),
    );

    expect(result.mode).toBe("agentos");
    expect(result.runtime.persistence).toBe("agentos");
    expect(result.runtime.selectedProvider).toBe("unavailable");
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "not_configured",
      detail: "尚未配置",
    });
    expect(
      result.services.find(({ id }) => id === "public_entry"),
    ).toMatchObject({
      state: "not_configured",
      detail: "默认 Agent 或模型尚未配置",
    });
    expect(result.configuration.model).toBe("未配置");
  });

  it("does not mark unhealthy readiness as ready when execution is also open", async () => {
    const actual = await vi.importActual<
      typeof import("@/server/assistant/assistant-runtime")
    >("@/server/assistant/assistant-runtime");
    const unhealthyHealthClient: AgentOSClient = {
      live: vi.fn(async () => ({
        live: true,
        ready: false,
        capability: "degraded" as const,
        message: "private degraded detail",
      })),
      ready: vi.fn(async () => ({
        ready: false,
        capability: "degraded" as const,
      })),
      capability: vi.fn(async () => "degraded" as const),
    };
    const executionCircuit: AgentOSExecutionCircuit = {
      execute: async (operation) => operation(),
      inspect: () => ({ state: "open", consecutiveFailures: 3 }),
    };
    const realRuntime = actual.createAssistantRuntime({
      environment: AGENTOS_ENVIRONMENT,
      createHealthClient: () => unhealthyHealthClient,
      createRunClient: () => runClient(),
      createExecutionCircuit: () => executionCircuit,
    });

    const result = await loadAdminAssistantStatus(
      runtimeSources(realRuntime, degradedControlRuntime()),
    );

    expect(result.mode).toBe("agentos");
    expect(result.runtime.selectedProvider).toBe("unavailable");
    expect(result.services.find(({ id }) => id === "agentos")?.state).toBe(
      "degraded",
    );
    expect(result.services.find(({ id }) => id === "database")?.state).toBe(
      "degraded",
    );
    expect(result.services.find(({ id }) => id === "public_entry")?.state).toBe(
      "degraded",
    );
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "degraded",
      detail: "模型状态不可用",
    });
    expect(result.configuration.model).toBe("状态不可用");
    expect(result.configuration.sessionStorage).toBe("AgentOS 持久化已启用");
  });

  it("keeps AgentOS mode and sanitized unavailable metadata when lazy composition is invalid", async () => {
    const actual = await vi.importActual<
      typeof import("@/server/assistant/assistant-runtime")
    >("@/server/assistant/assistant-runtime");
    const realRuntime = actual.createAssistantRuntime({
      environment: {
        ...AGENTOS_ENVIRONMENT,
        ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: "1",
      },
    });

    const result = await loadAdminAssistantStatus(
      runtimeSources(realRuntime, degradedControlRuntime()),
    );

    expect(result).toMatchObject({
      mode: "agentos",
      runtime: {
        live: false,
        ready: false,
        capability: "degraded",
        providerMode: "agentos",
        selectedProvider: "unavailable",
        persistence: "unavailable",
      },
      configuration: {
        defaultAgent: "码多多（maduoduo）",
        model: "状态不可用",
        sessionStorage: "状态不可用",
      },
    });
    expect(result.services.find(({ id }) => id === "agentos")).toMatchObject({
      state: "not_connected",
      detail: "尚未探测",
    });
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "degraded",
      detail: "模型状态不可用",
    });
    expect(result.services.find(({ id }) => id === "public_entry")?.state).toBe(
      "degraded",
    );
    expect(JSON.stringify(result)).not.toMatch(
      /agent:7777|security-key|private|fallback|回退|占位/iu,
    );
  });

  it("derives one consistent degraded snapshot when execution opens after readiness", async () => {
    let executionState: "closed" | "open" = "closed";
    const status = vi.fn(async () => ({
      live: true,
      ready: false,
      capability: "degraded" as const,
      message: "助手基础服务暂不可用。",
    }));
    const readinessStatus = vi.fn(async () => {
      executionState = "open";
      return {
        probed: true,
        live: true,
        ready: true,
        capability: "available" as const,
      };
    });
    const inspect = vi.fn(() => ({
      providerMode: "agentos" as const,
      persistence: "agentos" as const,
      circuits: {
        readiness: { state: "closed" as const, consecutiveFailures: 0 },
        execution: { state: executionState, consecutiveFailures: 3 },
      },
      readiness: {
        cacheTtlMs: 5000,
        probeTimeoutMs: 1500,
        failureThreshold: 3,
      },
    }));

    const result = await loadAdminAssistantStatus(
      runtimeSources({ readinessStatus, inspect }, deploymentControlRuntime()),
    );

    expect(result.runtime).toMatchObject({
      live: true,
      ready: false,
      capability: "degraded",
      selectedProvider: "unavailable",
      circuits: { execution: { state: "open", consecutiveFailures: 3 } },
    });
    expect(result.services.find(({ id }) => id === "agentos")?.state).toBe(
      "ready",
    );
    expect(result.services.find(({ id }) => id === "database")?.state).toBe(
      "ready",
    );
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "degraded",
      detail: "模型执行暂不可用",
    });
    expect(result.configuration.model).toBe(
      "OpenAI / gpt-5（部署配置，执行暂不可用）",
    );
    expect(status).not.toHaveBeenCalled();
    expect(readinessStatus).toHaveBeenCalledOnce();
    expect(inspect).toHaveBeenCalledOnce();
  });

  it("derives one consistent ready snapshot when execution recovers after readiness", async () => {
    let executionState: "closed" | "open" = "open";
    const status = vi.fn(async () => ({
      live: true,
      ready: false,
      capability: "degraded" as const,
      message: "助手基础服务暂不可用。",
    }));
    const readinessStatus = vi.fn(async () => {
      executionState = "closed";
      return {
        probed: true,
        live: true,
        ready: true,
        capability: "available" as const,
      };
    });
    const inspect = vi.fn(() => ({
      providerMode: "agentos" as const,
      persistence: "agentos" as const,
      circuits: {
        readiness: { state: "closed" as const, consecutiveFailures: 0 },
        execution: { state: executionState, consecutiveFailures: 0 },
      },
      readiness: {
        cacheTtlMs: 5000,
        probeTimeoutMs: 1500,
        failureThreshold: 3,
      },
    }));

    const result = await loadAdminAssistantStatus(
      runtimeSources({ readinessStatus, inspect }, deploymentControlRuntime()),
    );

    expect(result.runtime).toMatchObject({
      live: true,
      ready: true,
      capability: "available",
      selectedProvider: "agentos",
      circuits: { execution: { state: "closed", consecutiveFailures: 0 } },
    });
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "ready",
      detail: "部署模型已启用",
    });
    expect(result.services.find(({ id }) => id === "public_entry")?.state).toBe(
      "ready",
    );
    expect(result.configuration.model).toBe("OpenAI / gpt-5（部署配置）");
    expect(status).not.toHaveBeenCalled();
    expect(readinessStatus).toHaveBeenCalledOnce();
    expect(inspect).toHaveBeenCalledOnce();
  });

  it("exports only GET and requires exactly admin:assistant", async () => {
    const route = await import("./route");
    expect(Object.keys(route)).toEqual(["GET"]);

    const response = await route.GET(request("route-correlation"));
    expect(response.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledExactlyOnceWith(
      "admin:assistant",
    );
    expect(runtime.status).not.toHaveBeenCalled();
    expect(runtime.readinessStatus).toHaveBeenCalledOnce();
    expect(runtime.inspect).toHaveBeenCalledOnce();
  });

  it.each([
    ["AUTH_SESSION_REQUIRED", 401, "authentication_required"],
    ["AUTH_PERMISSION_DENIED", 403, "permission_denied"],
  ] as const)(
    "returns a correlated %s envelope before reading status",
    async (authCode, status, errorCode) => {
      const loadStatus = vi.fn();
      const GET = createAdminAssistantStatusHandler({
        access: {
          requirePermission: vi
            .fn()
            .mockRejectedValue(new auth.AuthAccessError(authCode, status)),
        },
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
          retryable: false,
        },
      });
      expect(loadStatus).not.toHaveBeenCalled();
    },
  );

  it("returns a safe correlated unavailable envelope for source failure", async () => {
    const GET = createAdminAssistantStatusHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
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
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/private|url|secret/iu);
  });

  it("rejects a polluted loader snapshot before serialization", async () => {
    const unsafe = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus: async () => ({
          probed: true,
          live: true,
          ready: true,
          capability: "available" as const,
        }),
        inspect: () => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "closed" as const, consecutiveFailures: 0 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        }),
      },
      controlClient: controlClient(),
      requestIdFactory: () => CONTROL_REQUEST_ID,
    });
    Object.assign(unsafe.runtime, {
      apiKey: "sk-private-loader",
      errorDetail: "private provider body",
    });
    const GET = createAdminAssistantStatusHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadStatus: vi.fn(async () => unsafe),
      requestIdFactory: () => "polluted-loader",
    });

    const response = await GET(request("polluted-loader"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      version: "1",
      requestId: "polluted-loader",
      error: {
        code: "assistant_unavailable",
        message: "AI assistant service is unavailable",
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-private|provider body/iu);
  });

  it("serializes a detached safe snapshot instead of a loader Proxy toJSON", async () => {
    const safeStatus = await loadAdminAssistantStatus({
      runtime: {
        readinessStatus: async () => ({
          probed: true,
          live: true,
          ready: true,
          capability: "available" as const,
        }),
        inspect: () => ({
          providerMode: "agentos" as const,
          persistence: "agentos" as const,
          circuits: {
            readiness: { state: "closed" as const, consecutiveFailures: 0 },
            execution: { state: "closed" as const, consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5_000,
            probeTimeoutMs: 1_500,
            failureThreshold: 3,
          },
        }),
      },
      controlClient: controlClient(),
      requestIdFactory: () => CONTROL_REQUEST_ID,
    });
    const maliciousToJSON = vi.fn(() => ({
      ...safeStatus,
      apiKey: "sk-private-proxy",
      endpointId: "private-endpoint",
      endpointUrl: "https://private.example.com",
      errorDetail: "private provider body",
    }));
    const proxiedStatus = new Proxy(safeStatus, {
      get(target, property, receiver) {
        return property === "toJSON"
          ? maliciousToJSON
          : Reflect.get(target, property, receiver);
      },
    });
    const GET = createAdminAssistantStatusHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadStatus: vi.fn(async () => proxiedStatus),
      requestIdFactory: () => "proxy-status",
    });

    const response = await GET(request("proxy-status"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      version: "1",
      requestId: "proxy-status",
      status: {
        runtime: {
          source: "dynamic",
          provider: "deepseek",
          modelId: "deepseek-chat",
        },
      },
    });
    expect(maliciousToJSON).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toMatch(
      /sk-private|private-endpoint|private\.example|provider body|apiKey|endpointUrl|errorDetail/iu,
    );
  });

  it("does not let a malicious loader AuthAccessError impersonate an authorization failure", async () => {
    const GET = createAdminAssistantStatusHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadStatus: vi
        .fn()
        .mockRejectedValue(
          new auth.AuthAccessError("AUTH_SESSION_REQUIRED", 401),
        ),
      requestIdFactory: () => "loader-auth-error",
    });

    const response = await GET(request("loader-auth-error"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: "loader-auth-error",
      error: {
        code: "assistant_unavailable",
        message: "AI assistant service is unavailable",
        retryable: true,
      },
    });
  });

  it.each([
    {
      name: "placeholder Provider with degraded AgentOS",
      inspection: {
        providerMode: "placeholder" as const,
        persistence: "disabled" as const,
        circuits: {
          readiness: { state: "open" as const, consecutiveFailures: 3 },
          execution: { state: "closed" as const, consecutiveFailures: 0 },
        },
        readiness: {
          cacheTtlMs: 5_000,
          probeTimeoutMs: 1_500,
          failureThreshold: 3,
        },
      },
      readiness: {
        probed: false,
        live: false,
        ready: false,
        capability: "degraded" as const,
      },
      expected: {
        mode: "placeholder",
        selectedProvider: "placeholder",
        publicState: "placeholder",
        agentosState: "not_connected",
      },
    },
    {
      name: "AgentOS mode without available capability",
      inspection: {
        providerMode: "agentos" as const,
        persistence: "agentos" as const,
        circuits: {
          readiness: { state: "closed" as const, consecutiveFailures: 0 },
          execution: { state: "closed" as const, consecutiveFailures: 0 },
        },
        readiness: {
          cacheTtlMs: 5_000,
          probeTimeoutMs: 1_500,
          failureThreshold: 3,
        },
      },
      readiness: {
        probed: true,
        live: true,
        ready: true,
        capability: "placeholder" as const,
      },
      expected: {
        mode: "agentos",
        selectedProvider: "unavailable",
        publicState: "not_configured",
        agentosState: "ready",
      },
    },
    {
      name: "fully available AgentOS Provider",
      inspection: {
        providerMode: "agentos" as const,
        persistence: "agentos" as const,
        circuits: {
          readiness: { state: "closed" as const, consecutiveFailures: 0 },
          execution: { state: "closed" as const, consecutiveFailures: 0 },
        },
        readiness: {
          cacheTtlMs: 5_000,
          probeTimeoutMs: 1_500,
          failureThreshold: 3,
        },
      },
      readiness: {
        probed: true,
        live: true,
        ready: true,
        capability: "available" as const,
      },
      expected: {
        mode: "agentos",
        selectedProvider: "agentos",
        publicState: "ready",
        agentosState: "ready",
      },
    },
  ])(
    "derives public entry from $name",
    async ({ readiness, inspection, expected }) => {
      const control =
        inspection.providerMode === "placeholder" ||
        readiness.capability === "placeholder"
          ? placeholderControlRuntime()
          : deploymentControlRuntime();
      const result = await loadAdminAssistantStatus(
        runtimeSources(
          {
            readinessStatus: async () => readiness,
            inspect: () => inspection,
          },
          control,
        ),
      );

      expect(result.mode).toBe(expected.mode);
      expect(result.runtime.selectedProvider).toBe(expected.selectedProvider);
      expect(
        result.services.find(({ id }) => id === "public_entry")?.state,
      ).toBe(expected.publicState);
      expect(result.services.find(({ id }) => id === "agentos")?.state).toBe(
        expected.agentosState,
      );
    },
  );

  it("shows healthy AgentOS infrastructure separately from an open model execution circuit", async () => {
    const result = await loadAdminAssistantStatus(
      runtimeSources(
        {
          readinessStatus: async () => ({
            probed: true,
            live: true,
            ready: true,
            capability: "available" as const,
          }),
          inspect: () => ({
            providerMode: "agentos" as const,
            persistence: "agentos" as const,
            circuits: {
              readiness: {
                state: "closed" as const,
                consecutiveFailures: 0,
              },
              execution: {
                state: "open" as const,
                consecutiveFailures: 3,
              },
            },
            readiness: {
              cacheTtlMs: 5000,
              probeTimeoutMs: 1500,
              failureThreshold: 3,
            },
          }),
        },
        deploymentControlRuntime(),
      ),
    );

    expect(result.runtime.selectedProvider).toBe("unavailable");
    expect(result.runtime.circuits).toEqual({
      readiness: { state: "closed", consecutiveFailures: 0 },
      execution: { state: "open", consecutiveFailures: 3 },
    });
    expect(result.services.find(({ id }) => id === "agentos")).toMatchObject({
      state: "ready",
      detail: "基础服务已就绪",
    });
    expect(result.services.find(({ id }) => id === "model")).toMatchObject({
      state: "degraded",
      detail: "模型执行暂不可用",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /timestamp|openedAt|session.?id|prompt|reply|raw/iu,
    );
  });

  it("returns a correlated safe status snapshot with circuit metadata", async () => {
    const requestIdFactory = vi.fn(() => "unused-fallback");
    const GET = createAdminAssistantStatusHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadStatus: async () => ({
        mode: "placeholder",
        runtime: {
          live: true,
          ready: true,
          capability: "placeholder",
          providerMode: "placeholder",
          selectedProvider: "placeholder",
          persistence: "disabled",
          circuits: {
            readiness: { state: "closed", consecutiveFailures: 2 },
            execution: { state: "closed", consecutiveFailures: 0 },
          },
          readiness: {
            cacheTtlMs: 5000,
            probeTimeoutMs: 1500,
            failureThreshold: 3,
          },
          source: "none",
          provider: null,
          modelId: null,
          configRevision: null,
          activationVersion: null,
          testStatus: "not_configured",
        },
        services: [
          {
            id: "agentos",
            label: "AgentOS",
            state: "ready",
            detail: "基础服务已就绪",
          },
          {
            id: "database",
            label: "会话数据库",
            state: "not_configured",
            detail: "持久化未启用",
          },
          {
            id: "model",
            label: "模型",
            state: "not_configured",
            detail: "尚未配置",
          },
          {
            id: "public_entry",
            label: "公开入口",
            state: "placeholder",
            detail: "占位模式可用",
          },
        ],
        configuration: {
          defaultAgent: "码多多（占位）",
          model: "未配置",
          skills: "未接入",
          sessionStorage: "未启用",
        },
        message: "模型尚未配置，当前为安全占位模式。",
      }),
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
    expect(body.status.runtime).toEqual({
      live: true,
      ready: true,
      capability: "placeholder",
      providerMode: "placeholder",
      selectedProvider: "placeholder",
      persistence: "disabled",
      circuits: {
        readiness: { state: "closed", consecutiveFailures: 2 },
        execution: { state: "closed", consecutiveFailures: 0 },
      },
      readiness: {
        cacheTtlMs: 5000,
        probeTimeoutMs: 1500,
        failureThreshold: 3,
      },
      source: "none",
      provider: null,
      modelId: null,
      configRevision: null,
      activationVersion: null,
      testStatus: "not_configured",
    });
    expect(JSON.stringify(body)).not.toMatch(
      /https?:|database_url|api.?key|secret|token|openedAt|monotonic|cookie|session.?id|user.?agent/iu,
    );
  });

  it("fails safely to degraded metadata when runtime configuration is invalid", async () => {
    runtime.getAssistantRuntime.mockImplementation(() => {
      throw new Error(
        "AGENTOS_INTERNAL_URL=http://agent:7777 OS_SECURITY_KEY=private",
      );
    });

    const route = await import("./route");
    const response = await route.GET(request("safe-degraded"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status.runtime).toEqual({
      live: false,
      ready: false,
      capability: "degraded",
      providerMode: "placeholder",
      selectedProvider: "unavailable",
      persistence: "unavailable",
      circuits: {
        readiness: { state: "closed", consecutiveFailures: 0 },
        execution: { state: "closed", consecutiveFailures: 0 },
      },
      readiness: { cacheTtlMs: 0, probeTimeoutMs: 0, failureThreshold: 0 },
      source: "none",
      provider: null,
      modelId: null,
      configRevision: null,
      activationVersion: null,
      testStatus: "unavailable",
    });
    expect(body.status.configuration.sessionStorage).toBe("状态不可用");
    expect(body.status.services).not.toContainEqual(
      expect.objectContaining({ state: "ready" }),
    );
    expect(
      body.status.services.find(
        ({ id }: { id: string }) => id === "public_entry",
      ),
    ).toMatchObject({ state: "degraded", detail: "降级模式" });
    expect(JSON.stringify(body)).not.toMatch(
      /agent:7777|private|security|url|secret|raw/iu,
    );
  });

  it("uses the factory for a 65-character incoming id", async () => {
    const requestIdFactory = vi.fn(() => "generated-status-id");
    const GET = createAdminAssistantStatusHandler({
      access: {
        requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
      },
      loadStatus: loadAdminAssistantStatus,
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
