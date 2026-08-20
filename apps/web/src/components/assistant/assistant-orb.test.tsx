import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantOrb, type AssistantOrbState } from "./assistant-orb";

const reducedMotionMock = vi.hoisted(() => ({ value: false }));

vi.mock("framer-motion", () => ({
  useReducedMotion: () => reducedMotionMock.value,
}));

function canvasContext() {
  return new Proxy(
    {},
    {
      get(target, property) {
        if (!(property in target)) {
          Object.assign(target, { [property]: vi.fn() });
        }
        return Reflect.get(target, property);
      },
      set(target, property, value) {
        return Reflect.set(target, property, value);
      },
    },
  ) as CanvasRenderingContext2D;
}

function enableCanvas(context = canvasContext()) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 17),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  return context;
}

afterEach(() => {
  cleanup();
  reducedMotionMock.value = false;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AssistantOrb", () => {
  it.each<{
    assistantState: AssistantOrbState;
    ariaLabel: string;
    orbState: string;
    paused?: boolean;
  }>([
    {
      assistantState: "idle",
      orbState: "breathing",
      ariaLabel: "码多多已就绪",
    },
    {
      assistantState: "completed",
      orbState: "breathing",
      ariaLabel: "码多多已完成",
      paused: true,
    },
    {
      assistantState: "reading",
      orbState: "searching",
      ariaLabel: "码多多正在读取页面",
    },
    {
      assistantState: "analyzing",
      orbState: "solving",
      ariaLabel: "码多多正在分析",
    },
    {
      assistantState: "tool",
      orbState: "working",
      ariaLabel: "码多多正在执行操作",
    },
    {
      assistantState: "listening",
      orbState: "listening",
      ariaLabel: "码多多正在倾听",
    },
  ])(
    "maps $assistantState to the $orbState animation and an accessible label",
    async ({ ariaLabel, assistantState, orbState, paused = false }) => {
      enableCanvas();

      render(<AssistantOrb size={64} state={assistantState} />);

      const orb = await screen.findByRole("img", { name: ariaLabel });
      expect(orb).toHaveAttribute("data-orb-state", orbState);
      expect(orb).toHaveAttribute("data-paused", String(paused));
    },
  );

  it("paints a completed orb once without scheduling another frame", async () => {
    const context = enableCanvas();

    render(<AssistantOrb size={20} state="completed" />);

    await waitFor(() => expect(context.fill).toHaveBeenCalled());
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("runs the listening preset at the requested quarter speed", async () => {
    enableCanvas();

    render(<AssistantOrb size={20} speed={0.25} state="listening" />);

    expect(
      await screen.findByRole("img", { name: "码多多正在倾听" }),
    ).toHaveAttribute("data-speed", "0.25");
  });

  it.each([20, 64] as const)(
    "uses the tuned %ipx thinking-orbs preset",
    async (size) => {
      enableCanvas();

      const { container } = render(
        <AssistantOrb size={size} state="analyzing" />,
      );

      await screen.findByRole("img");
      expect(container.firstElementChild).toHaveAttribute(
        "data-assistant-orb-size",
        String(size),
      );
      expect(container.firstElementChild).toHaveAttribute(
        "data-orb-state",
        "solving",
      );
      expect(screen.getByRole("img")).toHaveClass("assistant-orb__canvas");
    },
  );

  it("explicitly pauses the orb when reduced motion is requested", async () => {
    enableCanvas();
    reducedMotionMock.value = true;

    render(<AssistantOrb size={20} state="reading" />);

    expect(await screen.findByRole("img")).toHaveAttribute(
      "data-paused",
      "true",
    );
  });

  it("renders brand colors on the orb points without an outer color mask", async () => {
    const context = enableCanvas();

    render(<AssistantOrb size={20} state="analyzing" />);

    expect(await screen.findByRole("img")).toHaveAttribute(
      "data-color-rendering",
      "per-dot",
    );
    await waitFor(() => expect(context.fill).toHaveBeenCalled());
    expect(String(context.fillStyle)).toMatch(
      /^rgba\((37|[3-9]\d|1[01]\d|12[0-4]), /u,
    );
    const stylesheet = readFileSync(
      "src/components/assistant/assistant-orb.css",
      "utf8",
    );
    expect(stylesheet).not.toContain(".assistant-orb::before");
    expect(stylesheet).toMatch(
      /\.assistant-orb\s*\{[\s\S]*?background:\s*transparent;/u,
    );
  });

  it("keeps an accessible static brand fallback when Canvas 2D is unavailable", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    render(<AssistantOrb size={64} state="reading" />);

    expect(
      await screen.findByRole("img", { name: "码多多正在读取页面" }),
    ).toHaveAttribute("data-assistant-orb-fallback", "true");
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("falls back safely when point rendering fails", async () => {
    const context = enableCanvas();
    vi.mocked(context.fill).mockImplementation(() => {
      throw new Error("point renderer failed");
    });

    render(<AssistantOrb size={20} state="tool" />);

    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "码多多正在执行操作" }),
      ).toHaveAttribute("data-assistant-orb-fallback", "true"),
    );
  });
});

describe("brand Orb visibility lifecycle", () => {
  it("pauses and resumes the point renderer on document visibility", async () => {
    let visibilityState: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibilityState,
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      })),
    );
    const requestAnimationFrame = vi.fn(() => 17);
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext(),
    );

    render(<AssistantOrb size={20} state="idle" />);
    await waitFor(() => expect(requestAnimationFrame).toHaveBeenCalled());
    const animationStarts = requestAnimationFrame.mock.calls.length;

    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancelAnimationFrame).toHaveBeenCalledWith(17);

    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(requestAnimationFrame.mock.calls.length).toBeGreaterThan(
      animationStarts,
    );
  });
});
