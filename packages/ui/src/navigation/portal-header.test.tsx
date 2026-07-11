import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PortalHeader } from "./portal-header";
import type { PortalNavigationItem } from "./navigation-types";

const items: PortalNavigationItem[] = [
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
  {
    label: "文档",
    href: "/docs",
    children: [
      {
        label: "开始使用",
        items: [{ label: "快速开始", href: "/docs#quick-start" }],
      },
    ],
  },
];

afterEach(cleanup);

describe("PortalHeader", () => {
  it("renders the product wordmark and login action", () => {
    render(<PortalHeader activeHref="/" items={items} />);

    const brand = screen.getByRole("link", {
      name: "AI Agent Platform 首页",
    });
    expect(within(brand).getByText("AI Agent Platform")).toBeVisible();
    expect(within(brand).getByText("Build Enterprise AI Faster")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "登录 / 进入平台" }),
    ).toHaveAttribute("href", "/login");
  });

  it("composes the desktop mega menu and mobile navigation trigger", () => {
    render(<PortalHeader activeHref="/docs" items={items} />);

    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(
      within(navigation).getByRole("button", { name: /产品/ }),
    ).toBeVisible();
    expect(
      within(navigation).getByRole("button", { name: /文档/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "打开导航" })).toBeVisible();
  });
});
