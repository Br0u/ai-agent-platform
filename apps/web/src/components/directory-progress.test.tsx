import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  calculatePageProgress,
  DirectoryProgressRail,
  selectActiveAnchor,
  useDirectoryProgress,
} from "./directory-progress";

function setDocumentHeight(height: number) {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: height,
  });
}

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value,
  });
}

function appendAnchor(id: string, top: number) {
  const anchor = document.createElement("section");
  anchor.id = id;
  anchor.getBoundingClientRect = () =>
    ({
      bottom: top - window.scrollY + 100,
      height: 100,
      left: 0,
      right: 100,
      top: top - window.scrollY,
      width: 100,
      x: 0,
      y: top - window.scrollY,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.append(anchor);
  return anchor;
}

beforeEach(() => {
  vi.stubGlobal("innerHeight", 800);
  setDocumentHeight(2_400);
  setScrollY(0);
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("calculatePageProgress", () => {
  it("clamps the scroll range to zero through one", () => {
    expect(
      calculatePageProgress({
        scrollY: -10,
        scrollHeight: 1_800,
        innerHeight: 800,
      }),
    ).toBe(0);
    expect(
      calculatePageProgress({
        scrollY: 500,
        scrollHeight: 1_800,
        innerHeight: 800,
      }),
    ).toBe(0.5);
    expect(
      calculatePageProgress({
        scrollY: 1_500,
        scrollHeight: 1_800,
        innerHeight: 800,
      }),
    ).toBe(1);
  });

  it("returns zero when the document cannot scroll", () => {
    expect(
      calculatePageProgress({
        scrollY: 0,
        scrollHeight: 800,
        innerHeight: 800,
      }),
    ).toBe(0);
  });
});

describe("selectActiveAnchor", () => {
  it("uses DOM order instead of visual positions or input order", () => {
    appendAnchor("first", -20);
    appendAnchor("second", -10);

    expect(
      selectActiveAnchor(["second", "first"], {
        atBottom: false,
        headerOffset: 100,
      }),
    ).toBe("second");
  });

  it("keeps the first anchor active at the top", () => {
    appendAnchor("first", 260);
    appendAnchor("second", 500);

    expect(
      selectActiveAnchor(["first", "second"], {
        atBottom: false,
        headerOffset: 100,
      }),
    ).toBe("first");
  });

  it("forces the first anchor at scroll position zero even after later anchors cross the header", () => {
    appendAnchor("first", -20);
    appendAnchor("second", -10);

    expect(
      selectActiveAnchor(["first", "second"], {
        atBottom: false,
        atTop: true,
        headerOffset: 100,
      }),
    ).toBe("first");
  });

  it("selects the last anchor that has crossed the header offset", () => {
    appendAnchor("first", 60);
    appendAnchor("second", 130);
    appendAnchor("third", 300);

    expect(
      selectActiveAnchor(["first", "second", "third"], {
        atBottom: false,
        headerOffset: 160,
      }),
    ).toBe("second");
  });

  it("tolerates subpixel rounding at the sticky header boundary", () => {
    appendAnchor("first", 20);
    appendAnchor("second", 65.1);

    expect(
      selectActiveAnchor(["first", "second"], {
        atBottom: false,
        headerOffset: 65,
      }),
    ).toBe("second");
  });

  it("uses the final anchor at the bottom when its short section never crosses the header", () => {
    appendAnchor("first", -80);
    appendAnchor("last", 500);

    expect(
      selectActiveAnchor(["first", "last"], {
        atBottom: true,
        headerOffset: 120,
      }),
    ).toBe("last");
  });

  it("ignores missing and duplicate anchor ids", () => {
    appendAnchor("first", 60);
    appendAnchor("second", 130);

    expect(
      selectActiveAnchor(["missing", "first", "first", "second"], {
        atBottom: false,
        headerOffset: 160,
      }),
    ).toBe("second");
  });
});

describe("useDirectoryProgress", () => {
  it("recalculates from scroll events and cleans listeners and observers on unmount", () => {
    appendAnchor("first", 10);
    appendAnchor("second", 300);
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const disconnect = vi.fn();
    const observe = vi.fn();

    class ResizeObserverMock {
      disconnect = disconnect;
      observe = observe;
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const historyReplace = vi.spyOn(window.history, "replaceState");
    const hook = renderHook(() =>
      useDirectoryProgress(["first", "first", "missing", "second"]),
    );

    expect(hook.result.current).toEqual({ activeHash: "#first", progress: 0 });
    expect(observe).toHaveBeenCalledWith(document.documentElement);

    setScrollY(800);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(hook.result.current).toEqual({
      activeHash: "#second",
      progress: 0.5,
    });
    expect(historyReplace).not.toHaveBeenCalled();

    hook.unmount();

    expect(removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("does not treat overscroll beyond one pixel as the page bottom", () => {
    appendAnchor("first", 10);
    appendAnchor("last", 1_700);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const hook = renderHook(() => useDirectoryProgress(["first", "last"]));

    setScrollY(1_610);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(hook.result.current).toEqual({ activeHash: "#first", progress: 1 });
  });
});

describe("DirectoryProgressRail", () => {
  it("renders only while collapsed and places the dot at the page progress", () => {
    const view = render(<DirectoryProgressRail collapsed progress={0.25} />);

    expect(screen.getByTestId("directory-progress-rail")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByTestId("directory-progress-dot")).toHaveStyle({
      top: "25%",
    });

    view.rerender(<DirectoryProgressRail collapsed={false} progress={0.25} />);

    expect(
      screen.queryByTestId("directory-progress-rail"),
    ).not.toBeInTheDocument();
  });

  it("keeps motion short and disables it for reduced motion", () => {
    const stylesheet = readFileSync(
      "src/components/directory-progress.css",
      "utf8",
    );

    expect(stylesheet).toMatch(/transition:\s*top\s+160ms/);
    expect(stylesheet).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(stylesheet).toMatch(/transition:\s*none/);
  });
});
