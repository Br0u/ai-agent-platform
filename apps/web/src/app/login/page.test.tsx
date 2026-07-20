import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/server-actions", () => ({
  customerLoginAction: vi.fn(),
}));

import Page from "./page";

afterEach(cleanup);

describe("customer login page", () => {
  it("uses the customer login page and preserves returnTo", async () => {
    const { container } = render(
      await Page({
        searchParams: Promise.resolve({ returnTo: "/console/licenses" }),
      }),
    );

    expect(screen.getByText("华鲲元启 · AI Agent Platform")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "登录客户控制台" }),
    ).toBeVisible();
    expect(screen.getByText("使用已注册的客户账号继续访问。")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "手机号登录，即将开放" }),
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: "员工登录" })).toHaveAttribute(
      "href",
      "/staff/login",
    );
    expect(container.querySelector('input[name="returnTo"]')).toHaveValue(
      "/console/licenses",
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开 AI 助理" }),
    ).not.toBeInTheDocument();
  });
});
