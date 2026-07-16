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
