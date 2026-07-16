import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MobiusStripVisual, ROTATION_DURATION_MS } from "./mobius-strip-visual";

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

let resizeCallback: ResizeCallback | undefined;
let resizeObserverInstance: {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};
let motionListener: (() => void) | undefined;
let motionQuery: MediaQueryList & { setMatches: (value: boolean) => void };

function createContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    ellipse: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  const context = createContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context,
  );

  resizeCallback = undefined;
  resizeObserverInstance = {
    observe: vi.fn(),
    disconnect: vi.fn(),
  };

  class MockResizeObserver {
    constructor(callback: ResizeCallback) {
      resizeCallback = callback;
    }

    observe = resizeObserverInstance.observe;
    disconnect = resizeObserverInstance.disconnect;
  }

  vi.stubGlobal("ResizeObserver", MockResizeObserver);

  motionListener = undefined;
  let matches = false;
  motionQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      motionListener = listener;
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    setMatches(value: boolean) {
      matches = value;
    },
  } as unknown as MediaQueryList & { setMatches: (value: boolean) => void };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => motionQuery),
  });

  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 42),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: globalThis.requestAnimationFrame,
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: globalThis.cancelAnimationFrame,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MobiusStripVisual", () => {
  it("keeps the canvas and its description available during SSR", () => {
    const markup = renderToString(<MobiusStripVisual />);

    expect(markup).toContain("带有一次 180° 半扭转的莫比乌斯带");
    expect(markup).toContain("正在缓慢旋转的三维莫比乌斯带");
  });

  it("schedules a slow animation loop and cleans it up on unmount", () => {
    const requestAnimationFrame = vi.mocked(globalThis.requestAnimationFrame);
    const cancelAnimationFrame = vi.mocked(globalThis.cancelAnimationFrame);
    const view = render(<MobiusStripVisual />);

    expect(
      screen.getByRole("img", { name: "带有一次 180° 半扭转的莫比乌斯带" }),
    ).toBeInTheDocument();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(resizeObserverInstance.observe).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img")).toHaveAttribute(
      "data-rotation-duration",
      `${ROTATION_DURATION_MS}`,
    );

    view.unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(resizeObserverInstance.disconnect).toHaveBeenCalledTimes(1);
    expect(motionQuery.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it("renders one frame without a loop when reduced motion is enabled", () => {
    motionQuery.setMatches(true);

    render(<MobiusStripVisual />);

    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
    expect(resizeObserverInstance.observe).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the mesh when the observed width crosses the mobile breakpoint", () => {
    render(<MobiusStripVisual />);
    const canvas = screen.getByRole("img", {
      name: "带有一次 180° 半扭转的莫比乌斯带",
    });

    expect(canvas).toHaveAttribute("data-mesh-resolution", "64x12");

    act(() => {
      resizeCallback?.([
        {
          contentRect: { width: 720, height: 420 },
        } as ResizeObserverEntry,
      ]);
    });

    expect(canvas).toHaveAttribute("data-mesh-resolution", "96x16");
  });

  it("restarts the animation when reduced-motion preference changes", () => {
    motionQuery.setMatches(true);
    render(<MobiusStripVisual />);

    expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();

    motionQuery.setMatches(false);
    act(() => motionListener?.());

    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
});
