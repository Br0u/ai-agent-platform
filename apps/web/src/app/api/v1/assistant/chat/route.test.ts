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
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
    body,
  });
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
