import {
  createAssistantErrorResponse,
  isAssistantMessageId,
  isAssistantProviderReply,
  isAssistantStreamEventData,
  parseAssistantRequest,
  safeAssistantSuggestedActions,
  ASSISTANT_CHAT_REQUEST_MAX_BYTES,
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  type AssistantErrorResponse,
  type AssistantSuccessResponse,
} from "@/features/assistant/assistant-contract";
import { matchesAssistantInputPolicy } from "@/features/assistant/assistant-input-policy";
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
import { resolveAssistantActor } from "@/server/assistant/assistant-actor";
import {
  AssistantRateLimitExceededError,
  type AssistantRateLimitInput,
  type AssistantRateLimiter,
} from "@/server/assistant/assistant-rate-limit";
import type {
  PublicPageContext,
  PublicPageContextResolver,
} from "@/server/assistant/public-page-context";
import type { resolveTrustedClientIp } from "@/server/assistant/trusted-client-ip";
import { readBoundedJson } from "@/server/http/read-bounded-json";
import {
  createAssistantInputPolicyRepository,
  type AssistantInputPolicySnapshot,
} from "@/server/assistant/assistant-input-policy";

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
  resolveActor: typeof resolveAssistantActor;
  rateLimiter: AssistantRateLimiter;
  loadInputPolicy: () => Promise<AssistantInputPolicySnapshot>;
  pageResolver: Pick<PublicPageContextResolver, "load">;
  resolveTrustedClientIp: (
    request: Request,
  ) => ReturnType<typeof resolveTrustedClientIp>;
}

function loadAssistantInputPolicy() {
  return createAssistantInputPolicyRepository().load();
}

const defaultDependencies: AssistantChatHandlerDependencies = {
  resolveProvider: () => getAssistantRuntime().resolveProvider(),
  logger: assistantRequestLogger,
  clock: () => performance.now(),
  requestIdFactory: () => crypto.randomUUID(),
  messageIdFactory: () => crypto.randomUUID(),
  resolveActor: resolveAssistantActor,
  rateLimiter: {
    consume: (input) => getAssistantRuntime().rateLimiter.consume(input),
  },
  loadInputPolicy: loadAssistantInputPolicy,
  pageResolver: {
    load: (input, signal) =>
      getAssistantRuntime().pageResolver.load(input, signal),
  },
  resolveTrustedClientIp: (request) =>
    getAssistantRuntime().resolveTrustedClientIp(request),
};

function rateLimitInput(
  actor: Awaited<ReturnType<typeof resolveAssistantActor>>,
  client: { mode: "trusted"; ipAddress: string } | { mode: "direct_global" },
): AssistantRateLimitInput {
  return actor.kind === "customer"
    ? { scope: "customer", actorId: actor.userId }
    : client.mode === "trusted"
      ? { scope: "anonymous", ipAddress: client.ipAddress }
      : { scope: "anonymous", global: true };
}

class AssistantInputBlockedError extends Error {}

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
    let statusCode: 200 | 400 | 422 | 429 | 503;
    let retryAfterSeconds: number | undefined;

    const input = await readBoundedJson(
      request,
      ASSISTANT_CHAT_REQUEST_MAX_BYTES,
    );
    const assistantRequest = input.ok
      ? parseAssistantRequest(input.value)
      : null;

    if (!assistantRequest) {
      body = createAssistantErrorResponse(requestId, "validation_error");
      statusCode = 400;
    } else {
      try {
        const actor = await dependencies.resolveActor(request);
        const client = dependencies.resolveTrustedClientIp(request);
        if (client.mode === "invalid_proxy") {
          throw new Error("Assistant proxy is misconfigured");
        }
        await dependencies.rateLimiter.consume(rateLimitInput(actor, client));
        const policy = await dependencies.loadInputPolicy();
        if (
          matchesAssistantInputPolicy(
            [
              assistantRequest.message,
              ...assistantRequest.history
                .filter((message) => message.role === "user")
                .map((message) => message.content),
            ],
            policy.terms,
          )
        ) {
          throw new AssistantInputBlockedError();
        }
        let pageContext: PublicPageContext | null = null;
        if (assistantRequest.page) {
          try {
            pageContext = await dependencies.pageResolver.load(
              assistantRequest.page,
              request.signal,
            );
          } catch {
            if (request.signal.aborted) throw request.signal.reason;
          }
        }
        const selected = dependencies.resolveProvider
          ? await dependencies.resolveProvider()
          : {
              provider: dependencies.provider ?? placeholderAssistantProvider,
              mode: "placeholder" as const,
            };
        const invocation = {
          request: assistantRequest,
          pageContext,
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
          request.signal.addEventListener("abort", abortStream, {
            once: true,
          });
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
              if (pageContext) {
                controller.enqueue(
                  encoder.encode(
                    formatAssistantStreamEvent({
                      type: "activity",
                      phase: "reading",
                      label: "已读取当前页面",
                    }),
                  ),
                );
              }
              void (async () => {
                let contentCodePoints = 0;
                let hasNonWhitespaceContent = false;
                try {
                  while (true) {
                    const next = await iterator.next();
                    if (next.done) break;
                    const event = next.value;
                    if (
                      !isAssistantStreamEventData(event) ||
                      (event.type === "activity" && event.phase === "reading")
                    ) {
                      throw new TypeError("Invalid assistant provider event");
                    }
                    if (event.type === "answer_delta") {
                      contentCodePoints += Array.from(event.content).length;
                      if (
                        contentCodePoints > ASSISTANT_CONTENT_MAX_CODE_POINTS
                      ) {
                        throw new TypeError("Assistant stream is too large");
                      }
                      hasNonWhitespaceContent ||=
                        event.content.trim().length > 0;
                    }
                    controller.enqueue(
                      encoder.encode(formatAssistantStreamEvent(event)),
                    );
                  }
                  if (!hasNonWhitespaceContent) {
                    throw new TypeError("Assistant stream is empty");
                  }
                  controller.enqueue(
                    encoder.encode(
                      formatAssistantStreamEvent({ type: "done" }),
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
                            type: "error",
                            code: "stream_interrupted",
                            message: "回答中断，请重试。",
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
        } else if (error instanceof AssistantInputBlockedError) {
          body = createAssistantErrorResponse(requestId, "input_blocked");
          statusCode = 422;
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
