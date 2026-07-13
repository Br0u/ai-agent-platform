import { AuthAccessError, requirePermission } from "@/server/auth/access";
import {
  createAdminAssistantErrorResponse,
  type AdminAssistantStatusSnapshot,
  type AdminAssistantStatusResponse,
} from "@/features/assistant/admin-assistant-contract";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";

type AdminAssistantStatusDependencies = {
  authorize: () => Promise<unknown>;
  loadStatus: () => Promise<AdminAssistantStatusSnapshot>;
  requestIdFactory: () => string;
};

export async function loadPlaceholderAdminAssistantStatus(): Promise<AdminAssistantStatusSnapshot> {
  return {
    mode: "placeholder",
    services: [
      {
        id: "agentos",
        label: "AgentOS",
        state: "not_connected",
        detail: "尚未连接",
      },
      {
        id: "database",
        label: "会话数据库",
        state: "not_configured",
        detail: "尚未启用",
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
      defaultAgent: "M 企业助理（占位）",
      model: "未配置",
      skills: "未接入",
      sessionStorage: "未启用",
    },
    message: "当前仅提供本地占位回复，尚未连接真实 AgentOS、模型或会话存储。",
  };
}

const defaultDependencies: AdminAssistantStatusDependencies = {
  authorize: () => requirePermission("admin:assistant"),
  loadStatus: loadPlaceholderAdminAssistantStatus,
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
      await dependencies.authorize();
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
