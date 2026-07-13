import {
  AuthAccessError,
  authAccessErrorBody,
  requirePermission,
} from "@/server/auth/access";

export type AdminAssistantServiceState = {
  id: "agentos" | "database" | "model" | "public_entry";
  label: string;
  state: "not_connected" | "not_configured" | "placeholder";
  detail: string;
};

export type AdminAssistantStatusResponse = {
  version: "1";
  mode: "placeholder";
  services: AdminAssistantServiceState[];
  configuration: {
    defaultAgent: string;
    model: string;
    skills: string;
    sessionStorage: string;
  };
  message: string;
};

type AdminAssistantStatusDependencies = {
  authorize: () => Promise<unknown>;
  loadStatus: () => Promise<AdminAssistantStatusResponse>;
};

export async function loadPlaceholderAdminAssistantStatus(): Promise<AdminAssistantStatusResponse> {
  return {
    version: "1",
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
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function createAdminAssistantStatusHandler(
  overrides: Partial<AdminAssistantStatusDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async function GET(request: Request): Promise<Response> {
    void request;
    try {
      await dependencies.authorize();
      return Response.json(await dependencies.loadStatus(), {
        headers: NO_STORE_HEADERS,
      });
    } catch (error) {
      if (error instanceof AuthAccessError) {
        return Response.json(authAccessErrorBody(error), {
          status: error.status,
          headers: NO_STORE_HEADERS,
        });
      }
      return Response.json(
        {
          error: {
            code: "ASSISTANT_ADMIN_UNAVAILABLE",
            message: "AI assistant status is unavailable",
          },
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
  };
}

export const adminAssistantStatusHandler = createAdminAssistantStatusHandler();
