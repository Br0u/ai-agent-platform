import {
  AuthAccessError,
  requirePermission,
  type AccessService,
} from "@/server/auth/access";
import {
  createAdminAssistantErrorResponse,
  type AdminAssistantSessionsResponse,
  type AdminAssistantSessionsSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  getAssistantRuntime,
  type AssistantRuntimeInspection,
} from "@/server/assistant/assistant-runtime";

type AdminAssistantSessionsDependencies = {
  access: Pick<AccessService, "requirePermission">;
  loadSessions: () => Promise<AdminAssistantSessionsSnapshot>;
  requestIdFactory: () => string;
};

type AdminAssistantSessionsRuntime = {
  inspect: () => Pick<AssistantRuntimeInspection, "persistence">;
};

const UNAVAILABLE_SESSIONS: AdminAssistantSessionsSnapshot = {
  persistence: "unavailable",
  listing: "not_available",
  message: "持久化状态不可用；管理列表不可用。",
};

export async function loadAdminAssistantSessions(
  runtime?: AdminAssistantSessionsRuntime,
): Promise<AdminAssistantSessionsSnapshot> {
  let persistence: AssistantRuntimeInspection["persistence"];
  try {
    persistence = (runtime ?? getAssistantRuntime()).inspect().persistence;
  } catch {
    return { ...UNAVAILABLE_SESSIONS };
  }
  return {
    persistence,
    listing: "not_available",
    message:
      persistence === "agentos"
        ? "AgentOS 持久化已启用，但管理列表不在本阶段范围。"
        : persistence === "disabled"
          ? "占位模式未持久化会话；管理列表不可用。"
          : UNAVAILABLE_SESSIONS.message,
  };
}

const defaultDependencies: AdminAssistantSessionsDependencies = {
  access: { requirePermission },
  loadSessions: loadAdminAssistantSessions,
  requestIdFactory: () => crypto.randomUUID(),
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function createAdminAssistantSessionsHandler(
  overrides: Partial<AdminAssistantSessionsDependencies> = {},
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
      const body: AdminAssistantSessionsResponse = {
        version: "1",
        requestId,
        sessions: await dependencies.loadSessions(),
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

export const adminAssistantSessionsHandler =
  createAdminAssistantSessionsHandler();
