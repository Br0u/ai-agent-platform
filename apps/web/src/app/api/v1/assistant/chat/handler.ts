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
  getAnonymousSessionManager,
  type AnonymousSessionManager,
  type AssistantPublicSession,
} from "@/server/assistant/anonymous-session";
import {
  resolveAssistantActor,
  type AssistantActor,
} from "@/server/assistant/assistant-actor";
import {
  AssistantRateLimitExceededError,
  createDatabaseAssistantRateLimiter,
  type AssistantRateLimitInput,
  type AssistantRateLimiter,
} from "@/server/assistant/assistant-rate-limit";
import { resolveTrustedClientIp } from "@/server/assistant/trusted-client-ip";
import { readBoundedJson } from "@/server/http/read-bounded-json";

export type AssistantChatSessionResolution = {
  publicSession: AssistantPublicSession;
  internalSessionId: string;
  actor: AssistantActor;
  setCookie?: string;
};

interface AssistantChatHandlerDependencies {
  provider: AssistantProvider;
  logger: AssistantRequestLogger;
  clock: () => number;
  requestIdFactory: () => string;
  messageIdFactory: () => string;
  resolveSession: (request: Request) => Promise<AssistantChatSessionResolution>;
  rateLimiter: AssistantRateLimiter;
  resolveTrustedClientIp: (request: Request) => string | undefined;
}

let defaultRateLimiter: AssistantRateLimiter | undefined;

function getDefaultRateLimiter(): AssistantRateLimiter {
  defaultRateLimiter ??= createDatabaseAssistantRateLimiter();
  return defaultRateLimiter;
}

export function createAssistantChatSessionResolver(
  manager: AnonymousSessionManager,
  actorResolver: (request: Request) => Promise<AssistantActor>,
) {
  return async function resolveSession(
    request: Request,
  ): Promise<AssistantChatSessionResolution> {
    const actor = await actorResolver(request);
    const session = manager.resolve(request.headers, actor);
    return { ...session, actor };
  };
}

async function resolveDefaultSession(
  request: Request,
): Promise<AssistantChatSessionResolution> {
  return createAssistantChatSessionResolver(
    getAnonymousSessionManager(),
    resolveAssistantActor,
  )(request);
}

function trustNginxProxy(): boolean {
  const value = process.env.TRUST_NGINX_PROXY;
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("TRUST_NGINX_PROXY must be true or false");
}

const defaultDependencies: AssistantChatHandlerDependencies = {
  provider: placeholderAssistantProvider,
  logger: assistantRequestLogger,
  clock: () => performance.now(),
  requestIdFactory: () => crypto.randomUUID(),
  messageIdFactory: () => crypto.randomUUID(),
  resolveSession: resolveDefaultSession,
  rateLimiter: {
    consume: (input) => getDefaultRateLimiter().consume(input),
  },
  resolveTrustedClientIp: (request) =>
    resolveTrustedClientIp(request.headers, trustNginxProxy()),
};

function rateLimitInput(
  session: AssistantChatSessionResolution,
  ipAddress: string | undefined,
): AssistantRateLimitInput {
  return session.actor.kind === "customer"
    ? { scope: "customer", actorId: session.actor.userId }
    : {
        scope: "anonymous",
        sessionId: session.internalSessionId,
        ...(ipAddress ? { ipAddress } : {}),
      };
}

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
    let statusCode: 200 | 400 | 429 | 503;
    let session: AssistantChatSessionResolution | undefined;
    let retryAfterSeconds: number | undefined;

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
        const ipAddress = dependencies.resolveTrustedClientIp(request);
        await dependencies.rateLimiter.consume(
          rateLimitInput(session, ipAddress),
        );
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
      } catch (error) {
        if (error instanceof AssistantRateLimitExceededError) {
          body = createAssistantErrorResponse(requestId, "rate_limited");
          statusCode = 429;
          retryAfterSeconds = error.retryAfterSeconds;
        } else {
          body = createAssistantErrorResponse(
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
          "Cache-Control": "no-store",
          ...(session?.setCookie ? { "Set-Cookie": session.setCookie } : {}),
          ...(retryAfterSeconds !== undefined
            ? { "Retry-After": String(retryAfterSeconds) }
            : {}),
        },
      });
    } catch {
      body = createAssistantErrorResponse(requestId, "assistant_unavailable");
      statusCode = 503;
      retryAfterSeconds = undefined;
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
