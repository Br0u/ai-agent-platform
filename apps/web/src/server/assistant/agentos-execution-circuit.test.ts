import { describe, expect, it, vi } from "vitest";

import { AgentOSRunClientError } from "./agentos-run-client";
import {
  AgentOSExecutionUnavailableError,
  createAgentOSExecutionCircuit,
} from "./agentos-execution-circuit";

function failure(code: ConstructorParameters<typeof AgentOSRunClientError>[0]) {
  return new AgentOSRunClientError(code);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function circuitFixture(
  options: {
    failureThreshold?: number;
    resetAfterMs?: number;
    start?: number;
  } = {},
) {
  let now = options.start ?? 0;
  const circuit = createAgentOSExecutionCircuit({
    failureThreshold: options.failureThreshold ?? 3,
    resetAfterMs: options.resetAfterMs ?? 100,
    now: () => now,
  });
  return {
    circuit,
    setNow(value: number) {
      now = value;
    },
  };
}

describe("AgentOS execution circuit", () => {
  it("opens on exactly three consecutive counted run-client failures", async () => {
    const { circuit } = circuitFixture();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(
        circuit.execute(async () => {
          throw failure("transport_error");
        }),
      ).rejects.toEqual(new AgentOSExecutionUnavailableError());
      expect(circuit.inspect()).toEqual({
        state: attempt === 3 ? "open" : "closed",
        consecutiveFailures: attempt,
      });
    }
  });

  it.each([
    "timeout",
    "transport_error",
    "redirect_rejected",
    "authentication",
    "not_found",
    "server_error",
    "unexpected_status",
    "invalid_content_type",
    "invalid_response",
  ] as const)(
    "counts the sanitized AgentOS run/client error %s",
    async (code) => {
      const { circuit } = circuitFixture({ failureThreshold: 1 });

      await expect(
        circuit.execute(async () => {
          throw failure(code);
        }),
      ).rejects.toMatchObject({ code: "ASSISTANT_EXECUTION_UNAVAILABLE" });
      expect(circuit.inspect()).toEqual({
        state: "open",
        consecutiveFailures: 1,
      });
    },
  );

  it("does not open the global circuit for one request's bounded response failure", async () => {
    const { circuit } = circuitFixture({ failureThreshold: 1 });
    const failures = [
      failure("response_too_large"),
      new AgentOSRunClientError("invalid_response", "stream_content_too_large"),
      new AgentOSRunClientError("invalid_response", "run_cancelled_event"),
      new AgentOSRunClientError("invalid_response", "run_error_event"),
      new AgentOSRunClientError("invalid_response", "stream_empty_content"),
    ];

    for (const error of failures) {
      await expect(
        circuit.execute(async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(circuit.inspect()).toEqual({
        state: "closed",
        consecutiveFailures: 0,
      });
    }
  });

  it("does not count invalid requests, upstream rate limits, other 4xx, user Abort, or external abort", async () => {
    const { circuit } = circuitFixture();
    const validation = new TypeError("public validation error");
    const rateLimit = Object.assign(new Error("public rate limit"), {
      code: "RATE_LIMITED",
    });
    const userAbort = new DOMException("user aborted", "AbortError");
    const runClientErrors = [
      failure("invalid_request"),
      failure("rate_limited"),
      failure("other_client_error"),
      failure("external_abort"),
    ];

    for (const error of [
      validation,
      rateLimit,
      userAbort,
      ...runClientErrors,
    ]) {
      await expect(
        circuit.execute(async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(circuit.inspect()).toEqual({
        state: "closed",
        consecutiveFailures: 0,
      });
    }
  });

  it("resets consecutive failures after a successful operation", async () => {
    const { circuit } = circuitFixture();
    await circuit
      .execute(async () => {
        throw failure("timeout");
      })
      .catch(() => undefined);
    await circuit
      .execute(async () => {
        throw failure("timeout");
      })
      .catch(() => undefined);

    await expect(circuit.execute(async () => "ok")).resolves.toBe("ok");
    expect(circuit.inspect()).toEqual({
      state: "closed",
      consecutiveFailures: 0,
    });
  });

  it("rejects open callers without invoking the operation and exposes one stable sanitized error", async () => {
    const { circuit } = circuitFixture({ failureThreshold: 1 });
    await circuit
      .execute(async () => {
        const error = failure("transport_error") as AgentOSRunClientError & {
          cause?: unknown;
        };
        error.cause = new Error("raw URL key prompt and answer");
        throw error;
      })
      .catch(() => undefined);
    const operation = vi.fn(async () => "must-not-run");

    const error = await circuit.execute(operation).catch((value) => value);

    expect(operation).not.toHaveBeenCalled();
    expect(error).toEqual(new AgentOSExecutionUnavailableError());
    expect(JSON.stringify(error)).toBe(
      '{"code":"ASSISTANT_EXECUTION_UNAVAILABLE"}',
    );
    expect(`${error.name}:${error.message}`).toBe(
      "AgentOSExecutionUnavailableError:Assistant execution unavailable",
    );
    expect(JSON.stringify(error)).not.toMatch(/raw|url|key|prompt|answer/iu);
  });

  it("allows exactly one half-open probe and rejects concurrent callers immediately", async () => {
    const { circuit, setNow } = circuitFixture({
      failureThreshold: 1,
      resetAfterMs: 10,
    });
    await circuit
      .execute(async () => {
        throw failure("timeout");
      })
      .catch(() => undefined);
    setNow(10);
    let resolveProbe: ((value: string) => void) | undefined;
    const probeOperation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveProbe = resolve;
        }),
    );
    const concurrentOperation = vi.fn(async () => "must-not-run");

    const probe = circuit.execute(probeOperation);
    expect(circuit.inspect()).toEqual({
      state: "half-open",
      consecutiveFailures: 1,
    });
    await expect(circuit.execute(concurrentOperation)).rejects.toEqual(
      new AgentOSExecutionUnavailableError(),
    );
    expect(concurrentOperation).not.toHaveBeenCalled();
    resolveProbe?.("probe-ok");
    await expect(probe).resolves.toBe("probe-ok");
    expect(circuit.inspect()).toEqual({
      state: "closed",
      consecutiveFailures: 0,
    });
  });

  it("ignores a stale closed-generation success while the current half-open probe is pending", async () => {
    const { circuit, setNow } = circuitFixture({
      failureThreshold: 3,
      resetAfterMs: 10,
    });
    const stale = deferred<string>();
    const staleRun = circuit.execute(() => stale.promise);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await circuit
        .execute(async () => {
          throw failure("timeout");
        })
        .catch(() => undefined);
    }
    setNow(10);
    const probe = deferred<string>();
    const probeRun = circuit.execute(() => probe.promise);
    const blockedOperation = vi.fn(async () => "must-not-run");

    stale.resolve("stale-success");
    await expect(staleRun).resolves.toBe("stale-success");

    expect(circuit.inspect()).toEqual({
      state: "half-open",
      consecutiveFailures: 3,
    });
    await expect(circuit.execute(blockedOperation)).rejects.toEqual(
      new AgentOSExecutionUnavailableError(),
    );
    expect(blockedOperation).not.toHaveBeenCalled();

    probe.resolve("current-probe-success");
    await expect(probeRun).resolves.toBe("current-probe-success");
    expect(circuit.inspect()).toEqual({
      state: "closed",
      consecutiveFailures: 0,
    });
  });

  it("ignores a stale closed-generation failure without restarting the half-open cooldown", async () => {
    const { circuit, setNow } = circuitFixture({
      failureThreshold: 3,
      resetAfterMs: 10,
    });
    const stale = deferred<string>();
    const staleRun = circuit.execute(() => stale.promise);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await circuit
        .execute(async () => {
          throw failure("timeout");
        })
        .catch(() => undefined);
    }
    setNow(10);
    const probe = deferred<string>();
    const probeRun = circuit.execute(() => probe.promise);
    const staleFailure = failure("transport_error");

    stale.reject(staleFailure);
    await expect(staleRun).rejects.toEqual(
      new AgentOSExecutionUnavailableError(),
    );
    expect(circuit.inspect()).toEqual({
      state: "half-open",
      consecutiveFailures: 3,
    });
    const blockedOperation = vi.fn(async () => "must-not-run");
    await expect(circuit.execute(blockedOperation)).rejects.toEqual(
      new AgentOSExecutionUnavailableError(),
    );
    expect(blockedOperation).not.toHaveBeenCalled();

    const nonCountedProbeFailure = failure("external_abort");
    probe.reject(nonCountedProbeFailure);
    await expect(probeRun).rejects.toBe(nonCountedProbeFailure);
    await expect(circuit.execute(async () => "recovered")).resolves.toBe(
      "recovered",
    );
    expect(circuit.inspect()).toEqual({
      state: "closed",
      consecutiveFailures: 0,
    });
  });

  it("reopens after a failed half-open probe and can close after the next reset", async () => {
    const { circuit, setNow } = circuitFixture({
      failureThreshold: 1,
      resetAfterMs: 10,
    });
    await circuit
      .execute(async () => {
        throw failure("timeout");
      })
      .catch(() => undefined);

    setNow(10);
    await expect(
      circuit.execute(async () => {
        throw failure("invalid_response");
      }),
    ).rejects.toEqual(new AgentOSExecutionUnavailableError());
    expect(circuit.inspect()).toEqual({
      state: "open",
      consecutiveFailures: 1,
    });

    setNow(20);
    await expect(circuit.execute(async () => "recovered")).resolves.toBe(
      "recovered",
    );
    expect(circuit.inspect()).toEqual({
      state: "closed",
      consecutiveFailures: 0,
    });
  });

  it.each([
    "external_abort",
    "rate_limited",
    "other_client_error",
    "invalid_request",
  ] as const)(
    "releases a half-open probe after non-counted %s without restarting cooldown",
    async (code) => {
      const { circuit, setNow } = circuitFixture({
        failureThreshold: 1,
        resetAfterMs: 10,
      });
      await circuit
        .execute(async () => {
          throw failure("timeout");
        })
        .catch(() => undefined);
      setNow(10);
      const nonCounted = failure(code);

      await expect(
        circuit.execute(async () => {
          throw nonCounted;
        }),
      ).rejects.toBe(nonCounted);
      expect(circuit.inspect()).toEqual({
        state: "open",
        consecutiveFailures: 1,
      });

      await expect(circuit.execute(async () => "recovered")).resolves.toBe(
        "recovered",
      );
      expect(circuit.inspect()).toEqual({
        state: "closed",
        consecutiveFailures: 0,
      });
    },
  );

  it("validates all options as positive safe integers", () => {
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        createAgentOSExecutionCircuit({
          failureThreshold: invalid,
          resetAfterMs: 10,
        }),
      ).toThrow("failureThreshold must be a positive integer");
      expect(() =>
        createAgentOSExecutionCircuit({
          failureThreshold: 3,
          resetAfterMs: invalid,
        }),
      ).toThrow("resetAfterMs must be a positive integer");
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid monotonic clock value %s",
    async (clockValue) => {
      const circuit = createAgentOSExecutionCircuit({
        failureThreshold: 3,
        resetAfterMs: 100,
        now: () => clockValue,
      });

      await expect(circuit.execute(async () => "unused")).rejects.toThrow(
        "finite monotonic milliseconds",
      );
    },
  );

  it("clamps a backwards monotonic clock and never reopens early", async () => {
    const { circuit, setNow } = circuitFixture({
      failureThreshold: 1,
      resetAfterMs: 10,
      start: 100,
    });
    await circuit
      .execute(async () => {
        throw failure("timeout");
      })
      .catch(() => undefined);
    const operation = vi.fn(async () => "probe");

    setNow(50);
    await expect(circuit.execute(operation)).rejects.toEqual(
      new AgentOSExecutionUnavailableError(),
    );
    setNow(109);
    await expect(circuit.execute(operation)).rejects.toEqual(
      new AgentOSExecutionUnavailableError(),
    );
    expect(operation).not.toHaveBeenCalled();
    setNow(110);
    await expect(circuit.execute(operation)).resolves.toBe("probe");
  });

  it("inspect exposes only state and consecutiveFailures without reading the clock", () => {
    const now = vi.fn(() => 0);
    const circuit = createAgentOSExecutionCircuit({
      failureThreshold: 3,
      resetAfterMs: 100,
      now,
    });

    expect(circuit.inspect()).toEqual({
      state: "closed",
      consecutiveFailures: 0,
    });
    expect(Object.keys(circuit.inspect()).sort()).toEqual([
      "consecutiveFailures",
      "state",
    ]);
    expect(now).not.toHaveBeenCalled();
  });
});
