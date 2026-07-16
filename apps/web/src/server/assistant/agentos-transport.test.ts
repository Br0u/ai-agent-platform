import { describe, expect, it, vi } from "vitest";

import {
  AgentOSTransportError,
  createAgentOSTransport,
} from "./agentos-transport";

const INTERNAL_URL = "http://agent:7777";
const SECURITY_KEY = "agentos-internal-security-key-32-bytes";

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

describe("AgentOS transport cancellation", () => {
  it("sanitizes an external abort without reading its reason and distinguishes it from timeout", async () => {
    const external = new AbortController();
    let reasonWasRead = false;
    Object.defineProperty(external.signal, "reason", {
      configurable: true,
      get() {
        reasonWasRead = true;
        return "private-abort-reason";
      },
    });
    const externalTransport = createAgentOSTransport({
      settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
      fetcher: abortAwareFetcher(),
    });

    const externallyAborted = externalTransport.request({
      method: "GET",
      path: "/external-abort",
      acceptedStatuses: [200],
      timeoutMs: 250,
      maxResponseBytes: 1_024,
      signal: external.signal,
    });
    external.abort();

    const externalError = await externallyAborted.catch(
      (error: unknown) => error,
    );
    expect(externalError).toBeInstanceOf(AgentOSTransportError);
    expect(externalError).toMatchObject({ code: "external_abort" });
    expect(reasonWasRead).toBe(false);
    expect(JSON.stringify(externalError)).not.toContain("private-abort-reason");

    const timeoutTransport = createAgentOSTransport({
      settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
      fetcher: abortAwareFetcher(),
    });
    await expect(
      timeoutTransport.request({
        method: "GET",
        path: "/internal-timeout",
        acceptedStatuses: [200],
        timeoutMs: 1,
        maxResponseBytes: 1_024,
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("AgentOS transport path boundary", () => {
  it.each([
    "agents/maduoduo/runs",
    "https://evil.test/private",
    "//evil.test/private",
    "//user:password@evil.test/private",
    "/sessions/../private",
    "/sessions/%2e%2e/private",
    "/private?secret=value",
    "/private#secret",
    "/\\evil.test/private",
  ])(
    "rejects a non-canonical or non-origin path before fetch: %s",
    async (path) => {
      const fetcher = vi.fn<typeof fetch>();
      const transport = createAgentOSTransport({
        settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
        fetcher,
      });

      const error = await transport
        .request({
          method: "GET",
          path,
          acceptedStatuses: [200],
          timeoutMs: 250,
          maxResponseBytes: 1_024,
        })
        .catch((value: unknown) => value);

      expect(error).toBeInstanceOf(AgentOSTransportError);
      expect(error).toMatchObject({ code: "invalid_request" });
      expect(fetcher).not.toHaveBeenCalled();
      const serialized = JSON.stringify(error);
      for (const sensitive of [INTERNAL_URL, SECURITY_KEY, path]) {
        expect(serialized).not.toContain(sensitive);
      }
    },
  );
});

describe("AgentOS transport status classification", () => {
  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "server_error"],
    [503, "server_error"],
    [400, "other_client_error"],
    [422, "other_client_error"],
  ] as const)(
    "keeps health-compatible unexpected_status while classifying HTTP %s as %s",
    async (status, statusCategory) => {
      const rawBody = "private response prompt session secret";
      const transport = createAgentOSTransport({
        settings: { baseUrl: INTERNAL_URL, securityKey: SECURITY_KEY },
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(rawBody, { status })),
      });

      const error = await transport
        .request({
          method: "POST",
          path: "/agents/maduoduo/runs",
          acceptedStatuses: [200],
          timeoutMs: 250,
          maxResponseBytes: 1_024,
        })
        .catch((value: unknown) => value);

      expect(error).toBeInstanceOf(AgentOSTransportError);
      if (!(error instanceof AgentOSTransportError)) {
        throw new TypeError("Expected AgentOSTransportError");
      }
      expect(error).toMatchObject({
        code: "unexpected_status",
        statusCategory,
      });
      expect(`${error.name}:${error.message}`).toBe(
        "AgentOSTransportError:AgentOS request failed",
      );
      expect(JSON.stringify(error)).toBe('{"code":"unexpected_status"}');
      expect(JSON.stringify(error)).not.toMatch(
        /private|response|prompt|session|secret|401|403|404|429|500|503/iu,
      );
    },
  );
});
