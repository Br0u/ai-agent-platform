import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSISTANT_DOCK_DEFAULT_WIDTH,
  ASSISTANT_DOCK_MAX_WIDTH,
  ASSISTANT_DOCK_MIN_WIDTH,
  ASSISTANT_DOCK_MOBILE_QUERY,
  ASSISTANT_DOCK_WIDTH_STORAGE_KEY,
  useAssistantDockSize,
} from "./use-assistant-dock-size";

type MediaListener = (event: MediaQueryListEvent) => void;

let viewportWidth = 1_280;
let mediaListeners = new Set<MediaListener>();

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

function setViewportWidth(width: number) {
  viewportWidth = width;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  const event = { matches: width <= 720 } as MediaQueryListEvent;
  for (const listener of mediaListeners) listener(event);
  window.dispatchEvent(new Event("resize"));
}

function DockSizeHarness() {
  const state = useAssistantDockSize();

  return (
    <div
      data-testid="dock-state"
      data-mobile={String(state.isMobile)}
      data-resizing={String(state.isResizing)}
      data-width={state.width ?? "mobile"}
    >
      {state.resizeHandleProps ? (
        <div data-testid="resize-handle" {...state.resizeHandleProps} />
      ) : null}
    </div>
  );
}

function stateElement() {
  return screen.getByTestId("dock-state");
}

function resizeHandle() {
  return screen.getByTestId("resize-handle");
}

beforeEach(() => {
  viewportWidth = 1_280;
  mediaListeners = new Set();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string): MediaQueryList => {
      expect(query).toBe(ASSISTANT_DOCK_MOBILE_QUERY);
      return {
        get matches() {
          return viewportWidth <= 720;
        },
        media: query,
        onchange: null,
        addEventListener: (
          _type: string,
          listener: EventListenerOrEventListenerObject,
        ) => {
          mediaListeners.add(listener as MediaListener);
        },
        removeEventListener: (
          _type: string,
          listener: EventListenerOrEventListenerObject,
        ) => {
          mediaListeners.delete(listener as MediaListener);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  });
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  window.localStorage.clear();
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAssistantDockSize", () => {
  it("exports the versioned dimensions contract", () => {
    expect(ASSISTANT_DOCK_DEFAULT_WIDTH).toBe(480);
    expect(ASSISTANT_DOCK_MIN_WIDTH).toBe(380);
    expect(ASSISTANT_DOCK_MAX_WIDTH).toBe(760);
    expect(ASSISTANT_DOCK_MOBILE_QUERY).toBe("(max-width: 720px)");
    expect(ASSISTANT_DOCK_WIDTH_STORAGE_KEY).toBe(
      "ai-agent-platform:assistant-dock-width:v1",
    );
  });

  it("uses the hydration-safe default before restoring a valid preference", async () => {
    window.localStorage.setItem(ASSISTANT_DOCK_WIDTH_STORAGE_KEY, "612");
    const renderedWidths: Array<number | null> = [];
    function InitialRenderProbe() {
      const state = useAssistantDockSize();
      renderedWidths.push(state.width);
      return <div data-testid="restored-width">{state.width}</div>;
    }
    render(<InitialRenderProbe />);

    expect(renderedWidths[0]).toBe(480);
    await waitFor(() =>
      expect(screen.getByTestId("restored-width")).toHaveTextContent("612"),
    );
    expect(renderedWidths.at(-1)).toBe(612);
  });

  it.each(["", "NaN", "Infinity", "379", "761", "1000"])(
    "falls back to the default for an invalid stored preference %j",
    async (storedValue) => {
      window.localStorage.setItem(
        ASSISTANT_DOCK_WIDTH_STORAGE_KEY,
        storedValue,
      );
      const { result } = renderHook(() => useAssistantDockSize());

      await waitFor(() => expect(result.current.width).toBe(480));
    },
  );

  it("survives storage read failures", async () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    const { result } = renderHook(() => useAssistantDockSize());

    await waitFor(() => expect(result.current.width).toBe(480));
  });

  it("treats 720px as mobile and 721px as desktop", async () => {
    setViewportWidth(720);
    const { result } = renderHook(() => useAssistantDockSize());

    await waitFor(() => expect(result.current.isMobile).toBe(true));
    expect(result.current.width).toBeNull();
    expect(result.current.resizeHandleProps).toBeNull();

    act(() => setViewportWidth(721));
    expect(result.current.isMobile).toBe(false);
    expect(result.current.width).toBe(480);
    expect(result.current.resizeHandleProps).not.toBeNull();
  });

  it("keeps separator bounds hydration-safe before applying the viewport limit", async () => {
    setViewportWidth(721);
    const renderedMaximums: Array<number | undefined> = [];
    function SeparatorBoundsProbe() {
      const state = useAssistantDockSize();
      renderedMaximums.push(state.resizeHandleProps?.["aria-valuemax"]);
      return (
        <div data-testid="separator-maximum">
          {state.resizeHandleProps?.["aria-valuemax"]}
        </div>
      );
    }
    render(<SeparatorBoundsProbe />);

    expect(renderedMaximums[0]).toBe(ASSISTANT_DOCK_MAX_WIDTH);
    await waitFor(() =>
      expect(screen.getByTestId("separator-maximum")).toHaveTextContent("673"),
    );
  });

  it("clamps only the rendered width and restores the preferred width later", async () => {
    window.localStorage.setItem(ASSISTANT_DOCK_WIDTH_STORAGE_KEY, "700");
    const { result } = renderHook(() => useAssistantDockSize());
    await waitFor(() => expect(result.current.width).toBe(700));

    act(() => setViewportWidth(721));
    expect(result.current.width).toBe(673);
    expect(window.localStorage.getItem(ASSISTANT_DOCK_WIDTH_STORAGE_KEY)).toBe(
      "700",
    );

    act(() => setViewportWidth(1_280));
    expect(result.current.width).toBe(700);
  });

  it("does not overwrite a wider preference when a keyboard step is clamped away", async () => {
    window.localStorage.setItem(ASSISTANT_DOCK_WIDTH_STORAGE_KEY, "700");
    setViewportWidth(721);
    render(<DockSizeHarness />);
    await waitFor(() =>
      expect(stateElement()).toHaveAttribute("data-width", "673"),
    );

    fireEvent.keyDown(resizeHandle(), { key: "ArrowLeft" });
    expect(window.localStorage.getItem(ASSISTANT_DOCK_WIDTH_STORAGE_KEY)).toBe(
      "700",
    );

    act(() => setViewportWidth(1_280));
    expect(stateElement()).toHaveAttribute("data-width", "700");
  });

  it("does not persist the viewport clamp when pointerup ends without resizing", async () => {
    window.localStorage.setItem(ASSISTANT_DOCK_WIDTH_STORAGE_KEY, "700");
    setViewportWidth(721);
    render(<DockSizeHarness />);
    await waitFor(() =>
      expect(stateElement()).toHaveAttribute("data-width", "673"),
    );

    fireEvent.pointerDown(resizeHandle(), {
      button: 0,
      clientX: 700,
      pointerId: 6,
    });
    fireEvent.pointerUp(resizeHandle(), { clientX: 700, pointerId: 6 });
    expect(window.localStorage.getItem(ASSISTANT_DOCK_WIDTH_STORAGE_KEY)).toBe(
      "700",
    );

    act(() => setViewportWidth(1_280));
    expect(stateElement()).toHaveAttribute("data-width", "700");
  });

  it("adjusts and persists keyboard width with normal and shifted steps", async () => {
    render(<DockSizeHarness />);
    await waitFor(() =>
      expect(stateElement()).toHaveAttribute("data-width", "480"),
    );
    expect(resizeHandle()).toHaveAttribute("role", "separator");
    expect(resizeHandle()).toHaveAttribute("aria-orientation", "vertical");
    expect(resizeHandle()).toHaveAttribute("aria-valuemin", "380");
    expect(resizeHandle()).toHaveAttribute("aria-valuemax", "760");
    expect(resizeHandle()).toHaveAttribute("aria-valuenow", "480");

    fireEvent.keyDown(resizeHandle(), { key: "ArrowLeft" });
    expect(stateElement()).toHaveAttribute("data-width", "496");
    expect(window.localStorage.getItem(ASSISTANT_DOCK_WIDTH_STORAGE_KEY)).toBe(
      "496",
    );

    fireEvent.keyDown(resizeHandle(), { key: "ArrowRight", shiftKey: true });
    expect(stateElement()).toHaveAttribute("data-width", "448");
    expect(window.localStorage.getItem(ASSISTANT_DOCK_WIDTH_STORAGE_KEY)).toBe(
      "448",
    );
  });

  it("keeps keyboard adjustment usable when storage writes fail", async () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    render(<DockSizeHarness />);
    await waitFor(() =>
      expect(stateElement()).toHaveAttribute("data-width", "480"),
    );

    expect(() =>
      fireEvent.keyDown(resizeHandle(), { key: "ArrowLeft" }),
    ).not.toThrow();
    expect(stateElement()).toHaveAttribute("data-width", "496");
  });

  it("captures the pointer, clamps dragging, and persists only on pointerup", async () => {
    const setPointerCapture = vi.spyOn(
      HTMLElement.prototype,
      "setPointerCapture",
    );
    const releasePointerCapture = vi.spyOn(
      HTMLElement.prototype,
      "releasePointerCapture",
    );
    const setItem = vi.spyOn(window.localStorage, "setItem");
    render(<DockSizeHarness />);
    await waitFor(() =>
      expect(stateElement()).toHaveAttribute("data-width", "480"),
    );

    fireEvent.pointerDown(resizeHandle(), {
      button: 0,
      clientX: 800,
      pointerId: 7,
    });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(stateElement()).toHaveAttribute("data-resizing", "true");
    expect(document.body.style.userSelect).toBe("none");

    fireEvent.pointerMove(resizeHandle(), { clientX: 400, pointerId: 7 });
    expect(stateElement()).toHaveAttribute("data-width", "760");
    expect(setItem).not.toHaveBeenCalled();

    fireEvent.pointerMove(resizeHandle(), { clientX: 1_000, pointerId: 7 });
    expect(stateElement()).toHaveAttribute("data-width", "380");
    expect(setItem).not.toHaveBeenCalled();

    fireEvent.pointerUp(resizeHandle(), { clientX: 420, pointerId: 7 });
    expect(stateElement()).toHaveAttribute("data-width", "760");
    expect(stateElement()).toHaveAttribute("data-resizing", "false");
    expect(setItem).toHaveBeenCalledWith(
      ASSISTANT_DOCK_WIDTH_STORAGE_KEY,
      "760",
    );
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(document.body.style.userSelect).toBe("");
    expect(document.body.style.cursor).toBe("");

    fireEvent.pointerMove(resizeHandle(), { clientX: 1_000, pointerId: 7 });
    expect(stateElement()).toHaveAttribute("data-width", "760");
  });

  it("ignores pointerup from a different pointer", async () => {
    const setItem = vi.spyOn(window.localStorage, "setItem");
    render(<DockSizeHarness />);
    await waitFor(() =>
      expect(stateElement()).toHaveAttribute("data-width", "480"),
    );

    fireEvent.pointerDown(resizeHandle(), {
      button: 0,
      clientX: 800,
      pointerId: 7,
    });
    fireEvent.pointerMove(resizeHandle(), { clientX: 700, pointerId: 7 });
    fireEvent.pointerUp(resizeHandle(), { clientX: 650, pointerId: 8 });

    expect(stateElement()).toHaveAttribute("data-resizing", "true");
    expect(stateElement()).toHaveAttribute("data-width", "580");
    expect(setItem).not.toHaveBeenCalled();
    fireEvent.pointerCancel(resizeHandle(), { pointerId: 7 });
  });

  it.each([
    [
      "pointercancel",
      () => fireEvent.pointerCancel(resizeHandle(), { pointerId: 4 }),
    ],
    [
      "lostpointercapture",
      () => fireEvent(resizeHandle(), new Event("lostpointercapture")),
    ],
    ["window blur", () => window.dispatchEvent(new Event("blur"))],
  ])("discards an unfinished drag on %s", async (_label, finish) => {
    const setItem = vi.spyOn(window.localStorage, "setItem");
    render(<DockSizeHarness />);
    await waitFor(() =>
      expect(stateElement()).toHaveAttribute("data-width", "480"),
    );

    fireEvent.pointerDown(resizeHandle(), {
      button: 0,
      clientX: 800,
      pointerId: 4,
    });
    fireEvent.pointerMove(resizeHandle(), { clientX: 700, pointerId: 4 });
    expect(stateElement()).toHaveAttribute("data-width", "580");

    act(finish);
    expect(stateElement()).toHaveAttribute("data-width", "480");
    expect(stateElement()).toHaveAttribute("data-resizing", "false");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("cancels an unfinished drag when crossing the mobile breakpoint", async () => {
    const setItem = vi.spyOn(window.localStorage, "setItem");
    render(<DockSizeHarness />);
    await waitFor(() =>
      expect(stateElement()).toHaveAttribute("data-width", "480"),
    );

    fireEvent.pointerDown(resizeHandle(), {
      button: 0,
      clientX: 800,
      pointerId: 12,
    });
    fireEvent.pointerMove(resizeHandle(), { clientX: 700, pointerId: 12 });
    act(() => setViewportWidth(720));

    expect(stateElement()).toHaveAttribute("data-mobile", "true");
    expect(stateElement()).toHaveAttribute("data-width", "mobile");
    expect(screen.queryByTestId("resize-handle")).not.toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();

    act(() => setViewportWidth(1_280));
    expect(stateElement()).toHaveAttribute("data-width", "480");
  });

  it("cleans up an active drag without persisting when unmounted", async () => {
    const setItem = vi.spyOn(window.localStorage, "setItem");
    const releasePointerCapture = vi.spyOn(
      HTMLElement.prototype,
      "releasePointerCapture",
    );
    const { unmount } = render(<DockSizeHarness />);
    await waitFor(() =>
      expect(stateElement()).toHaveAttribute("data-width", "480"),
    );

    fireEvent.pointerDown(resizeHandle(), {
      button: 0,
      clientX: 800,
      pointerId: 19,
    });
    unmount();

    expect(setItem).not.toHaveBeenCalled();
    expect(releasePointerCapture).toHaveBeenCalledWith(19);
    expect(document.body.style.userSelect).toBe("");
    expect(document.body.style.cursor).toBe("");
    expect(mediaListeners).toHaveLength(0);
  });
});
