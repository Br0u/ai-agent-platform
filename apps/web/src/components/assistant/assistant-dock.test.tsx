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
      </div>
      <AssistantDock />
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
    expect(background).not.toHaveAttribute("inert");
    expect(background).toHaveAttribute("aria-hidden", "false");
    expect(document.body.style.overflow).toBe("clip");
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
    expect(document.activeElement).toBe(trigger);
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

  it("keeps the dialog mounted long enough to run its exit transition", async () => {
    renderDock();
    const dialog = await openDock();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭 AI 助理工作区" }),
    );
    expect(dialog).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 240));
    });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });
});
