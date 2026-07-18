import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminModelProvider } from "@/features/assistant/admin-model-config-contract";
import { useModelKeyReveal } from "./use-model-key-reveal";

const FIRST_KEY = "SECRET-FIRST-KEY";
const SECOND_KEY = "SECRET-SECOND-KEY";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function revealResponse(key: string) {
  return Response.json({
    version: "1",
    requestId: "11111111-1111-4111-8111-111111111111",
    key,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-18T00:00:00.000Z"));
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useModelKeyReveal", () => {
  it("keeps plaintext only for 30 seconds, replaces its deadline and supports manual hide", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(revealResponse(FIRST_KEY))
      .mockResolvedValueOnce(revealResponse(SECOND_KEY))
      .mockResolvedValueOnce(revealResponse(FIRST_KEY));
    const { result } = renderHook(() => useModelKeyReveal("openai"));

    expect(Object.keys(result.current)).toEqual([
      "reveal",
      "hide",
      "plaintext",
      "secondsRemaining",
      "status",
      "error",
    ]);

    await act(async () => result.current.reveal("openai", 4));
    expect(result.current.plaintext).toBe(FIRST_KEY);
    expect(result.current.secondsRemaining).toBe(30);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/admin/assistant/model-configs/openai/reveal-key",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: 4 }),
        signal: expect.any(AbortSignal),
      }),
    );

    await act(async () => vi.advanceTimersByTimeAsync(29_000));
    expect(result.current.plaintext).toBe(FIRST_KEY);
    expect(result.current.secondsRemaining).toBe(1);

    await act(async () => result.current.reveal("openai", 4));
    expect(result.current.plaintext).toBe(SECOND_KEY);
    expect(result.current.secondsRemaining).toBe(30);

    await act(async () => vi.advanceTimersByTimeAsync(29_999));
    expect(result.current.plaintext).toBe(SECOND_KEY);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(result.current.plaintext).toBeNull();
    expect(result.current.secondsRemaining).toBe(0);

    await act(async () => result.current.reveal("openai", 4));
    expect(result.current.plaintext).toBe(FIRST_KEY);
    act(() => result.current.hide());
    expect(result.current.plaintext).toBeNull();
    expect(result.current.secondsRemaining).toBe(0);
  });

  it.each([
    ["forward", new Date("2036-07-18T00:00:00.000Z")],
    ["backward", new Date("2016-07-18T00:00:00.000Z")],
  ] as const)(
    "uses a hard 30-second timeout when Date.now jumps %s",
    async (_direction, changedSystemTime) => {
      vi.mocked(fetch).mockResolvedValue(revealResponse(FIRST_KEY));
      const { result } = renderHook(() => useModelKeyReveal("openai"));

      await act(async () => result.current.reveal("openai", 4));
      vi.setSystemTime(changedSystemTime);
      await act(async () => vi.advanceTimersByTimeAsync(29_999));
      expect(result.current.plaintext).toBe(FIRST_KEY);

      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(result.current.plaintext).toBeNull();
      expect(result.current.secondsRemaining).toBe(0);
    },
  );

  it("clears and aborts on Provider change and discards a late response", async () => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_input, init) => {
      signal = init?.signal as AbortSignal;
      return pending.promise;
    });
    const { result, rerender } = renderHook(
      ({ provider }) => useModelKeyReveal(provider),
      { initialProps: { provider: "openai" as AdminModelProvider } },
    );

    act(() => void result.current.reveal("openai", 7));
    expect(result.current.status).toBe("loading");
    rerender({ provider: "anthropic" });

    expect(signal?.aborted).toBe(true);
    expect(result.current.plaintext).toBeNull();
    pending.resolve(revealResponse(FIRST_KEY));
    await act(async () => Promise.resolve());
    expect(result.current.plaintext).toBeNull();
    expect(result.current.status).toBe("idle");
  });

  it.each([
    [
      "pagehide",
      () => {
        window.dispatchEvent(new PageTransitionEvent("pagehide"));
      },
    ],
    [
      "hidden",
      () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      },
    ],
  ] as const)(
    "clears and aborts an in-flight request when the page becomes %s",
    async (_label, trigger) => {
      const pending = deferred<Response>();
      let signal: AbortSignal | undefined;
      vi.mocked(fetch).mockImplementation((_input, init) => {
        signal = init?.signal as AbortSignal;
        return pending.promise;
      });
      const { result } = renderHook(() => useModelKeyReveal("openai"));

      act(() => void result.current.reveal("openai", 3));
      act(trigger);

      expect(signal?.aborted).toBe(true);
      pending.resolve(revealResponse(FIRST_KEY));
      await act(async () => Promise.resolve());
      expect(result.current.plaintext).toBeNull();
      expect(result.current.status).toBe("idle");
    },
  );

  it.each([
    [
      "pagehide",
      () => {
        window.dispatchEvent(new PageTransitionEvent("pagehide"));
      },
    ],
    [
      "visibilitychange",
      () => {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        document.dispatchEvent(new Event("visibilitychange"));
      },
    ],
  ] as const)("removes displayed plaintext on %s", async (_label, trigger) => {
    vi.mocked(fetch).mockResolvedValue(revealResponse(FIRST_KEY));
    const { result } = renderHook(() => useModelKeyReveal("openai"));

    await act(async () => result.current.reveal("openai", 5));
    expect(result.current.plaintext).toBe(FIRST_KEY);
    act(trigger);

    expect(result.current.plaintext).toBeNull();
    expect(result.current.secondsRemaining).toBe(0);
  });

  it("aborts on unmount and never writes the Key to browser storage or caches", async () => {
    const storageGet = vi.spyOn(Storage.prototype, "getItem");
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const storageRemove = vi.spyOn(Storage.prototype, "removeItem");
    const storageClear = vi.spyOn(Storage.prototype, "clear");
    const indexedDbOpen = vi.fn();
    const cacheOpen = vi.fn();
    const cacheMatch = vi.fn();
    vi.stubGlobal("indexedDB", { open: indexedDbOpen });
    vi.stubGlobal("caches", { open: cacheOpen, match: cacheMatch });
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_input, init) => {
      signal = init?.signal as AbortSignal;
      return pending.promise;
    });
    const { result, unmount } = renderHook(() => useModelKeyReveal("openai"));

    act(() => void result.current.reveal("openai", 9));
    unmount();
    expect(signal?.aborted).toBe(true);
    pending.resolve(revealResponse(FIRST_KEY));
    await act(async () => Promise.resolve());

    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
    expect(storageClear).not.toHaveBeenCalled();
    expect(indexedDbOpen).not.toHaveBeenCalled();
    expect(cacheOpen).not.toHaveBeenCalled();
    expect(cacheMatch).not.toHaveBeenCalled();
  });
});
