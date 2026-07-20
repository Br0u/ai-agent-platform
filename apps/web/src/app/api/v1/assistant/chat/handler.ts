import {
  createAssistantErrorResponse,
  isAssistantMessageId,
  isAssistantProviderReply,
  isAssistantStreamDeltaEvent,
  parseAssistantRequest,
  safeAssistantSuggestedActions,
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  type AssistantErrorResponse,
  type AssistantSuccessResponse,
} from "@/features/assistant/assistant-contract";
import {
  ASSISTANT_STREAM_MEDIA_TYPE,
  formatAssistantStreamEvent,
} from "@/features/assistant/assistant-stream";
import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import {
  assistantRequestLogger,
  type AssistantRequestLogger,
} from "@/server/assistant/assistant-request-log";
import { placeholderAssistantProvider } from "@/server/assistant/placeholder-assistant-provider";
import { getAssistantRuntime } from "@/server/assistant/assistant-runtime";
import { resolveAssistantRequestId } from "@/server/assistant/assistant-request-id";
import {
  type AnonymousSessionManager,
  type AssistantPublicSession,
} from "@/server/assistant/anonymous-session";
import { type AssistantActor } from "@/server/assistant/assistant-actor";
import {
  AssistantRateLimitExceededError,
  type AssistantRateLimitInput,
  type AssistantRateLimiter,
} from "@/server/assistant/assistant-rate-limit";
import { readBoundedJson } from "@/server/http/read-bounded-json";

export type AssistantChatSessionResolution = {
  publicSession: AssistantPublicSession;
  internalSessionId: string;
  actor: AssistantActor;
  setCookie?: string;
};

interface AssistantChatHandlerDependencies {
  provider?: AssistantProvider;
  resolveProvider?: () => Promise<{
    provider: AssistantProvider;
    mode: "placeholder" | "agentos";
  }>;
  logger: AssistantRequestLogger;
  clock: () => number;
  requestIdFactory: () => string;
  messageIdFactory: () => string;
  resolveSession: (request: Request) => Promise<AssistantChatSessionResolution>;
  rateLimiter: AssistantRateLimiter;
  resolveTrustedClientIp: (request: Request) => string | undefined;
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

const defaultDependencies: AssistantChatHandlerDependencies = {
  resolveProvider: () => getAssistantRuntime().resolveProvider(),
  logger: assistantRequestLogger,
  clock: () => performance.now(),
  requestIdFactory: () => crypto.randomUUID(),
  messageIdFactory: () => crypto.randomUUID(),
  resolveSession: (request) => getAssistantRuntime().resolveSession(request),
  rateLimiter: {
    consume: (input) => getAssistantRuntime().rateLimiter.consume(input),
  },
  resolveTrustedClientIp: (request) =>
    getAssistantRuntime().resolveTrustedClientIp(request),
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
        const resolvedSession = session;
        const ipAddress = dependencies.resolveTrustedClientIp(request);
        await dependencies.rateLimiter.consume(
          rateLimitInput(resolvedSession, ipAddress),
        );
        const selected = dependencies.resolveProvider
          ? await dependencies.resolveProvider()
          : {
              provider: dependencies.provider ?? placeholderAssistantProvider,
              mode: "placeholder" as const,
            };
        const invocation = {
          request: assistantRequest,
          session: {
            kind: "persistent" as const,
            internalSessionId: resolvedSession.internalSessionId,
          },
          signal: request.signal,
        };
        if (
          selected.mode === "agentos" &&
          selected.provider.streamReply !== undefined
        ) {
          const messageId = dependencies.messageIdFactory();
          if (!isAssistantMessageId(messageId)) {
            throw new TypeError("Invalid assistant message id");
          }
          const encoder = new TextEncoder();
          const streamAbortController = new AbortController();
          const iterator = selected.provider
            .streamReply({
              ...invocation,
              signal: streamAbortController.signal,
            })
            [Symbol.asyncIterator]();
          const abortStream = () => streamAbortController.abort();
          request.signal.addEventListener("abort", abortStream, { once: true });
          if (request.signal.aborted) abortStream();
          let cancelled = false;
          let logged = false;
          const logStream = (streamStatusCode: number) => {
            if (logged) return;
            logged = true;
            try {
              dependencies.logger.log({
                requestId,
                statusCode: streamStatusCode,
                durationMs: Math.max(0, dependencies.clock() - startedAt),
              });
            } catch {
              // Logging must not change the public stream.
            }
          };
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  formatAssistantStreamEvent({
                    event: "start",
                    data: {
                      version: "1",
                      requestId,
                      mode: "agentos",
                      session: resolvedSession.publicSession,
                      message: {
                        id: messageId,
                        role: "assistant",
                      },
                      suggestedActions: [],
                    },
                  }),
                ),
              );
              void (async () => {
                let contentCodePoints = 0;
                let hasNonWhitespaceContent = false;
                try {
                  while (true) {
                    const next = await iterator.next();
                    if (next.done) break;
                    const delta = { content: next.value };
                    if (!isAssistantStreamDeltaEvent(delta)) {
                      throw new TypeError("Invalid assistant stream delta");
                    }
                    contentCodePoints += Array.from(delta.content).length;
                    if (contentCodePoints > ASSISTANT_CONTENT_MAX_CODE_POINTS) {
                      throw new TypeError("Assistant stream is too large");
                    }
                    hasNonWhitespaceContent ||= delta.content.trim().length > 0;
                    controller.enqueue(
                      encoder.encode(
                        formatAssistantStreamEvent({
                          event: "delta",
                          data: delta,
                        }),
                      ),
                    );
                  }
                  if (!hasNonWhitespaceContent) {
                    throw new TypeError("Assistant stream is empty");
                  }
                  controller.enqueue(
                    encoder.encode(
                      formatAssistantStreamEvent({ event: "done", data: {} }),
                    ),
                  );
                  controller.close();
                  logStream(200);
                } catch {
                  if (!cancelled) {
                    try {
                      controller.enqueue(
                        encoder.encode(
                          formatAssistantStreamEvent({
                            event: "error",
                            data: {},
                          }),
                        ),
                      );
                      controller.close();
                    } catch {
                      // The browser may have disconnected during failure cleanup.
                    }
                    logStream(503);
                  }
                } finally {
                  request.signal.removeEventListener("abort", abortStream);
                  await iterator.return?.();
                }
              })();
            },
            async cancel() {
              cancelled = true;
              logStream(499);
              streamAbortController.abort();
              await iterator.return?.();
            },
          });
          return new Response(stream, {
            status: 200,
            headers: {
              "Cache-Control": "no-store, no-transform",
              "Content-Type": `${ASSISTANT_STREAM_MEDIA_TYPE}; charset=utf-8`,
              "X-Accel-Buffering": "no",
              ...(resolvedSession.setCookie
                ? { "Set-Cookie": resolvedSession.setCookie }
                : {}),
            },
          });
        }
        const providerResponse = await selected.provider.reply({
          ...invocation,
        });
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
