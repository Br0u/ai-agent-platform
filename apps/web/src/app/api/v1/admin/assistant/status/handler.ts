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
  getAssistantRuntime,
  readSafeAssistantRuntimeStatus,
  type AssistantRuntime,
  type AssistantRuntimeInspection,
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

const SAFE_DEGRADED_INSPECTION: AssistantRuntimeInspection = {
  providerMode: "placeholder",
  persistence: "disabled",
  circuit: { state: "closed", consecutiveFailures: 0 },
  readiness: { cacheTtlMs: 0, probeTimeoutMs: 0, failureThreshold: 0 },
};

function serviceState(
  status: AssistantRuntimeStatus,
  inspection: AssistantRuntimeInspection,
  configurationValid: boolean,
): AdminAssistantStatusSnapshot["services"] {
  const agentosState = status.ready
    ? "ready"
    : status.live
      ? "degraded"
      : "not_connected";
  const databaseState = status.ready
    ? "ready"
    : status.live
      ? "degraded"
      : "not_connected";
  const publicState = !configurationValid
    ? "degraded"
    : inspection.providerMode === "placeholder"
      ? "placeholder"
      : !status.live || !status.ready || status.capability === "degraded"
        ? "degraded"
        : status.capability === "available"
          ? "ready"
          : "not_configured";

  return [
    {
      id: "agentos",
      label: "AgentOS",
      state: agentosState,
      detail: status.ready
        ? "基础服务已就绪"
        : status.live
          ? "依赖尚未就绪"
          : "服务不可用",
    },
    {
      id: "database",
      label: "运行数据库",
      state: databaseState,
      detail: status.ready
        ? "运行依赖已就绪"
        : status.live
          ? "运行依赖异常"
          : "状态不可用",
    },
    {
      id: "model",
      label: "模型",
      state: status.capability === "available" ? "ready" : "not_configured",
      detail: status.capability === "available" ? "能力已启用" : "尚未配置",
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
  inspection: AssistantRuntimeInspection,
  configurationValid = true,
): AdminAssistantStatusSnapshot {
  const selectedProvider = !configurationValid
    ? "unavailable"
    : inspection.providerMode === "placeholder"
      ? "placeholder"
      : status.live && status.ready && status.capability === "available"
        ? "agentos"
        : status.live && status.ready && status.capability === "placeholder"
          ? "placeholder"
          : "unavailable";
  const mode = selectedProvider === "agentos" ? "agentos" : "placeholder";
  return {
    mode,
    runtime: {
      live: status.live,
      ready: status.ready,
      capability: status.capability,
      selectedProvider,
      ...inspection,
    },
    services: serviceState(status, inspection, configurationValid),
    configuration: {
      defaultAgent:
        configurationValid && inspection.providerMode === "agentos"
          ? "已配置"
          : "M 企业助理（占位）",
      model: status.capability === "available" ? "已配置" : "未配置",
      skills: "未接入",
      sessionStorage: "未启用",
    },
    message:
      configurationValid && inspection.providerMode === "placeholder"
        ? "公开入口使用安全占位模式；AgentOS 基础设施状态独立展示。"
        : status.message,
  };
}

export async function loadAdminAssistantStatus(
  runtime?: Pick<AssistantRuntime, "status" | "inspect">,
): Promise<AdminAssistantStatusSnapshot> {
  try {
    const resolved = runtime ?? getAssistantRuntime();
    const status = await readSafeAssistantRuntimeStatus(resolved);
    return snapshot(status, resolved.inspect());
  } catch {
    return snapshot(SAFE_DEGRADED_STATUS, SAFE_DEGRADED_INSPECTION, false);
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
