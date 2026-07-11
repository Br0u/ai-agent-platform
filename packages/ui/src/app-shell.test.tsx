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
  groups: [
    {
      label: "工作台",
      items: [
        { label: "控制台首页", href: "/console" },
        { label: "账号资料", href: "/console/profile" },
      ],
    },
    {
      label: "企业服务",
      items: [{ label: "我的 License", href: "/console/licenses" }],
    },
    {
      label: "开发与资源",
      items: [{ label: "API 密钥管理", href: "/console/api-keys" }],
    },
    {
      label: "组织与财务",
      items: [{ label: "团队管理", href: "/console/team" }],
    },
  ],
  utilities: [
    { label: "返回公开门户", href: "/" },
    { label: "帮助与支持", href: "/support" },
    { label: "当前账号", href: "/console/profile#account-menu" },
    {
      label: "退出登录",
      action: "logout",
      disabled: true,
      status: "placeholder",
      description: "账号会话尚未接入",
    },
  ],
};

const adminNavigation: SidebarNavigationConfig = {
  groups: [
    {
      label: "运营概览",
      items: [{ label: "运营仪表盘", href: "/admin" }],
    },
    {
      label: "站点内容",
      items: [
        {
          label: "产品管理",
          href: "/admin/products",
          permission: "admin:products",
        },
        { label: "资讯管理", href: "/admin/news" },
      ],
    },
    {
      label: "客户运营",
      items: [
        { label: "工单管理", href: "/admin/tickets" },
        {
          label: "用户管理",
          href: "/admin/users",
          permission: "admin:users",
        },
      ],
    },
    {
      label: "数据",
      items: [{ label: "访问分析", href: "/admin/analytics" }],
    },
    {
      label: "系统管理",
      items: [{ label: "站点设置", href: "/admin/site" }],
    },
  ],
  utilities: [],
};

const footerNavigation: NavigationSection[] = [
  { label: "产品与版本", items: [{ label: "产品", href: "/product" }] },
];

type RenderShellOptions = {
  activeHref?: string;
  grantedPermissions?: readonly string[];
};

function renderShell(
  variant: "portal" | "console" | "admin",
  { activeHref = "/", grantedPermissions }: RenderShellOptions = {},
) {
  return render(
    <AppShell
      activeHref={activeHref}
      adminNavigation={adminNavigation}
      consoleNavigation={consoleNavigation}
      footerNavigation={footerNavigation}
      grantedPermissions={grantedPermissions}
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
    expect(screen.queryByText("客户控制台")).not.toBeInTheDocument();
    expect(screen.queryByText("CMS 运营后台")).not.toBeInTheDocument();
    expect(screen.getByText("页面内容")).toBeVisible();
  });

  it("renders the complete Console navigation with utilities and active route", () => {
    const { container } = renderShell("console", {
      activeHref: "/console/profile",
    });
    const navigation = screen.getByRole("navigation", {
      name: "客户控制台导航",
    });

    expect(container.firstChild).toHaveAttribute(
      "data-shell-variant",
      "console",
    );
    expect(within(navigation).getByText("客户控制台")).toBeInTheDocument();
    for (const group of ["工作台", "企业服务", "开发与资源", "组织与财务"]) {
      expect(
        within(navigation).getByRole("heading", { name: group }),
      ).toBeVisible();
    }
    for (const utility of ["返回公开门户", "帮助与支持", "当前账号"]) {
      expect(
        within(navigation).getByRole("link", { name: utility }),
      ).toBeVisible();
    }
    expect(
      within(navigation).getByRole("button", { name: /退出登录/ }),
    ).toBeDisabled();
    expect(
      within(navigation).getByRole("link", { name: "账号资料" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("CMS 运营后台")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.getByText("页面内容")).toBeVisible();
  });

  it("renders the permission-filtered CMS navigation without Console utilities", () => {
    const { container } = renderShell("admin", {
      activeHref: "/admin/products",
      grantedPermissions: ["admin:products"],
    });
    const navigation = screen.getByRole("navigation", {
      name: "CMS 运营后台导航",
    });

    expect(container.firstChild).toHaveAttribute("data-shell-variant", "admin");
    expect(within(navigation).getByText("CMS 运营后台")).toBeInTheDocument();
    for (const group of [
      "运营概览",
      "站点内容",
      "客户运营",
      "数据",
      "系统管理",
    ]) {
      expect(
        within(navigation).getByRole("heading", { name: group }),
      ).toBeVisible();
    }
    expect(
      within(navigation).getByRole("link", { name: "产品管理" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(navigation).queryByRole("link", { name: "用户管理" }),
    ).not.toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: "站点设置" }),
    ).toBeVisible();
    for (const utility of [
      "返回公开门户",
      "帮助与支持",
      "当前账号",
      "退出登录",
    ]) {
      expect(within(navigation).queryByText(utility)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("客户控制台")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
    expect(screen.getByText("页面内容")).toBeVisible();
  });
});
