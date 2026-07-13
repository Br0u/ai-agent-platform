import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthShell } from "./auth-shell";

afterEach(cleanup);

describe("AuthShell", () => {
  it("pairs a brand story with the supplied authentication operation", () => {
    render(
      <AuthShell
        intro="管理企业授权、资源、团队与服务记录。"
        realmLabel="Customer Workspace"
        storyDescription="一套面向企业部署、开发与运营的 AI 工作空间。"
        storyTitle="进入企业 AI 工作空间。"
        title="登录客户控制台"
      >
        <form aria-label="客户登录表单">
          <button type="submit">安全登录</button>
        </form>
      </AuthShell>,
    );

    const story = screen.getByRole("region", {
      name: "进入企业 AI 工作空间。",
    });
    expect(within(story).getByText("AI Agent Platform")).toBeVisible();
    expect(
      within(story).getByText("一套面向企业部署、开发与运营的 AI 工作空间。"),
    ).toBeVisible();

    const operation = screen.getByRole("main");
    expect(within(operation).getByText("Customer Workspace")).toBeVisible();
    expect(
      within(operation).getByRole("heading", { name: "登录客户控制台" }),
    ).toBeVisible();
    expect(
      within(operation).getByRole("form", { name: "客户登录表单" }),
    ).toBeVisible();
  });

  it("does not import public portal chrome into secure authentication flows", () => {
    render(
      <AuthShell
        intro="完成安全验证。"
        realmLabel="Workforce Security"
        storyDescription="统一的企业身份与安全上下文。"
        storyTitle="安全进入工作空间。"
        title="双因素认证"
      >
        <p>验证操作</p>
      </AuthShell>,
    );

    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "主导航" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("验证操作")).toBeVisible();
  });
});
