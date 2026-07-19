import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeRevealObserver } from "./home-reveal";

type ObserverHarness = {
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  unobserve: ReturnType<typeof vi.fn>;
};

let observerCallback: IntersectionObserverCallback | undefined;
let observerOptions: IntersectionObserverInit | undefined;
let observer: ObserverHarness;
let reducedMotion = false;
let rectSpy: ReturnType<typeof vi.spyOn>;

function createRect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

function createIntersectionEntry(
  target: Element,
  isIntersecting: boolean,
): IntersectionObserverEntry {
  const targetRect = createRect(750, 900);

  return {
    boundingClientRect: targetRect,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: isIntersecting ? targetRect : createRect(0, 0),
    isIntersecting,
    rootBounds: createRect(0, 800),
    target,
    time: 0,
  };
}

function renderHome(firstRect?: { top: number; bottom: number }) {
  return render(
    <>
      <main className="home" data-testid="home">
        <section data-testid="hero">Hero</section>
        <section
          data-home-reveal="true"
          data-rect-bottom={firstRect?.bottom}
          data-rect-top={firstRect?.top}
          data-testid="reveal-one"
        >
          First reveal
        </section>
        <section data-home-reveal="true" data-testid="reveal-two">
          Second reveal
        </section>
        <section data-testid="closing">Closing</section>
      </main>
      <HomeRevealObserver />
    </>,
  );
}

beforeEach(() => {
  observerCallback = undefined;
  observerOptions = undefined;
  observer = {
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn(),
  };
  reducedMotion = false;

  class MockIntersectionObserver {
    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      observerCallback = callback;
      observerOptions = options;
    }

    disconnect = observer.disconnect;
    observe = observer.observe;
    unobserve = observer.unobserve;
  }

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(
      (query: string): MediaQueryList => ({
        matches: reducedMotion,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    ),
  );

  rectSpy = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return createRect(
        Number(this.dataset.rectTop ?? 750),
        Number(this.dataset.rectBottom ?? 900),
      );
    });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HomeRevealObserver", () => {
  it("renders no markup", () => {
    const view = render(<HomeRevealObserver />);

    expect(view.container).toBeEmptyDOMElement();
  });

  it("enables reveal styling and observes only marked homepage sections", () => {
    renderHome();

    const home = screen.getByTestId("home");
    const first = screen.getByTestId("reveal-one");
    const second = screen.getByTestId("reveal-two");

    expect(home).toHaveClass("home-reveal-ready");
    expect(observer.observe).toHaveBeenCalledTimes(2);
    expect(observer.observe).toHaveBeenCalledWith(first);
    expect(observer.observe).toHaveBeenCalledWith(second);
    expect(observer.observe).not.toHaveBeenCalledWith(
      screen.getByTestId("hero"),
    );
    expect(observer.observe).not.toHaveBeenCalledWith(
      screen.getByTestId("closing"),
    );
    expect(observerOptions).toEqual({
      rootMargin: "0px 0px -96px 0px",
      threshold: 0.05,
    });
  });

  it("reveals and unobserves a target when it intersects", () => {
    renderHome();
    const target = screen.getByTestId("reveal-one");

    act(() => {
      observerCallback?.(
        [createIntersectionEntry(target, true)],
        observer as unknown as IntersectionObserver,
      );
    });

    expect(target).toHaveClass("is-home-visible");
    expect(observer.unobserve).toHaveBeenCalledTimes(1);
    expect(observer.unobserve).toHaveBeenCalledWith(target);
  });

  it("disconnects and removes the ready class on unmount", () => {
    const view = renderHome();
    const home = screen.getByTestId("home");

    expect(home).toHaveClass("home-reveal-ready");

    view.unmount();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(home).not.toHaveClass("home-reveal-ready");
  });

  it("immediately reveals an initially in-viewport target without observing it", () => {
    renderHome({ top: 700, bottom: 760 });
    const inViewportTarget = screen.getByTestId("reveal-one");

    expect(inViewportTarget).toHaveClass("is-home-visible");
    expect(observer.observe).not.toHaveBeenCalledWith(inViewportTarget);
  });

  it("reveals all targets without enabling observer styling for reduced motion", () => {
    reducedMotion = true;

    renderHome();

    expect(screen.getByTestId("home")).not.toHaveClass("home-reveal-ready");
    expect(screen.getByTestId("reveal-one")).toHaveClass("is-home-visible");
    expect(screen.getByTestId("reveal-two")).toHaveClass("is-home-visible");
    expect(observer.observe).not.toHaveBeenCalled();
    expect(rectSpy).not.toHaveBeenCalled();
    expect(window.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
  });

  it("handles missing browser APIs with safe progressive enhancement", () => {
    const intersectionObserver = window.IntersectionObserver;
    const matchMedia = window.matchMedia;

    vi.stubGlobal("IntersectionObserver", undefined);

    renderHome();

    expect(screen.getByTestId("home")).not.toHaveClass("home-reveal-ready");
    expect(screen.getByTestId("reveal-one")).toHaveClass("is-home-visible");
    expect(screen.getByTestId("reveal-two")).toHaveClass("is-home-visible");
    expect(observer.observe).not.toHaveBeenCalled();
    expect(rectSpy).not.toHaveBeenCalled();

    cleanup();
    vi.stubGlobal("IntersectionObserver", intersectionObserver);
    vi.stubGlobal("matchMedia", undefined);

    renderHome();

    expect(screen.getByTestId("home")).toHaveClass("home-reveal-ready");
    expect(observer.observe).toHaveBeenCalledTimes(2);
    expect(observer.observe).toHaveBeenCalledWith(
      screen.getByTestId("reveal-one"),
    );
    expect(observer.observe).toHaveBeenCalledWith(
      screen.getByTestId("reveal-two"),
    );

    vi.stubGlobal("matchMedia", matchMedia);
  });
});
