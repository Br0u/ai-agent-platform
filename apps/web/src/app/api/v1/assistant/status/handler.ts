import { createPlaceholderAssistantStatus } from "@/server/assistant/assistant-status";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";

interface AssistantStatusHandlerDependencies {
  requestIdFactory: () => string;
}

const defaultDependencies: AssistantStatusHandlerDependencies = {
  requestIdFactory: () => crypto.randomUUID(),
};

export function createAssistantStatusHandler(
  dependencies: AssistantStatusHandlerDependencies = defaultDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    return Response.json(
      createPlaceholderAssistantStatus(
        resolveAssistantRequestId(request, dependencies.requestIdFactory),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  };
}

export const assistantStatusHandler = createAssistantStatusHandler();
