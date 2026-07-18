import {
  AuthAccessError,
  requirePermission,
  type AccessService,
} from "@/server/auth/access";
import {
  createAdminAssistantErrorResponse,
  isAdminAssistantStatusResponse,
  type AdminAssistantStatusSnapshot,
  type AdminAssistantStatusResponse,
} from "@/features/assistant/admin-assistant-contract";
import {
  ADMIN_MODEL_PROVIDERS,
  type AdminModelProvider,
} from "@/features/assistant/admin-model-config-contract";
import {
  createAgentModelControlClient,
  resolveAgentModelControlSettings,
  type AgentModelControlClient,
  type AgentModelRuntimeResponse,
} from "@/server/assistant/agent-model-control-client";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  deriveAssistantRuntimeStatus,
  getAssistantRuntime,
  type AssistantRuntime,
  type AssistantRuntimeInspection,
  type AssistantRuntimeReadinessStatus,
  type AssistantRuntimeStatus,
} from "@/server/assistant/assistant-runtime";

type AdminAssistantStatusDependencies = {
  access: Pick<AccessService, "requirePermission">;
  loadStatus: () => Promise<AdminAssistantStatusSnapshot>;
  requestIdFactory: () => string;
};

type AdminAssistantStatusLoadOptions = {
  runtime?: Pick<AssistantRuntime, "readinessStatus" | "inspect">;
  controlClient?: Pick<AgentModelControlClient, "runtimeStatus">;
  requestIdFactory?: () => string;
};

type SafeControlRuntime = {
  capability: "placeholder" | "available" | "degraded";
  source: "none" | "deployment" | "dynamic";
  provider: AdminModelProvider | null;
  modelId: string | null;
  configRevision: number | null;
  activationVersion: number | null;
  testStatus: "not_configured" | "untested" | "passed" | "unavailable";
};

const DISPLAY_NAMES: Readonly<Record<AdminModelProvider, string>> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Gemini",
  dashscope: "Qwen / DashScope",
  deepseek: "DeepSeek",
  minimax: "MiniMax",
};

const SAFE_DEGRADED_STATUS: AssistantRuntimeStatus = {
  live: false,
  ready: false,
  capability: "degraded",
  message: "助手基础服务暂不可用。",
};

const SAFE_UNPROBED_READINESS: AssistantRuntimeReadinessStatus = {
  probed: false,
  live: false,
  ready: false,
  capability: "degraded",
};

const SAFE_DEGRADED_INSPECTION: AssistantRuntimeInspection = {
  providerMode: "placeholder",
  persistence: "unavailable",
  circuits: {
    readiness: { state: "closed", consecutiveFailures: 0 },
    execution: { state: "closed", consecutiveFailures: 0 },
  },
  readiness: { cacheTtlMs: 0, probeTimeoutMs: 0, failureThreshold: 0 },
};

const SAFE_CONTROL_UNAVAILABLE: SafeControlRuntime = {
  capability: "degraded",
  source: "none",
  provider: null,
  modelId: null,
  configRevision: null,
  activationVersion: null,
  testStatus: "unavailable",
};

function defaultModelControlClient(): Pick<
  AgentModelControlClient,
  "runtimeStatus"
> {
  return createAgentModelControlClient({
    settings: resolveAgentModelControlSettings({
      AGENTOS_INTERNAL_URL: process.env.AGENTOS_INTERNAL_URL,
      OS_SECURITY_KEY: process.env.OS_SECURITY_KEY,
      AGENT_CONFIG_CONTROL_KEY: process.env.AGENT_CONFIG_CONTROL_KEY,
    }),
  });
}

function isProvider(value: unknown): value is AdminModelProvider {
  return (
    typeof value === "string" &&
    (ADMIN_MODEL_PROVIDERS as readonly string[]).includes(value)
  );
}

function hasOnlyPairedSurrogates(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isSafeModelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    Array.from(value).length <= 128 &&
    hasOnlyPairedSurrogates(value) &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
    !/(?:[a-z][a-z0-9+.-]*:\/\/|\/\/)/iu.test(value)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function safeControlRuntime(
  value: AgentModelRuntimeResponse,
): SafeControlRuntime {
  if (
    value.version !== "1" ||
    !["placeholder", "available", "degraded"].includes(value.capability)
  ) {
    return SAFE_CONTROL_UNAVAILABLE;
  }
  if (value.source === null) {
    if (
      value.provider !== null ||
      value.modelId !== null ||
      value.configRevision !== null ||
      value.activationVersion !== null ||
      value.capability === "available"
    ) {
      return SAFE_CONTROL_UNAVAILABLE;
    }
    return value.capability === "placeholder"
      ? {
          capability: "placeholder",
          source: "none",
          provider: null,
          modelId: null,
          configRevision: null,
          activationVersion: null,
          testStatus: "not_configured",
        }
      : SAFE_CONTROL_UNAVAILABLE;
  }
  if (value.capability === "placeholder") return SAFE_CONTROL_UNAVAILABLE;
  if (!isProvider(value.provider) || !isSafeModelId(value.modelId)) {
    return SAFE_CONTROL_UNAVAILABLE;
  }
  if (value.source === "deployment") {
    return value.configRevision === null && value.activationVersion === null
      ? {
          capability: value.capability,
          source: "deployment",
          provider: value.provider,
          modelId: value.modelId,
          configRevision: null,
          activationVersion: null,
          // Deployment bootstrap did not pass through the control-plane test.
          testStatus: "untested",
        }
      : SAFE_CONTROL_UNAVAILABLE;
  }
  return value.source === "dynamic" &&
    isPositiveInteger(value.configRevision) &&
    isPositiveInteger(value.activationVersion)
    ? {
        capability: value.capability,
        source: "dynamic",
        provider: value.provider,
        modelId: value.modelId,
        configRevision: value.configRevision,
        activationVersion: value.activationVersion,
        // A dynamic revision can become active only after a passing test.
        testStatus: "passed",
      }
    : SAFE_CONTROL_UNAVAILABLE;
}

type ModelPresentation = {
  state: "ready" | "degraded" | "not_configured";
  detail: string;
  configuration: string;
};

function modelPresentation(
  control: SafeControlRuntime,
  executionUnavailable: boolean,
  modelUnavailable: boolean,
): ModelPresentation {
  if (modelUnavailable || control.capability === "degraded") {
    return {
      state: "degraded",
      detail: "模型状态不可用",
      configuration: "状态不可用",
    };
  }
  if (
    control.source === "none" ||
    control.provider === null ||
    control.modelId === null
  ) {
    return {
      state: "not_configured",
      detail: "尚未配置",
      configuration: "未配置",
    };
  }
  const sourceLabel = control.source === "dynamic" ? "动态配置" : "部署配置";
  const configured = `${DISPLAY_NAMES[control.provider]} / ${control.modelId}`;
  if (executionUnavailable) {
    return {
      state: "degraded",
      detail: "模型执行暂不可用",
      configuration: `${configured}（${sourceLabel}，执行暂不可用）`,
    };
  }
  return {
    state: "ready",
    detail: control.source === "dynamic" ? "动态模型已启用" : "部署模型已启用",
    configuration: `${configured}（${sourceLabel}）`,
  };
}

function serviceState(
  readiness: AssistantRuntimeReadinessStatus,
  inspection: AssistantRuntimeInspection,
  status: AssistantRuntimeStatus,
  control: SafeControlRuntime,
  runtimeValid: boolean,
  modelUnavailable: boolean,
): AdminAssistantStatusSnapshot["services"] {
  const executionUnavailable = inspection.circuits.execution.state !== "closed";
  const infrastructureReady =
    readiness.probed &&
    inspection.circuits.readiness.state === "closed" &&
    readiness.live &&
    readiness.ready;
  const agentosState =
    !readiness.probed || !readiness.live
      ? "not_connected"
      : infrastructureReady
        ? "ready"
        : "degraded";
  const databaseState = agentosState;
  const publicState =
    !runtimeValid || status.capability === "degraded"
      ? "degraded"
      : inspection.providerMode === "placeholder"
        ? "placeholder"
        : !infrastructureReady
          ? "degraded"
          : status.capability === "placeholder"
            ? "not_configured"
            : executionUnavailable
              ? "degraded"
              : "ready";

  const model = modelPresentation(
    control,
    executionUnavailable,
    modelUnavailable,
  );
  return [
    {
      id: "agentos",
      label: "AgentOS",
      state: agentosState,
      detail: !readiness.probed
        ? "尚未探测"
        : infrastructureReady
          ? "基础服务已就绪"
          : readiness.live
            ? "依赖尚未就绪"
            : "服务不可用",
    },
    {
      id: "database",
      label: "运行数据库",
      state: databaseState,
      detail: !readiness.probed
        ? "尚未探测"
        : infrastructureReady
          ? "运行依赖已就绪"
          : readiness.live
            ? "运行依赖异常"
            : "状态不可用",
    },
    {
      id: "model",
      label: "模型",
      state: model.state,
      detail: model.detail,
    },
    {
      id: "public_entry",
      label: "公开入口",
      state: publicState,
      detail:
        publicState === "ready"
          ? "AgentOS 模式可用"
          : publicState === "placeholder"
            ? "占位模式可用"
            : publicState === "not_configured"
              ? "默认 Agent 或模型尚未配置"
              : "降级模式",
    },
  ];
}

function snapshot(
  status: AssistantRuntimeStatus,
  readiness: AssistantRuntimeReadinessStatus,
  inspection: AssistantRuntimeInspection,
  control: SafeControlRuntime,
  runtimeValid: boolean,
  modelUnavailable: boolean,
): AdminAssistantStatusSnapshot {
  const infrastructureReady =
    readiness.probed &&
    inspection.circuits.readiness.state === "closed" &&
    readiness.live &&
    readiness.ready;
  const executionUnavailable = inspection.circuits.execution.state !== "closed";
  const selectedProvider =
    !runtimeValid || status.capability === "degraded"
      ? "unavailable"
      : inspection.providerMode === "placeholder"
        ? "placeholder"
        : !executionUnavailable &&
            infrastructureReady &&
            status.capability === "available"
          ? "agentos"
          : "unavailable";
  const mode = inspection.providerMode;
  const model = modelPresentation(
    control,
    executionUnavailable,
    modelUnavailable,
  );
  return {
    mode,
    runtime: {
      live: status.live,
      ready: status.ready,
      capability: status.capability,
      selectedProvider,
      ...inspection,
      source: control.source,
      provider: control.provider,
      modelId: control.modelId,
      configRevision: control.configRevision,
      activationVersion: control.activationVersion,
      testStatus: control.testStatus,
    },
    services: serviceState(
      readiness,
      inspection,
      status,
      control,
      runtimeValid,
      modelUnavailable,
    ),
    configuration: {
      defaultAgent:
        inspection.providerMode === "agentos"
          ? "码多多（maduoduo）"
          : "码多多（占位）",
      model:
        runtimeValid || control.source !== "none"
          ? model.configuration
          : "状态不可用",
      skills: "未接入",
      sessionStorage:
        inspection.persistence === "agentos"
          ? "AgentOS 持久化已启用"
          : inspection.persistence === "unavailable"
            ? "状态不可用"
            : "未启用",
    },
    message:
      runtimeValid &&
      control.capability === "placeholder" &&
      inspection.providerMode === "placeholder"
        ? "公开入口使用安全占位模式；AgentOS 基础设施尚未探测。"
        : status.message,
  };
}

export async function loadAdminAssistantStatus(
  options: AdminAssistantStatusLoadOptions = {},
): Promise<AdminAssistantStatusSnapshot> {
  const runtimeTask = (async () => {
    const resolved = options.runtime ?? getAssistantRuntime();
    try {
      const readiness = await resolved.readinessStatus();
      return { readiness, inspection: resolved.inspect(), valid: true };
    } catch {
      return {
        readiness: SAFE_UNPROBED_READINESS,
        inspection: resolved.inspect(),
        valid: false,
      };
    }
  })();
  const controlTask = (async () => {
    const client = options.controlClient ?? defaultModelControlClient();
    const response = await client.runtimeStatus({
      requestId: (options.requestIdFactory ?? crypto.randomUUID)(),
    });
    return safeControlRuntime(response);
  })();
  const [runtimeResult, controlResult] = await Promise.allSettled([
    runtimeTask,
    controlTask,
  ]);
  const runtime =
    runtimeResult.status === "fulfilled"
      ? runtimeResult.value
      : {
          readiness: SAFE_UNPROBED_READINESS,
          inspection: SAFE_DEGRADED_INSPECTION,
          valid: false,
        };
  const control =
    controlResult.status === "fulfilled"
      ? controlResult.value
      : SAFE_CONTROL_UNAVAILABLE;
  const slotCapability =
    runtime.inspection.providerMode === "placeholder"
      ? "placeholder"
      : runtime.readiness.capability;
  const capabilityMismatch =
    runtime.valid && slotCapability !== control.capability;
  const baseStatus = runtime.valid
    ? deriveAssistantRuntimeStatus(runtime.readiness, {
        providerMode: runtime.inspection.providerMode,
        executionState:
          control.capability === "placeholder"
            ? "closed"
            : runtime.inspection.circuits.execution.state,
      })
    : SAFE_DEGRADED_STATUS;
  const degraded =
    !runtime.valid ||
    capabilityMismatch ||
    baseStatus.capability === "degraded" ||
    control.capability === "degraded";
  const status: AssistantRuntimeStatus = degraded
    ? {
        live: baseStatus.live,
        ready: false,
        capability: "degraded",
        message: "助手基础服务暂不可用。",
      }
    : {
        live: baseStatus.live,
        ready: baseStatus.ready,
        capability: control.capability,
        message:
          control.capability === "placeholder"
            ? "模型尚未配置，当前为安全占位模式。"
            : "AI 助理基础服务已就绪。",
      };
  return snapshot(
    status,
    runtime.readiness,
    runtime.inspection,
    control,
    runtime.valid,
    !runtime.valid ||
      capabilityMismatch ||
      control.capability === "degraded" ||
      slotCapability === "degraded",
  );
}

const defaultDependencies: AdminAssistantStatusDependencies = {
  access: { requirePermission },
  loadStatus: loadAdminAssistantStatus,
  requestIdFactory: () => crypto.randomUUID(),
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function createAdminAssistantStatusHandler(
  overrides: Partial<AdminAssistantStatusDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async function GET(request: Request): Promise<Response> {
    const requestId = resolveAssistantRequestId(
      request,
      dependencies.requestIdFactory,
    );
    try {
      await dependencies.access.requirePermission("admin:assistant");
    } catch (error) {
      if (error instanceof AuthAccessError) {
        const code =
          error.status === 401
            ? "authentication_required"
            : "permission_denied";
        return Response.json(
          createAdminAssistantErrorResponse(requestId, code),
          {
            status: error.status,
            headers: NO_STORE_HEADERS,
          },
        );
      }
      return Response.json(
        createAdminAssistantErrorResponse(requestId, "assistant_unavailable"),
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    try {
      const body: AdminAssistantStatusResponse = {
        version: "1",
        requestId,
        status: await dependencies.loadStatus(),
      };
      if (!isAdminAssistantStatusResponse(body)) {
        throw new TypeError("Invalid Admin assistant status");
      }
      return Response.json(body, { headers: NO_STORE_HEADERS });
    } catch {
      return Response.json(
        createAdminAssistantErrorResponse(requestId, "assistant_unavailable"),
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
  };
}

export const adminAssistantStatusHandler = createAdminAssistantStatusHandler();
