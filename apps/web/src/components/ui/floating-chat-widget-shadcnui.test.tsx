import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingChatWidget } from "./floating-chat-widget-shadcnui";

const successfulReply = {
  mode: "placeholder",
  message: "你可以前往客户支持页面提交产品问题和相关信息。",
  suggestedActions: [{ label: "客户支持", href: "/support" }],
};

function openWidget() {
  render(<FloatingChatWidget pathname="/" />);
  const launcher = screen.getByRole("button", { name: "打开 M 助手" });
  fireEvent.click(launcher);
  return launcher;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
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
  it("opens the preserved Chinese chat content without a model selector", () => {
    openWidget();

    expect(screen.getByRole("dialog", { name: "M 助手" })).toBeInTheDocument();
    expect(screen.getByText("AI 服务尚未接入")).toBeInTheDocument();
    expect(screen.getByText("如何开始了解平台？")).toBeInTheDocument();
    expect(screen.getByText("如何获取部署支持？")).toBeInTheDocument();
    expect(screen.getByText("如何提交产品问题？")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("GPT-4")).not.toBeInTheDocument();
  });

  it("sends a preset prompt and renders the returned message and action", async () => {
    openWidget();
    fireEvent.click(screen.getByRole("button", { name: "如何提交产品问题？" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith("/api/v1/assistant/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "如何提交产品问题？",
        context: { pathname: "/" },
      }),
    });
    expect(
      await screen.findByText("你可以前往客户支持页面提交产品问题和相关信息。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "客户支持" })).toHaveAttribute(
      "href",
      "/support",
    );
  });

  it("sends trimmed free text and clears the input after success", async () => {
    openWidget();
    const input = screen.getByRole("textbox", { name: "向 M 助手提问" });

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

  it("keeps failed input and retries the same request without duplicating it", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successfulReply), { status: 200 }),
      );
    openWidget();
    const input = screen.getByRole("textbox", { name: "向 M 助手提问" });
    fireEvent.change(input, { target: { value: "部署失败怎么办" } });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    expect(
      await screen.findByText("消息发送失败，请重试。"),
    ).toBeInTheDocument();
    expect(input).toHaveValue("部署失败怎么办");
    expect(screen.getAllByText("部署失败怎么办")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("部署失败怎么办")).toHaveLength(1);
  });

  it("rejects input over 500 Unicode characters before sending", () => {
    openWidget();
    fireEvent.change(screen.getByRole("textbox", { name: "向 M 助手提问" }), {
      target: { value: "😀".repeat(501) },
    });

    expect(screen.getByText("501 / 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("counts characters after trimming whitespace, matching the API", () => {
    openWidget();
    fireEvent.change(screen.getByRole("textbox", { name: "向 M 助手提问" }), {
      target: { value: `  ${"你".repeat(500)}  ` },
    });

    expect(screen.getByText("500 / 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送消息" })).toBeEnabled();
  });

  it("closes on Escape and restores focus to the launcher", async () => {
    const launcher = openWidget();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "M 助手" }),
      ).not.toBeInTheDocument(),
    );
    expect(launcher).toHaveFocus();
  });

  it("hides the duplicate launcher while the mobile drawer is open", () => {
    const stylesheet = readFileSync(
      "src/components/ui/floating-chat-widget-shadcnui.css",
      "utf8",
    );

    expect(stylesheet).toContain(
      ".floating-assistant__launcher.is-open {\n    display: none;\n  }",
    );
  });
});
