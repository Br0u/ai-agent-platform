import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantStatusResponse } from "@/features/assistant/assistant-contract";
import { AssistantExperienceProvider } from "./assistant-experience-provider";
import { AssistantWorkspace } from "./assistant-workspace";

type MediaQueryController = {
  setMatches: (matches: boolean) => void;
};

function installMatchMedia(initialMatches: boolean): MediaQueryController {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = initialMatches;
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(min-width: 721px)",
    onchange: null,
    addEventListener: (
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      if (type === "change") listeners.add(listener);
    },
    removeEventListener: (
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      if (type === "change") listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeListener: (listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;

  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQuery),
  );

  return {
    setMatches(nextMatches) {
      matches = nextMatches;
      act(() => {
        const event = {
          matches,
          media: mediaQuery.media,
        } as MediaQueryListEvent;
        listeners.forEach((listener) => listener(event));
      });
    },
  };
}

const placeholderStatus: AssistantStatusResponse = {
  version: "1",
  requestId: "workspace-status",
  live: true,
  ready: false,
  capability: "placeholder",
  message: "模型尚未配置，当前为安全占位模式。",
};

function renderWorkspace() {
  return render(
    <AssistantExperienceProvider pathname="/assistant">
      <AssistantWorkspace serviceState={placeholderStatus} />
    </AssistantExperienceProvider>,
  );
}

function successfulPlaceholderReply(content = "当前仅提供安全占位答复。") {
  return new Response(
    JSON.stringify({
      version: "1",
      requestId: "request-1",
      mode: "placeholder",
      session: { temporary: true, expiresAt: "2026-07-13T12:00:00.000Z" },
      message: { id: "message-1", role: "assistant", content },
      suggestedActions: [],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let mediaQuery: MediaQueryController;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  mediaQuery = installMatchMedia(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantWorkspace", () => {
  it("uses the approved spatial direction and states the real placeholder capability", () => {
    renderWorkspace();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "从一个问题开始，找到适合企业的 AI 路径。",
      }),
    ).toBeVisible();
    expect(screen.getByText(placeholderStatus.message)).toBeVisible();
    expect(screen.getByText("公开咨询 · 匿名临时会话")).toBeVisible();
    expect(screen.getByTestId("assistant-service-state")).toHaveAttribute(
      "data-capability",
      "placeholder",
    );
    expect(screen.getAllByRole("textbox", { name: "输入问题" })).toHaveLength(
      1,
    );
  });

  it("offers presets without inventing persisted messages or clickable history", () => {
    installMatchMedia(true);
    renderWorkspace();

    expect(
      screen.queryByTestId("assistant-message-history"),
    ).toBeEmptyDOMElement();
    expect(
      screen.getByRole("button", {
        name: "私有化部署咨询（历史会话不可用）",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "兼容性与 GPU 配置（历史会话不可用）",
      }),
    ).toBeDisabled();
    const newSession = screen.getByRole("button", { name: "新建会话" });
    const availability = screen.getByText("模型接入后开放");
    expect(newSession).toBeDisabled();
    expect(newSession).toHaveAttribute("aria-describedby", availability.id);
    expect(
      screen.getByRole("button", { name: "如何开始了解平台？" }),
    ).toBeEnabled();
  });

  it("uses the shared session to submit a preset question", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulPlaceholderReply());
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "如何开始了解平台？" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/assistant/chat",
      expect.objectContaining({
        body: JSON.stringify({
          message: "如何开始了解平台？",
          context: { pathname: "/assistant" },
        }),
      }),
    );
    expect(
      await within(screen.getByTestId("assistant-message-history")).findByText(
        "当前仅提供安全占位答复。",
      ),
    ).toBeVisible();
  });

  it("submits with Enter but keeps Shift+Enter available for a newline", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulPlaceholderReply());
    renderWorkspace();
    const composer = screen.getByRole("textbox", { name: "输入问题" });

    fireEvent.change(composer, { target: { value: "第一行\n第二行" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(composer).toHaveValue("第一行\n第二行");

    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });

  it("does not submit a composing Enter before the confirmed input", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulPlaceholderReply());
    renderWorkspace();
    const composer = screen.getByRole("textbox", { name: "输入问题" });
    fireEvent.change(composer, { target: { value: "正在输入" } });

    fireEvent(
      composer,
      new KeyboardEvent("keydown", {
        bubbles: true,
        isComposing: true,
        key: "Enter",
      }),
    );
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });

  it("rejects blank and over-500-code-point input beside the composer", () => {
    renderWorkspace();
    const composer = screen.getByRole("textbox", { name: "输入问题" });
    const form = composer.closest("form");
    expect(form).not.toBeNull();

    fireEvent.keyDown(composer, { key: "Enter" });
    expect(
      within(form as HTMLFormElement).getByText("请输入问题。"),
    ).toHaveAttribute("role", "alert");

    fireEvent.change(composer, { target: { value: "𠮷".repeat(501) } });
    const error = within(form as HTMLFormElement).getByText(
      "问题不能超过 500 个字符。",
    );
    expect(composer).toHaveAttribute("aria-describedby", error.id);
    expect(composer).toHaveAttribute("aria-invalid", "true");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("disables the one composer while a request is pending and keeps failures adjacent", async () => {
    let rejectRequest: ((reason?: unknown) => void) | undefined;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    renderWorkspace();
    const composer = screen.getByRole("textbox", { name: "输入问题" });
    fireEvent.change(composer, { target: { value: "部署需要什么？" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(composer).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
    rejectRequest?.(new Error("offline"));

    const error = await within(
      composer.closest("form") as HTMLFormElement,
    ).findByText("发送失败，请重试或使用帮助中心或商务咨询。");
    expect(composer.closest("form")).toContainElement(error);
  });

  it("starts collapsed on mobile and preserves a manual expansion across breakpoint changes", () => {
    renderWorkspace();
    const toggle = screen.getByRole("button", { name: "展开会话栏" });
    const railContent = screen.getByTestId("assistant-session-rail-content");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(railContent).toHaveAttribute("hidden");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("收起会话栏");
    expect(railContent).not.toHaveAttribute("hidden");

    mediaQuery.setMatches(true);
    mediaQuery.setMatches(false);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(railContent).not.toHaveAttribute("hidden");
  });

  it("expands the session rail after mounting on desktop", async () => {
    installMatchMedia(true);
    renderWorkspace();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "收起会话栏" }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
    expect(
      screen.getByTestId("assistant-session-rail-content"),
    ).not.toHaveAttribute("hidden");
  });

  it("keeps workspace CSS free of viewport-width fixed children", () => {
    const css = readFileSync(
      resolve(
        process.cwd(),
        "src/components/assistant/assistant-workspace.css",
      ),
      "utf8",
    );

    expect(css).not.toMatch(/position\s*:\s*fixed/i);
    expect(css).not.toMatch(/\b(?:width|max-width|min-width)\s*:\s*100vw\b/i);
    expect(css).toMatch(
      /\.assistant-workspace\s*{[^}]*--assistant-workspace-shell-offset:\s*77px;[^}]*min-height:\s*calc\(100dvh - var\(--assistant-workspace-shell-offset\)\);/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 560px\)\s*{[\s\S]*?\.assistant-workspace\s*{[^}]*--assistant-workspace-shell-offset:\s*65px;/,
    );
  });
});
