// @ts-expect-error Vitest provides Node at runtime; the package deliberately omits Node types.
import { readFileSync } from "node:fs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarNavigation } from "../navigation/sidebar-navigation";
import { AdminShell } from "./admin-shell";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function renderWithSidebar() {
  return render(
    <AdminShell
      administratorDisplayName="林管理员"
      breadcrumb={[{ label: "运营后台" }]}
      environmentStatus="开发环境"
      navigation={
        <SidebarNavigation
          activeHref="/admin"
          ariaLabel="后台功能导航"
          brandLabel="CMS 运营后台"
          groups={[
            {
              label: "运营概览",
              items: [{ label: "运营仪表盘", href: "/admin" }],
            },
          ]}
          utilities={[]}
        />
      }
    >
      页面内容
    </AdminShell>,
  );
}

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

    const contentSurface = document.querySelector(".admin-shell__main");
    expect(contentSurface).toBeInstanceOf(HTMLDivElement);
    expect(contentSurface).toHaveAttribute("data-surface", "bright");
    expect(
      within(contentSurface as HTMLElement).getByRole("heading", {
        name: "AI 助理",
      }),
    ).toBeVisible();
  });

  it("keeps a route-provided main as the only main landmark", () => {
    const { container } = render(
      <AdminShell
        administratorDisplayName="周启明"
        breadcrumb={[
          { label: "运营后台", href: "/admin" },
          { label: "AI 助理" },
        ]}
        environmentStatus="私有化测试环境"
        navigation={<nav aria-label="后台功能导航">后台菜单</nav>}
      >
        <main>
          <h1>AI 助理</h1>
        </main>
      </AdminShell>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(container.querySelector(".admin-shell__main")).toContainElement(
      screen.getByRole("main"),
    );
    expect(screen.getByRole("navigation", { name: "面包屑" })).toBeVisible();
    expect(screen.getByText("私有化测试环境")).toBeVisible();
    expect(screen.getByLabelText("当前管理员")).toHaveTextContent("周启明");
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

  it("keeps the shell column synchronized with the sidebar collapse state", () => {
    const { container } = renderWithSidebar();
    const shell = container.querySelector<HTMLElement>(".admin-shell");
    const desktopSidebar = container.querySelector<HTMLElement>(
      ".sidebar-navigation__desktop",
    );

    expect(desktopSidebar).toHaveAttribute("data-collapsed", "false");
    fireEvent.click(screen.getByRole("button", { name: "折叠侧栏" }));
    expect(desktopSidebar).toHaveAttribute("data-collapsed", "true");
    expect(shell).toContainElement(desktopSidebar);

    const css = readFileSync("src/admin-shell/admin-shell.css", "utf8");
    expect(css).toMatch(
      /\.admin-shell\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\);/u,
    );
    expect(css).not.toMatch(
      /\.admin-shell__navigation\s+\.sidebar-navigation__desktop\s*\{[^}]*width:\s*100%;/u,
    );
  });

  it("gives the mobile navigation drawer a complete dark surface contract", () => {
    const { container } = renderWithSidebar();
    fireEvent.click(screen.getByRole("button", { name: "打开后台功能导航" }));

    const navigationRegion = screen.getByRole("complementary", {
      name: "后台导航区",
    });
    const drawer = screen.getByRole("dialog", { name: "后台功能导航" });
    expect(navigationRegion).toContainElement(drawer);
    expect(container.querySelector(".sidebar-navigation__drawer")).toBe(drawer);

    const css = readFileSync("src/admin-shell/admin-shell.css", "utf8");
    expect(css).toMatch(
      /\.admin-shell__navigation\s+\.sidebar-navigation__drawer\s*\{[\s\S]*?color:\s*var\(--color-surface\);[\s\S]*?background:\s*var\(--color-admin-rail\);/u,
    );
    expect(css).toMatch(
      /\.admin-shell__navigation\s+\.sidebar-navigation__drawer\s+\.sidebar-navigation__close\s*\{[\s\S]*?color:\s*var\(--color-surface\);/u,
    );
  });
});
