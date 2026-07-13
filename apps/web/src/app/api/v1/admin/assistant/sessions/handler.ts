import { AuthAccessError, requirePermission } from "@/server/auth/access";
import {
  createAdminAssistantErrorResponse,
  type AdminAssistantSessionsResponse,
  type AdminAssistantSessionsSnapshot,
} from "@/features/assistant/admin-assistant-contract";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";

type AdminAssistantSessionsDependencies = {
  authorize: () => Promise<unknown>;
  loadSessions: () => Promise<AdminAssistantSessionsSnapshot>;
  requestIdFactory: () => string;
};

export async function loadPlaceholderAdminAssistantSessions(): Promise<AdminAssistantSessionsSnapshot> {
  return {
    persisted: false,
    items: [],
    message: "占位模式不持久化会话；会话审计将在存储接入后开放。",
  };
}

const defaultDependencies: AdminAssistantSessionsDependencies = {
  authorize: () => requirePermission("admin:assistant"),
  loadSessions: loadPlaceholderAdminAssistantSessions,
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
      await dependencies.authorize();
      const body: AdminAssistantSessionsResponse = {
        version: "1",
        requestId,
        sessions: await dependencies.loadSessions(),
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

export const adminAssistantSessionsHandler =
  createAdminAssistantSessionsHandler();
