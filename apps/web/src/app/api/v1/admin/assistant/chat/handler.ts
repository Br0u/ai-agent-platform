import {
  AuthAccessError,
  requirePermission,
  type AccessService,
  type WorkforceActor,
} from "@/server/auth/access";
import {
  createAdminAssistantErrorResponse,
  type AdminAssistantChatResponse,
  type AdminAssistantErrorResponse,
} from "@/features/assistant/admin-assistant-contract";
import {
  isAssistantMessageId,
  isAssistantProviderReply,
  parseAssistantRequest,
  safeAssistantSuggestedActions,
} from "@/features/assistant/assistant-contract";
import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import {
  assistantRequestLogger,
  type AssistantRequestLogger,
} from "@/server/assistant/assistant-request-log";
import { getAssistantRuntime } from "@/server/assistant/assistant-runtime";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  AssistantRateLimitExceededError,
  type AssistantRateLimiter,
} from "@/server/assistant/assistant-rate-limit";
import { readBoundedJson } from "@/server/http/read-bounded-json";

type AdminAssistantChatDependencies = {
  access: Pick<AccessService, "requirePermission">;
  provider?: AssistantProvider;
  resolveProvider: () => Promise<{
    provider: AssistantProvider;
    mode: "placeholder" | "agentos";
  }>;
  rateLimiter: AssistantRateLimiter;
  logger: AssistantRequestLogger;
  clock: () => number;
  requestIdFactory: () => string;
  messageIdFactory: () => string;
};

const defaultDependencies: AdminAssistantChatDependencies = {
  access: { requirePermission },
  resolveProvider: () => getAssistantRuntime().resolveProvider(),
  rateLimiter: {
    consume: (input) => getAssistantRuntime().rateLimiter.consume(input),
  },
  logger: assistantRequestLogger,
  clock: () => performance.now(),
  requestIdFactory: () => crypto.randomUUID(),
  messageIdFactory: () => crypto.randomUUID(),
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

export function createAdminAssistantChatHandler(
  overrides: Partial<AdminAssistantChatDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async function POST(request: Request): Promise<Response> {
    const requestId = resolveAssistantRequestId(
      request,
      dependencies.requestIdFactory,
    );
    let actor: WorkforceActor;
    try {
      actor = await dependencies.access.requirePermission("admin:assistant");
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

    const startedAt = dependencies.clock();
    let body: AdminAssistantChatResponse | AdminAssistantErrorResponse;
    let statusCode: 200 | 400 | 429 | 503;
    let retryAfterSeconds: number | undefined;
    const input = await readBoundedJson(request, MAX_REQUEST_BODY_BYTES);
    const assistantRequest = input.ok
      ? parseAssistantRequest(input.value)
      : null;

    if (assistantRequest === null) {
      body = createAdminAssistantErrorResponse(requestId, "validation_error");
      statusCode = 400;
    } else {
      try {
        await dependencies.rateLimiter.consume({
          scope: "admin-test",
          actorId: actor.userId,
        });
        const selected = dependencies.provider
          ? { provider: dependencies.provider, mode: "placeholder" as const }
          : await dependencies.resolveProvider();
        const providerResponse =
          await selected.provider.reply(assistantRequest);
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
          mode: selected.mode,
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
      } catch (error) {
        if (error instanceof AssistantRateLimitExceededError) {
          body = createAdminAssistantErrorResponse(requestId, "rate_limited");
          statusCode = 429;
          retryAfterSeconds = error.retryAfterSeconds;
        } else {
          body = createAdminAssistantErrorResponse(
            requestId,
            "assistant_unavailable",
          );
          statusCode = 503;
        }
      }
    }

    let response: Response;
    try {
      response = Response.json(body, {
        status: statusCode,
        headers: {
          ...NO_STORE_HEADERS,
          ...(retryAfterSeconds === undefined
            ? {}
            : { "Retry-After": String(retryAfterSeconds) }),
        },
      });
    } catch {
      body = createAdminAssistantErrorResponse(
        requestId,
        "assistant_unavailable",
      );
      statusCode = 503;
      retryAfterSeconds = undefined;
      response = Response.json(body, {
        status: statusCode,
        headers: NO_STORE_HEADERS,
      });
    }

    try {
      dependencies.logger.log({
        requestId,
        statusCode,
        durationMs: Math.max(0, dependencies.clock() - startedAt),
      });
    } catch {
      // Logging must not change the protected response.
    }

    return response;
  };
}

export const adminAssistantChatHandler = createAdminAssistantChatHandler();
