import {
  AuthAccessError,
  authAccessErrorBody,
  requirePermission,
} from "@/server/auth/access";

export type AdminAssistantSessionSummary = {
  id: string;
  mode: "placeholder" | "agentos";
  status: "active" | "closed";
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
};

export type AdminAssistantSessionsResponse = {
  version: "1";
  persisted: false;
  items: AdminAssistantSessionSummary[];
  message: string;
};

type AdminAssistantSessionsDependencies = {
  authorize: () => Promise<unknown>;
  loadSessions: () => Promise<AdminAssistantSessionsResponse>;
};

export async function loadPlaceholderAdminAssistantSessions(): Promise<AdminAssistantSessionsResponse> {
  return {
    version: "1",
    persisted: false,
    items: [],
    message: "占位模式不持久化会话；会话审计将在存储接入后开放。",
  };
}

const defaultDependencies: AdminAssistantSessionsDependencies = {
  authorize: () => requirePermission("admin:assistant"),
  loadSessions: loadPlaceholderAdminAssistantSessions,
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function createAdminAssistantSessionsHandler(
  overrides: Partial<AdminAssistantSessionsDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async function GET(request: Request): Promise<Response> {
    void request;
    try {
      await dependencies.authorize();
      return Response.json(await dependencies.loadSessions(), {
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
            message: "AI assistant sessions are unavailable",
          },
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
  };
}

export const adminAssistantSessionsHandler =
  createAdminAssistantSessionsHandler();
