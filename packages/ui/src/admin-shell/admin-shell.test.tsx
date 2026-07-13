import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminShell } from "./admin-shell";

afterEach(cleanup);

describe("AdminShell", () => {
  it("separates the dark control rail from a bright content surface", () => {
    render(
      <AdminShell
        administratorDisplayName="林管理员"
        breadcrumb={[
          { label: "运营后台", href: "/admin" },
          { label: "AI 助理" },
        ]}
        environmentStatus="开发环境"
        navigation={<nav aria-label="后台功能导航">后台菜单</nav>}
      >
        <h1>AI 助理</h1>
      </AdminShell>,
    );

    const navigationRegion = screen.getByRole("complementary", {
      name: "后台导航区",
    });
    expect(navigationRegion).toHaveClass("admin-shell__navigation");
    expect(navigationRegion).toHaveAttribute("data-surface", "dark-indigo");
    expect(
      within(navigationRegion).getByRole("navigation", {
        name: "后台功能导航",
      }),
    ).toBeVisible();

    const main = screen.getByRole("main");
    expect(main).toHaveClass("admin-shell__main");
    expect(main).toHaveAttribute("data-surface", "bright");
    expect(
      within(main).getByRole("heading", { name: "AI 助理" }),
    ).toBeVisible();
  });

  it("renders supplied breadcrumb, environment, and administrator identity", () => {
    render(
      <AdminShell
        administratorDisplayName="周启明"
        breadcrumb={[
          { label: "运营后台", href: "/admin" },
          { label: "系统状态" },
        ]}
        environmentStatus="私有化测试环境"
        navigation={<span>导航</span>}
      >
        页面内容
      </AdminShell>,
    );

    const breadcrumb = screen.getByRole("navigation", { name: "面包屑" });
    expect(
      within(breadcrumb).getByRole("link", { name: "运营后台" }),
    ).toHaveAttribute("href", "/admin");
    expect(within(breadcrumb).getByText("系统状态")).toBeVisible();
    expect(screen.getByText("私有化测试环境")).toBeVisible();
    expect(screen.getByText("周启明")).toBeVisible();
    expect(screen.queryByText("管理员用户")).not.toBeInTheDocument();
  });
});
