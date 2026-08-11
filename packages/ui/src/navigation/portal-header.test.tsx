import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PortalHeader } from "./portal-header";
import type { PortalNavigationItem } from "./navigation-types";

const items: PortalNavigationItem[] = [
  { label: "首页", href: "/", children: [] },
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
    label: "解决方案",
    href: "/solutions",
    children: [
      {
        label: "通用场景方案",
        items: [{ label: "知识与数据智能", href: "/solutions#knowledge" }],
      },
    ],
  },
  {
    label: "下载中心",
    href: "/downloads",
    children: [
      {
        label: "产品资料",
        items: [{ label: "元启产品资料", href: "/downloads#materials" }],
      },
    ],
  },
  {
    label: "合作伙伴",
    href: "/partners",
    children: [
      {
        label: "商业模式",
        items: [{ label: "合作模式", href: "/partners#business-modes" }],
      },
      {
        label: "伙伴政策",
        items: [{ label: "认证体系", href: "/partners#policy-cert" }],
      },
      {
        label: "伙伴培训",
        items: [{ label: "培训体系", href: "/partners#training-system" }],
      },
      {
        label: "合作对接",
        items: [{ label: "成为合作伙伴", href: "/partners#become" }],
      },
    ],
  },
  { label: "价格与服务", href: "/pricing", children: [] },
];

afterEach(cleanup);

describe("PortalHeader", () => {
  it("renders the final public parent order from the supplied fixture", () => {
    render(<PortalHeader activeHref="/" items={items} />);
    const navigation = screen.getByRole("navigation", { name: "主导航" });

    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "首页",
      "产品",
      "解决方案",
      "下载中心",
      "合作伙伴",
      "价格与服务",
    ]);
  });

  it("keeps one injected assistant entry in site-actions before public actions", () => {
    render(
      <PortalHeader
        activeHref="/"
        assistantEntry={<button type="button">AI 助理入口</button>}
        items={items}
      />,
    );

    const assistant = screen.getByRole("button", { name: "AI 助理入口" });
    const contact = screen.getByRole("link", { name: "联系我们" });
    expect(screen.getAllByRole("button", { name: "AI 助理入口" })).toHaveLength(
      1,
    );
    expect(assistant.parentElement).toHaveClass("site-actions");
    expect(assistant.nextElementSibling).toBe(contact);
  });

  it("shows contact and trial on desktop and mobile without login or docs", () => {
    render(<PortalHeader activeHref="/" items={items} />);

    const trial = screen.getByRole("link", { name: "申请体验" });
    expect(screen.getByRole("link", { name: "联系我们" })).toHaveAttribute(
      "href",
      "/contact",
    );
    expect(trial).toHaveAttribute("href", "/trial");
    expect(trial).toHaveClass("site-trial");
    expect(screen.queryByRole("link", { name: /登录/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "文档" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "打开导航" }));
    const mobileDialog = screen.getByRole("dialog", { name: "全站导航" });
    expect(
      within(mobileDialog).getByRole("link", { name: "联系我们" }),
    ).toHaveAttribute("href", "/contact");
    expect(
      within(mobileDialog).getByRole("link", { name: "申请体验" }),
    ).toHaveAttribute("href", "/trial");
    expect(
      within(mobileDialog).queryByRole("link", { name: /登录/ }),
    ).toBeNull();
    expect(
      within(mobileDialog).queryByRole("link", { name: "文档" }),
    ).toBeNull();
  });

  it("renders the production wordmark", () => {
    render(<PortalHeader activeHref="/" items={items} />);

    const brand = screen.getByRole("link", {
      name: "AI Agent Platform 首页",
    });
    expect(within(brand).getByText("AI Agent Platform")).toBeVisible();
    expect(within(brand).getByText("Build Enterprise AI Faster")).toBeVisible();
  });
});
