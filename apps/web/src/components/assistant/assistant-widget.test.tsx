import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssistantWidget } from "./assistant-widget";
import { useAssistantSession } from "./use-assistant-session";

function Harness() {
  return <AssistantWidget session={useAssistantSession("/pricing")} />;
}

const answer = (
  message: string,
  suggestedActions: { label: string; href: string }[] = [],
) =>
  new Response(
    JSON.stringify({ mode: "placeholder", message, suggestedActions }),
  );

describe("AssistantWidget", () => {
  beforeEach(() =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(answer("最新回答"))),
  );
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens from an image launcher and moves focus into the dialog", () => {
    render(<Harness />);
    const launcher = screen.getByRole("button", { name: "打开 M 助手" });
    expect(launcher).toBeVisible();
    const image = launcher.querySelector("img");
    expect(image).toHaveAttribute("alt", "");
    expect(image?.getAttribute("src")).toContain("m-assistant.webp");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(launcher);
    expect(screen.getByRole("dialog", { name: "M 助手" })).toBeVisible();
    expect(screen.getByText("AI 服务尚未接入")).toBeVisible();
    expect(screen.getByRole("link", { name: "帮助中心" })).toHaveAttribute(
      "href",
      "/help",
    );
    expect(screen.getByRole("link", { name: "商务咨询" })).toHaveAttribute(
      "href",
      "/contact",
    );
    expect(
      screen.getByRole("textbox", { name: "向 M 助手提问" }),
    ).toHaveFocus();
  });

  it("ignores blank input and trims free input before submitting", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    const input = screen.getByRole("textbox", { name: "向 M 助手提问" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "  自由问题  " } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      message: "自由问题",
    });
  });

  it("closes on Escape and returns focus to the launcher", () => {
    render(<Harness />);
    const launcher = screen.getByRole("button", { name: "打开 M 助手" });
    fireEvent.click(launcher);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
  });

  it("offers exactly the three presets and submits a preset", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    for (const question of [
      "如何开始了解平台？",
      "如何获取部署支持？",
      "如何提交产品问题？",
    ]) {
      expect(screen.getByRole("button", { name: question })).toBeVisible();
    }
    fireEvent.click(screen.getByRole("button", { name: "如何获取部署支持？" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      message: "如何获取部署支持？",
    });
  });

  it("renders safe response actions as client links and keeps permanent fallbacks", async () => {
    vi.mocked(fetch).mockResolvedValue(
      answer("快速开始回答", [
        { label: "查看快速开始", href: "/docs#quick-start" },
        { label: "不安全入口", href: "//evil.example" },
      ]),
    );
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    fireEvent.click(screen.getByRole("button", { name: "如何开始了解平台？" }));

    const action = await screen.findByRole("link", { name: "查看快速开始" });
    expect(action).toHaveAttribute("href", "/docs#quick-start");
    expect(screen.queryByRole("link", { name: "不安全入口" })).toBeNull();
    expect(screen.getByRole("link", { name: "帮助中心" })).toHaveAttribute(
      "href",
      "/help",
    );
    expect(screen.getByRole("link", { name: "商务咨询" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  it("uses a code-point-aware 500-character input contract", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    const input = screen.getByRole("textbox", { name: "向 M 助手提问" });
    const helper = screen.getByText("最多输入 500 个字符。");
    const send = screen.getByRole("button", { name: "发送" });

    expect(input).not.toHaveAttribute("maxlength");
    expect(input).toHaveAttribute("aria-describedby", helper.id);
    fireEvent.change(input, {
      target: { value: `  ${"😀".repeat(500)}  ` },
    });
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)).message,
    ).toBe("😀".repeat(500));

    fireEvent.change(input, {
      target: { value: `  ${"😀".repeat(501)}  ` },
    });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("问题不能超过 500 个字符。")).toBeVisible();
    expect(send).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("submits free input, disables controls while sending, and announces only the newest answer", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((done) => (resolve = done)));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    const input = screen.getByRole("textbox", { name: "向 M 助手提问" });
    fireEvent.change(input, { target: { value: "自由问题" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
    await act(async () => resolve(answer("唯一的新回答")));

    const history = screen.getByTestId("assistant-history");
    expect(history).not.toHaveAttribute("aria-live");
    expect(history).toHaveTextContent("自由问题");
    expect(history).toHaveTextContent("唯一的新回答");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent("唯一的新回答");
  });

  it("shows failure fallback links, no false answer, and retries once", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(answer("重试回答"));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "打开 M 助手" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "失败问题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "重试" })).toBeVisible(),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "发送失败，请重试或使用帮助中心或商务咨询。",
    );
    expect(screen.getByRole("link", { name: "帮助中心" })).toHaveAttribute(
      "href",
      "/help",
    );
    expect(screen.getByRole("link", { name: "商务咨询" })).toHaveAttribute(
      "href",
      "/contact",
    );
    expect(screen.getByTestId("assistant-history")).not.toHaveTextContent(
      "重试回答",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() =>
      expect(screen.getByTestId("assistant-history")).toHaveTextContent(
        "重试回答",
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("失败问题")).toHaveLength(1);
  });
});
