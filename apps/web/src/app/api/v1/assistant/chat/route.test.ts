import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_ACTION_HREF_MAX_CODE_POINTS,
  ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS,
  ASSISTANT_CHAT_REQUEST_MAX_BYTES,
  ASSISTANT_CONTENT_MAX_CODE_POINTS,
  ASSISTANT_MAX_SUGGESTED_ACTIONS,
  createAssistantErrorResponse,
  type AssistantSuccessResponse,
} from "@/features/assistant/assistant-contract";
import type {
  AssistantProvider,
  AssistantProviderReply,
} from "@/server/assistant/assistant-provider";
import * as inputPolicyRepository from "@/server/assistant/assistant-input-policy";
import type {
  AssistantRequestLog,
  AssistantRequestLogger,
} from "@/server/assistant/assistant-request-log";
import type { resolveAssistantActor } from "@/server/assistant/assistant-actor";
import {
  AssistantRateLimitExceededError,
  AssistantRateLimitUnavailableError,
} from "@/server/assistant/assistant-rate-limit";
import type { PublicPageContext } from "@/server/assistant/public-page-context";
import type { resolveTrustedClientIp } from "@/server/assistant/trusted-client-ip";
import { createAssistantChatHandler } from "./handler";
import * as route from "./route";

const success: AssistantSuccessResponse = {
  version: "1",
  requestId: "generated-request-id",
  mode: "placeholder",
  message: { id: "generated-message-id", role: "assistant", content: "ok" },
  suggestedActions: [{ label: "帮助中心", href: "/help" }],
};

const providerSuccess = {
  content: "ok",
  suggestedActions: [{ label: "帮助中心", href: "/help" }],
};

function request(body: string, requestId?: string) {
  let normalizedBody = body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      parsed.version === undefined
    ) {
      const { context, ...rest } = parsed;
      normalizedBody = JSON.stringify({
        version: "2",
        history: [],
        ...rest,
        ...(context !== undefined
          ? {
              page:
                typeof context === "object" && context !== null
                  ? { ...context, search: "" }
                  : context,
            }
          : {}),
      });
    }
  } catch {
    // Malformed JSON is passed through to the route.
  }
  return new Request("http://localhost/api/v1/assistant/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(requestId !== undefined ? { "x-request-id": requestId } : {}),
    },
    body: normalizedBody,
  });
}

function streamingRequest(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new Request("http://localhost/api/v1/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function escapedEmojiBody(count: number) {
  return `{"version":"2","message":"${"\\ud83d\\ude00".repeat(count)}","history":[],"page":{"pathname":"/help","search":""}}`;
}

function requestBodyAtBytes(byteLength: number) {
  const body = JSON.stringify({
    version: "2",
    message: "问题",
    history: [],
    page: { pathname: "/help", search: "" },
  });
  const padding = byteLength - new TextEncoder().encode(body).byteLength;
  if (padding < 0) throw new Error("Requested body boundary is too small");
  return `${body}${" ".repeat(padding)}`;
}

function declaredRequest(body: string) {
  const declared = request(body);
  declared.headers.set(
    "content-length",
    String(new TextEncoder().encode(body).byteLength),
  );
  return declared;
}

function dependencies(options?: {
  reply?: AssistantProvider["reply"];
  times?: number[];
}) {
  const provider: AssistantProvider = {
    reply: vi.fn(options?.reply ?? (async () => providerSuccess)),
  };
  const records: AssistantRequestLog[] = [];
  const logger: AssistantRequestLogger = {
    log: vi.fn((record) => records.push(record)),
  };
  const times = options?.times ?? [100, 107];
  let timeIndex = 0;
  const rateLimiter = { consume: vi.fn(async () => undefined) };
  const loadInputPolicy = vi.fn(async () => ({
    terms: [] as string[],
    revision: 0,
    updatedAt: null,
    updatedBy: null,
  }));
  const pageContext: PublicPageContext = {
    pathname: "/pricing",
    search: "",
    title: "价格与服务",
    text: "公开页面正文",
    links: [],
  };
  const pageResolver = {
    load: vi.fn(async () => pageContext as PublicPageContext | null),
  };

  return {
    provider,
    resolveProvider: vi.fn(async () => ({
      provider,
      mode: "placeholder" as "placeholder" | "agentos",
    })),
    logger,
    records,
    clock: () => times[timeIndex++] ?? times.at(-1) ?? 0,
    requestIdFactory: () => "generated-request-id",
    messageIdFactory: () => "generated-message-id",
    resolveActor: vi.fn<typeof resolveAssistantActor>(async () => ({
      kind: "anonymous" as const,
    })),
    rateLimiter,
    loadInputPolicy,
    pageContext,
    pageResolver,
    resolveTrustedClientIp: vi.fn<
      (request: Request) => ReturnType<typeof resolveTrustedClientIp>
    >(() => ({ mode: "trusted", ipAddress: "203.0.113.10" })),
  };
}

describe("POST /api/v1/assistant/chat", () => {
  it("rejects a literal legacy V1 wire payload before dependencies", async () => {
    const deps = dependencies();
    const legacyRequest = new Request(
      "http://localhost/api/v1/assistant/chat",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "旧请求",
          context: { pathname: "/help" },
        }),
      },
    );

    const response = await createAssistantChatHandler(deps)(legacyRequest);

    expect(response.status).toBe(400);
    expect(deps.resolveActor).not.toHaveBeenCalled();
    expect(deps.rateLimiter.consume).not.toHaveBeenCalled();
    expect(deps.loadInputPolicy).not.toHaveBeenCalled();
    expect(deps.resolveProvider).not.toHaveBeenCalled();
    expect(deps.provider.reply).not.toHaveBeenCalled();
  });

  it("trims the message and passes a valid pathname to the provider", async () => {
    const deps = dependencies();
    const POST = createAssistantChatHandler(deps);

    const response = await POST(
      request(
        JSON.stringify({
          message: "  如何开始了解平台？  ",
          context: { pathname: "/pricing" },
        }),
        "incoming-request-id",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      ...success,
      requestId: "incoming-request-id",
    });
    expect(deps.provider.reply).toHaveBeenCalledExactlyOnceWith({
      request: {
        version: "2",
        message: "如何开始了解平台？",
        history: [],
        page: { pathname: "/pricing", search: "" },
      },
      pageContext: deps.pageContext,
      signal: expect.any(AbortSignal),
    });
    expect(deps.resolveActor).toHaveBeenCalledExactlyOnceWith(
      expect.any(Request),
    );
    expect(deps.rateLimiter.consume).toHaveBeenCalledExactlyOnceWith({
      scope: "anonymous",
      ipAddress: "203.0.113.10",
    });
    expect(deps.records).toEqual([
      { requestId: "incoming-request-id", statusCode: 200, durationMs: 7 },
    ]);
  });

  it("streams AgentOS deltas through the public route as SSE", async () => {
    const deps = dependencies();
    const streamingProvider = {
      reply: vi.fn(async () => providerSuccess),
      async *streamReply() {
        yield {
          type: "activity" as const,
          phase: "analyzing" as const,
          label: "正在分析问题",
        };
        yield { type: "answer_delta" as const, content: "第一段" };
        yield {
          type: "action" as const,
          action: {
            kind: "navigate" as const,
            pathname: "/pricing",
            label: "价格与服务",
          },
        };
        yield { type: "answer_delta" as const, content: "第二段" };
      },
    };
    deps.resolveProvider.mockResolvedValue({
      provider: streamingProvider,
      mode: "agentos",
    });
    const POST = createAssistantChatHandler(deps);

    const response = await POST(
      request(
        JSON.stringify({
          message: "流式问题",
          context: { pathname: "/assistant" },
        }),
        "stream-request-id",
      ),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(body).toBe(
      'data: {"type":"activity","phase":"reading","label":"已读取当前页面"}\n\n' +
        'data: {"type":"activity","phase":"analyzing","label":"正在分析问题"}\n\n' +
        'data: {"type":"answer_delta","content":"第一段"}\n\n' +
        'data: {"type":"action","action":{"kind":"navigate","pathname":"/pricing","label":"价格与服务"}}\n\n' +
        'data: {"type":"answer_delta","content":"第二段"}\n\n' +
        'data: {"type":"done"}\n\n',
    );
    expect(streamingProvider.reply).not.toHaveBeenCalled();
  });

  it("terminates a failed AgentOS stream without exposing the provider error", async () => {
    const deps = dependencies({ times: [100, 109] });
    const streamingProvider = {
      reply: vi.fn(async () => providerSuccess),
      async *streamReply() {
        yield { type: "answer_delta" as const, content: "可见片段" };
        throw new Error("private URL key prompt and answer");
      },
    };
    deps.resolveProvider.mockResolvedValue({
      provider: streamingProvider,
      mode: "agentos",
    });
    const POST = createAssistantChatHandler(deps);

    const response = await POST(
      request(
        JSON.stringify({
          message: "触发失败",
          context: { pathname: "/assistant" },
        }),
        "failed-stream-request",
      ),
    );
    const body = await response.text();

    expect(body).toContain(
      'data: {"type":"answer_delta","content":"可见片段"}\n\n',
    );
    expect(body).toContain(
      'data: {"type":"error","code":"stream_interrupted","message":"回答中断，请重试。"}\n\n',
    );
    expect(body).not.toMatch(/private|url|key|prompt/iu);
    expect(deps.records).toEqual([
      {
        requestId: "failed-stream-request",
        statusCode: 503,
        durationMs: 9,
      },
    ]);
  });

  it("after valid V2 parsing, limits, loads policy, resolves the page, then streams", async () => {
    const order: string[] = [];
    const deps = dependencies();
    const streamingProvider = {
      reply: vi.fn(async () => providerSuccess),
      async *streamReply() {
        order.push("stream");
        yield { type: "answer_delta" as const, content: "回答" };
      },
    };
    deps.resolveActor.mockImplementation(async () => {
      return { kind: "anonymous" as const };
    });
    deps.rateLimiter.consume.mockImplementation(async () => {
      order.push("limit");
    });
    deps.loadInputPolicy.mockImplementation(async () => {
      order.push("policy");
      return { terms: [], revision: 0, updatedAt: null, updatedBy: null };
    });
    deps.pageResolver.load.mockImplementation(async () => {
      order.push("page");
      return deps.pageContext;
    });
    deps.resolveProvider.mockImplementation(async () => {
      order.push("selector");
      return { provider: streamingProvider, mode: "agentos" };
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          version: "2",
          message: "问题",
          history: [],
          page: { pathname: "/product", search: "" },
        }),
      ),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"type":"answer_delta"');
    expect(order).toEqual(["limit", "policy", "page", "selector", "stream"]);
    expect(deps.resolveActor).toHaveBeenCalledOnce();
    expect(streamingProvider.reply).not.toHaveBeenCalled();
  });

  it("returns exact 422 for a matching current message before provider resolution", async () => {
    const deps = dependencies();
    deps.loadInputPolicy.mockResolvedValue({
      terms: ["敏感词"],
      revision: 1,
      updatedAt: null,
      updatedBy: null,
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          message: "请解释这个敏感词",
          context: { pathname: "/" },
        }),
      ),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: "generated-request-id",
      error: {
        code: "input_blocked",
        message: "该问题无法提交，请调整表述",
        retryable: false,
      },
    });
    expect(deps.resolveProvider).not.toHaveBeenCalled();
    expect(deps.pageResolver.load).not.toHaveBeenCalled();
    expect(deps.provider.reply).not.toHaveBeenCalled();
    expect(deps.records).toEqual([
      { requestId: "generated-request-id", statusCode: 422, durationMs: 7 },
    ]);
  });

  it("blocks a matching user-history message without checking assistant history", async () => {
    const order: string[] = [];
    const deps = dependencies();
    deps.rateLimiter.consume.mockImplementation(async () => {
      order.push("limit");
    });
    deps.loadInputPolicy.mockImplementation(async () => {
      order.push("policy");
      return {
        terms: ["历史敏感词"],
        revision: 1,
        updatedAt: null,
        updatedBy: null,
      };
    });
    deps.pageResolver.load.mockImplementation(async () => {
      order.push("page");
      return deps.pageContext;
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          version: "2",
          message: "继续",
          history: [
            { role: "user", content: "包含历史敏感词" },
            { role: "assistant", content: "普通回答" },
          ],
          page: null,
        }),
      ),
    );

    expect(response.status).toBe(422);
    expect(order).toEqual(["limit", "policy"]);
    expect(deps.pageResolver.load).not.toHaveBeenCalled();
    expect(deps.resolveProvider).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("历史敏感词");
  });

  it("does not apply user-input policy terms to assistant-role history", async () => {
    const deps = dependencies();
    deps.loadInputPolicy.mockResolvedValue({
      terms: ["仅助手内容"],
      revision: 1,
      updatedAt: null,
      updatedBy: null,
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          version: "2",
          message: "继续",
          history: [
            { role: "user", content: "普通问题" },
            { role: "assistant", content: "包含仅助手内容" },
          ],
          page: null,
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(deps.resolveProvider).toHaveBeenCalledOnce();
  });

  it("returns safe 503 when input policy storage fails before provider resolution", async () => {
    const deps = dependencies();
    deps.loadInputPolicy.mockRejectedValue(
      new Error("policy storage leaked term 敏感词"),
    );

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({ message: "普通问题", context: { pathname: "/" } }),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual(
      createAssistantErrorResponse(
        "generated-request-id",
        "assistant_unavailable",
      ),
    );
    expect(JSON.stringify(body)).not.toMatch(/storage|敏感词/iu);
    expect(deps.resolveProvider).not.toHaveBeenCalled();
    expect(deps.pageResolver.load).not.toHaveBeenCalled();
    expect(deps.provider.reply).not.toHaveBeenCalled();
  });

  it("keeps rate-limit failure ahead of input policy loading", async () => {
    const deps = dependencies();
    deps.rateLimiter.consume.mockRejectedValue(
      new AssistantRateLimitExceededError(37),
    );

    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ message: "问题", context: { pathname: "/" } })),
    );

    expect(response.status).toBe(429);
    expect(deps.loadInputPolicy).not.toHaveBeenCalled();
    expect(deps.resolveProvider).not.toHaveBeenCalled();
    expect(deps.provider.reply).not.toHaveBeenCalled();
  });

  it("never falls back to the global policy repository for custom handlers", async () => {
    const globalRepository = vi
      .spyOn(inputPolicyRepository, "createAssistantInputPolicyRepository")
      .mockImplementation(() => {
        throw new Error("global policy repository must not be used");
      });
    const deps = dependencies();

    try {
      const response = await createAssistantChatHandler(deps)(
        request(
          JSON.stringify({ message: "问题", context: { pathname: "/" } }),
        ),
      );

      expect(response.status).toBe(200);
      expect(deps.loadInputPolicy).toHaveBeenCalledOnce();
      expect(globalRepository).not.toHaveBeenCalled();
      expect(deps.resolveProvider).toHaveBeenCalledOnce();
    } finally {
      globalRepository.mockRestore();
    }
  });

  it("uses only the server-resolved customer actor for customer limits", async () => {
    const deps = dependencies();
    deps.resolveActor.mockResolvedValue({
      kind: "customer",
      userId: "server-customer-id",
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          message: "问题",
          context: { pathname: "/" },
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(deps.rateLimiter.consume).toHaveBeenCalledExactlyOnceWith({
      scope: "customer",
      actorId: "server-customer-id",
    });
  });

  it("rejects a body-supplied actor ID before resolving dependencies", async () => {
    const deps = dependencies();
    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          message: "问题",
          context: { pathname: "/" },
          actorId: "attacker-controlled",
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(deps.resolveActor).not.toHaveBeenCalled();
    expect(deps.rateLimiter.consume).not.toHaveBeenCalled();
  });

  it("returns exact versioned 429 with Retry-After", async () => {
    const deps = dependencies();
    deps.rateLimiter.consume.mockRejectedValue(
      new AssistantRateLimitExceededError(37),
    );

    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ message: "问题", context: { pathname: "/" } })),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    await expect(response.json()).resolves.toEqual(
      createAssistantErrorResponse("generated-request-id", "rate_limited"),
    );
    expect(deps.provider.reply).not.toHaveBeenCalled();
    expect(deps.records).toEqual([
      { requestId: "generated-request-id", statusCode: 429, durationMs: 7 },
    ]);
  });

  it("fails closed with the safe versioned 503 when PostgreSQL is unavailable", async () => {
    const deps = dependencies();
    deps.rateLimiter.consume.mockRejectedValue(
      new AssistantRateLimitUnavailableError(),
    );

    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ message: "问题", context: { pathname: "/" } })),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      createAssistantErrorResponse(
        "generated-request-id",
        "assistant_unavailable",
      ),
    );
    expect(deps.provider.reply).not.toHaveBeenCalled();
  });

  it("returns safe versioned 503 when explicit Provider selection is unavailable", async () => {
    const deps = dependencies();
    deps.resolveProvider.mockRejectedValue(
      new Error("http://agent:7777 private readiness failure"),
    );

    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ message: "问题", context: { pathname: "/" } })),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual(
      createAssistantErrorResponse(
        "generated-request-id",
        "assistant_unavailable",
      ),
    );
    expect(JSON.stringify(body)).not.toMatch(/agent:7777|private|readiness/iu);
    expect(deps.rateLimiter.consume).toHaveBeenCalledOnce();
    expect(deps.provider.reply).not.toHaveBeenCalled();
  });

  it("fails closed before limiting or provider work for an invalid trusted proxy IP", async () => {
    const deps = dependencies();
    deps.resolveTrustedClientIp.mockReturnValue({ mode: "invalid_proxy" });

    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ message: "问题", context: { pathname: "/" } })),
    );

    expect(response.status).toBe(503);
    expect(deps.rateLimiter.consume).not.toHaveBeenCalled();
    expect(deps.loadInputPolicy).not.toHaveBeenCalled();
    expect(deps.pageResolver.load).not.toHaveBeenCalled();
    expect(deps.provider.reply).not.toHaveBeenCalled();
  });

  it("uses the fixed direct-global limiter input without session identity", async () => {
    const deps = dependencies();
    deps.resolveTrustedClientIp.mockReturnValue({ mode: "direct_global" });

    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ message: "问题", context: { pathname: "/" } })),
    );

    expect(response.status).toBe(200);
    expect(deps.rateLimiter.consume).toHaveBeenCalledExactlyOnceWith({
      scope: "anonymous",
      global: true,
    });
    expect(JSON.stringify(deps.rateLimiter.consume.mock.calls)).not.toContain(
      "internal-replayable-value",
    );
    expect(
      JSON.stringify(vi.mocked(deps.provider.reply).mock.calls),
    ).not.toContain("internal-replayable-value");
  });

  it("continues without page context or reading activity when page loading returns null", async () => {
    const deps = dependencies();
    const streamingProvider = {
      reply: vi.fn(async () => providerSuccess),
      async *streamReply() {
        yield { type: "answer_delta" as const, content: "回答" };
      },
    };
    deps.resolveProvider.mockResolvedValue({
      provider: streamingProvider,
      mode: "agentos",
    });
    deps.pageResolver.load.mockResolvedValue(null);

    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ message: "问题", context: { pathname: "/" } })),
    );
    const body = await response.text();

    expect(body).not.toContain('"type":"activity"');
    expect(body).toContain('"type":"answer_delta"');
    expect(streamingProvider.reply).not.toHaveBeenCalled();
  });

  it("downgrades a rejected page load to null without reading activity", async () => {
    const deps = dependencies();
    const invocations: unknown[] = [];
    const streamingProvider = {
      reply: vi.fn(async () => providerSuccess),
      async *streamReply(invocation: unknown) {
        invocations.push(invocation);
        yield { type: "answer_delta" as const, content: "回答" };
      },
    };
    deps.resolveProvider.mockResolvedValue({
      provider: streamingProvider,
      mode: "agentos",
    });
    deps.pageResolver.load.mockRejectedValue(
      new Error("private page reader failure"),
    );

    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ message: "问题", context: { pathname: "/" } })),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('"type":"activity"');
    expect(body).toContain('"type":"answer_delta"');
    expect(invocations).toEqual([
      expect.objectContaining({ pageContext: null }),
    ]);
    expect(streamingProvider.reply).not.toHaveBeenCalled();
  });

  it("does not start provider work when the request aborts during page loading", async () => {
    const deps = dependencies();
    const streamingProvider = {
      reply: vi.fn(async () => providerSuccess),
      streamReply: vi.fn(async function* () {
        yield { type: "answer_delta" as const, content: "不应调用" };
      }),
    };
    deps.resolveProvider.mockResolvedValue({
      provider: streamingProvider,
      mode: "agentos",
    });
    const abortController = new AbortController();
    deps.pageResolver.load.mockImplementation(async () => {
      abortController.abort();
      throw abortController.signal.reason;
    });
    const input = request(
      JSON.stringify({ message: "问题", context: { pathname: "/" } }),
    );
    Object.defineProperty(input, "signal", { value: abortController.signal });

    const response = await createAssistantChatHandler(deps)(input);

    expect(response.status).toBe(503);
    expect(deps.resolveProvider).not.toHaveBeenCalled();
    expect(streamingProvider.streamReply).not.toHaveBeenCalled();
  });

  it("skips page loading and reading activity for an explicit null page", async () => {
    const deps = dependencies();
    const streamingProvider = {
      reply: vi.fn(async () => providerSuccess),
      async *streamReply() {
        yield { type: "answer_delta" as const, content: "回答" };
      },
    };
    deps.resolveProvider.mockResolvedValue({
      provider: streamingProvider,
      mode: "agentos",
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          version: "2",
          message: "问题",
          history: [],
          page: null,
        }),
      ),
    );
    const body = await response.text();

    expect(deps.pageResolver.load).not.toHaveBeenCalled();
    expect(body).not.toContain('"type":"activity"');
    expect(body).toContain('"type":"answer_delta"');
  });

  it("streams trusted reading activity before answer when page loading succeeds", async () => {
    const deps = dependencies();
    const streamingProvider = {
      reply: vi.fn(async () => providerSuccess),
      async *streamReply() {
        yield { type: "answer_delta" as const, content: "回答" };
      },
    };
    deps.resolveProvider.mockResolvedValue({
      provider: streamingProvider,
      mode: "agentos",
    });

    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ message: "问题", context: { pathname: "/" } })),
    );
    const body = await response.text();

    expect(body.indexOf('"type":"activity"')).toBeLessThan(
      body.indexOf('"type":"answer_delta"'),
    );
  });

  it("counts Unicode code points and accepts exactly 500 characters", async () => {
    const deps = dependencies();
    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          message: "😀".repeat(500),
          context: { pathname: "/help" },
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(deps.provider.reply).toHaveBeenCalledOnce();
  });

  it("accepts a declared JSON body containing 500 escaped emoji", async () => {
    const deps = dependencies();
    const body = escapedEmojiBody(500);

    const response = await createAssistantChatHandler(deps)(
      declaredRequest(body),
    );

    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(4096);
    expect(response.status).toBe(200);
    expect(deps.provider.reply).toHaveBeenCalledExactlyOnceWith({
      request: {
        version: "2",
        message: "😀".repeat(500),
        history: [],
        page: { pathname: "/help", search: "" },
      },
      pageContext: deps.pageContext,
      signal: expect.any(AbortSignal),
    });
  });

  it("accepts a chunked JSON body containing 500 escaped emoji", async () => {
    const deps = dependencies();
    const body = escapedEmojiBody(500);
    const midpoint = Math.floor(body.length / 2);

    const response = await createAssistantChatHandler(deps)(
      streamingRequest([body.slice(0, midpoint), body.slice(midpoint)]),
    );

    expect(response.status).toBe(200);
    expect(deps.provider.reply).toHaveBeenCalledExactlyOnceWith({
      request: {
        version: "2",
        message: "😀".repeat(500),
        history: [],
        page: { pathname: "/help", search: "" },
      },
      pageContext: deps.pageContext,
      signal: expect.any(AbortSignal),
    });
  });

  it("contract-rejects 501 escaped emoji after reading the bounded body", async () => {
    const deps = dependencies();
    const body = escapedEmojiBody(501);

    const response = await createAssistantChatHandler(deps)(
      declaredRequest(body),
    );

    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(16 * 1024);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      createAssistantErrorResponse("generated-request-id", "validation_error"),
    );
    expect(deps.provider.reply).not.toHaveBeenCalled();
    expect(deps.resolveActor).not.toHaveBeenCalled();
  });

  it.each([
    ["blank message", { message: "   ", context: { pathname: "/help" } }],
    ["missing message", { context: { pathname: "/help" } }],
    ["non-string message", { message: 42, context: { pathname: "/help" } }],
    [
      "501 Unicode characters",
      { message: "😀".repeat(501), context: { pathname: "/help" } },
    ],
    ["missing context", { message: "问题" }],
    ["non-object context", { message: "问题", context: "wrong" }],
    ["missing pathname", { message: "问题", context: {} }],
    ["non-string pathname", { message: "问题", context: { pathname: 42 } }],
    [
      "pathname without leading slash",
      { message: "问题", context: { pathname: "help" } },
    ],
    [
      "pathname containing query",
      { message: "问题", context: { pathname: "/help?q=1" } },
    ],
    [
      "pathname containing hash",
      { message: "问题", context: { pathname: "/help#start" } },
    ],
    [
      "pathname over 256 Unicode characters",
      { message: "问题", context: { pathname: `/${"😀".repeat(256)}` } },
    ],
    [
      "protocol-relative pathname",
      { message: "问题", context: { pathname: "//evil.example/path" } },
    ],
    [
      "pathname containing a backslash",
      { message: "问题", context: { pathname: "/safe\\evil" } },
    ],
    [
      "pathname containing an ASCII control",
      { message: "问题", context: { pathname: "/safe\u0001evil" } },
    ],
    [
      "pathname containing a dot segment",
      { message: "问题", context: { pathname: "/safe/../admin" } },
    ],
  ])("returns the exact stable 400 response for %s", async (_name, body) => {
    const secret = "private-message-never-log";
    const deps = dependencies({ times: [20, 10] });
    const response = await createAssistantChatHandler(deps)(
      request(JSON.stringify({ ...body, ignored: secret })),
    );

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody).toEqual(
      createAssistantErrorResponse("generated-request-id", "validation_error"),
    );
    expect(responseBody).toEqual({
      version: "1",
      requestId: "generated-request-id",
      error: {
        code: "validation_error",
        message: "请输入 1 至 500 个字符的问题。",
        retryable: false,
      },
    });
    expect(JSON.stringify(responseBody)).not.toContain(secret);
    expect(deps.provider.reply).not.toHaveBeenCalled();
    expect(deps.records).toEqual([
      {
        requestId: "generated-request-id",
        statusCode: 400,
        durationMs: 0,
      },
    ]);
  });

  it("returns the exact stable 400 response for malformed JSON", async () => {
    const deps = dependencies();
    const response = await createAssistantChatHandler(deps)(request("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      createAssistantErrorResponse("generated-request-id", "validation_error"),
    );
    expect(deps.provider.reply).not.toHaveBeenCalled();
    expect(deps.records).toEqual([
      { requestId: "generated-request-id", statusCode: 400, durationMs: 7 },
    ]);
  });

  it.each([
    ["an empty value", ""],
    ["body text containing PII", "user@example.com private body"],
    ["whitespace", "request id with spaces"],
    ["control characters", "request-id\tprivate"],
    ["more than 64 characters", "a".repeat(65)],
  ])("replaces an unsafe x-request-id containing %s", async (_name, header) => {
    const deps = dependencies();
    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          message: "private body",
          context: { pathname: "/private-path" },
        }),
        header,
      ),
    );

    expect(response.status).toBe(200);
    expect(deps.records).toEqual([
      { requestId: "generated-request-id", statusCode: 200, durationMs: 7 },
    ]);
    expect(JSON.stringify(deps.records)).not.toMatch(
      /user@example\.com|private body|private-path|request id with spaces/iu,
    );
  });

  it("keeps a strict bounded token x-request-id", async () => {
    const deps = dependencies();
    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({ message: "问题", context: { pathname: "/help" } }),
        "req_1234-AB.cd:ef",
      ),
    );

    expect(response.status).toBe(200);
    expect(deps.records[0]?.requestId).toBe("req_1234-AB.cd:ef");
  });

  it("returns a stable response and attempts logging once when the logger throws", async () => {
    const deps = dependencies();
    deps.logger.log = vi.fn(() => {
      throw new Error("logger unavailable");
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({ message: "问题", context: { pathname: "/help" } }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(success);
    expect(deps.logger.log).toHaveBeenCalledOnce();
  });

  it("removes unsafe provider actions before returning a successful response", async () => {
    const deps = dependencies({
      reply: async () => ({
        content: "入口",
        suggestedActions: [
          { label: "快速开始", href: "/docs#quick-start" },
          { label: "协议相对", href: "//evil.example" },
          { label: "查询跳转", href: "/contact?next=https://evil.example" },
        ],
      }),
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({ message: "入口", context: { pathname: "/help" } }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: "1",
      requestId: "generated-request-id",
      mode: "placeholder",
      message: {
        id: "generated-message-id",
        role: "assistant",
        content: "入口",
      },
      suggestedActions: [{ label: "快速开始", href: "/docs#quick-start" }],
    });
  });

  it.each([
    ["invalid shape", { content: 42 }],
    [
      "unserializable value",
      {
        content: "unsafe",
        suggestedActions: [],
        extra: 1n,
      },
    ],
  ])("returns stable 503 for a provider %s", async (_name, value) => {
    const deps = dependencies({
      reply: async () => value as unknown as AssistantProviderReply,
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({ message: "secret", context: { pathname: "/secret" } }),
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      createAssistantErrorResponse(
        "generated-request-id",
        "assistant_unavailable",
      ),
    );
    expect(deps.logger.log).toHaveBeenCalledOnce();
    expect(deps.records).toEqual([
      { requestId: "generated-request-id", statusCode: 503, durationMs: 7 },
    ]);
    expect(JSON.stringify(deps.records)).not.toMatch(/secret|unsafe/iu);
  });

  it.each([
    [
      "content",
      {
        content: `private-${"😀".repeat(ASSISTANT_CONTENT_MAX_CODE_POINTS + 1)}`,
        suggestedActions: [],
      },
    ],
    [
      "action count",
      {
        content: "private-content",
        suggestedActions: Array.from(
          { length: ASSISTANT_MAX_SUGGESTED_ACTIONS + 1 },
          () => ({ label: "private-label", href: "/private-href" }),
        ),
      },
    ],
    [
      "action label",
      {
        content: "private-content",
        suggestedActions: [
          {
            label: `private-${"😀".repeat(ASSISTANT_ACTION_LABEL_MAX_CODE_POINTS + 1)}`,
            href: "/private-href",
          },
        ],
      },
    ],
    [
      "action href",
      {
        content: "private-content",
        suggestedActions: [
          {
            label: "private-label",
            href: `/${"a".repeat(ASSISTANT_ACTION_HREF_MAX_CODE_POINTS)}private-href`,
          },
        ],
      },
    ],
  ])(
    "rejects overlong provider %s without leaking or partially rendering",
    async (_name, reply) => {
      const deps = dependencies({
        reply: async () => reply,
      });

      const response = await createAssistantChatHandler(deps)(
        request(
          JSON.stringify({ message: "问题", context: { pathname: "/help" } }),
        ),
      );
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toEqual(
        createAssistantErrorResponse(
          "generated-request-id",
          "assistant_unavailable",
        ),
      );
      expect(JSON.stringify(body)).not.toContain("private");
    },
  );

  it("rejects an overlong generated message id", async () => {
    const deps = dependencies();
    deps.messageIdFactory = () => "😀".repeat(129);

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({ message: "问题", context: { pathname: "/help" } }),
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      createAssistantErrorResponse(
        "generated-request-id",
        "assistant_unavailable",
      ),
    );
  });

  it("accepts an exact 64 KiB UTF-8 body and reaches dependencies", async () => {
    const deps = dependencies();
    const exact = declaredRequest(
      requestBodyAtBytes(ASSISTANT_CHAT_REQUEST_MAX_BYTES),
    );

    const response = await createAssistantChatHandler(deps)(exact);

    expect(response.status).toBe(200);
    expect(deps.resolveActor).toHaveBeenCalledOnce();
    expect(deps.provider.reply).toHaveBeenCalledOnce();
  });

  it("rejects a declared UTF-8 body one byte over 64 KiB before dependencies", async () => {
    const deps = dependencies();
    const oversized = declaredRequest(
      requestBodyAtBytes(ASSISTANT_CHAT_REQUEST_MAX_BYTES + 1),
    );

    const response = await createAssistantChatHandler(deps)(oversized);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      createAssistantErrorResponse("generated-request-id", "validation_error"),
    );
    expect(deps.resolveActor).not.toHaveBeenCalled();
    expect(deps.provider.reply).not.toHaveBeenCalled();
    expect(deps.logger.log).toHaveBeenCalledOnce();
  });

  it("returns and logs the exact 503 response when the provider fails", async () => {
    const secretMessage = "do-not-echo-this";
    const secretPath = "/private-path";
    const deps = dependencies({
      reply: async () => {
        throw new Error("provider failed");
      },
    });
    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          message: secretMessage,
          context: { pathname: secretPath },
        }),
      ),
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual(
      createAssistantErrorResponse(
        "generated-request-id",
        "assistant_unavailable",
      ),
    );
    expect(body).toEqual({
      version: "1",
      requestId: "generated-request-id",
      error: {
        code: "assistant_unavailable",
        message: "助手服务暂不可用，请使用帮助中心或商务咨询。",
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain(secretMessage);
    expect(deps.records).toEqual([
      { requestId: "generated-request-id", statusCode: 503, durationMs: 7 },
    ]);
    const serializedLog = JSON.stringify(deps.records);
    expect(serializedLog).not.toContain(secretMessage);
    expect(serializedLog).not.toContain(secretPath);
  });

  it("returns the exact versioned envelope without session credentials", async () => {
    const deps = dependencies();
    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({ message: "问题", context: { pathname: "/help" } }),
        "req-1",
      ),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      version: "1",
      requestId: "req-1",
      mode: "placeholder",
      message: {
        id: "generated-message-id",
        role: "assistant",
        content: "ok",
      },
      suggestedActions: [{ label: "帮助中心", href: "/help" }],
    });
    expect(JSON.stringify(body)).not.toMatch(
      /cookie|credential|token|secret/iu,
    );
    expect(JSON.stringify(body)).not.toMatch(
      /raw-cookie-value|internal-replayable-value/iu,
    );
  });

  it("logs exactly the three permitted fields exactly once", async () => {
    const deps = dependencies();
    await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({
          message: "sensitive body",
          context: { pathname: "/sensitive-path" },
        }),
      ),
    );

    expect(deps.logger.log).toHaveBeenCalledOnce();
    expect(Object.keys(deps.records[0] ?? {}).sort()).toEqual([
      "durationMs",
      "requestId",
      "statusCode",
    ]);
    expect(JSON.stringify(deps.records)).not.toMatch(
      /sensitive body|sensitive-path/iu,
    );
  });

  it("exports POST only", () => {
    expect(route.POST).toBeTypeOf("function");
    expect("GET" in route).toBe(false);
    expect(Object.keys(route)).toEqual(["POST"]);

    const source = readFileSync(
      "src/app/api/v1/assistant/chat/route.ts",
      "utf8",
    );
    expect(source).not.toMatch(/export\s+(?:const|function)\s+GET/u);
  });
});
