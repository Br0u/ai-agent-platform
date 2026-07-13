import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  ASSISTANT_UNAVAILABLE_RESPONSE,
  INVALID_ASSISTANT_REQUEST_RESPONSE,
  type AssistantSuccessResponse,
} from "@/features/assistant/assistant-contract";
import type { AssistantProvider } from "@/server/assistant/assistant-provider";
import type {
  AssistantRequestLog,
  AssistantRequestLogger,
} from "@/server/assistant/assistant-request-log";
import { createAssistantChatHandler } from "./handler";
import * as route from "./route";

const success: AssistantSuccessResponse = {
  mode: "placeholder",
  message: "ok",
  suggestedActions: [{ label: "帮助中心", href: "/help" }],
};

function request(body: string, requestId?: string) {
  return new Request("http://localhost/api/v1/assistant/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(requestId !== undefined ? { "x-request-id": requestId } : {}),
    },
    body,
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

function dependencies(options?: {
  reply?: AssistantProvider["reply"];
  times?: number[];
}) {
  const provider: AssistantProvider = {
    reply: vi.fn(options?.reply ?? (async () => success)),
  };
  const records: AssistantRequestLog[] = [];
  const logger: AssistantRequestLogger = {
    log: vi.fn((record) => records.push(record)),
  };
  const times = options?.times ?? [100, 107];
  let timeIndex = 0;

  return {
    provider,
    logger,
    records,
    clock: () => times[timeIndex++] ?? times.at(-1) ?? 0,
    requestIdFactory: () => "generated-request-id",
  };
}

describe("POST /api/v1/assistant/chat", () => {
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
    await expect(response.json()).resolves.toEqual(success);
    expect(deps.provider.reply).toHaveBeenCalledExactlyOnceWith({
      message: "如何开始了解平台？",
      context: { pathname: "/pricing" },
    });
    expect(deps.records).toEqual([
      { requestId: "incoming-request-id", statusCode: 200, durationMs: 7 },
    ]);
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
    expect(responseBody).toEqual(INVALID_ASSISTANT_REQUEST_RESPONSE);
    expect(responseBody).toEqual({
      mode: "placeholder",
      error: {
        code: "invalid_message",
        message: "请输入 1 至 500 个字符的问题。",
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
      INVALID_ASSISTANT_REQUEST_RESPONSE,
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
        mode: "placeholder",
        message: "入口",
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
      mode: "placeholder",
      message: "入口",
      suggestedActions: [{ label: "快速开始", href: "/docs#quick-start" }],
    });
  });

  it.each([
    ["invalid shape", { mode: "placeholder", message: 42 }],
    [
      "unserializable value",
      {
        mode: "placeholder",
        message: "unsafe",
        suggestedActions: [],
        extra: 1n,
      },
    ],
  ])("returns stable 503 for a provider %s", async (_name, value) => {
    const deps = dependencies({
      reply: async () => value as unknown as AssistantSuccessResponse,
    });

    const response = await createAssistantChatHandler(deps)(
      request(
        JSON.stringify({ message: "secret", context: { pathname: "/secret" } }),
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      ASSISTANT_UNAVAILABLE_RESPONSE,
    );
    expect(deps.logger.log).toHaveBeenCalledOnce();
    expect(deps.records).toEqual([
      { requestId: "generated-request-id", statusCode: 503, durationMs: 7 },
    ]);
    expect(JSON.stringify(deps.records)).not.toMatch(/secret|unsafe/iu);
  });

  it("rejects an oversized declared body before parsing", async () => {
    const deps = dependencies();
    const oversized = request(
      JSON.stringify({ message: "问题", context: { pathname: "/help" } }),
    );
    oversized.headers.set("content-length", "4097");

    const response = await createAssistantChatHandler(deps)(oversized);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      INVALID_ASSISTANT_REQUEST_RESPONSE,
    );
    expect(deps.provider.reply).not.toHaveBeenCalled();
    expect(deps.logger.log).toHaveBeenCalledOnce();
  });

  it("rejects an oversized chunked body while streaming", async () => {
    const deps = dependencies();
    const oversized = JSON.stringify({
      message: "问题",
      context: { pathname: "/help" },
      ignored: "x".repeat(4097),
    });
    const midpoint = Math.floor(oversized.length / 2);

    const response = await createAssistantChatHandler(deps)(
      streamingRequest([
        oversized.slice(0, midpoint),
        oversized.slice(midpoint),
      ]),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      INVALID_ASSISTANT_REQUEST_RESPONSE,
    );
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
    expect(body).toEqual(ASSISTANT_UNAVAILABLE_RESPONSE);
    expect(body).toEqual({
      mode: "placeholder",
      error: {
        code: "assistant_unavailable",
        message: "助手服务暂不可用，请使用帮助中心或商务咨询。",
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
