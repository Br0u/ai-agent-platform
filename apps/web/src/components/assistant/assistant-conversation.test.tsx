import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
      ariaLabel={options.ariaLabel ?? "AI 助理对话"}
      registerComposer={options.registerComposer ?? (() => () => undefined)}
      session={session}
      variant={options.variant ?? "dock"}
    />,
  );
}

afterEach(cleanup);

describe("AssistantConversation", () => {
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

    const log = screen.getByRole("log", { name: "AI 助理对话" });
    expect(log).toHaveAttribute("data-testid", "assistant-message-history");
    expect(
      within(log).getByRole("article", { name: "你的消息" }),
    ).toHaveTextContent("如何部署？");
    expect(
      within(log).getByRole("article", { name: "M 企业助理的消息" }),
    ).toHaveTextContent("请先查看部署指南。");
    expect(
      within(log).getByRole("navigation", { name: "建议操作" }),
    ).toContainElement(within(log).getByRole("link", { name: "部署指南" }));
    expect(screen.getByTestId("assistant-conversation")).toHaveAttribute(
      "data-variant",
      "workspace",
    );
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
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("问题不能超过 500 个字符。");
    expect(composer).toHaveAttribute("aria-describedby", alert.id);
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
        ariaLabel="AI 助理对话"
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

  it("registers the mounted composer and disposes that registration on unmount", () => {
    const dispose = vi.fn();
    const registerComposer = vi.fn(() => dispose);
    const view = renderConversation(createSession(), { registerComposer });
    const composer = screen.getByRole("textbox", { name: "输入问题" });

    expect(registerComposer).toHaveBeenCalledExactlyOnceWith(composer);
    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
