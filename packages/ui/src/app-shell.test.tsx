import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";
import type {
  NavigationSection,
  PortalNavigationItem,
  SidebarNavigationConfig,
} from "./navigation/navigation-types";

const portalNavigation: PortalNavigationItem[] = [
  {
    label: "产品",
    href: "/product",
    children: [
      {
        label: "产品中心",
        items: [{ label: "产品介绍", href: "/product#overview" }],
      },
    ],
  },
];

const consoleNavigation: SidebarNavigationConfig = {
  groups: [{ label: "工作台", items: [{ label: "首页", href: "/console" }] }],
  utilities: [],
};

const adminNavigation: SidebarNavigationConfig = {
  groups: [{ label: "运营", items: [{ label: "首页", href: "/admin" }] }],
  utilities: [],
};

const footerNavigation: NavigationSection[] = [
  { label: "产品与版本", items: [{ label: "产品", href: "/product" }] },
];

function renderShell(variant: "portal" | "console" | "admin") {
  return render(
    <AppShell
      activeHref="/"
      adminNavigation={adminNavigation}
      consoleNavigation={consoleNavigation}
      footerNavigation={footerNavigation}
      portalNavigation={portalNavigation}
      variant={variant}
    >
      <p>页面内容</p>
    </AppShell>,
  );
}

afterEach(cleanup);

describe("AppShell", () => {
  it("wraps portal content with the public header and footer", () => {
    const { container } = renderShell("portal");

    expect(container.firstChild).toHaveAttribute(
      "data-shell-variant",
      "portal",
    );
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", {
        name: "产品",
      }),
    ).toHaveAttribute("href", "/product");
    expect(screen.getByText("页面内容")).toBeVisible();
  });

  it.each(["console", "admin"] as const)(
    "keeps the %s workspace free of public navigation and footer",
    (variant) => {
      const { container } = renderShell(variant);

      expect(container.firstChild).toHaveAttribute(
        "data-shell-variant",
        variant,
      );
      expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
      expect(screen.queryByRole("contentinfo")).toBeNull();
      expect(screen.getByText("页面内容")).toBeVisible();
    },
  );
});
