import {
  ASSISTANT_UNAVAILABLE_RESPONSE,
  INVALID_ASSISTANT_REQUEST_RESPONSE,
  parseAssistantRequest,
} from "@/features/assistant/assistant-contract";
import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import {
  assistantRequestLogger,
  type AssistantRequestLogger,
} from "@/server/assistant/assistant-request-log";
import { placeholderAssistantProvider } from "@/server/assistant/placeholder-assistant-provider";

interface AssistantChatHandlerDependencies {
  provider: AssistantProvider;
  logger: AssistantRequestLogger;
  clock: () => number;
  requestIdFactory: () => string;
}

const defaultDependencies: AssistantChatHandlerDependencies = {
  provider: placeholderAssistantProvider,
  logger: assistantRequestLogger,
  clock: Date.now,
  requestIdFactory: crypto.randomUUID,
};

export function createAssistantChatHandler(
  dependencies: AssistantChatHandlerDependencies = defaultDependencies,
) {
  return async function POST(request: Request): Promise<Response> {
    const startedAt = dependencies.clock();
    const requestId =
      request.headers.get("x-request-id") ?? dependencies.requestIdFactory();

    const respond = (body: unknown, statusCode: number): Response => {
      dependencies.logger.log({
        requestId,
        statusCode,
        durationMs: Math.max(0, dependencies.clock() - startedAt),
      });
      return Response.json(body, { status: statusCode });
    };

    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return respond(INVALID_ASSISTANT_REQUEST_RESPONSE, 400);
    }

    const assistantRequest = parseAssistantRequest(input);
    if (!assistantRequest) {
      return respond(INVALID_ASSISTANT_REQUEST_RESPONSE, 400);
    }

    try {
      return respond(await dependencies.provider.reply(assistantRequest), 200);
    } catch {
      return respond(ASSISTANT_UNAVAILABLE_RESPONSE, 503);
    }
  };
}

export const assistantChatHandler = createAssistantChatHandler();
