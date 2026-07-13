import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentOSClientError,
  createAgentOSClient,
  resolveAgentOSClientSettings,
} from "./agentos-client";

const INTERNAL_URL = "http://agent:7777";
const SECURITY_KEY = "agentos-internal-security-key-32-bytes";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function within<T>(promise: Promise<T>, timeoutMs = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<"test-deadline">((resolve) => {
        timer = setTimeout(() => resolve("test-deadline"), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

afterEach(() => vi.restoreAllMocks());

describe("AgentOS client settings", () => {
  it.each([
    "http://user:pass@agent:7777",
    "http://agent:7777/path",
    "http://agent:7777?secret=value",
    "http://agent:7777#fragment",
    "ftp://agent:7777",
    "http://agent:7777/",
  ])("rejects a non-origin internal URL: %s", (url) => {
    expect(() =>
      resolveAgentOSClientSettings({
        AGENTOS_INTERNAL_URL: url,
        OS_SECURITY_KEY: SECURITY_KEY,
      }),
    ).toThrow("AGENTOS_INTERNAL_URL must be an exact HTTP(S) origin");
  });

  it("requires an independent security key of at least 32 UTF-8 bytes", () => {
    expect(() =>
      resolveAgentOSClientSettings({
        AGENTOS_INTERNAL_URL: INTERNAL_URL,
        OS_SECURITY_KEY: "short",
      }),
    ).toThrow("OS_SECURITY_KEY must contain at least 32 bytes");
  });
});

describe("AgentOS protected transport", () => {
  it("fetches and validates live, ready, and capability independently", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          live: true,
          ready: false,
          capability: "placeholder",
          message: "service is live",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ready: true, capability: "placeholder" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ready: true, capability: "placeholder" }),
      );
    const client = createAgentOSClient({
      settings: resolveAgentOSClientSettings({
        AGENTOS_INTERNAL_URL: INTERNAL_URL,
        OS_SECURITY_KEY: SECURITY_KEY,
      }),
      fetcher,
      timeoutMs: 250,
    });

    await expect(client.live()).resolves.toEqual({
      live: true,
      ready: false,
      capability: "placeholder",
      message: "service is live",
    });
    await expect(client.ready()).resolves.toEqual({
      ready: true,
      capability: "placeholder",
    });
    await expect(client.capability()).resolves.toBe("placeholder");

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `${INTERNAL_URL}/internal/health/live`,
      `${INTERNAL_URL}/internal/health/ready`,
      `${INTERNAL_URL}/internal/health/ready`,
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ method: "GET", redirect: "manual" });
      expect(init?.headers).toEqual({
        Accept: "application/json",
        Authorization: `Bearer ${SECURITY_KEY}`,
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("accepts the exact safe 503 readiness body", async () => {
    const client = createAgentOSClient({
      settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse({ ready: false, capability: "placeholder" }, 503),
        ),
    });

    await expect(client.ready()).resolves.toEqual({
      ready: false,
      capability: "placeholder",
    });
  });

  it.each([
    [200, { ready: false, capability: "placeholder" }],
    [503, { ready: true, capability: "placeholder" }],
  ])(
    "rejects a readiness body that contradicts HTTP %s",
    async (status, body) => {
      const client = createAgentOSClient({
        settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(jsonResponse(body, status)),
      });

      await expect(client.ready()).rejects.toMatchObject({
        code: "invalid_response",
      });
    },
  );

  it.each([
    new Response("", {
      status: 302,
      headers: { location: "https://evil.test" },
    }),
    new Response("not-json", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }),
    jsonResponse({ ready: true, capability: "placeholder", extra: "unsafe" }),
    jsonResponse({ ready: true, capability: "future" }),
    new Response("x".repeat(20_000), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ])(
    "rejects redirects, unsafe types, schemas, and oversized bodies",
    async (response) => {
      const client = createAgentOSClient({
        settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(response),
      });

      await expect(client.ready()).rejects.toBeInstanceOf(AgentOSClientError);
    },
  );

  it("aborts a timed-out request", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
      throw new Error("unreachable");
    });
    const client = createAgentOSClient({
      settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
      fetcher,
      timeoutMs: 1,
    });

    await expect(client.live()).rejects.toMatchObject({ code: "timeout" });
  });

  it("times out and cancels a 200 response whose JSON body never closes", async () => {
    let cancelled = false;
    const stalled = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(stalled)
      .mockResolvedValueOnce(
        jsonResponse({
          live: true,
          ready: false,
          capability: "placeholder",
          message: "service is live",
        }),
      );
    const client = createAgentOSClient({
      settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
      fetcher,
      timeoutMs: 5,
    });

    const first = await within(client.live().catch((error: unknown) => error));
    expect(first).toMatchObject({ code: "timeout" });
    expect(JSON.stringify(first)).not.toMatch(
      /agent:7777|agentos-internal-security|raw-response/u,
    );
    await vi.waitFor(() => expect(cancelled).toBe(true));

    await expect(client.live()).resolves.toMatchObject({
      live: true,
      capability: "placeholder",
    });
  });

  it("honors the deadline even when an abnormal reader ignores abort and cancel", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stuckResponse = {
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        locked: true,
        getReader: () => ({
          read: () => new Promise(() => undefined),
          cancel,
          releaseLock: vi.fn(),
        }),
      },
    } as unknown as Response;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(stuckResponse)
      .mockResolvedValueOnce(
        jsonResponse({
          live: true,
          ready: false,
          capability: "placeholder",
          message: "service is live",
        }),
      );
    const client = createAgentOSClient({
      settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
      fetcher,
      timeoutMs: 5,
    });

    await expect(within(client.live())).rejects.toMatchObject({
      code: "timeout",
    });
    expect(cancel).toHaveBeenCalledOnce();
    await expect(client.live()).resolves.toMatchObject({ live: true });
  });

  it("returns only typed sanitized errors and never logs sensitive inputs", async () => {
    const consoleSpies = [
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "log").mockImplementation(() => undefined),
    ];
    const secretBody = "raw-response-secret";
    const client = createAgentOSClient({
      settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(secretBody, {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    });

    const error = await client.live().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(AgentOSClientError);
    const serialized = JSON.stringify(error);
    for (const sensitive of [INTERNAL_URL, SECURITY_KEY, secretBody]) {
      expect(serialized).not.toContain(sensitive);
    }
    expect(consoleSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });
});
