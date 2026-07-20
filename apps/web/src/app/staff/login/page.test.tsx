import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/server-actions", () => ({ staffLoginAction: vi.fn() }));

import Page from "./page";

afterEach(cleanup);

describe("staff login page", () => {
  it("uses the staff login page and preserves returnTo", async () => {
    const { container } = render(
      await Page({ searchParams: Promise.resolve({ returnTo: "/admin" }) }),
    );

    expect(screen.getByText("华鲲元启 · 运营工作台")).toBeVisible();
    expect(screen.getByRole("heading", { name: "登录运营后台" })).toBeVisible();
    expect(screen.getByText("使用企业管理员分配的内部账号。")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "企业 SSO 登录，即将开放" }),
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: "返回客户登录" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(container.querySelector('input[name="returnTo"]')).toHaveValue(
      "/admin",
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
