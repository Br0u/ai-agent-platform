import {
  ASSISTANT_UNAVAILABLE_RESPONSE,
  INVALID_ASSISTANT_REQUEST_RESPONSE,
  isAssistantSuccessResponse,
  parseAssistantRequest,
  type AssistantErrorResponse,
  type AssistantSuccessResponse,
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
  clock: () => performance.now(),
  requestIdFactory: () => crypto.randomUUID(),
};

const MAX_REQUEST_BODY_BYTES = 4096;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/u;

type JsonReadResult = { ok: true; value: unknown } | { ok: false };

async function readBoundedJson(request: Request): Promise<JsonReadResult> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/u.test(contentLength) &&
    Number(contentLength) > MAX_REQUEST_BODY_BYTES
  ) {
    return { ok: false };
  }

  if (!request.body) return { ok: false };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return { ok: false };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      ok: true,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ),
    };
  } catch {
    return { ok: false };
  }
}

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

    const input = await readBoundedJson(request);
    const assistantRequest = input.ok
      ? parseAssistantRequest(input.value)
      : null;

    if (!assistantRequest) {
      body = INVALID_ASSISTANT_REQUEST_RESPONSE;
      statusCode = 400;
    } else {
      try {
        const providerResponse =
          await dependencies.provider.reply(assistantRequest);
        if (!isAssistantSuccessResponse(providerResponse)) {
          throw new TypeError("Invalid assistant provider response");
        }
        body = providerResponse;
        statusCode = 200;
      } catch {
        body = ASSISTANT_UNAVAILABLE_RESPONSE;
        statusCode = 503;
      }
    }

    let response: Response;
    try {
      response = Response.json(body, { status: statusCode });
    } catch {
      body = ASSISTANT_UNAVAILABLE_RESPONSE;
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
