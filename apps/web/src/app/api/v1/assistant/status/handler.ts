import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  getAssistantRuntime,
  type AssistantRuntimeStatus,
} from "@/server/assistant/assistant-runtime";

interface AssistantStatusHandlerDependencies {
  requestIdFactory: () => string;
  getStatus: () => Promise<AssistantRuntimeStatus>;
}

const defaultDependencies: AssistantStatusHandlerDependencies = {
  requestIdFactory: () => crypto.randomUUID(),
  getStatus: () => getAssistantRuntime().status(),
};

export function createAssistantStatusHandler(
  dependencies: AssistantStatusHandlerDependencies = defaultDependencies,
) {
  return async function GET(request: Request): Promise<Response> {
    const requestId = resolveAssistantRequestId(
      request,
      dependencies.requestIdFactory,
    );
    let status: AssistantRuntimeStatus;
    try {
      status = await dependencies.getStatus();
    } catch {
      status = {
        live: false,
        ready: false,
        capability: "degraded",
        message: "助手基础服务暂不可用。",
      };
    }
    return Response.json(
      { version: "1", requestId, ...status },
      { headers: { "Cache-Control": "no-store" } },
    );
  };
}

export const assistantStatusHandler = createAssistantStatusHandler();
