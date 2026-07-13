import {
  createAssistantErrorResponse,
  isAssistantMessageId,
  isAssistantProviderReply,
  parseAssistantRequest,
  safeAssistantSuggestedActions,
  type AssistantErrorResponse,
  type AssistantSuccessResponse,
} from "@/features/assistant/assistant-contract";
import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import {
  assistantRequestLogger,
  type AssistantRequestLogger,
} from "@/server/assistant/assistant-request-log";
import { placeholderAssistantProvider } from "@/server/assistant/placeholder-assistant-provider";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  resolveAnonymousSession,
  type AssistantPublicSession,
} from "@/server/assistant/anonymous-session";
import { readBoundedJson } from "@/server/http/read-bounded-json";

export type AssistantChatSessionResolution = {
  publicSession: AssistantPublicSession;
  setCookie?: string;
};

interface AssistantChatHandlerDependencies {
  provider: AssistantProvider;
  logger: AssistantRequestLogger;
  clock: () => number;
  requestIdFactory: () => string;
  messageIdFactory: () => string;
  resolveSession: (request: Request) => Promise<AssistantChatSessionResolution>;
}

const defaultDependencies: AssistantChatHandlerDependencies = {
  provider: placeholderAssistantProvider,
  logger: assistantRequestLogger,
  clock: () => performance.now(),
  requestIdFactory: () => crypto.randomUUID(),
  messageIdFactory: () => crypto.randomUUID(),
  resolveSession: resolveAnonymousSession,
};

const MAX_REQUEST_BODY_BYTES = 16 * 1024;
export function createAssistantChatHandler(
  dependencies: AssistantChatHandlerDependencies = defaultDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    const startedAt = dependencies.clock();
    const requestId = resolveAssistantRequestId(
      request,
      dependencies.requestIdFactory,
    );
    let body: AssistantSuccessResponse | AssistantErrorResponse;
    let statusCode: 200 | 400 | 503;
    let session: AssistantChatSessionResolution | undefined;

    const input = await readBoundedJson(request, MAX_REQUEST_BODY_BYTES);
    const assistantRequest = input.ok
      ? parseAssistantRequest(input.value)
      : null;

    if (!assistantRequest) {
      body = createAssistantErrorResponse(requestId, "validation_error");
      statusCode = 400;
    } else {
      try {
        session = await dependencies.resolveSession(request);
        const providerResponse =
          await dependencies.provider.reply(assistantRequest);
        if (!isAssistantProviderReply(providerResponse)) {
          throw new TypeError("Invalid assistant provider response");
        }
        const messageId = dependencies.messageIdFactory();
        if (!isAssistantMessageId(messageId)) {
          throw new TypeError("Invalid assistant message id");
        }
        body = {
          version: "1",
          requestId,
          mode: "placeholder",
          session: session.publicSession,
          message: {
            id: messageId,
            role: "assistant",
            content: providerResponse.content,
          },
          suggestedActions: safeAssistantSuggestedActions(
            providerResponse.suggestedActions,
          ),
        };
        statusCode = 200;
      } catch {
        body = createAssistantErrorResponse(requestId, "assistant_unavailable");
        statusCode = 503;
      }
    }

    let response: Response;
    try {
      response = Response.json(body, {
        status: statusCode,
        headers: {
          "Cache-Control": "no-store",
          ...(session?.setCookie ? { "Set-Cookie": session.setCookie } : {}),
        },
      });
    } catch {
      body = createAssistantErrorResponse(requestId, "assistant_unavailable");
      statusCode = 503;
      response = Response.json(body, {
        status: statusCode,
        headers: {
          "Cache-Control": "no-store",
          ...(session?.setCookie ? { "Set-Cookie": session.setCookie } : {}),
        },
      });
    }

    try {
      dependencies.logger.log({
        requestId,
        statusCode,
        durationMs: Math.max(0, dependencies.clock() - startedAt),
      });
    } catch {
      // Logging must not change the public response.
    }

    return response;
  };
}

export const assistantChatHandler = createAssistantChatHandler();
