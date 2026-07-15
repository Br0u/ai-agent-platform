import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AuthPage } from "./auth-page";

afterEach(cleanup);

describe("AuthPage", () => {
  it("adapts the shared enterprise AuthShell without portal chrome", () => {
    render(
      <AuthPage
        intro="完成身份验证后继续。"
        realmLabel="Security Check"
        title="验证身份"
      >
        <form aria-label="测试认证表单" />
      </AuthPage>,
    );

    expect(screen.getByText("AI Agent Platform")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "让每次访问都遵循企业安全边界" }),
    ).toBeVisible();
    expect(screen.getByText("Security Check")).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "验证身份" }),
    ).toBeVisible();
    expect(screen.getByText("完成身份验证后继续。")).toBeVisible();
    expect(screen.getByRole("form", { name: "测试认证表单" })).toBeVisible();

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开 AI 助理" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistant-launcher")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assistant-history")).not.toBeInTheDocument();
  });
});
