import { describe, expect, it, vi } from "vitest";

import {
  createAdminAssistantErrorResponse,
  isAdminAssistantChatResponse,
  isAdminAssistantStatusResponse,
  parseAdminAssistantStatusResponse,
} from "./admin-assistant-contract";

function adminResponse(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    requestId: "request-1",
    mode: "placeholder",
    message: {
      id: "message-1",
      role: "assistant",
      content: "测试回复",
    },
    suggestedActions: [],
    ...overrides,
  };
}

describe("admin assistant test contract", () => {
  it("marks only transient administrator errors retryable", () => {
    expect(
      createAdminAssistantErrorResponse("req-1", "rate_limited").error
        .retryable,
    ).toBe(true);
    expect(
      createAdminAssistantErrorResponse("req-1", "assistant_unavailable").error
        .retryable,
    ).toBe(true);
    for (const code of [
      "authentication_required",
      "permission_denied",
      "validation_error",
    ] as const) {
      expect(
        createAdminAssistantErrorResponse("req-1", code).error.retryable,
      ).toBe(false);
    }
  });

  it("accepts the exact protected test response without a public session", () => {
    expect(isAdminAssistantChatResponse(adminResponse())).toBe(true);
  });

  it("rejects public or forged session metadata", () => {
    expect(
      isAdminAssistantChatResponse(
        adminResponse({
          session: {
            temporary: true,
            expiresAt: "2026-07-13T12:00:00.000Z",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isAdminAssistantChatResponse(
        adminResponse({ expiresAt: "2026-07-13T12:00:00.000Z" }),
      ),
    ).toBe(false);
  });
});

function statusResponse(runtimeOverrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    requestId: "status-request-1",
    status: {
      mode: "agentos",
      runtime: {
        live: true,
        ready: true,
        capability: "available",
        providerMode: "agentos",
        selectedProvider: "agentos",
        persistence: "agentos",
        circuits: {
          readiness: { state: "closed", consecutiveFailures: 0 },
          execution: { state: "closed", consecutiveFailures: 0 },
        },
        readiness: {
          cacheTtlMs: 5_000,
          probeTimeoutMs: 1_500,
          failureThreshold: 3,
        },
        source: "dynamic",
        provider: "deepseek",
        modelId: "deepseek-chat",
        configRevision: 3,
        activationVersion: 8,
        testStatus: "passed",
        ...runtimeOverrides,
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
          label: "运行数据库",
          state: "ready",
          detail: "运行依赖已就绪",
        },
        {
          id: "model",
          label: "模型",
          state: "ready",
          detail: "动态模型已启用",
        },
        {
          id: "public_entry",
          label: "公开入口",
          state: "ready",
          detail: "AgentOS 模式可用",
        },
      ],
      configuration: {
        defaultAgent: "码多多（maduoduo）",
        model: "DeepSeek / deepseek-chat（动态配置）",
        skills: "未接入",
        sessionStorage: "AgentOS 持久化已启用",
      },
      message: "AI 助理基础服务已就绪。",
    },
  };
}

describe("admin assistant status contract", () => {
  it.each([
    [
      "dynamic",
      {
        source: "dynamic",
        provider: "deepseek",
        modelId: "deepseek-chat",
        configRevision: 3,
        activationVersion: 8,
        testStatus: "passed",
      },
    ],
    [
      "deployment",
      {
        source: "deployment",
        provider: "openai",
        modelId: "gpt-5",
        configRevision: null,
        activationVersion: null,
        testStatus: "untested",
      },
    ],
    [
      "none placeholder",
      {
        capability: "placeholder",
        selectedProvider: "unavailable",
        source: "none",
        provider: null,
        modelId: null,
        configRevision: null,
        activationVersion: null,
        testStatus: "not_configured",
      },
    ],
    [
      "none unavailable",
      {
        live: true,
        ready: false,
        capability: "degraded",
        selectedProvider: "unavailable",
        source: "none",
        provider: null,
        modelId: null,
        configRevision: null,
        activationVersion: null,
        testStatus: "unavailable",
      },
    ],
    [
      "known empty slot with degraded readiness",
      {
        live: true,
        ready: false,
        capability: "degraded",
        selectedProvider: "unavailable",
        source: "none",
        provider: null,
        modelId: null,
        configRevision: null,
        activationVersion: null,
        testStatus: "not_configured",
      },
    ],
  ])("accepts exact %s runtime metadata", (_name, runtime) => {
    expect(isAdminAssistantStatusResponse(statusResponse(runtime))).toBe(true);
  });

  it.each([
    ["api Key", { apiKey: "sk-private" }],
    ["Key last four", { lastFour: "1234" }],
    ["Endpoint URL", { endpointUrl: "https://private.example.com" }],
    ["Endpoint ID", { endpointId: "deepseek-default" }],
    ["error detail", { errorDetail: "private provider response" }],
  ])("rejects an extra %s runtime field", (_name, leaked) => {
    expect(isAdminAssistantStatusResponse(statusResponse(leaked))).toBe(false);
  });

  it.each([
    [
      "none with provider metadata",
      {
        source: "none",
        provider: "openai",
        modelId: "gpt-5",
        configRevision: null,
        activationVersion: null,
        testStatus: "not_configured",
      },
    ],
    [
      "deployment revision",
      {
        source: "deployment",
        provider: "openai",
        modelId: "gpt-5",
        configRevision: 1,
        activationVersion: null,
        testStatus: "untested",
      },
    ],
    [
      "dynamic without activation",
      {
        source: "dynamic",
        provider: "openai",
        modelId: "gpt-5",
        configRevision: 1,
        activationVersion: null,
        testStatus: "passed",
      },
    ],
    [
      "dynamic untested",
      {
        source: "dynamic",
        provider: "openai",
        modelId: "gpt-5",
        configRevision: 1,
        activationVersion: 1,
        testStatus: "untested",
      },
    ],
    [
      "degraded selected Provider",
      {
        live: true,
        ready: false,
        capability: "degraded",
        selectedProvider: "agentos",
      },
    ],
    [
      "placeholder selected AgentOS",
      {
        capability: "placeholder",
        source: "none",
        provider: null,
        modelId: null,
        configRevision: null,
        activationVersion: null,
        testStatus: "not_configured",
        selectedProvider: "agentos",
      },
    ],
    ["available without selected AgentOS", { selectedProvider: "unavailable" }],
  ])("rejects contradictory runtime metadata: %s", (_name, runtime) => {
    expect(isAdminAssistantStatusResponse(statusResponse(runtime))).toBe(false);
  });

  it.each([
    ["unknown Provider", { provider: "other" }],
    ["URL-like Model ID", { modelId: "https://private.example.com/model" }],
    ["control in Model ID", { modelId: "deepseek\u0000-chat" }],
    ["oversized Model ID", { modelId: "m".repeat(129) }],
    ["zero config revision", { configRevision: 0 }],
    ["fractional config revision", { configRevision: 1.5 }],
    ["zero activation version", { activationVersion: 0 }],
    ["fractional activation version", { activationVersion: 1.5 }],
    ["failed test status", { testStatus: "failed" }],
    ["future test status", { testStatus: "future" }],
  ])("rejects invalid safe metadata: %s", (_name, override) => {
    expect(isAdminAssistantStatusResponse(statusResponse(override))).toBe(
      false,
    );
  });

  it("rejects accessors and symbol fields instead of invoking them", () => {
    const response = statusResponse();
    const getter = vi.fn(() => "deepseek-chat");
    Object.defineProperty(response.status.runtime, "modelId", {
      enumerable: true,
      get: getter,
    });

    expect(isAdminAssistantStatusResponse(response)).toBe(false);
    expect(getter).not.toHaveBeenCalled();

    const symbolResponse = statusResponse();
    Object.defineProperty(symbolResponse.status.runtime, Symbol("key"), {
      enumerable: false,
      value: "private",
    });
    expect(isAdminAssistantStatusResponse(symbolResponse)).toBe(false);
  });

  it("takes one runtime descriptor snapshot without TOCTOU re-reads", () => {
    const response = statusResponse();
    const runtime = response.status.runtime;
    const descriptorReads = new Map<PropertyKey, number>();
    response.status.runtime = new Proxy(runtime, {
      getOwnPropertyDescriptor(target, property) {
        descriptorReads.set(property, (descriptorReads.get(property) ?? 0) + 1);
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });

    expect(isAdminAssistantStatusResponse(response)).toBe(true);
    for (const key of Reflect.ownKeys(runtime)) {
      expect(descriptorReads.get(key), String(key)).toBe(1);
    }
  });

  it("parses into detached plain objects and arrays", () => {
    const source = statusResponse();
    const parsed = parseAdminAssistantStatusResponse(source);

    expect(parsed).not.toBeNull();
    if (parsed === null) throw new Error("expected parsed status");
    expect(parsed).not.toBe(source);
    expect(parsed.status).not.toBe(source.status);
    expect(parsed.status.runtime).not.toBe(source.status.runtime);
    expect(parsed.status.runtime.circuits).not.toBe(
      source.status.runtime.circuits,
    );
    expect(parsed.status.runtime.circuits.readiness).not.toBe(
      source.status.runtime.circuits.readiness,
    );
    expect(parsed.status.runtime.readiness).not.toBe(
      source.status.runtime.readiness,
    );
    expect(parsed.status.services).not.toBe(source.status.services);
    expect(parsed.status.services[0]).not.toBe(source.status.services[0]);
    expect(parsed.status.configuration).not.toBe(source.status.configuration);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(parsed.status)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(parsed.status.runtime)).toBe(Object.prototype);
    expect(Array.isArray(parsed.status.services)).toBe(true);
    expect(Object.getPrototypeOf(parsed.status.services)).toBe(Array.prototype);

    source.requestId = "mutated-request";
    source.status.message = "mutated message";
    source.status.runtime.modelId = "mutated-model";
    source.status.runtime.circuits.readiness.consecutiveFailures = 99;
    source.status.runtime.readiness.cacheTtlMs = 99;
    source.status.services[0]!.detail = "mutated detail";
    source.status.services.push({
      id: "model",
      label: "mutated",
      state: "degraded",
      detail: "mutated",
    });
    source.status.configuration.model = "mutated configuration";

    expect(parsed.requestId).toBe("status-request-1");
    expect(parsed.status.message).toBe("AI 助理基础服务已就绪。");
    expect(parsed.status.runtime.modelId).toBe("deepseek-chat");
    expect(parsed.status.runtime.circuits.readiness.consecutiveFailures).toBe(
      0,
    );
    expect(parsed.status.runtime.readiness.cacheTtlMs).toBe(5_000);
    expect(parsed.status.services).toHaveLength(4);
    expect(parsed.status.services[0]?.detail).toBe("基础服务已就绪");
    expect(parsed.status.configuration.model).toBe(
      "DeepSeek / deepseek-chat（动态配置）",
    );
  });

  it("rejects extra fields outside runtime metadata", () => {
    const response = statusResponse() as ReturnType<typeof statusResponse> & {
      key?: string;
    };
    response.key = "sk-private";

    expect(isAdminAssistantStatusResponse(response)).toBe(false);
    expect(
      isAdminAssistantStatusResponse({
        ...statusResponse(),
        status: { ...statusResponse().status, error: "private detail" },
      }),
    ).toBe(false);
  });
});
