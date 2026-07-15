// @ts-expect-error Vitest provides Node at runtime; the package deliberately omits Node types.
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantHeaderEntry } from "./assistant-header-entry";

type RafCallback = (time: number) => void;

let context: CanvasRenderingContext2D;
let rafCallbacks: Map<number, RafCallback>;
let nextRafId: number;

function createContext(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineTo: vi.fn(),
    lineWidth: 1,
    moveTo: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  context = createContext();
  rafCallbacks = new Map();
  nextRafId = 1;

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: RafCallback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => {
      rafCallbacks.delete(id);
    }),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AssistantHeaderEntry", () => {
  it("exposes one named control and activates it without exposing the canvas", () => {
    const onActivate = vi.fn();
    render(<AssistantHeaderEntry onActivate={onActivate} />);

    const button = screen.getByRole("button", { name: "打开 AI 助理" });
    const canvas = button.querySelector("canvas");
    expect(button).toHaveClass("assistant-header-entry");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(context.fill).toHaveBeenCalled();

    fireEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(button);
  });

  it("reprojects the mesh on animation frames instead of rotating a flat asset", () => {
    render(<AssistantHeaderEntry onActivate={() => undefined} />);

    const initialMoveCount = vi.mocked(context.moveTo).mock.calls.length;
    const firstFrame = [...rafCallbacks.values()][0];
    expect(firstFrame).toBeDefined();

    firstFrame?.(550);

    expect(vi.mocked(context.moveTo).mock.calls.length).toBeGreaterThan(
      initialMoveCount,
    );
    expect(context.setTransform).toHaveBeenCalled();
  });

  it("stops scheduling frames when reduced motion is enabled", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    render(<AssistantHeaderEntry onActivate={() => undefined} />);

    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(context.fill).toHaveBeenCalled();
  });

  it("keeps the hit target and canvas dimensions accessible", () => {
    const appShellCss = readFileSync("src/app-shell.css", "utf8");

    expect(appShellCss).toMatch(
      /\.assistant-header-entry\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/u,
    );
    expect(appShellCss).toMatch(
      /\.assistant-header-entry__mark\s*\{[\s\S]*?width:\s*25px;[\s\S]*?height:\s*25px;[\s\S]*?display:\s*block;/u,
    );
    expect(appShellCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)/u,
    );
  });

  it("keeps the canvas visible in forced-colors mode", () => {
    const appShellCss = readFileSync("src/app-shell.css", "utf8");

    expect(appShellCss).toMatch(
      /@media\s*\(forced-colors:\s*active\)[\s\S]*?\.assistant-header-entry__mark\s*\{[\s\S]*?filter:\s*grayscale\(1\)\s+contrast\(1\.8\);/u,
    );
  });
});
