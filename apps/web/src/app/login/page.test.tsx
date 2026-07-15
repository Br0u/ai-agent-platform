import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/server-actions", () => ({
  customerLoginAction: vi.fn(),
}));

import Page from "./page";

afterEach(cleanup);

describe("customer login page", () => {
  it("uses the shared auth shell with customer context and preserves returnTo", async () => {
    const { container } = render(
      await Page({
        searchParams: Promise.resolve({ returnTo: "/console/licenses" }),
      }),
    );

    expect(screen.getByText("Customer Access")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "登录客户控制台" }),
    ).toBeVisible();
    expect(
      screen.getByText(/管理企业授权、资源、团队与服务记录/),
    ).toBeVisible();
    expect(container.querySelector('input[name="returnTo"]')).toHaveValue(
      "/console/licenses",
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开 AI 助理" }),
    ).not.toBeInTheDocument();
  });
});
