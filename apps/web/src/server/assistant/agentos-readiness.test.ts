import { describe, expect, it, vi } from "vitest";

import {
  createAgentOSProbe,
  createAgentOSReadinessCircuit,
  resolveAgentOSReadinessSettings,
  type AgentOSReadinessSnapshot,
} from "./agentos-readiness";
import { createAgentOSClient } from "./agentos-client";

const READY_PLACEHOLDER: AgentOSReadinessSnapshot = {
  live: true,
  ready: true,
  capability: "placeholder",
};
const DEGRADED: AgentOSReadinessSnapshot = {
  live: false,
  ready: false,
  capability: "degraded",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

describe("AgentOS readiness cache and circuit", () => {
  it("strictly parses bounded readiness settings only when the factory is used", () => {
    expect(
      resolveAgentOSReadinessSettings({
        ASSISTANT_AGENTOS_READINESS_TTL_MS: "5000",
        ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS: "1500",
        ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD: "3",
        ASSISTANT_AGENTOS_CIRCUIT_RESET_MS: "30000",
      }),
    ).toEqual({
      cacheTtlMs: 5_000,
      probeTimeoutMs: 1_500,
      failureThreshold: 3,
      resetAfterMs: 30_000,
    });
    expect(() =>
      resolveAgentOSReadinessSettings({
        ASSISTANT_AGENTOS_READINESS_TTL_MS: "0",
        ASSISTANT_AGENTOS_PROBE_TIMEOUT_MS: "1500",
        ASSISTANT_AGENTOS_CIRCUIT_FAILURE_THRESHOLD: "3",
        ASSISTANT_AGENTOS_CIRCUIT_RESET_MS: "30000",
      }),
    ).toThrow("ASSISTANT_AGENTOS_READINESS_TTL_MS");
  });

  it("caches one successful probe for the configured TTL", async () => {
    let now = 1_000;
    const probe = vi.fn(async () => READY_PLACEHOLDER);
    const circuit = createAgentOSReadinessCircuit({
      probe,
      now: () => now,
      cacheTtlMs: 100,
      failureThreshold: 3,
      resetAfterMs: 30_000,
    });

    await expect(circuit.status()).resolves.toEqual(READY_PLACEHOLDER);
    now = 1_099;
    await expect(circuit.status()).resolves.toEqual(READY_PLACEHOLDER);
    expect(probe).toHaveBeenCalledOnce();
    now = 1_100;
    await circuit.status();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight probe among concurrent callers at TTL expiry", async () => {
    let now = 0;
    const second = deferred<AgentOSReadinessSnapshot>();
    const probe = vi
      .fn<() => Promise<AgentOSReadinessSnapshot>>()
      .mockResolvedValueOnce(READY_PLACEHOLDER)
      .mockReturnValueOnce(second.promise);
    const circuit = createAgentOSReadinessCircuit({
      probe,
      now: () => now,
      cacheTtlMs: 10,
      failureThreshold: 3,
      resetAfterMs: 30_000,
    });
    await circuit.status();
    now = 10;

    const first = circuit.status();
    const concurrent = circuit.status();
    expect(probe).toHaveBeenCalledTimes(2);
    second.resolve(READY_PLACEHOLDER);
    await expect(Promise.all([first, concurrent])).resolves.toEqual([
      READY_PLACEHOLDER,
      READY_PLACEHOLDER,
    ]);
  });

  it("opens after three failures and does not probe during reset delay", async () => {
    let now = 0;
    const probe = vi.fn(async () => {
      throw new Error("database URL and key must remain private");
    });
    const circuit = createAgentOSReadinessCircuit({
      probe,
      now: () => now,
      cacheTtlMs: 10,
      failureThreshold: 3,
      resetAfterMs: 30_000,
    });

    for (const time of [0, 10, 20]) {
      now = time;
      await expect(circuit.status()).resolves.toEqual(DEGRADED);
    }
    expect(circuit.inspect()).toMatchObject({
      state: "open",
      consecutiveFailures: 3,
    });
    now = 29_999;
    await expect(circuit.status()).resolves.toEqual(DEGRADED);
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("counts one concurrent failed probe once", async () => {
    let now = 0;
    const failure = deferred<AgentOSReadinessSnapshot>();
    const probe = vi.fn(() => failure.promise);
    const circuit = createAgentOSReadinessCircuit({
      probe,
      now: () => now,
      cacheTtlMs: 10,
      failureThreshold: 3,
      resetAfterMs: 30_000,
    });

    const callers = [circuit.status(), circuit.status(), circuit.status()];
    now = 5;
    failure.reject(new Error("not ready"));
    await expect(Promise.all(callers)).resolves.toEqual([
      DEGRADED,
      DEGRADED,
      DEGRADED,
    ]);
    expect(probe).toHaveBeenCalledOnce();
    expect(circuit.inspect()).toMatchObject({
      state: "closed",
      consecutiveFailures: 1,
    });
  });

  it("turns stalled response bodies into one shared failure and opens normally", async () => {
    let now = 0;
    let cancelled = 0;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("/internal/health/ready")) {
        return new Response(
          JSON.stringify({ ready: true, capability: "placeholder" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled += 1;
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const client = createAgentOSClient({
      settings: {
        baseUrl: "http://agent:7777",
        securityKey: "agentos-internal-security-key-32-bytes",
      },
      fetcher,
      timeoutMs: 5,
    });
    const circuit = createAgentOSReadinessCircuit({
      probe: createAgentOSProbe(client),
      now: () => now,
      cacheTtlMs: 1,
      failureThreshold: 2,
      resetAfterMs: 30_000,
    });

    await expect(within(circuit.status())).resolves.toEqual(DEGRADED);
    expect(circuit.inspect()).toMatchObject({
      state: "closed",
      consecutiveFailures: 1,
    });
    now = 1;
    await expect(
      within(
        Promise.all([circuit.status(), circuit.status(), circuit.status()]),
      ),
    ).resolves.toEqual([DEGRADED, DEGRADED, DEGRADED]);
    expect(circuit.inspect()).toMatchObject({
      state: "open",
      consecutiveFailures: 2,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(cancelled).toBe(2);

    await expect(circuit.status()).resolves.toEqual(DEGRADED);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("permits one half-open probe and makes all concurrent callers await it", async () => {
    let now = 0;
    const halfOpen = deferred<AgentOSReadinessSnapshot>();
    const probe = vi
      .fn<() => Promise<AgentOSReadinessSnapshot>>()
      .mockRejectedValueOnce(new Error("one"))
      .mockRejectedValueOnce(new Error("two"))
      .mockRejectedValueOnce(new Error("three"))
      .mockReturnValueOnce(halfOpen.promise);
    const circuit = createAgentOSReadinessCircuit({
      probe,
      now: () => now,
      cacheTtlMs: 1,
      failureThreshold: 3,
      resetAfterMs: 30_000,
    });
    for (const time of [0, 1, 2]) {
      now = time;
      await circuit.status();
    }
    now = 30_002;

    const callers = [circuit.status(), circuit.status(), circuit.status()];
    expect(probe).toHaveBeenCalledTimes(4);
    expect(circuit.inspect().state).toBe("half-open");
    halfOpen.resolve(READY_PLACEHOLDER);
    await expect(Promise.all(callers)).resolves.toEqual([
      READY_PLACEHOLDER,
      READY_PLACEHOLDER,
      READY_PLACEHOLDER,
    ]);
    expect(circuit.inspect()).toMatchObject({
      state: "closed",
      consecutiveFailures: 0,
    });
  });

  it("reopens from half-open on failure using the completion clock", async () => {
    let now = 0;
    const halfOpen = deferred<AgentOSReadinessSnapshot>();
    const probe = vi
      .fn<() => Promise<AgentOSReadinessSnapshot>>()
      .mockRejectedValueOnce(new Error("one"))
      .mockRejectedValueOnce(new Error("two"))
      .mockRejectedValueOnce(new Error("three"))
      .mockReturnValueOnce(halfOpen.promise);
    const circuit = createAgentOSReadinessCircuit({
      probe,
      now: () => now,
      cacheTtlMs: 1,
      failureThreshold: 3,
      resetAfterMs: 30_000,
    });
    for (const time of [0, 1, 2]) {
      now = time;
      await circuit.status();
    }
    now = 30_002;
    const first = circuit.status();
    const second = circuit.status();
    now = 40_000;
    halfOpen.reject(new Error("still down"));
    await expect(Promise.all([first, second])).resolves.toEqual([
      DEGRADED,
      DEGRADED,
    ]);
    expect(circuit.inspect()).toMatchObject({
      state: "open",
      openedAt: 40_000,
    });
  });

  it("treats ready placeholder as success but ready false as a failure", async () => {
    let now = 0;
    const probe = vi
      .fn<() => Promise<AgentOSReadinessSnapshot>>()
      .mockResolvedValueOnce(READY_PLACEHOLDER)
      .mockResolvedValueOnce({
        live: true,
        ready: false,
        capability: "placeholder",
      });
    const circuit = createAgentOSReadinessCircuit({
      probe,
      now: () => now,
      cacheTtlMs: 1,
      failureThreshold: 3,
      resetAfterMs: 30_000,
    });
    await circuit.status();
    expect(circuit.inspect().consecutiveFailures).toBe(0);
    now = 1;
    await circuit.status();
    expect(circuit.inspect().consecutiveFailures).toBe(1);
  });
});
