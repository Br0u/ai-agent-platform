import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("TrialExperience", () => {
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
});
