import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGENTOS_RUN_MAX_RESPONSE_BYTES,
  AGENTOS_SESSION_DELETE_TIMEOUT_MS,
  AgentOSRunClientError,
  createAgentOSRunClient,
  resolveAgentOSRunSettings,
} from "./agentos-run-client";

const INTERNAL_URL = "http://agent:7777";
const SECURITY_KEY = "agentos-internal-security-key-32-bytes";

function settings(timeout: string | undefined = undefined) {
  return resolveAgentOSRunSettings({
    AGENTOS_INTERNAL_URL: INTERNAL_URL,
    OS_SECURITY_KEY: SECURITY_KEY,
    ASSISTANT_AGENTOS_RUN_TIMEOUT_MS: timeout,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function abortAwareFetcher(): typeof fetch {
  return vi.fn<typeof fetch>(async (_url, init) => {
    await new Promise<void>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });
    throw new Error("unreachable");
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AgentOS run settings", () => {
  it("defaults the run deadline to 55000 ms", () => {
    expect(settings()).toEqual({
      baseUrl: INTERNAL_URL,
      securityKey: SECURITY_KEY,
      runTimeoutMs: 55_000,
    });
  });

  it.each([
    ["50999", false],
    ["51000", true],
    ["55000", true],
    ["55001", false],
  ])("accepts only the supported run deadline boundary %s", (raw, accepted) => {
    if (accepted) {
      expect(settings(raw).runTimeoutMs).toBe(Number(raw));
    } else {
      expect(() => settings(raw)).toThrow("ASSISTANT_AGENTOS_RUN_TIMEOUT_MS");
    }
  });

  it.each([
    "",
    "051000",
    "51000.0",
    "+51000",
    " 51000",
    "51000 ",
    "not-a-number",
  ])("rejects malformed run deadline %j", (raw) => {
    expect(() => settings(raw)).toThrow("ASSISTANT_AGENTOS_RUN_TIMEOUT_MS");
  });
});

describe("AgentOS run client", () => {
  it("exposes only trusted activity, answer, and owned navigation markers", async () => {
    const rawStream =
      'event: RunStarted\ndata: {"event":"RunStarted","run_id":"private"}\n\n' +
      'event: ReasoningStep\ndata: {"event":"ReasoningStep","reasoning_content":"private chain"}\n\n' +
      'event: ToolCallStarted\ndata: {"event":"ToolCallStarted","tool":{"tool_name":"suggest_navigation","tool_args":{"pathname":"/help"}}}\n\n' +
      'event: ToolCallCompleted\ndata: {"event":"ToolCallCompleted","tool":{"tool_name":"suggest_navigation","tool_args":{"pathname":"/help"},"result":"aap.navigate.v1:%2Fhelp"}}\n\n' +
      'event: RunContent\ndata: {"event":"RunContent","content":"公开回答","reasoning_content":"private"}\n\n' +
      'event: Unknown\ndata: {"event":"Unknown","content":"private"}\n\n' +
      'event: RunCompleted\ndata: {"event":"RunCompleted","content":"must not duplicate"}\n\n';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(rawStream, {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const client = createAgentOSRunClient({ settings: settings(), fetcher });

    const events = [];
    for await (const event of client.runAgentStream({ message: "private" })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "activity", phase: "analyzing" },
      { type: "activity", phase: "tool", toolName: "suggest_navigation" },
      { type: "navigation_candidate", pathname: "/help" },
      { type: "answer_delta", content: "公开回答" },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/private|chain|run_id/iu);
    expect(
      (fetcher.mock.calls[0]?.[1]?.body as FormData).get("stream_events"),
    ).toBe("true");
  });

  it("rejects spoofed navigation completion shapes without leaking payloads", async () => {
    const rawStream =
      'event: RunStarted\ndata: {"event":"RunStarted"}\n\n' +
      'event: ToolCallCompleted\ndata: {"event":"ToolCallCompleted","result":"aap.navigate.v1:%2Fevil"}\n\n' +
      'event: ToolCallCompleted\ndata: {"event":"ToolCallCompleted","tool":{"tool_name":"suggest_navigation","tool_args":{"pathname":"/help"},"result":"aap.navigate.v1:%2Fproduct"}}\n\n' +
      'event: ToolCallCompleted\ndata: {"event":"ToolCallCompleted","tool":{"tool_name":"suggest_navigation","tool_args":{"pathname":"/help","extra":true},"result":"aap.navigate.v1:%2Fhelp"}}\n\n' +
      'event: ToolCallCompleted\ndata: {"event":"ToolCallCompleted","tool":{"tool_name":"suggest_navigation","tool_args":{"pathname":"/help"},"result":"aap.navigate.v1:%2Fhelp%"}}\n\n' +
      'event: ToolCallCompleted\ndata: {"event":"ToolCallCompleted","tool":{"tool_name":"suggest_navigation","tool_args":{"pathname":"/help"},"result":"aap.navigate.v1:%252Fhelp"}}\n\n' +
      'event: ToolCallCompleted\ndata: {"event":"ToolCallCompleted","tool":{"tool_name":"suggest_navigation","tool_args":{"pathname":"/help"},"result":"aap.navigate.v1:%2Fhelpaap.navigate.v1:%2Fhelp"}}\n\n' +
      'event: ToolCallCompleted\ndata: {"event":"ToolCallCompleted","tool":{"tool_name":"suggest_navigation","tool_args":{"pathname":"/help"},"result":"aap.navigate.v1:%2Fhelp trailing"}}\n\n' +
      'event: RunContent\ndata: {"event":"RunContent","content":"安全回答"}\n\n' +
      'event: RunCompleted\ndata: {"event":"RunCompleted"}\n\n';
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(rawStream, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    });

    const events = [];
    for await (const event of client.runAgentStream({ message: "private" })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "activity", phase: "analyzing" },
      { type: "answer_delta", content: "安全回答" },
    ]);
  });

  it("requests Agno's event stream and accepts clean EOF after text", async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(streamController) {
            controller = streamController;
          },
        }),
        { headers: { "content-type": "text/event-stream; charset=utf-8" } },
      ),
    );
    const client = createAgentOSRunClient({ settings: settings(), fetcher });
    const stream = client.runAgentStream({
      message: "private prompt",
    });
    const iterator = stream[Symbol.asyncIterator]();

    controller.enqueue(
      encoder.encode(
        'event: RunStarted\ndata: {"event":"RunStarted"}\n\n' +
          'event: RunContent\ndata: {"event":"RunContent","reasoning_content":"内部思考片段"}\n\n' +
          'event: RunContent\ndata: {"event":"RunContent","content":"第一段"}\n\n',
      ),
    );
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "activity", phase: "analyzing" },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "answer_delta", content: "第一段" },
    });

    const form = fetcher.mock.calls[0]?.[1]?.body as FormData;
    expect(form.get("stream")).toBe("true");
    expect(form.get("stream_events")).toBe("true");
    expect(form.has("session_id")).toBe(false);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      Accept: "text/event-stream",
      Authorization: `Bearer ${SECURITY_KEY}`,
    });

    controller.enqueue(
      encoder.encode(
        'event: RunContent\ndata: {"event":"RunContent","content":"第二段"}\n\n',
      ),
    );
    controller.close();
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: "answer_delta", content: "第二段" },
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it("ignores non-text RunContent events while preserving later text", async () => {
    const rawStream =
      'event: RunStarted\ndata: {"event":"RunStarted"}\n\n' +
      'event: RunContent\ndata: {"event":"RunContent","content":null,"content_type":"str"}\n\n' +
      'event: RunContent\ndata: {"event":"RunContent","content":"NPU 正文"}\n\n' +
      'event: RunCompleted\ndata: {"event":"RunCompleted"}\n\n';
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(rawStream, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    });

    const chunks = [];
    for await (const chunk of client.runAgentStream({
      message: "private prompt",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: "activity", phase: "analyzing" },
      { type: "answer_delta", content: "NPU 正文" },
    ]);
  });

  it("keeps large Skill tool events off the public run stream", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      const rawStream =
        'event: RunStarted\ndata: {"event":"RunStarted"}\n\n' +
        'event: ToolCallCompleted\ndata: {"event":"ToolCallCompleted","tool":{"tool_name":"private_skill","result":"' +
        "x".repeat(256 * 1_024) +
        '"}}\n\n' +
        'event: RunContent\ndata: {"event":"RunContent","content":"NPU 正文"}\n\n' +
        'event: RunCompleted\ndata: {"event":"RunCompleted"}\n\n';
      return new Response(rawStream, {
        headers: { "content-type": "text/event-stream" },
      });
    });
    const client = createAgentOSRunClient({ settings: settings(), fetcher });

    const chunks = [];
    for await (const chunk of client.runAgentStream({
      message: "使用大 Skill",
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: "activity", phase: "analyzing" },
      { type: "answer_delta", content: "NPU 正文" },
    ]);
    expect(
      (fetcher.mock.calls[0]?.[1]?.body as FormData).get("stream_events"),
    ).toBe("true");
  });

  it.each([
    [
      "an upstream error event",
      'event: RunError\ndata: {"event":"RunError","content":"private upstream detail"}\n\n',
    ],
    [
      "a cancelled stream followed by Agno's completion event",
      'event: RunContent\ndata: {"event":"RunContent","content":"partial private answer"}\n\n' +
        'event: RunCancelled\ndata: {"event":"RunCancelled","reason":"private cancellation reason"}\n\n' +
        'event: RunCompleted\ndata: {"event":"RunCompleted"}\n\n',
    ],
    [
      "a completed stream without text",
      'event: RunContent\ndata: {"event":"RunContent","content":null}\n\n' +
        'event: RunCompleted\ndata: {"event":"RunCompleted"}\n\n',
    ],
    [
      "malformed SSE JSON",
      'event: RunContent\ndata: {"event":"RunContent","content":}\n\n',
    ],
  ])("sanitizes %s", async (_name, rawStream) => {
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(rawStream, {
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    });
    const consume = async () => {
      for await (const chunk of client.runAgentStream({
        message: "private prompt",
      })) {
        void chunk;
        // Consume the complete stream so terminal validation runs.
      }
    };

    const error = await consume().catch((value: unknown) => value);

    expect(error).toBeInstanceOf(AgentOSRunClientError);
    expect(error).toMatchObject({ code: "invalid_response" });
    expect(JSON.stringify(error)).not.toMatch(
      /private|upstream|detail|answer|prompt|session/iu,
    );
  });

  it("matches Agno 2.7 content-only streams that end without RunCompleted", async () => {
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            'event: RunContent\ndata: {"event":"RunContent","content":"partial private answer"}\n\n',
            { headers: { "content-type": "text/event-stream" } },
          ),
        ),
    });
    const consume = async () => {
      for await (const chunk of client.runAgentStream({ message: "private" })) {
        void chunk;
      }
    };

    await expect(consume()).resolves.toBeUndefined();
  });

  it("enforces the run deadline while waiting for the first stream event", async () => {
    vi.useFakeTimers();
    const client = createAgentOSRunClient({
      settings: settings("51000"),
      fetcher: abortAwareFetcher(),
    });
    const consume = async () => {
      for await (const chunk of client.runAgentStream({ message: "hello" })) {
        void chunk;
        // The fixture never produces a chunk.
      }
    };
    const assertion = expect(consume()).rejects.toMatchObject({
      code: "timeout",
    });

    await vi.advanceTimersByTimeAsync(51_000);

    await assertion;
  });

  it("cancels an active stream when the public request aborts", async () => {
    const external = new AbortController();
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: abortAwareFetcher(),
    });
    const consume = async () => {
      for await (const chunk of client.runAgentStream({
        message: "private prompt",
        signal: external.signal,
      })) {
        void chunk;
        // The fixture never produces a chunk.
      }
    };
    const running = consume();

    external.abort("private abort reason");

    const error = await running.catch((value: unknown) => value);
    expect(error).toBeInstanceOf(AgentOSRunClientError);
    expect(error).toMatchObject({ code: "external_abort" });
    expect(JSON.stringify(error)).not.toContain("private abort reason");
  });

  it("posts the exact sessionless multipart run contract", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ content: "agent answer" }));
    const client = createAgentOSRunClient({ settings: settings(), fetcher });

    await expect(
      client.runAgent({ message: "private prompt" }),
    ).resolves.toEqual({ content: "agent answer" });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`${INTERNAL_URL}/agents/maduoduo/runs`);
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: `Bearer ${SECURITY_KEY}`,
    });
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect([...form.keys()].sort()).toEqual(["message", "stream"]);
    expect(form.get("message")).toBe("private prompt");
    expect(form.get("stream")).toBe("true");
    expect(form.has("session_id")).toBe(false);
  });

  it.each([
    [
      "redirect",
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.test" },
      }),
      "redirect_rejected",
    ],
    [
      "HTML",
      new Response("<html>upstream error</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      "invalid_content_type",
    ],
    [
      "invalid UTF-8",
      new Response(new Uint8Array([0xc3, 0x28]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      "invalid_response",
    ],
    [
      "invalid JSON",
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      "invalid_response",
    ],
    ["blank content", jsonResponse({ content: "   " }), "invalid_response"],
    ["non-string content", jsonResponse({ content: 7 }), "invalid_response"],
  ])("rejects %s with a sanitized code", async (_name, response, code) => {
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response as Response),
    });

    await expect(client.runAgent({ message: "hello" })).rejects.toMatchObject({
      code,
    });
  });

  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [404, "not_found"],
    [429, "rate_limited"],
    [400, "other_client_error"],
    [422, "other_client_error"],
    [500, "server_error"],
    [503, "server_error"],
  ] as const)(
    "maps upstream HTTP %s to sanitized run code %s",
    async (status, code) => {
      const client = createAgentOSRunClient({
        settings: settings(),
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse({ content: "secret" }, status)),
      });

      const error = await client
        .runAgent({ message: "private prompt" })
        .catch((value: unknown) => value);

      expect(error).toBeInstanceOf(AgentOSRunClientError);
      if (!(error instanceof AgentOSRunClientError)) {
        throw new TypeError("Expected AgentOSRunClientError");
      }
      expect(error).toMatchObject({ code });
      expect(`${error.name}:${error.message}`).toBe(
        "AgentOSRunClientError:AgentOS run request failed",
      );
      expect(JSON.stringify(error)).toBe(`{"code":"${code}"}`);
      expect(JSON.stringify(error)).not.toMatch(
        /agent:7777|security|secret|private|prompt|session/iu,
      );
    },
  );

  it("accepts exactly the raw response budget and rejects one byte more", async () => {
    expect(AGENTOS_RUN_MAX_RESPONSE_BYTES).toBe(4_194_304);
    const payload = JSON.stringify({ content: "ok" });
    const exact =
      payload + " ".repeat(AGENTOS_RUN_MAX_RESPONSE_BYTES - payload.length);
    const oversized = exact + " ";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(exact, {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(oversized, {
          headers: { "content-type": "application/json" },
        }),
      );
    const client = createAgentOSRunClient({ settings: settings(), fetcher });

    await expect(client.runAgent({ message: "first" })).resolves.toEqual({
      content: "ok",
    });
    await expect(client.runAgent({ message: "second" })).rejects.toMatchObject({
      code: "response_too_large",
    });
  });

  it("accepts a maximum-length answer split across one-character SSE events", async () => {
    const fragments = Array.from(
      { length: 32_768 },
      () => 'event: RunContent\ndata: {"event":"RunContent","content":"x"}\n\n',
    ).join("");
    expect(new TextEncoder().encode(fragments).byteLength).toBeGreaterThan(
      256 * 1_024,
    );
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            `${fragments}event: RunCompleted\ndata: {"event":"RunCompleted"}\n\n`,
            { headers: { "content-type": "text/event-stream" } },
          ),
        ),
    });

    let content = "";
    for await (const event of client.runAgentStream({
      message: "fragmented",
    })) {
      if (event.type === "answer_delta") content += event.content;
    }

    expect(content).toBe("x".repeat(32_768));
  });

  it("bounds final content by Unicode code points rather than UTF-16 length or bytes", async () => {
    const exact = "😀".repeat(32_768);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ content: exact }))
      .mockResolvedValueOnce(jsonResponse({ content: `${exact}😀` }));
    const client = createAgentOSRunClient({ settings: settings(), fetcher });

    await expect(client.runAgent({ message: "first" })).resolves.toEqual({
      content: exact,
    });
    await expect(client.runAgent({ message: "second" })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("enforces the configured internal run deadline", async () => {
    vi.useFakeTimers();
    const client = createAgentOSRunClient({
      settings: settings("51000"),
      fetcher: abortAwareFetcher(),
    });
    const assertion = expect(
      client.runAgent({ message: "hello" }),
    ).rejects.toMatchObject({ code: "timeout" });

    await vi.advanceTimersByTimeAsync(51_000);

    await assertion;
  });

  it("rejects and cancels a stalled wrong media type before its deadline", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const stalledHtml = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("private raw answer"));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(stalledHtml);
    const client = createAgentOSRunClient({
      settings: settings("51000"),
      fetcher,
    });
    const message = "private prompt";
    const result = client
      .runAgent({ message })
      .catch((value: unknown) => value);
    let settled = false;
    void result.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    const settledBeforeDeadline = settled;
    if (!settled) await vi.advanceTimersByTimeAsync(51_000);
    const error = await result;

    expect(settledBeforeDeadline).toBe(true);
    expect(error).toBeInstanceOf(AgentOSRunClientError);
    expect(error).toMatchObject({ code: "invalid_content_type" });
    expect(cancelled).toBe(true);
    const serialized = JSON.stringify(error);
    for (const sensitive of [
      INTERNAL_URL,
      SECURITY_KEY,
      "text/html",
      "private raw answer",
      message,
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it("honors and sanitizes an external abort", async () => {
    const external = new AbortController();
    let reasonWasRead = false;
    Object.defineProperty(external.signal, "reason", {
      configurable: true,
      get() {
        reasonWasRead = true;
        return "private-run-abort-reason";
      },
    });
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: abortAwareFetcher(),
    });
    const running = client.runAgent({
      message: "private prompt",
      signal: external.signal,
    });

    external.abort();

    const error = await running.catch((value: unknown) => value);
    expect(error).toBeInstanceOf(AgentOSRunClientError);
    expect(error).toMatchObject({ code: "external_abort" });
    expect(reasonWasRead).toBe(false);
    expect(JSON.stringify(error)).not.toContain("private-run-abort-reason");
  });
});

describe("AgentOS session deletion", () => {
  it.each(["", ".", ".."])(
    "rejects unsafe session path segment %j before fetch",
    async (sessionId) => {
      const fetcher = vi.fn<typeof fetch>();
      const client = createAgentOSRunClient({ settings: settings(), fetcher });

      const error = await client
        .deleteSession(sessionId)
        .catch((value: unknown) => value);

      expect(error).toBeInstanceOf(AgentOSRunClientError);
      expect(error).toMatchObject({ code: "invalid_response" });
      expect(fetcher).not.toHaveBeenCalled();
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(INTERNAL_URL);
      if (sessionId.length > 0) expect(serialized).not.toContain(sessionId);
    },
  );

  it.each([200, 204, 404])("treats HTTP %s as success", async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status }));
    const client = createAgentOSRunClient({ settings: settings(), fetcher });

    await expect(
      client.deleteSession("opaque-session"),
    ).resolves.toBeUndefined();
  });

  it("encodes an opaque session ID as exactly one path segment", async () => {
    const sessionId = "opaque/session?secret# value";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = createAgentOSRunClient({ settings: settings(), fetcher });

    await client.deleteSession(sessionId);

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `${INTERNAL_URL}/sessions/opaque%2Fsession%3Fsecret%23%20value`,
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "DELETE",
      body: undefined,
    });
  });

  it.each([
    [302, "redirect_rejected"],
    [401, "authentication"],
    [429, "rate_limited"],
    [500, "server_error"],
    [503, "server_error"],
  ])("rejects HTTP %s deletion", async (status, code) => {
    const response =
      status === 302
        ? new Response(null, {
            status,
            headers: { location: "https://evil.test" },
          })
        : new Response(null, { status });
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    await expect(
      client.deleteSession("private-session-id"),
    ).rejects.toMatchObject({ code });
  });

  it("uses the fixed 3000 ms cleanup deadline", async () => {
    expect(AGENTOS_SESSION_DELETE_TIMEOUT_MS).toBe(3_000);
    vi.useFakeTimers();
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: abortAwareFetcher(),
    });
    const assertion = expect(
      client.deleteSession("private-session-id"),
    ).rejects.toMatchObject({ code: "timeout" });

    await vi.advanceTimersByTimeAsync(2_999);
    await vi.advanceTimersByTimeAsync(1);

    await assertion;
  });

  it("does not log or serialize the session ID on deletion failure", async () => {
    const consoleSpies = [
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "log").mockImplementation(() => undefined),
    ];
    const sessionId = "private-session-id";
    const client = createAgentOSRunClient({
      settings: settings(),
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("private raw response", { status: 500 }),
        ),
    });

    const error = await client.deleteSession(sessionId).catch((value) => value);

    expect(error).toBeInstanceOf(AgentOSRunClientError);
    expect(JSON.stringify(error)).not.toContain(sessionId);
    expect(JSON.stringify(error)).not.toContain("private raw response");
    expect(consoleSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });
});
