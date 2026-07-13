import { createPlaceholderAssistantStatus } from "@/server/assistant/assistant-status";

interface AssistantStatusHandlerDependencies {
  requestIdFactory: () => string;
}

const defaultDependencies: AssistantStatusHandlerDependencies = {
  requestIdFactory: () => crypto.randomUUID(),
};

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/u;

function requestId(request: Request, factory: () => string): string {
  const header = request.headers.get("x-request-id");
  return header !== null && SAFE_REQUEST_ID.test(header) ? header : factory();
}

export function createAssistantStatusHandler(
  dependencies: AssistantStatusHandlerDependencies = defaultDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    return Response.json(
      createPlaceholderAssistantStatus(
        requestId(request, dependencies.requestIdFactory),
      ),
    );
  };
}

export const assistantStatusHandler = createAssistantStatusHandler();
