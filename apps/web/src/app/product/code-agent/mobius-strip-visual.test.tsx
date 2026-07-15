import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./mobius-strip", async () => {
  const actual =
    await vi.importActual<typeof import("./mobius-strip")>("./mobius-strip");

  return {
    ...actual,
    createMobiusMesh: vi.fn(actual.createMobiusMesh),
  };
});

import { createMobiusMesh } from "./mobius-strip";
import { MobiusStripVisual, mobiusScaleForViewport } from "./mobius-strip-visual";

type FakeResizeObserver = {
  trigger: (width: number, height?: number) => void;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

type FakeMediaQuery = MediaQueryList & {
  trigger: (matches: boolean) => void;
  removeEventListener: ReturnType<typeof vi.fn>;
};

type ScheduledFrame = {
  id: number;
  callback: FrameRequestCallback;
};

const createCanvasContext = () => {
  const gradient = { addColorStop: vi.fn() };
  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
  };

  return context as unknown as CanvasRenderingContext2D;
};

let canvasContext: CanvasRenderingContext2D;
let getContext: ReturnType<typeof vi.spyOn> | undefined;
let resizeObservers: FakeResizeObserver[];
let mediaQuery: FakeMediaQuery;
let requestAnimationFrame: ReturnType<typeof vi.fn>;
let cancelAnimationFrame: ReturnType<typeof vi.fn>;
let scheduledFrames: ScheduledFrame[];
let flushAnimationFrames: (time: number) => void;

function installCanvasAndBrowserMocks({ reducedMotion = false } = {}) {
  canvasContext = createCanvasContext();
  getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => canvasContext);

  resizeObservers = [];
  class ResizeObserverMock {
    private readonly callback: ResizeObserverCallback;
    readonly observe = vi.fn();
    readonly disconnect = vi.fn();

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      resizeObservers.push(this as unknown as FakeResizeObserver);
    }

    trigger(width: number, height = 280) {
      this.callback(
        [
          {
            contentRect: { width, height },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);

  scheduledFrames = [];
  let nextFrameId = 1;
  requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrameId;
    nextFrameId += 1;
    scheduledFrames.push({ id, callback });
    return id;
  });
  cancelAnimationFrame = vi.fn((id: number) => {
    scheduledFrames = scheduledFrames.filter((frame) => frame.id !== id);
  });
  flushAnimationFrames = (time: number) => {
    const frames = scheduledFrames;
    scheduledFrames = [];
    for (const frame of frames) frame.callback(time);
  };
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

  let currentMatches = reducedMotion;
  const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
  mediaQuery = {
    get matches() {
      return currentMatches;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "change") {
        mediaListeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "change") {
        mediaListeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    trigger(matches: boolean) {
      currentMatches = matches;
      for (const listener of mediaListeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    },
  } as unknown as FakeMediaQuery;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQuery),
  );
}

const mockedCreateMobiusMesh = vi.mocked(createMobiusMesh);

beforeEach(() => {
  installCanvasAndBrowserMocks();
  mockedCreateMobiusMesh.mockClear();
});

afterEach(() => {
  cleanup();
  getContext?.mockRestore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MobiusStripVisual", () => {
  it.each([
    [320, 260],
    [520, 360],
  ])("fits safely in a %sx%s viewport", (width, height) => {
    const scale = mobiusScaleForViewport(width, height);

    expect(2 * 2.44 * scale).toBeLessThanOrEqual(
      Math.min(width, height) / 1.16,
    );
  });

  it("returns zero for invalid or non-positive viewport dimensions", () => {
    expect(mobiusScaleForViewport(0, 260)).toBe(0);
    expect(mobiusScaleForViewport(320, 0)).toBe(0);
    expect(mobiusScaleForViewport(-1, 260)).toBe(0);
    expect(mobiusScaleForViewport(320, -1)).toBe(0);
    expect(mobiusScaleForViewport(Number.NaN, 260)).toBe(0);
    expect(mobiusScaleForViewport(320, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("renders an SSR-safe canvas and an accessible hidden description", () => {
    const html = renderToString(<MobiusStripVisual />);

    expect(html).toContain('class="ca-mobius"');
    expect(html).toContain(
      'class="ca-mobius__canvas" aria-label="带有一次 180° 半扭转的莫比乌斯带"',
    );
    expect(html).toContain("ca-visually-hidden");
    expect(html).toContain("180° 半扭转的莫比乌斯带");
  });

  it("rebuilds the mesh only when the width resolution changes", () => {
    const { unmount } = render(<MobiusStripVisual />);
    const observer = resizeObservers[0];
    const initialCreateCount = mockedCreateMobiusMesh.mock.calls.length;

    expect(observer).toBeDefined();
    expect(observer.observe).toHaveBeenCalled();
    expect(mockedCreateMobiusMesh).toHaveBeenCalledWith({
      uSteps: 64,
      vSteps: 12,
    });

    act(() => observer.trigger(639, 260));
    act(() => observer.trigger(639, 280));
    expect(mockedCreateMobiusMesh).toHaveBeenCalledTimes(initialCreateCount);

    act(() => observer.trigger(640, 280));
    expect(mockedCreateMobiusMesh).toHaveBeenLastCalledWith({
      uSteps: 96,
      vSteps: 16,
    });
    expect(mockedCreateMobiusMesh).toHaveBeenCalledTimes(
      initialCreateCount + 1,
    );

    unmount();
  });

  it("draws one static frame without scheduling animation for reduced motion", () => {
    mediaQuery.trigger(true);

    render(<MobiusStripVisual />);

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(canvasContext.clearRect).toHaveBeenCalled();
  });

  it("caches highlight work, draws three guide lines, and ignores an old frame after cleanup", () => {
    const { unmount } = render(<MobiusStripVisual />);
    const observer = resizeObservers[0];
    const oldFrame = scheduledFrames[0]?.callback;

    expect(oldFrame).toBeDefined();

    act(() => {
      observer.trigger(640, 280);
      flushAnimationFrames(7000);
    });

    expect(canvasContext.fill).toHaveBeenCalled();
    expect(canvasContext.stroke).toHaveBeenCalledTimes(3);
    expect(canvasContext.createLinearGradient).toHaveBeenCalledTimes(1);

    act(() => flushAnimationFrames(8000));
    expect(canvasContext.createLinearGradient).toHaveBeenCalledTimes(1);

    const clearRectMock = canvasContext.clearRect as unknown as ReturnType<
      typeof vi.fn
    >;
    const drawCallsBeforeUnmount = clearRectMock.mock.calls.length;
    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );

    act(() => oldFrame?.(9000));
    expect(canvasContext.clearRect).toHaveBeenCalledTimes(
      drawCallsBeforeUnmount,
    );
  });
});
