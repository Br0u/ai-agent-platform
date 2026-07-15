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
import {
  AssistantExperienceProvider,
  useAssistantExperience,
} from "./assistant-experience-provider";
import { AssistantWorkspace } from "./assistant-workspace";

type MediaQueryController = {
  setMatches: (matches: boolean) => void;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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
  ready: true,
  capability: "placeholder",
  message: "模型尚未配置，当前为安全占位模式。",
};

const availableStatus: AssistantStatusResponse = {
  version: "1",
  requestId: "workspace-available-status",
  live: true,
  ready: true,
  capability: "available",
  message: "AI 助理基础服务已就绪。",
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AssistantWorkspace", () => {
  it("adopts its server state into the provider and renders later shared updates", async () => {
    function SharedServiceStateProbe() {
      const experience = useAssistantExperience();
      return (
        <>
          <output aria-label="共享服务能力">
            {experience.serviceState.capability}
          </output>
          <button
            onClick={() => experience.adoptServiceState(availableStatus)}
            type="button"
          >
            采用后续服务状态
          </button>
        </>
      );
    }

    render(
      <AssistantExperienceProvider pathname="/assistant">
        <AssistantWorkspace serviceState={placeholderStatus} />
        <SharedServiceStateProbe />
      </AssistantExperienceProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("共享服务能力")).toHaveTextContent(
        "placeholder",
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "采用后续服务状态" }));
    expect(screen.getByTestId("assistant-service-state")).toHaveTextContent(
      "服务已就绪",
    );
  });

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
    expect(screen.getByTestId("assistant-conversation")).toHaveAttribute(
      "data-variant",
      "workspace",
    );
    expect(screen.getByRole("log", { name: "AI 助理对话" })).toHaveAttribute(
      "data-testid",
      "assistant-message-history",
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

  it("distinguishes degraded infrastructure from a healthy placeholder", () => {
    render(
      <AssistantExperienceProvider pathname="/assistant">
        <AssistantWorkspace
          serviceState={{
            version: "1",
            requestId: "degraded-status",
            live: false,
            ready: false,
            capability: "degraded",
            message: "助手基础服务暂不可用。",
          }}
        />
      </AssistantExperienceProvider>,
    );

    expect(screen.getByText("基础设施暂不可用")).toBeVisible();
    expect(screen.queryByText("模型未配置")).not.toBeInTheDocument();
    expect(screen.getByText("助手基础服务暂不可用。")).toBeVisible();
  });

  it("manually refreshes status through the public versioned endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        version: "1",
        requestId: "refreshed-status",
        live: true,
        ready: true,
        capability: "placeholder",
        message: "模型尚未配置，当前为安全占位模式。",
      }),
    );
    render(
      <AssistantExperienceProvider pathname="/assistant">
        <AssistantWorkspace
          serviceState={{
            version: "1",
            requestId: "initial-status",
            live: false,
            ready: false,
            capability: "degraded",
            message: "助手基础服务暂不可用。",
          }}
        />
      </AssistantExperienceProvider>,
    );

    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "刷新服务状态" }));

    await waitFor(() => expect(screen.getByText("模型尚未配置")).toBeVisible());
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/assistant/status",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("uses a synchronous in-flight lock for rapid repeated refreshes", () => {
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => undefined));
    renderWorkspace();
    const refresh = screen.getByRole("button", { name: "刷新服务状态" });

    fireEvent.click(refresh);
    fireEvent.click(refresh);

    expect(fetch).toHaveBeenCalledOnce();
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAccessibleName("刷新服务状态中");
  });

  it("times out a pending status body and recovers with a safe degraded result", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start() {
            // Keep the response body pending past the bounded client timeout.
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "刷新服务状态" }));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));

    expect(screen.getByTestId("assistant-service-state")).toHaveTextContent(
      "基础设施暂不可用",
    );
    expect(screen.getByRole("button", { name: "刷新服务状态" })).toBeEnabled();
  });

  it.each([
    [
      "network failure",
      () => Promise.reject(new Error("raw private network detail")),
    ],
    [
      "malformed response",
      () =>
        Promise.resolve(
          Response.json({
            version: "1",
            requestId: "contradictory-status",
            live: false,
            ready: true,
            capability: "available",
            message: "raw private runtime detail",
          }),
        ),
    ],
  ])("maps %s to a sanitized degraded status", async (_name, request) => {
    vi.mocked(fetch).mockImplementationOnce(request);
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "刷新服务状态" }));

    await waitFor(() =>
      expect(screen.getByTestId("assistant-service-state")).toHaveTextContent(
        "基础设施暂不可用",
      ),
    );
    expect(screen.queryByText(/raw private/u)).toBeNull();
    expect(screen.getByRole("button", { name: "刷新服务状态" })).toBeEnabled();
  });

  it("aborts an in-flight status refresh on unmount without updating state", () => {
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_input, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const view = renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "刷新服务状态" }));
    view.unmount();

    expect(signal?.aborted).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not let a stale timed-out response overwrite a newer status", async () => {
    vi.useFakeTimers();
    const stale = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(
        Response.json({
          version: "1",
          requestId: "newer-status",
          live: true,
          ready: true,
          capability: "available",
          message: "AI 助理基础服务已就绪。",
        }),
      );
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "刷新服务状态" }));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    fireEvent.click(screen.getByRole("button", { name: "刷新服务状态" }));
    await act(async () => Promise.resolve());
    expect(screen.getByTestId("assistant-service-state")).toHaveTextContent(
      "服务已就绪",
    );

    stale.resolve(
      Response.json({
        version: "1",
        requestId: "stale-status",
        live: true,
        ready: true,
        capability: "placeholder",
        message: "模型尚未配置，当前为安全占位模式。",
      }),
    );
    await act(async () => Promise.resolve());
    expect(screen.getByTestId("assistant-service-state")).toHaveTextContent(
      "服务已就绪",
    );
  });

  it("announces status refresh progress and its resulting service text", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({
        version: "1",
        requestId: "accessible-status",
        live: true,
        ready: true,
        capability: "available",
        message: "AI 助理基础服务已就绪。",
      }),
    );
    renderWorkspace();
    const region = screen.getByTestId("assistant-service-state");
    const refresh = screen.getByRole("button", { name: "刷新服务状态" });

    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-busy", "false");
    fireEvent.click(refresh);
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(refresh).toHaveAccessibleName("刷新服务状态中");

    await waitFor(() => expect(region).toHaveTextContent("服务已就绪"));
    expect(region).toHaveAttribute("aria-busy", "false");
    expect(refresh).toHaveAccessibleName("刷新服务状态");
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

  it("renders the sanitized rate-limit error beside the composer without auto retry", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          version: "1",
          requestId: "rate-limited",
          error: {
            code: "rate_limited",
            message: "raw internal limiter detail",
            retryable: true,
          },
        },
        { status: 429 },
      ),
    );
    renderWorkspace();
    const composer = screen.getByRole("textbox", { name: "输入问题" });
    fireEvent.change(composer, { target: { value: "限流测试" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("请求过于频繁，请稍后再试。");
    expect(
      screen
        .getAllByRole("status")
        .some((status) =>
          status.textContent?.includes("请求过于频繁，请稍后再试。"),
        ),
    ).toBe(true);
    expect(screen.queryByText(/raw internal limiter detail/u)).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
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
