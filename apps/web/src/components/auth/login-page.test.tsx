import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LoginPage } from "./login-page";

afterEach(cleanup);

describe("LoginPage", () => {
  it("renders customer login guidance and disabled future methods", () => {
    render(
      <LoginPage
        intro="使用企业账号继续。"
        title="客户账号登录"
        variant="customer"
      >
        <form aria-label="客户登录表单" />
      </LoginPage>,
    );

    expect(screen.getByText("华鲲元启 · AI Agent Platform")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "欢迎登录" }),
    ).toBeVisible();
    expect(screen.getByText("账号登录")).toHaveAttribute(
      "aria-current",
      "true",
    );

    const qrPlaceholder = screen.getByLabelText("扫码登录即将开放");
    expect(qrPlaceholder).toBeVisible();
    expect(within(qrPlaceholder).getByText("扫码登录")).toBeVisible();
    expect(within(qrPlaceholder).getByText("即将开放")).toBeVisible();

    for (const method of ["手机号", "扫码", "支付宝", "微信", "钉钉"]) {
      const button = screen.getByRole("button", {
        name: `${method}登录，即将开放`,
      });

      expect(button).toBeDisabled();
      expect(within(button).getByText(method)).toBeVisible();
      expect(within(button).getByText("即将开放")).toBeVisible();
    }

    expect(screen.getByRole("link", { name: "员工登录" })).toHaveAttribute(
      "href",
      "/staff/login",
    );
    expect(screen.getByRole("form", { name: "客户登录表单" })).toBeVisible();
  });

  it("renders staff security guidance and workforce-only future methods", () => {
    render(
      <LoginPage
        intro="使用内部账号继续。"
        title="员工账号登录"
        variant="staff"
      >
        <form aria-label="员工登录表单" />
      </LoginPage>,
    );

    const aside = screen.getByRole("complementary", {
      name: "员工安全登录说明",
    });
    expect(within(aside).getByText("分域访问")).toBeVisible();
    expect(within(aside).getByText("风险控制")).toBeVisible();
    expect(screen.queryByText("支付宝")).not.toBeInTheDocument();

    for (const { accessibleName, method } of [
      {
        accessibleName: "动态口令登录，即将开放",
        method: "动态口令",
      },
      {
        accessibleName: "企业 SSO 登录，即将开放",
        method: "企业 SSO",
      },
    ]) {
      const button = screen.getByRole("button", {
        name: accessibleName,
      });

      expect(button).toBeDisabled();
      expect(within(button).getByText(method)).toBeVisible();
      expect(within(button).getByText("即将开放")).toBeVisible();
    }

    expect(screen.getByRole("link", { name: "返回客户登录" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("form", { name: "员工登录表单" })).toBeVisible();
  });
});
