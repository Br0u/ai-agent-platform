import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantStatusResponse } from "@/features/assistant/assistant-contract";
import {
  AssistantExperienceProvider,
  useAssistantExperience,
} from "./assistant-experience-provider";
import { FloatingChatWidget } from "../ui/floating-chat-widget-shadcnui";
import { ASSISTANT_DOCK_MOTION, AssistantDock } from "./assistant-dock";

const placeholderStatus: AssistantStatusResponse = {
  version: "1",
  requestId: "dock-placeholder-status",
  live: true,
  ready: true,
  capability: "placeholder",
  message: "模型尚未配置，当前为安全占位模式。",
};

let mobileViewport = false;

type MockVisualViewport = {
  height: number;
  offsetTop: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatch: (type: "resize" | "scroll") => void;
};

function installVisualViewport({
  height,
  offsetTop,
}: {
  height: number;
  offsetTop: number;
}): MockVisualViewport {
  const listeners = new Map<string, Set<EventListener>>();
  const viewport: MockVisualViewport = {
    height,
    offsetTop,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const registered = listeners.get(type) ?? new Set<EventListener>();
      registered.add(listener);
      listeners.set(type, registered);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatch: (type) => {
      listeners.get(type)?.forEach((listener) => listener(new Event(type)));
    },
  };
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  return viewport;
}

function DockHarness({ originalAriaHidden }: { originalAriaHidden?: "false" }) {
  const experience = useAssistantExperience();

  return (
    <>
      <div
        aria-hidden={originalAriaHidden}
        data-assistant-background-root
        data-testid="assistant-background"
      >
        <button
          onClick={(event) => experience.openDockFrom(event.currentTarget)}
          type="button"
        >
          打开 AI 助理工作区
        </button>
        <button
          onClick={(event) => experience.openDockFrom(event.currentTarget)}
          type="button"
        >
          从第二入口打开 AI 助理工作区
        </button>
        <button
          onClick={(event) => experience.openQuickFrom(event.currentTarget)}
          type="button"
        >
          打开快速助手后进入工作区
        </button>
        {experience.surface === "quick" ? (
          <button
            onClick={(event) => experience.openDockFrom(event.currentTarget)}
            type="button"
          >
            从快速助手进入工作区
          </button>
        ) : null}
        <button
          onClick={(event) => {
            void experience.session.submit("发送中的问题");
            experience.openDockFrom(event.currentTarget);
          }}
          type="button"
        >
          发送中打开 AI 助理工作区
        </button>
      </div>
      <AssistantDock />
      <FloatingChatWidget showLauncher={false} />
    </>
  );
}

function renderDock(options: { originalAriaHidden?: "false" } = {}) {
  return render(
    <AssistantExperienceProvider pathname="/pricing">
      <DockHarness originalAriaHidden={options.originalAriaHidden} />
    </AssistantExperienceProvider>,
  );
}

async function openDock() {
  fireEvent.click(screen.getByRole("button", { name: "打开 AI 助理工作区" }));
  const dialog = await screen.findByRole("dialog", {
    name: "AI 助理工作区",
  });
  await waitFor(() => expect(dialog.style.opacity).toBe("1"));
  return dialog;
}

beforeEach(() => {
  mobileViewport = false;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1_280,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(
      (query: string): MediaQueryList => ({
        matches:
          query === "(max-width: 720px)"
            ? mobileViewport
            : query.includes("prefers-reduced-motion")
              ? false
              : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    ),
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: undefined,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(placeholderStatus)),
  );
  document.body.style.overflow = "clip";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("AssistantDock", () => {
  it("uses independent backdrop and panel motion variants", () => {
    expect(ASSISTANT_DOCK_MOTION.backdrop).toEqual({
      durationSeconds: 0.16,
      variants: {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      },
    });
    expect(ASSISTANT_DOCK_MOTION.panel).toEqual({
      enterDurationSeconds: 0.22,
      exitDurationSeconds: 0.17,
      offsetPixels: 18,
      variants: {
        hidden: { opacity: 0, x: 18 },
        visible: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 18 },
      },
    });
    expect(ASSISTANT_DOCK_MOTION.reducedDurationSeconds).toBe(0.01);
  });

  it("portals the complete dock outside the background root", async () => {
    const view = renderDock();
    const dialog = await openDock();
    const layer = screen.getByTestId("assistant-dock-layer");
    const backdrop = screen.getByTestId("assistant-dock-backdrop");

    expect(document.body).toContainElement(dialog);
    expect(view.container).not.toContainElement(dialog);
    expect(layer).not.toHaveAttribute("style");
    expect(backdrop).toHaveAttribute("data-motion-part", "backdrop");
    expect(dialog).toHaveAttribute("data-motion-part", "panel");
    expect(
      within(dialog).getByRole("heading", { name: "M 企业助理" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId("assistant-dock-service-state"),
    ).toHaveTextContent("模型尚未配置");
    expect(
      within(dialog).getByRole("button", { name: "收起为快速助手" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "进入完整工作区" }),
    ).toHaveAttribute("href", "/assistant");
    expect(
      within(dialog).getByRole("button", { name: "关闭 AI 助理工作区" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "如何开始了解平台？" }),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(
      within(dialog).getByRole("textbox", { name: "输入问题" }),
    );
  });

  it("isolates only the background and restores its exact state and body overflow", async () => {
    renderDock({ originalAriaHidden: "false" });
    const background = screen.getByTestId("assistant-background");
    const trigger = screen.getByRole("button", {
      name: "打开 AI 助理工作区",
    });
    await openDock();

    expect(background).toHaveAttribute("inert");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "AI 助理工作区" }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(background).not.toHaveAttribute("inert");
      expect(background).toHaveAttribute("aria-hidden", "false");
      expect(document.body.style.overflow).toBe("clip");
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("closes only when both pointer down and pointer up happen on the backdrop", async () => {
    renderDock();
    const dialog = await openDock();
    const backdrop = screen.getByTestId("assistant-dock-backdrop");

    fireEvent.pointerDown(dialog, { pointerId: 4 });
    fireEvent.pointerUp(backdrop, { pointerId: 4 });
    expect(
      screen.getByRole("dialog", { name: "AI 助理工作区" }),
    ).toBeInTheDocument();

    fireEvent.pointerDown(backdrop, { pointerId: 5 });
    fireEvent.pointerUp(backdrop, { pointerId: 5 });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "AI 助理工作区" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("traps focus inside the dock while leaving restoration to the provider", async () => {
    renderDock();
    const trigger = screen.getByRole("button", {
      name: "打开 AI 助理工作区",
    });
    const dialog = await openDock();
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);

    if (first === undefined || last === undefined) {
      throw new Error("Expected focusable controls inside the assistant dock");
    }

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭 AI 助理工作区" }),
    );
    expect(document.activeElement).not.toBe(trigger);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps modal isolation through exit without letting the old dialog recapture focus", async () => {
    renderDock({ originalAriaHidden: "false" });
    const background = screen.getByTestId("assistant-background");
    const trigger = screen.getByRole("button", {
      name: "打开 AI 助理工作区",
    });
    const dialog = await openDock();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭 AI 助理工作区" }),
    );

    expect(dialog).toBeInTheDocument();
    expect(background).toHaveAttribute("inert");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");

    trigger.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog).not.toContainElement(document.activeElement as HTMLElement);

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => {
      expect(background).not.toHaveAttribute("inert");
      expect(background).toHaveAttribute("aria-hidden", "false");
      expect(document.body.style.overflow).toBe("clip");
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps isolation and scroll lock when reopened during exit", async () => {
    renderDock();
    const background = screen.getByTestId("assistant-background");
    const trigger = screen.getByRole("button", {
      name: "打开 AI 助理工作区",
    });
    const dialog = await openDock();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭 AI 助理工作区" }),
    );
    expect(dialog).toHaveAttribute("inert");
    expect(dialog).toHaveAttribute("aria-hidden", "true");
    expect(dialog).not.toHaveAttribute("role");
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(dialog).toHaveClass("is-exiting");
    expect(dialog.closest(".assistant-dock-layer")).toHaveAttribute(
      "data-exiting",
      "true",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    const secondTrigger = screen.getByRole("button", {
      name: "从第二入口打开 AI 助理工作区",
      hidden: true,
    });
    fireEvent.click(secondTrigger);

    const reopenedDialog = screen.getByRole("dialog", {
      name: "AI 助理工作区",
    });
    expect(reopenedDialog).not.toBe(dialog);
    expect(reopenedDialog).not.toHaveAttribute("inert");
    expect(screen.getAllByRole("dialog")).toEqual([reopenedDialog]);

    expect(background).toHaveAttribute("inert");
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 240));
    });
    expect(
      screen.getByRole("dialog", { name: "AI 助理工作区" }),
    ).toBeInTheDocument();
    expect(background).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    expect(secondTrigger).not.toHaveFocus();
    expect(trigger).not.toHaveFocus();

    fireEvent.click(
      within(reopenedDialog).getByRole("button", {
        name: "关闭 AI 助理工作区",
      }),
    );
    await waitFor(() => expect(reopenedDialog).not.toBeInTheDocument());
    expect(secondTrigger).toHaveFocus();
    expect(trigger).not.toHaveFocus();
  });

  it("restores the original quick launcher after quick to dock to closed", async () => {
    renderDock();
    const quickLauncher = screen.getByRole("button", {
      name: "打开快速助手后进入工作区",
    });
    fireEvent.click(quickLauncher);
    fireEvent.click(
      screen.getByRole("button", { name: "从快速助手进入工作区" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "AI 助理工作区",
    });

    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭 AI 助理工作区" }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(quickLauncher).toHaveFocus();
  });

  it("focuses the quick surface when the dock collapses", async () => {
    renderDock();
    const background = screen.getByTestId("assistant-background");
    const dialog = await openDock();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "收起为快速助手" }),
    );
    expect(dialog).toHaveAttribute("inert");
    expect(dialog).toHaveAttribute("aria-hidden", "true");
    expect(dialog).not.toHaveAttribute("role");
    const blockedQuick = document.querySelector<HTMLElement>(
      ".floating-assistant__panel:not(.is-exiting)",
    );
    expect(blockedQuick).not.toBeNull();
    expect(blockedQuick).toHaveAttribute("inert");
    expect(blockedQuick).toHaveAttribute("aria-hidden", "true");
    expect(blockedQuick).not.toHaveAttribute("role");
    expect(screen.queryByRole("dialog")).toBeNull();
    const blockedQuickClose = within(blockedQuick as HTMLElement).getByRole(
      "button",
      {
        name: "关闭 M 助手",
        hidden: true,
      },
    );
    expect(background).toHaveAttribute("inert");
    expect(blockedQuickClose).not.toHaveFocus();
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    const quickDialog = await screen.findByRole("dialog", { name: "M 助手" });
    const quickClose = within(quickDialog).getByRole("button", {
      name: "关闭 M 助手",
    });
    expect(background).not.toHaveAttribute("inert");
    expect(quickClose).toHaveFocus();
  });

  it("falls back to a focusable control when the composer is disabled", async () => {
    const neverSettles = new Promise<Response>(() => undefined);
    vi.mocked(fetch).mockImplementation((input) =>
      String(input).includes("/chat")
        ? neverSettles
        : Promise.resolve(Response.json(placeholderStatus)),
    );
    renderDock();

    fireEvent.click(
      screen.getByRole("button", {
        name: "发送中打开 AI 助理工作区",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "AI 助理工作区",
    });
    const composer = within(dialog).getByRole("textbox", { name: "输入问题" });
    await waitFor(() => expect(composer).toBeDisabled());
    await waitFor(() =>
      expect(dialog).toContainElement(
        document.activeElement as HTMLElement | null,
      ),
    );
    expect(document.activeElement).not.toBe(composer);
  });

  it("exposes an accessible desktop resize separator and keeps it out of mobile", async () => {
    const desktop = renderDock();
    const desktopDialog = await openDock();
    const separator = within(desktopDialog).getByRole("separator", {
      name: "调整 AI 助理工作区宽度",
    });

    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuemin", "380");
    expect(separator).toHaveAttribute("aria-valuemax", "760");
    expect(separator).toHaveAttribute("aria-valuenow", "480");
    expect(separator).toHaveAttribute("aria-valuetext", "480 像素");
    desktop.unmount();

    mobileViewport = true;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    renderDock();
    const mobileDialog = await openDock();
    await waitFor(() => expect(mobileDialog).toHaveAttribute("data-mobile"));
    expect(within(mobileDialog).queryByRole("separator")).toBeNull();
  });

  it("tracks the mobile visual viewport and cleans up its listeners", async () => {
    mobileViewport = true;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const visualViewport = installVisualViewport({
      height: 620,
      offsetTop: 84,
    });
    const view = renderDock();
    const dialog = await openDock();
    const history = within(dialog).getByTestId("assistant-message-history");
    Object.defineProperties(history, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    history.scrollTop = 680;

    await waitFor(() => {
      expect(dialog).toHaveStyle({
        "--assistant-dock-viewport-height": "620px",
        "--assistant-dock-viewport-offset-top": "84px",
      });
    });
    expect(within(dialog).queryByRole("separator")).toBeNull();

    visualViewport.height = 418;
    visualViewport.offsetTop = 126;
    act(() => visualViewport.dispatch("resize"));
    await waitFor(() => {
      expect(dialog).toHaveStyle({
        "--assistant-dock-viewport-height": "418px",
        "--assistant-dock-viewport-offset-top": "126px",
      });
    });
    await waitFor(() => expect(history.scrollTop).toBe(700));

    const composer = within(dialog).getByRole("textbox", { name: "输入问题" });
    fireEvent.focus(composer);
    expect(
      composer.closest(".assistant-conversation__composer-wrap"),
    ).toHaveProperty("scrollIntoView");
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });

    view.unmount();
    expect(visualViewport.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    expect(visualViewport.removeEventListener).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
    );
  });

  it("preserves message history scroll when the reader is away from the bottom", async () => {
    mobileViewport = true;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const visualViewport = installVisualViewport({
      height: 620,
      offsetTop: 84,
    });
    renderDock();
    const dialog = await openDock();
    const history = within(dialog).getByTestId("assistant-message-history");
    Object.defineProperties(history, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    history.scrollTop = 240;

    visualViewport.height = 418;
    visualViewport.offsetTop = 126;
    act(() => visualViewport.dispatch("scroll"));

    await waitFor(() =>
      expect(dialog).toHaveStyle({
        "--assistant-dock-viewport-height": "418px",
        "--assistant-dock-viewport-offset-top": "126px",
      }),
    );
    expect(history.scrollTop).toBe(240);
  });

  it("keeps the dialog mounted long enough to run its exit transition", async () => {
    renderDock();
    const dialog = await openDock();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭 AI 助理工作区" }),
    );
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("inert");
    expect(dialog).toHaveAttribute("aria-hidden", "true");
    expect(dialog).not.toHaveAttribute("role");
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 240));
    });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });
});
