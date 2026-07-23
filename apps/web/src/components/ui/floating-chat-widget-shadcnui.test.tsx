import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import type { AssistantStatusResponse } from "@/features/assistant/assistant-contract";
import {
  AssistantExperienceProvider,
  useAssistantExperience,
} from "../assistant/assistant-experience-provider";
import { FloatingChatWidget } from "./floating-chat-widget-shadcnui";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const successfulReply = {
  version: "1",
  requestId: "request-1",
  mode: "placeholder",
  session: {
    temporary: true,
    expiresAt: "2026-07-13T12:00:00.000Z",
  },
  message: {
    id: "message-1",
    role: "assistant",
    content: "你可以前往客户支持页面提交产品问题和相关信息。",
  },
  suggestedActions: [{ label: "客户支持", href: "/support" }],
};

const serviceStates = {
  available: {
    version: "1",
    requestId: "quick-available",
    live: true,
    ready: true,
    capability: "available",
    message: "AI 助理基础服务已就绪。",
  },
  degraded: {
    version: "1",
    requestId: "quick-degraded",
    live: false,
    ready: false,
    capability: "degraded",
    message: "助手基础服务暂不可用。",
  },
  placeholder: {
    version: "1",
    requestId: "quick-placeholder",
    live: true,
    ready: true,
    capability: "placeholder",
    message: "模型尚未配置，当前为安全占位模式。",
  },
} satisfies Record<string, AssistantStatusResponse>;

function renderQuickWithServiceState(serviceState: AssistantStatusResponse) {
  function StatusHarness() {
    const { adoptServiceState } = useAssistantExperience();
    useEffect(() => {
      adoptServiceState(serviceState);
    }, [adoptServiceState]);
    return <FloatingChatWidget />;
  }

  render(
    <AssistantExperienceProvider pathname="/">
      <StatusHarness />
    </AssistantExperienceProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "打开码多多" }));
}

function openWidget() {
  render(
    <AssistantExperienceProvider pathname="/">
      <FloatingChatWidget />
    </AssistantExperienceProvider>,
  );
  const launcher = screen.getByRole("button", { name: "打开码多多" });
  fireEvent.click(launcher);
  return launcher;
}

beforeEach(() => {
  router.push.mockReset();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1_280,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(
      (query: string): MediaQueryList => ({
        matches: false,
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
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(successfulReply), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FloatingChatWidget", () => {
  it.each([
    [serviceStates.available, "服务已就绪"],
    [serviceStates.placeholder, "模型尚未配置"],
    [serviceStates.degraded, "基础服务暂不可用"],
  ])("shows the shared %s service meaning", (serviceState, expectedLabel) => {
    renderQuickWithServiceState(serviceState);

    expect(
      screen.getByTestId("assistant-quick-service-state"),
    ).toHaveTextContent(expectedLabel);
  });

  it("maps service capabilities to semantic status-light colors", () => {
    const stylesheet = readFileSync(
      "src/components/ui/floating-chat-widget-shadcnui.css",
      "utf8",
    );

    expect(stylesheet).toMatch(
      /\.floating-assistant__identity p > span \{[\s\S]*?background: #b38225;[\s\S]*?rgb\(179 130 37 \/ 15%\);[\s\S]*?\}/u,
    );
    expect(stylesheet).toMatch(
      /p\[data-capability="available"\] > span \{[\s\S]*?background: #27826b;[\s\S]*?rgb\(39 130 107 \/ 15%\);[\s\S]*?\}/u,
    );
    expect(stylesheet).toMatch(
      /p\[data-capability="degraded"\] > span \{[\s\S]*?background: #b94b5a;[\s\S]*?rgb\(185 75 90 \/ 15%\);[\s\S]*?\}/u,
    );
  });

  it("shows the shared refreshing service meaning without starting another status source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    openWidget();

    await waitFor(() =>
      expect(
        screen.getByTestId("assistant-quick-service-state"),
      ).toHaveTextContent("状态刷新中"),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("renders the compact panel only for the quick surface", async () => {
    function SurfaceHarness() {
      const experience = useAssistantExperience();
      return (
        <>
          <button
            onClick={(event) => experience.openDockFrom(event.currentTarget)}
            type="button"
          >
            打开停靠助手
          </button>
          <FloatingChatWidget />
        </>
      );
    }
    render(
      <AssistantExperienceProvider pathname="/">
        <SurfaceHarness />
      </AssistantExperienceProvider>,
    );

    const launcher = screen.getByRole("button", { name: "打开码多多" });
    fireEvent.click(launcher);
    expect(screen.getByRole("dialog", { name: "码多多" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开停靠助手" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "码多多" })).toBeNull(),
    );
  });

  it("opens the preserved Chinese chat content without a model selector", () => {
    openWidget();

    expect(screen.getByRole("dialog", { name: "码多多" })).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "码多多对话" })).toBeInTheDocument();
    expect(
      screen.getByTestId("assistant-quick-service-state"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "你好，我是码多多。已启用的审核 Skill 会按配置加载；知识库和网页正文读取尚未接入。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("如何开始了解平台？")).toBeInTheDocument();
    expect(screen.getByText("如何获取部署支持？")).toBeInTheDocument();
    expect(screen.getByText("如何提交产品问题？")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("GPT-4")).not.toBeInTheDocument();
  });

  it("focuses the quick close control after a direct open", async () => {
    openWidget();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "关闭码多多" })).toHaveFocus(),
    );
  });

  it("routes the quick expansion action to the full-page assistant", () => {
    openWidget();

    expect(
      screen.getByRole("button", { name: "展开码多多工作区" }).parentElement,
    ).toHaveClass("floating-assistant__header-actions");
    fireEvent.click(screen.getByRole("button", { name: "展开码多多工作区" }));
    expect(router.push).toHaveBeenCalledWith("/assistant");
  });

  it("keeps the quick surface as the only side surface", async () => {
    render(
      <AssistantExperienceProvider pathname="/">
        <FloatingChatWidget />
      </AssistantExperienceProvider>,
    );
    await act(async () => Promise.resolve());
    const launcher = screen.getByRole("button", { name: "打开码多多" });
    fireEvent.click(launcher);
    const quickDialog = screen.getByRole("dialog", { name: "码多多" });
    expect(quickDialog).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "码多多工作区" })).toBeNull();
  });

  it("keeps a reopened quick instance isolated from the exiting instance refs", async () => {
    function FocusHarness() {
      const { focusComposer } = useAssistantExperience();
      return (
        <button onClick={focusComposer} type="button">
          聚焦当前助手输入框
        </button>
      );
    }

    render(
      <AssistantExperienceProvider pathname="/">
        <FocusHarness />
        <FloatingChatWidget />
      </AssistantExperienceProvider>,
    );
    await act(async () => Promise.resolve());
    const launcher = screen.getByRole("button", { name: "打开码多多" });
    fireEvent.click(launcher);
    const firstDialog = screen.getByRole("dialog", { name: "码多多" });

    fireEvent.click(launcher);
    fireEvent.click(launcher);

    const secondDialog = screen.getByRole("dialog", { name: "码多多" });
    expect(secondDialog).not.toBe(firstDialog);
    expect(firstDialog).toHaveAttribute("inert");
    expect(secondDialog).not.toHaveAttribute("inert");
    expect(screen.getAllByRole("dialog")).toEqual([secondDialog]);
    const secondComposer = within(secondDialog).getByRole("textbox", {
      name: "向码多多提问",
    });

    await waitFor(() => expect(firstDialog).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "聚焦当前助手输入框" }));
    expect(secondComposer).toHaveFocus();

    fireEvent.click(
      within(secondDialog).getByRole("button", {
        name: "展开码多多工作区",
      }),
    );
    expect(router.push).toHaveBeenCalledWith("/assistant");
  });

  it("sends a preset prompt and renders the returned message and action", async () => {
    openWidget();
    fireEvent.click(screen.getByRole("button", { name: "如何提交产品问题？" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/assistant/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "如何提交产品问题？",
          context: { pathname: "/" },
        }),
      }),
    );
    expect(
      await screen.findByText("你可以前往客户支持页面提交产品问题和相关信息。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "客户支持" })).toHaveAttribute(
      "href",
      "/support",
    );
  });

  it("renders streamed assistant output as Markdown in the quick surface", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              ...successfulReply,
              message: {
                ...successfulReply.message,
                content: "## NPU\n\n**NPU** 是 AI 推理加速器。",
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    openWidget();

    fireEvent.click(screen.getByRole("button", { name: "如何提交产品问题？" }));

    const heading = await screen.findByRole("heading", { name: "NPU" });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText("NPU", { selector: "strong" })).toHaveTextContent(
      "NPU",
    );
  });

  it("sends trimmed free text and clears the input after success", async () => {
    openWidget();
    const input = screen.getByRole("textbox", { name: "向码多多提问" });

    fireEvent.change(input, { target: { value: "  请介绍知识库能力  " } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/v1/assistant/chat",
        expect.objectContaining({
          body: JSON.stringify({
            message: "请介绍知识库能力",
            context: { pathname: "/" },
          }),
        }),
      ),
    );
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("does not steal focus from the composer while the draft changes", () => {
    openWidget();
    const input = screen.getByRole("textbox", { name: "向码多多提问" });

    input.focus();
    fireEvent.change(input, { target: { value: "继续输入" } });

    expect(input).toHaveFocus();
  });

  it("keeps failed input and retries the same request without duplicating it", async () => {
    let chatAttempts = 0;
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (input === "/api/v1/assistant/chat" && init?.method === "POST") {
        chatAttempts += 1;
        return chatAttempts === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve(
              new Response(JSON.stringify(successfulReply), { status: 200 }),
            );
      }
      return Promise.resolve(
        Response.json({
          version: "1",
          requestId: "quick-status",
          live: true,
          ready: true,
          capability: "placeholder",
          message: "模型尚未配置。",
        }),
      );
    });
    openWidget();
    const input = screen.getByRole("textbox", { name: "向码多多提问" });
    fireEvent.change(input, { target: { value: "部署失败怎么办" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(
      await screen.findByText("发送失败，请重试或使用帮助中心或商务咨询。"),
    ).toBeInTheDocument();
    expect(input).toHaveValue("部署失败怎么办");
    expect(screen.getByTestId("assistant-history")).not.toHaveTextContent(
      "部署失败怎么办",
    );

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(chatAttempts).toBe(2));
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/assistant/status",
      expect.objectContaining({ method: "GET" }),
    );
    expect(screen.getAllByText("部署失败怎么办")).toHaveLength(1);
  });

  it("rejects input over 500 Unicode characters before sending", () => {
    openWidget();
    fireEvent.change(screen.getByRole("textbox", { name: "向码多多提问" }), {
      target: { value: "😀".repeat(501) },
    });

    expect(screen.getByText("501 / 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("counts characters after trimming whitespace, matching the API", () => {
    openWidget();
    fireEvent.change(screen.getByRole("textbox", { name: "向码多多提问" }), {
      target: { value: `  ${"你".repeat(500)}  ` },
    });

    expect(screen.getByText("500 / 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
  });

  it("closes on Escape and restores focus to the launcher", async () => {
    const launcher = openWidget();
    const quickDialog = screen.getByRole("dialog", { name: "码多多" });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(quickDialog).toHaveAttribute("inert");
    expect(quickDialog).toHaveAttribute("aria-hidden", "true");
    expect(quickDialog).not.toHaveAttribute("role");
    expect(quickDialog).toHaveClass("is-exiting");
    expect(screen.queryByRole("dialog", { name: "码多多" })).toBeNull();
    await waitFor(() => expect(quickDialog).not.toBeInTheDocument());
    await waitFor(() => expect(launcher).toHaveFocus());
  });

  it("hides the duplicate launcher while the mobile drawer is open", () => {
    const stylesheet = readFileSync(
      "src/components/ui/floating-chat-widget-shadcnui.css",
      "utf8",
    );

    expect(stylesheet).toContain(
      ".floating-assistant__launcher.is-open {\n    display: none;\n  }",
    );
    expect(stylesheet).toMatch(
      /\.floating-assistant__panel\.is-exiting\s*\{[\s\S]*?pointer-events:\s*none;/u,
    );
  });

  it("keeps the composer inside the panel when viewport height compresses the grid", () => {
    const stylesheet = readFileSync(
      "src/components/ui/floating-chat-widget-shadcnui.css",
      "utf8",
    );

    expect(stylesheet).toMatch(
      /\.floating-assistant__panel\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto auto;/u,
    );
    expect(stylesheet).toMatch(
      /\.floating-assistant__panel\s*\{[\s\S]*?height:\s*min\(620px, calc\(100dvh - 104px\)\);/u,
    );
    expect(stylesheet).toMatch(
      /\.floating-assistant__messages\s*\{[\s\S]*?min-height:\s*0;/u,
    );
  });

  it("anchors quick-assistant bubbles by role", () => {
    const stylesheet = readFileSync(
      "src/components/ui/floating-chat-widget-shadcnui.css",
      "utf8",
    );

    expect(stylesheet).toMatch(
      /\.floating-assistant__message\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?align-self:\s*flex-start;/u,
    );
    expect(stylesheet).toMatch(
      /\.floating-assistant__message--user\s*\{[\s\S]*?align-self:\s*flex-end;[\s\S]*?margin-inline-start:\s*auto;/u,
    );
  });

  it("keeps every mobile quick-assistant control at least 44 pixels", () => {
    const stylesheet = readFileSync(
      "src/components/ui/floating-chat-widget-shadcnui.css",
      "utf8",
    );

    expect(stylesheet).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.floating-assistant__panel button,\s*\.floating-assistant__panel a\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/u,
    );
    const composerStylesheet = readFileSync(
      "src/components/assistant/assistant-prompt-input.css",
      "utf8",
    );
    expect(composerStylesheet).toMatch(
      /\.assistant-prompt-input__surface\s*\{[\s\S]*?min-height:\s*70px;/u,
    );
    expect(composerStylesheet).toMatch(
      /\.assistant-prompt-input__submit\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*40px;/u,
    );
  });
});
