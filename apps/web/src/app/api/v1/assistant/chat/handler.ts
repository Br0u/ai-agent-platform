import {
  createAssistantErrorResponse,
  parseAssistantRequest,
  safeAssistantSuggestedActions,
  type AssistantErrorResponse,
  type AssistantSuccessResponse,
} from "@/features/assistant/assistant-contract";
import {
  isAssistantProviderReply,
  type AssistantProvider,
} from "@/server/assistant/assistant-provider";
import {
  assistantRequestLogger,
  type AssistantRequestLogger,
} from "@/server/assistant/assistant-request-log";
import { placeholderAssistantProvider } from "@/server/assistant/placeholder-assistant-provider";
import { readBoundedJson } from "@/server/http/read-bounded-json";

interface AssistantChatHandlerDependencies {
  provider: AssistantProvider;
  logger: AssistantRequestLogger;
  clock: () => number;
  requestIdFactory: () => string;
  messageIdFactory: () => string;
}

const defaultDependencies: AssistantChatHandlerDependencies = {
  provider: placeholderAssistantProvider,
  logger: assistantRequestLogger,
  clock: () => performance.now(),
  requestIdFactory: () => crypto.randomUUID(),
  messageIdFactory: () => crypto.randomUUID(),
};

const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/u;

function safeRequestId(request: Request, factory: () => string): string {
  const header = request.headers.get("x-request-id");
  return header !== null && SAFE_REQUEST_ID.test(header) ? header : factory();
}

export function createAssistantChatHandler(
  dependencies: AssistantChatHandlerDependencies = defaultDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    const startedAt = dependencies.clock();
    const requestId = safeRequestId(request, dependencies.requestIdFactory);
    let body: AssistantSuccessResponse | AssistantErrorResponse;
    let statusCode: 200 | 400 | 503;

    const input = await readBoundedJson(request, MAX_REQUEST_BODY_BYTES);
    const assistantRequest = input.ok
      ? parseAssistantRequest(input.value)
      : null;

    if (!assistantRequest) {
      body = createAssistantErrorResponse(requestId, "validation_error");
      statusCode = 400;
    } else {
      try {
        const providerResponse =
          await dependencies.provider.reply(assistantRequest);
        if (!isAssistantProviderReply(providerResponse)) {
          throw new TypeError("Invalid assistant provider response");
        }
        body = {
          version: "1",
          requestId,
          mode: "placeholder",
          session: { temporary: true },
          message: {
            id: dependencies.messageIdFactory(),
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
      response = Response.json(body, { status: statusCode });
    } catch {
      body = createAssistantErrorResponse(requestId, "assistant_unavailable");
      statusCode = 503;
      response = Response.json(body, { status: statusCode });
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
