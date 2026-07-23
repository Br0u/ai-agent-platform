import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantSession } from "./use-assistant-session";
import { AssistantConversation } from "./assistant-conversation";

function createSession(
  overrides: Partial<AssistantSession> = {},
): AssistantSession {
  return {
    draft: "",
    messages: [],
    latestAnnouncement: "",
    requestStatus: "idle",
    lastFailedMessage: null,
    validationError: null,
    sessionExpiresAt: null,
    setDraft: vi.fn(),
    submit: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderConversation(
  session: AssistantSession,
  options: {
    ariaLabel?: string;
    registerComposer?: (element: HTMLElement) => () => void;
    variant?: "dock" | "workspace";
  } = {},
) {
  return render(
    <AssistantConversation
      ariaLabel={options.ariaLabel ?? "码多多对话"}
      registerComposer={options.registerComposer ?? (() => () => undefined)}
      session={session}
      variant={options.variant ?? "dock"}
    />,
  );
}

afterEach(cleanup);

describe("AssistantConversation", () => {
  it("labels a retained partial answer as incomplete", () => {
    const session = createSession({
      messages: [
        {
          id: 1,
          role: "assistant",
          content: "已收到的部分内容",
          suggestedActions: [],
          incomplete: true,
        },
      ],
      requestStatus: "failed",
      latestAnnouncement: "发送失败，请重试。",
    });

    render(
      <AssistantConversation
        ariaLabel="测试助手"
        registerComposer={() => () => undefined}
        session={session}
        variant="workspace"
      />,
    );

    expect(screen.getByText("已收到的部分内容")).toBeInTheDocument();
    expect(screen.getByText("回答未完成")).toBeInTheDocument();
  });
  it("renders an accessible message log with user and assistant messages", () => {
    const session = createSession({
      messages: [
        { id: 1, role: "user", content: "如何部署？" },
        {
          id: 2,
          role: "assistant",
          content: "请先查看部署指南。",
          suggestedActions: [{ label: "部署指南", href: "/docs/deployment" }],
        },
      ],
    });

    renderConversation(session, { variant: "workspace" });

    const log = screen.getByRole("log", { name: "码多多对话" });
    expect(log).toHaveAttribute("data-testid", "assistant-message-history");
    expect(log).toHaveAttribute("aria-live", "off");
    expect(
      within(log).getByRole("article", { name: "你的消息" }),
    ).toHaveTextContent("如何部署？");
    expect(
      within(log).getByRole("article", { name: "码多多的消息" }),
    ).toHaveTextContent("请先查看部署指南。");
    expect(
      within(log).getByRole("navigation", { name: "建议操作" }),
    ).toContainElement(within(log).getByRole("link", { name: "部署指南" }));
    expect(screen.getByTestId("assistant-conversation")).toHaveAttribute(
      "data-variant",
      "workspace",
    );
  });

  it("renders assistant replies as safe GFM Markdown while keeping user input literal", () => {
    const session = createSession({
      messages: [
        { id: 1, role: "user", content: "**这不是粗体**" },
        {
          id: 2,
          role: "assistant",
          content:
            "## 什么是 NPU？\n\n**NPU** 是 AI 加速器。\n\n| 项目 | 说明 |\n| --- | --- |\n| 用途 | 推理 |\n\n[查看资料](https://example.com/docs) [不安全链接](javascript:alert(1))\n\n<img src=x onerror=alert(1)><script>alert(1)</script>",
          suggestedActions: [],
        },
      ],
    });

    renderConversation(session, { variant: "workspace" });

    const log = screen.getByRole("log", { name: "码多多对话" });
    const userMessage = within(log).getByRole("article", { name: "你的消息" });
    const assistantMessage = within(log).getByRole("article", {
      name: "码多多的消息",
    });

    expect(
      within(assistantMessage).getByRole("heading", { name: "什么是 NPU？" }),
    ).toBeInTheDocument();
    expect(within(assistantMessage).getByText("NPU")).toHaveProperty(
      "tagName",
      "STRONG",
    );
    expect(within(assistantMessage).getByRole("table")).toBeInTheDocument();
    const referenceLink = within(assistantMessage).getByRole("link", {
      name: "查看资料",
    });
    expect(referenceLink).toHaveAttribute("href", "https://example.com/docs");
    expect(referenceLink).toHaveAttribute("target", "_blank");
    expect(referenceLink).toHaveAttribute("rel", "noreferrer noopener");
    expect(
      within(assistantMessage).queryByRole("link", { name: "不安全链接" }),
    ).toBeNull();
    expect(assistantMessage.querySelector("img")).toBeNull();
    expect(assistantMessage.querySelector("script")).toBeNull();
    expect(userMessage.querySelector("strong")).toBeNull();
    expect(userMessage).toHaveTextContent("**这不是粗体**");
  });

  it("updates the shared draft and submits from the form", () => {
    const session = createSession({ draft: "部署需要什么？" });
    renderConversation(session);
    const composer = screen.getByRole("textbox", { name: "输入问题" });

    fireEvent.change(composer, { target: { value: "新的问题" } });
    fireEvent.submit(composer.closest("form") as HTMLFormElement);

    expect(session.setDraft).toHaveBeenCalledExactlyOnceWith("新的问题");
    expect(session.submit).toHaveBeenCalledOnce();
  });

  it("submits with Enter while preserving Shift+Enter and composing input", () => {
    const session = createSession({ draft: "第一行\n第二行" });
    renderConversation(session);
    const composer = screen.getByRole("textbox", { name: "输入问题" });

    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    fireEvent(
      composer,
      new KeyboardEvent("keydown", {
        bubbles: true,
        isComposing: true,
        key: "Enter",
      }),
    );
    expect(session.submit).not.toHaveBeenCalled();
    expect(composer).toHaveValue("第一行\n第二行");

    fireEvent.keyDown(composer, { key: "Enter" });
    expect(session.submit).toHaveBeenCalledOnce();
  });

  it("does not submit Safari IME Enter events reported with keyCode 229", () => {
    const session = createSession({ draft: "正在输入中文" });
    renderConversation(session);
    const composer = screen.getByRole("textbox", { name: "输入问题" });

    fireEvent.keyDown(composer, {
      key: "Enter",
      keyCode: 229,
      which: 229,
    });

    expect(session.submit).not.toHaveBeenCalled();
  });

  it("exposes the 500-character validation beside the composer", () => {
    const session = createSession({
      draft: "𠮷".repeat(501),
      validationError: {
        code: "too_long",
        message: "问题不能超过 500 个字符。",
      },
    });
    renderConversation(session);

    const composer = screen.getByRole("textbox", { name: "输入问题" });
    const form = composer.closest("form") as HTMLFormElement;
    const visibleError = within(form).getByText("问题不能超过 500 个字符。");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("问题不能超过 500 个字符。");
    expect(visibleError).not.toHaveAttribute("aria-live");
    expect(visibleError).not.toHaveAttribute("role");
    expect(composer).toHaveAttribute("aria-describedby", visibleError.id);
    expect(composer).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
  });

  it("reflects sending state and offers an explicit retry after failure", () => {
    const sending = createSession({
      draft: "正在发送",
      requestStatus: "sending",
    });
    const view = renderConversation(sending);

    expect(screen.getByRole("textbox", { name: "输入问题" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();

    const failedSession = createSession({
      draft: "失败的问题",
      latestAnnouncement: "请求过于频繁，请稍后再试。",
      requestStatus: "failed",
    });
    view.rerender(
      <AssistantConversation
        ariaLabel="码多多对话"
        registerComposer={() => () => undefined}
        session={failedSession}
        variant="dock"
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("请求过于频繁，请稍后再试。");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(failedSession.retry).toHaveBeenCalledOnce();
    expect(screen.getByTestId("assistant-conversation")).toHaveAttribute(
      "data-variant",
      "dock",
    );
  });

  it("uses one live region for request feedback instead of repeating a failure", () => {
    renderConversation(
      createSession({
        latestAnnouncement: "发送失败，请重试或使用帮助中心或商务咨询。",
        requestStatus: "failed",
      }),
    );

    const log = screen.getByRole("log", { name: "码多多对话" });
    const alert = screen.getByRole("alert");
    const feedback = within(
      screen
        .getByRole("textbox", { name: "输入问题" })
        .closest("form") as HTMLFormElement,
    ).getByText("发送失败，请重试或使用帮助中心或商务咨询。");

    expect(log).toHaveAttribute("aria-live", "off");
    expect(alert).toHaveTextContent(
      "发送失败，请重试或使用帮助中心或商务咨询。",
    );
    expect(feedback).not.toHaveAttribute("aria-live");
    expect(feedback).not.toHaveAttribute("role");
    expect(screen.queryAllByRole("alert")).toHaveLength(1);
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("renders duplicate suggested actions without duplicate React keys", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    renderConversation(
      createSession({
        messages: [
          {
            id: 1,
            role: "assistant",
            content: "可继续查看部署指南。",
            suggestedActions: [
              { label: "部署指南", href: "/docs/deployment" },
              { label: "部署指南", href: "/docs/deployment" },
            ],
          },
        ],
      }),
    );

    expect(screen.getAllByRole("link", { name: "部署指南" })).toHaveLength(2);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("registers the mounted composer and disposes that registration on unmount", () => {
    const dispose = vi.fn();
    const registerComposer = vi.fn(() => dispose);
    const view = renderConversation(createSession(), { registerComposer });
    const composer = screen.getByRole("textbox", { name: "输入问题" });

    expect(registerComposer).toHaveBeenCalledExactlyOnceWith(composer);
    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("uses explicit dock and workspace layout variants", () => {
    const css = readFileSync(
      resolve(
        process.cwd(),
        "src/components/assistant/assistant-conversation.css",
      ),
      "utf8",
    );

    expect(css).toMatch(
      /\.assistant-conversation\[data-variant="workspace"\][^{]*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;/s,
    );
    expect(css).toMatch(
      /\.assistant-conversation\[data-variant="dock"\][^{]*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;/s,
    );
  });

  it("anchors assistant bubbles left and user bubbles right", () => {
    const css = readFileSync(
      resolve(
        process.cwd(),
        "src/components/assistant/assistant-conversation.css",
      ),
      "utf8",
    );

    expect(css).toMatch(
      /\.assistant-conversation__message\s*\{[\s\S]*?width:\s*fit-content;[\s\S]*?justify-self:\s*start;/u,
    );
    expect(css).toMatch(
      /\.assistant-conversation__message--user\s*\{[\s\S]*?justify-self:\s*end;[\s\S]*?margin-inline-start:\s*auto;/u,
    );
  });
});
