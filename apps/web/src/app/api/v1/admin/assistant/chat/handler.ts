import { AuthAccessError, requirePermission } from "@/server/auth/access";
import { createAdminAssistantErrorResponse } from "@/features/assistant/admin-assistant-contract";
import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import {
  assistantRequestLogger,
  type AssistantRequestLogger,
} from "@/server/assistant/assistant-request-log";
import { placeholderAssistantProvider } from "@/server/assistant/placeholder-assistant-provider";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import { createAssistantChatHandler } from "@/app/api/v1/assistant/chat/handler";

type AdminAssistantChatDependencies = {
  authorize: () => Promise<unknown>;
  provider: AssistantProvider;
  logger: AssistantRequestLogger;
  clock: () => number;
  requestIdFactory: () => string;
  messageIdFactory: () => string;
};

const defaultDependencies: AdminAssistantChatDependencies = {
  authorize: () => requirePermission("admin:assistant"),
  provider: placeholderAssistantProvider,
  logger: assistantRequestLogger,
  clock: () => performance.now(),
  requestIdFactory: () => crypto.randomUUID(),
  messageIdFactory: () => crypto.randomUUID(),
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function createAdminAssistantChatHandler(
  overrides: Partial<AdminAssistantChatDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async function POST(request: Request): Promise<Response> {
    const requestId = resolveAssistantRequestId(
      request,
      dependencies.requestIdFactory,
    );
    try {
      await dependencies.authorize();
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

    return createAssistantChatHandler({
      provider: dependencies.provider,
      logger: dependencies.logger,
      clock: dependencies.clock,
      requestIdFactory: () => requestId,
      messageIdFactory: dependencies.messageIdFactory,
    })(request);
  };
}

export const adminAssistantChatHandler = createAdminAssistantChatHandler();
