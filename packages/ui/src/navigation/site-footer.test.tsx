import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";
import type { NavigationSection } from "./navigation-types";

const groups: NavigationSection[] = [
  {
    label: "产品与版本",
    items: [
      { label: "产品", href: "/product" },
      { label: "版本列表", href: "/releases" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    label: "文档与部署",
    items: [
      { label: "文档", href: "/docs" },
      { label: "部署指南", href: "/docs#deployment" },
      { label: "兼容性", href: "/compatibility" },
    ],
  },
  {
    label: "Marketplace 与资讯",
    items: [
      { label: "Marketplace", href: "/marketplace" },
      { label: "资讯", href: "/blog" },
      { label: "客户案例", href: "/cases" },
    ],
  },
  {
    label: "支持与商务联系",
    items: [
      { label: "支持", href: "/support" },
      { label: "帮助中心", href: "/help" },
      { label: "商务咨询", href: "/contact" },
    ],
  },
];

afterEach(cleanup);

describe("SiteFooter", () => {
  it("renders the footer landmark, exact brand copy, and named navigation", () => {
    render(<SiteFooter groups={groups} />);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("portal-footer");
    expect(within(footer).getByText("AI Agent Platform")).toBeVisible();
    expect(
      within(footer).getByText("Build Enterprise AI Faster"),
    ).toBeVisible();
    expect(
      within(footer).getByRole("navigation", { name: "页脚导航" }),
    ).toBeVisible();
  });

  it("renders every configured group and href in supplied order", () => {
    render(<SiteFooter groups={groups} />);
    const navigation = screen.getByRole("navigation", { name: "页脚导航" });

    expect(
      within(navigation)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(groups.map((group) => group.label));

    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual(
      groups.flatMap((group) =>
        group.items.map((item) => [item.label, item.href]),
      ),
    );
  });

  it("shows only the explicit legal placeholders without fake details", () => {
    render(<SiteFooter groups={groups} />);

    for (const text of [
      "公司信息待补充",
      "隐私政策（占位）",
      "备案信息（占位）",
    ]) {
      expect(screen.getByText(text)).toBeVisible();
      expect(screen.getByText(text)).not.toHaveAttribute("href");
    }

    expect(screen.queryByText(/ICP备|ICP证|统一社会信用代码/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByText(/\d+[+%万亿]/)).toBeNull();
  });

  it("does not turn action-only items into footer links", () => {
    const groupsWithAction: NavigationSection[] = [
      ...groups,
      {
        label: "账户",
        items: [{ label: "退出登录", action: "logout", disabled: true }],
      },
    ];

    render(<SiteFooter groups={groupsWithAction} />);

    expect(screen.queryByRole("link", { name: "退出登录" })).toBeNull();
    expect(screen.queryByRole("button", { name: "退出登录" })).toBeNull();
  });
});
