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
  it("posts the exact multipart run contract without putting the session in URL or headers", async () => {
    const internalSessionId = "opaque/internal?session#id";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ content: "agent answer" }));
    const client = createAgentOSRunClient({ settings: settings(), fetcher });

    await expect(
      client.runAgent({
        message: "private prompt",
        sessionId: internalSessionId,
      }),
    ).resolves.toEqual({ content: "agent answer" });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`${INTERNAL_URL}/agents/maduoduo/runs`);
    expect(String(url)).not.toContain(internalSessionId);
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(init?.headers).toEqual({
      Accept: "application/json",
      Authorization: `Bearer ${SECURITY_KEY}`,
    });
    expect(JSON.stringify(init?.headers)).not.toContain(internalSessionId);
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect([...form.keys()].sort()).toEqual([
      "message",
      "session_id",
      "stream",
    ]);
    expect(form.get("message")).toBe("private prompt");
    expect(form.get("stream")).toBe("false");
    expect(form.get("session_id")).toBe(internalSessionId);
  });

  it("omits session_id when no internal session is supplied", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ content: "ok" }));
    const client = createAgentOSRunClient({ settings: settings(), fetcher });

    await client.runAgent({ message: "hello" });

    const form = fetcher.mock.calls[0]?.[1]?.body as FormData;
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

  it.each([401, 404, 429, 500, 503])(
    "rejects upstream HTTP %s",
    async (status) => {
      const client = createAgentOSRunClient({
        settings: settings(),
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse({ content: "secret" }, status)),
      });

      await expect(client.runAgent({ message: "hello" })).rejects.toMatchObject(
        { code: "unexpected_status" },
      );
    },
  );

  it("accepts exactly 262144 raw response bytes and rejects 262145", async () => {
    expect(AGENTOS_RUN_MAX_RESPONSE_BYTES).toBe(262_144);
    const payload = JSON.stringify({ content: "ok" });
    const exact = payload + " ".repeat(262_144 - payload.length);
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
    [401, "unexpected_status"],
    [500, "unexpected_status"],
    [503, "unexpected_status"],
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
