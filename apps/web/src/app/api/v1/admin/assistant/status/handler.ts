import {
  AuthAccessError,
  requirePermission,
  type AccessService,
} from "@/server/auth/access";
import {
  createAdminAssistantErrorResponse,
  type AdminAssistantStatusSnapshot,
  type AdminAssistantStatusResponse,
} from "@/features/assistant/admin-assistant-contract";
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

function serviceState(
  readiness: AssistantRuntimeReadinessStatus,
  inspection: AssistantRuntimeInspection,
  configurationValid: boolean,
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
  const publicState = !configurationValid
    ? "degraded"
    : inspection.providerMode === "placeholder"
      ? "placeholder"
      : !infrastructureReady || readiness.capability === "degraded"
        ? "degraded"
        : readiness.capability === "placeholder"
          ? "not_configured"
          : executionUnavailable
            ? "degraded"
            : "ready";

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
      state:
        inspection.providerMode === "placeholder" ||
        readiness.capability === "placeholder"
          ? "not_configured"
          : readiness.capability === "degraded"
            ? "degraded"
            : executionUnavailable
              ? "degraded"
              : "ready",
      detail:
        inspection.providerMode === "placeholder" ||
        readiness.capability === "placeholder"
          ? "尚未配置"
          : readiness.capability === "degraded"
            ? "模型状态不可用"
            : executionUnavailable
              ? "模型执行暂不可用"
              : "能力已启用",
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
  configurationValid = true,
): AdminAssistantStatusSnapshot {
  const infrastructureReady =
    readiness.probed &&
    inspection.circuits.readiness.state === "closed" &&
    readiness.live &&
    readiness.ready;
  const executionUnavailable = inspection.circuits.execution.state !== "closed";
  const selectedProvider = !configurationValid
    ? "unavailable"
    : inspection.providerMode === "placeholder"
      ? "placeholder"
      : !executionUnavailable &&
          infrastructureReady &&
          readiness.capability === "available"
        ? "agentos"
        : "unavailable";
  const mode = inspection.providerMode;
  return {
    mode,
    runtime: {
      live: status.live,
      ready: status.ready,
      capability: status.capability,
      selectedProvider,
      ...inspection,
    },
    services: serviceState(readiness, inspection, configurationValid),
    configuration: {
      defaultAgent:
        inspection.providerMode === "agentos"
          ? "码多多（maduoduo）"
          : "码多多（占位）",
      model:
        inspection.providerMode === "placeholder"
          ? "未配置"
          : !configurationValid
            ? "状态不可用"
            : readiness.capability === "placeholder"
              ? "未配置"
              : readiness.capability === "degraded"
                ? "状态不可用"
                : executionUnavailable
                  ? "已配置（执行暂不可用）"
                  : "已配置",
      skills: "未接入",
      sessionStorage:
        inspection.persistence === "agentos"
          ? "AgentOS 持久化已启用"
          : inspection.persistence === "unavailable"
            ? "状态不可用"
            : "未启用",
    },
    message:
      configurationValid && inspection.providerMode === "placeholder"
        ? "公开入口使用安全占位模式；AgentOS 基础设施尚未探测。"
        : status.message,
  };
}

export async function loadAdminAssistantStatus(
  runtime?: Pick<AssistantRuntime, "readinessStatus" | "inspect">,
): Promise<AdminAssistantStatusSnapshot> {
  let inspection = SAFE_DEGRADED_INSPECTION;
  try {
    const resolved = runtime ?? getAssistantRuntime();
    let readiness: AssistantRuntimeReadinessStatus;
    try {
      readiness = await resolved.readinessStatus();
    } catch {
      inspection = resolved.inspect();
      return snapshot(
        SAFE_DEGRADED_STATUS,
        SAFE_UNPROBED_READINESS,
        inspection,
        false,
      );
    }
    inspection = resolved.inspect();
    const status = deriveAssistantRuntimeStatus(readiness, {
      providerMode: inspection.providerMode,
      executionState: inspection.circuits.execution.state,
    });
    return snapshot(status, readiness, inspection);
  } catch {
    return snapshot(
      SAFE_DEGRADED_STATUS,
      SAFE_UNPROBED_READINESS,
      inspection,
      false,
    );
  }
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
