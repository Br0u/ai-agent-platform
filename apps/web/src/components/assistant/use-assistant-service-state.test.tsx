import { act, renderHook, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantStatusResponse } from "@/features/assistant/assistant-contract";
import { useAssistantServiceState } from "./use-assistant-service-state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const placeholderStatus: AssistantStatusResponse = {
  version: "1",
  requestId: "server-placeholder",
  live: true,
  ready: true,
  capability: "placeholder",
  message: "模型尚未配置，当前为安全占位模式。",
};

const availableStatus: AssistantStatusResponse = {
  version: "1",
  requestId: "client-available",
  live: true,
  ready: true,
  capability: "available",
  message: "AI 助理基础服务已就绪。",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAssistantServiceState", () => {
  it("still accepts a refresh result after the Strict Mode effect probe", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(availableStatus));
    let probeSetups = 0;

    function EffectProbe({ children }: { children: ReactNode }) {
      useEffect(() => {
        probeSetups += 1;
      }, []);
      return children;
    }

    const { result } = renderHook(() => useAssistantServiceState(), {
      reactStrictMode: true,
      wrapper: EffectProbe,
    });
    await waitFor(() => expect(probeSetups).toBe(2));

    await act(async () => result.current.refreshServiceState());

    expect(result.current.serviceState).toEqual(availableStatus);
    expect(result.current.hasResolvedServiceState).toBe(true);
    expect(result.current.refreshingServiceState).toBe(false);
  });

  it("starts with a safe unresolved degraded state and adopts a valid server state", () => {
    const { result } = renderHook(() => useAssistantServiceState());

    expect(result.current.serviceState.capability).toBe("degraded");
    expect(result.current.hasResolvedServiceState).toBe(false);
    act(() => result.current.adoptServiceState(placeholderStatus));
    expect(result.current.serviceState).toEqual(placeholderStatus);
    expect(result.current.hasResolvedServiceState).toBe(true);
  });

  it("reuses one in-flight promise for two refreshes in the same tick", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAssistantServiceState());
    let first!: Promise<void>;
    let second!: Promise<void>;

    act(() => {
      first = result.current.refreshServiceState();
      second = result.current.refreshServiceState();
    });

    expect(first).toBe(second);
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.refreshingServiceState).toBe(true);
    pending.resolve(Response.json(availableStatus));
    await act(async () => first);
    expect(result.current.refreshingServiceState).toBe(false);
  });

  it("times out a pending response body after five seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start() {
            // Keep the body pending until the controller deadline expires.
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { result } = renderHook(() => useAssistantServiceState());

    act(() => void result.current.refreshServiceState());
    await act(async () => vi.advanceTimersByTimeAsync(5_000));

    expect(result.current.serviceState.capability).toBe("degraded");
    expect(result.current.hasResolvedServiceState).toBe(true);
    expect(result.current.refreshingServiceState).toBe(false);
  });

  it("maps an invalid response to the sanitized degraded state", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        version: "1",
        requestId: "contradictory",
        live: false,
        ready: true,
        capability: "available",
        message: "raw private runtime detail",
      }),
    );
    const { result } = renderHook(() => useAssistantServiceState());

    await act(async () => result.current.refreshServiceState());

    expect(result.current.serviceState).toEqual(
      expect.objectContaining({
        capability: "degraded",
        message: "助手基础服务暂不可用。",
      }),
    );
    expect(result.current.serviceState.message).not.toContain("raw private");
    expect(result.current.hasResolvedServiceState).toBe(true);
  });

  it("aborts an in-flight request when unmounted", () => {
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_input, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    });
    const { result, unmount } = renderHook(() => useAssistantServiceState());

    act(() => void result.current.refreshServiceState());
    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("does not let a late timed-out response overwrite a newer refresh", async () => {
    vi.useFakeTimers();
    const stale = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(Response.json(availableStatus));
    const { result } = renderHook(() => useAssistantServiceState());

    act(() => void result.current.refreshServiceState());
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    await act(async () => result.current.refreshServiceState());
    expect(result.current.serviceState).toEqual(availableStatus);

    stale.resolve(Response.json(placeholderStatus));
    await act(async () => Promise.resolve());
    expect(result.current.serviceState).toEqual(availableStatus);
  });

  it("does not let server adoption override an active client refresh", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAssistantServiceState());

    act(() => void result.current.refreshServiceState());
    act(() => result.current.adoptServiceState(placeholderStatus));
    expect(result.current.hasResolvedServiceState).toBe(false);

    pending.resolve(Response.json(availableStatus));
    await waitFor(() =>
      expect(result.current.serviceState).toEqual(availableStatus),
    );
  });

  it("allows a newer server snapshot after a client refresh completes", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(availableStatus));
    const { result } = renderHook(() => useAssistantServiceState());

    await act(async () => result.current.refreshServiceState());
    act(() => result.current.adoptServiceState(placeholderStatus));

    expect(result.current.serviceState).toEqual(placeholderStatus);
  });
});
