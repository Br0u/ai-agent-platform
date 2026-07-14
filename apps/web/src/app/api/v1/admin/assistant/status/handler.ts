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
};

function serviceState(
  status: AssistantRuntimeStatus,
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
  const publicState =
    status.capability === "available"
      ? "ready"
      : status.capability === "placeholder"
        ? "placeholder"
        : "degraded";

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
            : "降级模式",
    },
  ];
}

function snapshot(
  status: AssistantRuntimeStatus,
  inspection: AssistantRuntimeInspection,
): AdminAssistantStatusSnapshot {
  const mode =
    status.capability === "available" && inspection.providerMode === "agentos"
      ? "agentos"
      : "placeholder";
  return {
    mode,
    runtime: {
      live: status.live,
      ready: status.ready,
      capability: status.capability,
      ...inspection,
    },
    services: serviceState(status),
    configuration: {
      defaultAgent: mode === "agentos" ? "已配置" : "M 企业助理（占位）",
      model: status.capability === "available" ? "已配置" : "未配置",
      skills: "未接入",
      sessionStorage: "未启用",
    },
    message: status.message,
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
    return snapshot(SAFE_DEGRADED_STATUS, SAFE_DEGRADED_INSPECTION);
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
      const body: AdminAssistantStatusResponse = {
        version: "1",
        requestId,
        status: await dependencies.loadStatus(),
      };
      return Response.json(body, {
        headers: NO_STORE_HEADERS,
      });
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
  };
}

export const adminAssistantStatusHandler = createAdminAssistantStatusHandler();
