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
import { TrialExperience } from "./trial-experience";

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "立即填写申请" }));
  return screen.getByRole("dialog", { name: "开启企业 AI 落地体验" });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("TrialExperience", () => {
  it("接线立即填写和带咨询主题的联系我们入口", () => {
    render(<TrialExperience />);

    expect(screen.getByRole("button", { name: "立即填写申请" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "联系我们" })).toHaveAttribute(
      "href",
      "/contact?topic=体验申请咨询",
    );
    expect(screen.getByRole("button", { name: "填写申请信息" })).toBeEnabled();
  });

  it("打开原型弹层并按顺序校验姓名和联系方式", () => {
    render(<TrialExperience />);
    const dialog = openDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "提交申请" }));
    expect(screen.getByRole("status")).toHaveTextContent("请填写姓名");

    fill("姓名", "测试用户");
    fill("联系方式（手机号或邮箱）", "invalid");
    fireEvent.click(within(dialog).getByRole("button", { name: "提交申请" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "请填写正确的手机号或邮箱",
    );
  });

  it("生成六位演示码并拒绝错误验证码", () => {
    render(<TrialExperience />);
    const dialog = openDialog();
    fill("姓名", "测试用户");
    fill("所属公司", "测试公司");
    fill("联系方式（手机号或邮箱）", "test@example.com");

    fireEvent.click(within(dialog).getByRole("button", { name: "获取验证码" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "验证码已发送：100000（演示，正式版短信/邮件发送）",
    );

    fill("验证码", "999999");
    fireEvent.click(within(dialog).getByRole("button", { name: "提交申请" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "验证码不正确，请重新获取",
    );
  });

  it("发送验证码后执行六十秒倒计时并清理计时器", () => {
    vi.useFakeTimers();
    const { unmount } = render(<TrialExperience />);
    const dialog = openDialog();
    fill("联系方式（手机号或邮箱）", "test@example.com");

    const send = within(dialog).getByRole("button", { name: "获取验证码" });
    fireEvent.click(send);
    expect(send).toBeDisabled();
    expect(send).toHaveTextContent("60s 后重发");
    expect(within(dialog).getByLabelText("验证码")).toHaveAttribute(
      "inputmode",
      "numeric",
    );
    expect(within(dialog).getByLabelText("验证码")).toHaveAttribute(
      "maxlength",
      "6",
    );

    act(() => vi.advanceTimersByTime(1_000));
    expect(send).toHaveTextContent("59s 后重发");
    act(() => vi.advanceTimersByTime(59_000));
    expect(send).toBeEnabled();
    expect(send).toHaveTextContent("获取验证码");

    fireEvent.click(send);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("校验所属公司后显示原型成功态", () => {
    render(<TrialExperience />);
    const dialog = openDialog();
    fill("姓名", "测试用户");
    fill("联系方式（手机号或邮箱）", "13800138000");
    fireEvent.click(within(dialog).getByRole("button", { name: "获取验证码" }));
    fill("验证码", "100000");
    fireEvent.click(within(dialog).getByRole("button", { name: "提交申请" }));
    expect(screen.getByRole("status")).toHaveTextContent("请填写所属公司");

    fill("所属公司", "测试公司");
    fireEvent.click(within(dialog).getByRole("button", { name: "提交申请" }));
    expect(
      screen.getByRole("heading", { level: 2, name: "提交成功" }),
    ).toBeVisible();
    expect(
      screen.getByText("感谢您的申请，我们的产品顾问将在 24 小时内与您联系。"),
    ).toBeVisible();
  });

  it("关闭后重开会清空表单、演示码和成功态", () => {
    render(<TrialExperience />);
    let dialog = openDialog();
    fill("姓名", "测试用户");
    fill("所属公司", "测试公司");
    fill("联系方式（手机号或邮箱）", "test@example.com");
    fireEvent.click(within(dialog).getByRole("button", { name: "获取验证码" }));
    fill("验证码", "100000");
    fireEvent.click(within(dialog).getByRole("button", { name: "提交申请" }));
    fireEvent.click(screen.getByRole("button", { name: "完成" }));

    fireEvent.click(screen.getByRole("button", { name: "填写申请信息" }));
    dialog = screen.getByRole("dialog", {
      name: "开启企业 AI 落地体验",
    });
    expect(within(dialog).getByLabelText("姓名")).toHaveValue("");
    expect(screen.queryByText("提交成功")).toBeNull();
    expect(screen.queryByText(/100000/)).toBeNull();
  });

  it("弹层隔离背景、约束焦点并在 Escape 后回到触发按钮", async () => {
    const { container } = render(<TrialExperience />);
    const trigger = screen.getByRole("button", { name: "立即填写申请" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", {
      name: "开启企业 AI 落地体验",
    });
    const close = within(dialog).getByRole("button", { name: "关闭申请弹层" });
    const cancel = within(dialog).getByRole("button", { name: "取消" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(container.querySelector(".trial-content")).toHaveAttribute("inert");

    cancel.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector(".trial-content")).not.toHaveAttribute(
      "inert",
    );
  });

  it("点击背景关闭并阻止焦点离开活动弹层", async () => {
    const { container } = render(
      <>
        <button type="button">外部按钮</button>
        <TrialExperience />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "立即填写申请" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "开启企业 AI 落地体验",
    });
    const close = within(dialog).getByRole("button", { name: "关闭申请弹层" });

    screen.getByRole("button", { name: "外部按钮" }).focus();
    expect(document.activeElement).toBe(close);

    fireEvent.click(container.querySelector(".trial-dialog-backdrop")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("让活动弹层脱离路由动画层并覆盖完整视口", () => {
    const css = readFileSync("src/app/trial/trial.css", "utf8");

    expect(css).toMatch(
      /\.site-route-transition:has\(\.trial-dialog\)[^{]*\{[^}]*z-index:\s*120;[^}]*animation:\s*none;[^}]*transform:\s*none;[^}]*will-change:\s*auto;/su,
    );
    expect(css).toMatch(
      /\.trial-dialog-backdrop\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/su,
    );
  });
});
