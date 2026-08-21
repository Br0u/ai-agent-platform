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
  ASSISTANT_STREAM_MEDIA_TYPE,
  formatAssistantStreamEvent,
} from "@/features/assistant/assistant-stream";
import {
  AssistantExperienceProvider,
  useAssistantExperience,
} from "./assistant-experience-provider";
import { AssistantWorkspace } from "./assistant-workspace";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
      <AssistantWorkspace initialServiceState={placeholderStatus} />
    </AssistantExperienceProvider>,
  );
}

function successfulPlaceholderReply(content = "当前仅提供安全占位答复。") {
  return new Response(
    [
      formatAssistantStreamEvent({ type: "answer_delta", content }),
      formatAssistantStreamEvent({ type: "done" }),
    ].join(""),
    { status: 200, headers: { "Content-Type": ASSISTANT_STREAM_MEDIA_TYPE } },
  );
}

beforeEach(() => {
  router.push.mockReset();
  vi.stubGlobal("fetch", vi.fn());
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
        <AssistantWorkspace initialServiceState={placeholderStatus} />
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

  it("uses the approved clean workspace direction and states the real placeholder capability", () => {
    const { container } = renderWorkspace();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "你好，今天想解决什么问题？",
      }),
    ).toBeVisible();
    expect(screen.queryByText("MADUODUO / 01")).toBeNull();
    expect(container.querySelector(".assistant-workspace__header")).toBeNull();
    expect(
      container.querySelector(".assistant-workspace__utility"),
    ).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "缩小码多多并返回主页面" }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByRole("img", { name: "码多多已就绪" })).toBeVisible();
    expect(screen.queryByText("CONVERSATIONS")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByText(placeholderStatus.message)).toBeNull();
    expect(
      container.querySelector(".assistant-workspace__identity"),
    ).toHaveTextContent("码多多");
    expect(screen.getByText("公开网页助手 · 当前页面临时对话")).toBeVisible();
    expect(
      screen.queryByText("当前页面临时对话；刷新或离开后清空。"),
    ).toBeNull();
    expect(
      screen.queryByText(
        "已启用的 Skill 会按配置加载；我可以读取当前公开页面并协助跳转。",
      ),
    ).toBeNull();
    expect(screen.getByTestId("assistant-service-state")).toHaveAttribute(
      "data-capability",
      "placeholder",
    );
    expect(screen.getByRole("log", { name: "码多多对话" })).toHaveAttribute(
      "data-testid",
      "assistant-message-history",
    );
    expect(screen.getAllByRole("textbox", { name: "输入问题" })).toHaveLength(
      1,
    );
  });

  it("offers one document-flow chip strip without conversation controls", () => {
    const { container } = renderWorkspace();

    expect(
      screen.queryByTestId("assistant-message-history"),
    ).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "新建会话" })).toBeNull();
    expect(screen.queryByRole("button", { name: /会话栏/u })).toBeNull();
    const strip = screen.getByRole("group", { name: "常用问题" });
    expect(strip).toHaveClass("assistant-workspace__prompt-chips");
    expect(
      within(strip).getByRole("button", { name: "如何开始了解平台？" }),
    ).toBeEnabled();
    const stylesheet = readFileSync(
      resolve(
        process.cwd(),
        "src/components/assistant/assistant-workspace.css",
      ),
      "utf8",
    );
    expect(stylesheet).toMatch(
      /\.assistant-workspace__prompt-chips button\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/u,
    );
    expect(
      container.querySelector(".assistant-workspace__prompt-chips"),
    ).not.toBeNull();
  });

  it.each([
    availableStatus,
    {
      ...availableStatus,
      requestId: "workspace-degraded-status",
      ready: false,
      capability: "degraded" as const,
      message: "助手基础服务暂不可用。",
    },
  ])(
    "states the real anonymous multi-turn boundary for $capability capability",
    (status) => {
      render(
        <AssistantExperienceProvider pathname="/assistant">
          <AssistantWorkspace initialServiceState={status} />
        </AssistantExperienceProvider>,
      );

      expect(
        screen.queryByText("当前页面临时对话；刷新或离开后清空。"),
      ).toBeNull();
      expect(
        screen.queryByText(
          "已启用的 Skill 会按配置加载；我可以读取当前公开页面并协助跳转。",
        ),
      ).toBeNull();
      expect(screen.queryByText("安全占位模式，不创建服务端会话。")).toBeNull();
    },
  );

  it("distinguishes degraded infrastructure from a healthy placeholder", () => {
    render(
      <AssistantExperienceProvider pathname="/assistant">
        <AssistantWorkspace
          initialServiceState={{
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

    expect(screen.getByText("基础服务暂不可用")).toBeVisible();
    expect(screen.queryByText("模型未配置")).not.toBeInTheDocument();
    expect(screen.queryByText("助手基础服务暂不可用。")).toBeNull();
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
          initialServiceState={{
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
      "基础服务暂不可用",
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
        "基础服务暂不可用",
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
          version: "2",
          message: "如何开始了解平台？",
          history: [],
          page: null,
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
    expect(screen.getByRole("alert")).toHaveTextContent("请输入问题。");
    expect(
      within(form as HTMLFormElement).getByText("请输入问题。"),
    ).not.toHaveAttribute("role");

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
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.queryByText(/raw internal limiter detail/u)).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps the chip strip in flow and hides it after the first message", async () => {
    vi.mocked(fetch).mockResolvedValue(successfulPlaceholderReply());
    renderWorkspace();
    const strip = screen.getByRole("group", { name: "常用问题" });

    expect(strip.parentElement).toHaveClass(
      "assistant-workspace__conversation",
    );
    fireEvent.click(
      within(strip).getByRole("button", { name: "如何开始了解平台？" }),
    );

    await within(screen.getByTestId("assistant-message-history")).findByText(
      "当前仅提供安全占位答复。",
    );
    expect(screen.queryByRole("group", { name: "常用问题" })).toBeNull();
  });

  it("maps workspace service capabilities to semantic status-light colors", () => {
    const css = readFileSync(
      resolve(
        process.cwd(),
        "src/components/assistant/assistant-workspace.css",
      ),
      "utf8",
    );

    expect(css).toMatch(
      /\.assistant-workspace__service-state > span \{[\s\S]*?background: #b38225;[\s\S]*?rgb\(179 130 37 \/ 15%\);[\s\S]*?\}/u,
    );
    expect(css).toMatch(
      /\[data-capability="available"\] > span \{[\s\S]*?background: #27826b;[\s\S]*?rgb\(39 130 107 \/ 15%\);[\s\S]*?\}/u,
    );
    expect(css).toMatch(
      /\[data-capability="degraded"\] > span \{[\s\S]*?background: #b94b5a;[\s\S]*?rgb\(185 75 90 \/ 15%\);[\s\S]*?\}/u,
    );
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
    expect(css).toMatch(
      /\.assistant-workspace__conversation\s*\{[^}]*display:\s*flex;[^}]*width:\s*min\(100%, 980px\);[^}]*min-height:\s*0;[^}]*min-width:\s*0;[^}]*flex-direction:\s*column;/s,
    );
    expect(css).toMatch(
      /\.assistant-workspace__utility\s*\{[^}]*width:\s*min\(calc\(100% - 40px\), 960px\);[^}]*min-width:\s*0;/s,
    );
    expect(css).toMatch(
      /\.assistant-workspace\s*\{[^}]*height:\s*calc\(100dvh - var\(--assistant-workspace-shell-offset\)\);[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.assistant-workspace__surface\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s,
    );
    expect(css).toMatch(
      /\.assistant-workspace__conversation\s*\{[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.assistant-workspace__conversation\[data-has-messages="false"\]\s*\{[^}]*justify-content:\s*center;/s,
    );
    expect(css).toMatch(
      /\.assistant-workspace__conversation\[data-has-messages="false"\]\s+\.assistant-conversation\s*\{[^}]*flex:\s*0 0 auto;/s,
    );
  });
});
