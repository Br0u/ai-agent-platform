import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DATABASE_READINESS_TIMEOUT_MS,
  getLiveness,
  getReadiness,
} from "./health";

const DATABASE_UNAVAILABLE = {
  status: "not_ready",
  database: "down",
  errorCode: "DATABASE_UNAVAILABLE",
} as const;

function deferredProbe() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("health behavior", () => {
  it("reports liveness without touching the database", () => {
    const probe = vi.fn();

    expect(getLiveness()).toEqual({ status: "ok" });
    expect(probe).not.toHaveBeenCalled();
  });

  it("reports readiness after a successful database probe", async () => {
    vi.useFakeTimers();
    const probe = vi.fn().mockResolvedValue(undefined);

    await expect(getReadiness(probe)).resolves.toEqual({
      status: "ready",
      database: "up",
    });
    expect(probe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns a stable unavailable result when the database probe fails", async () => {
    vi.useFakeTimers();
    const probe = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(getReadiness(probe)).resolves.toEqual(DATABASE_UNAVAILABLE);
    expect(probe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns unavailable at the fixed total database readiness deadline", async () => {
    expect(DATABASE_READINESS_TIMEOUT_MS).toBe(3_000);
    vi.useFakeTimers();
    const pendingProbe = deferredProbe();
    const probe = vi.fn(() => pendingProbe.promise);
    const readiness = getReadiness(probe);
    let result: Awaited<typeof readiness> | undefined;
    void readiness.then((value) => {
      result = value;
    });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(result).toBeUndefined();
    expect(probe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual(DATABASE_UNAVAILABLE);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["resolve", "reject"] as const)(
    "safely ignores a probe that %ss after the readiness deadline",
    async (lateSettlement) => {
      vi.useFakeTimers();
      const pendingProbe = deferredProbe();
      const probe = vi.fn(() => pendingProbe.promise);
      const readiness = getReadiness(probe);
      let result: Awaited<typeof readiness> | undefined;
      void readiness.then((value) => {
        result = value;
      });

      await vi.advanceTimersByTimeAsync(DATABASE_READINESS_TIMEOUT_MS);
      expect(result).toEqual(DATABASE_UNAVAILABLE);

      if (lateSettlement === "resolve") {
        pendingProbe.resolve();
      } else {
        pendingProbe.reject(new Error("password secret"));
      }
      await vi.advanceTimersByTimeAsync(0);

      await expect(readiness).resolves.toEqual(DATABASE_UNAVAILABLE);
      expect(probe).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
