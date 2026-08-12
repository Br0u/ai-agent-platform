import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantOrb, type AssistantOrbState } from "./assistant-orb";

type MockThinkingOrbProps = {
  "aria-label": string;
  paused: boolean;
  size: 20 | 64;
  state: string;
};

const thinkingOrbMock = vi.hoisted(() => ({
  shouldThrow: false,
  render: vi.fn(),
}));

const reducedMotionMock = vi.hoisted(() => ({ value: false }));

vi.mock("framer-motion", () => ({
  useReducedMotion: () => reducedMotionMock.value,
}));

vi.mock("thinking-orbs", () => ({
  ThinkingOrb: (props: MockThinkingOrbProps) => {
    thinkingOrbMock.render(props);
    if (thinkingOrbMock.shouldThrow) {
      throw new Error("canvas renderer failed");
    }
    return (
      <canvas
        aria-label={props["aria-label"]}
        data-orb-size={props.size}
        data-orb-state={props.state}
        data-paused={String(props.paused)}
        data-testid="thinking-orb"
        role="img"
      />
    );
  },
}));

function enableCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
}

afterEach(() => {
  cleanup();
  thinkingOrbMock.render.mockClear();
  thinkingOrbMock.shouldThrow = false;
  reducedMotionMock.value = false;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AssistantOrb", () => {
  it.each<{
    assistantState: AssistantOrbState;
    ariaLabel: string;
    orbState: string;
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
  ])(
    "maps $assistantState to the $orbState animation and an accessible label",
    async ({ ariaLabel, assistantState, orbState }) => {
      enableCanvas();

      render(<AssistantOrb size={64} state={assistantState} />);

      expect(
        await screen.findByRole("img", { name: ariaLabel }),
      ).toHaveAttribute("data-orb-state", orbState);
      expect(thinkingOrbMock.render.mock.lastCall?.[0]).toEqual(
        expect.objectContaining({
          "aria-label": ariaLabel,
          paused: false,
          size: 64,
          state: orbState,
        }),
      );
    },
  );

  it.each([20, 64] as const)(
    "uses the tuned %ipx thinking-orbs preset",
    async (size) => {
      enableCanvas();

      const { container } = render(
        <AssistantOrb size={size} state="analyzing" />,
      );

      await screen.findByTestId("thinking-orb");
      expect(container.firstElementChild).toHaveAttribute(
        "data-assistant-orb-size",
        String(size),
      );
      expect(container.firstElementChild).toHaveAttribute(
        "data-orb-state",
        "solving",
      );
      expect(thinkingOrbMock.render.mock.lastCall?.[0]).toEqual(
        expect.objectContaining({ size }),
      );
    },
  );

  it("explicitly pauses the orb when reduced motion is requested", async () => {
    enableCanvas();
    reducedMotionMock.value = true;

    render(<AssistantOrb size={20} state="reading" />);

    expect(await screen.findByTestId("thinking-orb")).toHaveAttribute(
      "data-paused",
      "true",
    );
    expect(thinkingOrbMock.render.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ paused: true }),
    );
  });

  it("keeps an accessible static brand fallback when Canvas 2D is unavailable", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    render(<AssistantOrb size={64} state="reading" />);

    expect(
      await screen.findByRole("img", { name: "码多多正在读取页面" }),
    ).toHaveAttribute("data-assistant-orb-fallback", "true");
    expect(screen.queryByTestId("thinking-orb")).not.toBeInTheDocument();
    expect(thinkingOrbMock.render).not.toHaveBeenCalled();
  });

  it("falls back safely when the third-party orb renderer throws", async () => {
    enableCanvas();
    thinkingOrbMock.shouldThrow = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<AssistantOrb size={20} state="tool" />);

    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "码多多正在执行操作" }),
      ).toHaveAttribute("data-assistant-orb-fallback", "true"),
    );
    expect(screen.queryByTestId("thinking-orb")).not.toBeInTheDocument();
  });
});

describe("thinking-orbs visibility lifecycle", () => {
  it("uses the dependency's native visibility listener to pause and resume animation", async () => {
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
    const canvasContext = new Proxy(
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
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      canvasContext,
    );
    const { ThinkingOrb: NativeThinkingOrb } =
      await vi.importActual<typeof import("thinking-orbs")>("thinking-orbs");

    render(<NativeThinkingOrb size={20} state="breathing" />);
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
