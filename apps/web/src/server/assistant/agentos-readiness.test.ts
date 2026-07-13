import { describe, expect, it, vi } from "vitest";

import {
  createAgentOSReadinessCircuit,
  resolveAgentOSReadinessSettings,
  type AgentOSReadinessSnapshot,
} from "./agentos-readiness";

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
