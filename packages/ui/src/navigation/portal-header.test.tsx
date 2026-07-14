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
  it("places an injected assistant entry immediately before desktop login", () => {
    render(
      <PortalHeader
        activeHref="/"
        assistantEntry={<button type="button">AI 助理入口</button>}
        items={items}
      />,
    );

    const assistant = screen.getByRole("button", { name: "AI 助理入口" });
    const login = screen.getByRole("link", { name: "登录 / 进入平台" });
    const documents = screen.getByRole("navigation", { name: "文档导航" });
    expect(assistant.parentElement).toBe(login.parentElement);
    expect(assistant.nextElementSibling).toBe(documents);
    expect(documents.nextElementSibling).toBe(login);
  });

  it("renders the product wordmark and login action", () => {
    render(<PortalHeader activeHref="/" items={items} />);

    const brand = screen.getByRole("link", {
      name: "AI Agent Platform 首页",
    });
    expect(within(brand).getByText("AI Agent Platform")).toBeVisible();
    expect(within(brand).getByText("Build Enterprise AI Faster")).toBeVisible();
    const desktopAction = screen.getByRole("link", {
      name: "登录 / 进入平台",
    });
    expect(desktopAction).toHaveClass("site-login");
    expect(desktopAction).toHaveAttribute("href", "/login");

    fireEvent.click(screen.getByRole("button", { name: "打开导航" }));
    const mobileDialog = screen.getByRole("dialog", { name: "全站导航" });
    expect(
      within(mobileDialog).getByRole("link", {
        name: "登录 / 进入控制台",
      }),
    ).toHaveAttribute("href", "/login");
  });

  it("keeps documents beside the assistant and login actions", () => {
    render(<PortalHeader activeHref="/docs" items={items} />);

    const primaryNavigation = screen.getByRole("navigation", {
      name: "主导航",
    });
    expect(
      within(primaryNavigation).getByRole("link", { name: "产品" }),
    ).toBeVisible();
    expect(
      within(primaryNavigation).queryByRole("link", { name: "文档" }),
    ).not.toBeInTheDocument();

    const documentNavigation = screen.getByRole("navigation", {
      name: "文档导航",
    });
    expect(
      within(documentNavigation).getByRole("link", { name: "文档" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(documentNavigation).getByRole("link", { name: "文档" }),
    ).not.toHaveAttribute("aria-expanded");
    expect(
      within(documentNavigation).getByRole("link", { name: "文档" }),
    ).not.toHaveAttribute("aria-controls");
    const assistant = screen.queryByRole("button", { name: "AI 助理入口" });
    const login = screen.getByRole("link", { name: "登录 / 进入平台" });
    expect(assistant).toBeNull();
    expect(login.parentElement).toHaveClass("site-actions");
    expect(screen.getByRole("button", { name: "打开导航" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "打开导航" }));
    const mobileDialog = screen.getByRole("dialog", { name: "全站导航" });
    const mobileDocumentLink = within(mobileDialog).getByRole("link", {
      name: "文档",
    });
    expect(mobileDocumentLink).toHaveAttribute("href", "/docs");
    expect(
      within(mobileDialog).queryByRole("button", { name: /文档/ }),
    ).not.toBeInTheDocument();
  });
});
