import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import type {
  NavigationLinkComponent,
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
      disabled: false,
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
  assistantEntry?: ReactNode;
  adminBreadcrumb?: readonly { label: string; href?: string }[];
  administratorDisplayName?: string;
  environmentStatus?: string;
  grantedPermissions?: readonly string[];
  logoutAction?: () => Promise<void>;
  portalLinkComponent?: NavigationLinkComponent;
};

function renderShell(
  variant: "portal" | "assistant" | "auth" | "console" | "admin",
  {
    activeHref = "/",
    assistantEntry,
    adminBreadcrumb = [{ label: "运营后台" }],
    administratorDisplayName = "林管理员",
    environmentStatus = "开发环境",
    grantedPermissions,
    logoutAction,
    portalLinkComponent,
  }: RenderShellOptions = {},
) {
  return render(
    <AppShell
      activeHref={activeHref}
      assistantEntry={assistantEntry}
      adminBreadcrumb={adminBreadcrumb}
      adminNavigation={adminNavigation}
      administratorDisplayName={administratorDisplayName}
      consoleNavigation={consoleNavigation}
      footerNavigation={footerNavigation}
      environmentStatus={environmentStatus}
      grantedPermissions={grantedPermissions}
      logoutAction={logoutAction}
      portalNavigation={portalNavigation}
      portalLinkComponent={portalLinkComponent}
      variant={variant}
    >
      <p>页面内容</p>
    </AppShell>,
  );
}

afterEach(cleanup);

describe("AppShell", () => {
  it("forwards the assistant entry to portal chrome only", () => {
    const assistantEntry = <button type="button">打开工作区助理</button>;
    const { rerender } = renderShell("portal", { assistantEntry });

    expect(
      screen.getByRole("button", { name: "打开工作区助理" }),
    ).toBeVisible();

    rerender(
      <AppShell
        activeHref="/admin"
        adminNavigation={adminNavigation}
        assistantEntry={assistantEntry}
        adminBreadcrumb={[{ label: "运营后台" }]}
        administratorDisplayName="林管理员"
        consoleNavigation={consoleNavigation}
        environmentStatus="开发环境"
        footerNavigation={footerNavigation}
        portalNavigation={portalNavigation}
        variant="admin"
      >
        页面内容
      </AppShell>,
    );
    expect(
      screen.queryByRole("button", { name: "打开工作区助理" }),
    ).not.toBeInTheDocument();
  });

  it("uses portal chrome without a footer for the assistant workspace", () => {
    const assistantEntry = <button type="button">聚焦助理输入框</button>;
    const { container } = renderShell("assistant", {
      activeHref: "/assistant",
      assistantEntry,
    });

    expect(container.firstChild).toHaveAttribute(
      "data-shell-variant",
      "assistant",
    );
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "聚焦助理输入框" }),
    ).toBeVisible();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("renders auth content without portal, console, or admin chrome", () => {
    const { container } = renderShell("auth", { activeHref: "/login" });

    expect(container.firstChild).toHaveAttribute("data-shell-variant", "auth");
    expect(screen.getByText("页面内容")).toBeVisible();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("forwards an injected routing adapter to header and footer links", () => {
    const RoutingAdapter: NavigationLinkComponent = ({ href, ...props }) => (
      <a data-routing-adapter="next" href={href} {...props} />
    );
    renderShell("portal", { portalLinkComponent: RoutingAdapter });

    expect(
      screen.getByRole("link", { name: "AI Agent Platform 首页" }),
    ).toHaveAttribute("data-routing-adapter", "next");
    expect(
      within(screen.getByRole("contentinfo")).getByRole("link", {
        name: "产品",
      }),
    ).toHaveAttribute("data-routing-adapter", "next");
  });

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
    expect(screen.getByLabelText("当前管理员")).toHaveTextContent("林管理员");
    expect(screen.getByText("开发环境")).toBeVisible();
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

  it("enables a configured workspace logout action without changing portal navigation", () => {
    const logoutAction = async () => undefined;
    renderShell("console", { logoutAction });

    expect(screen.getByRole("button", { name: /退出登录/ })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /退出登录/ }).closest("form"),
    ).toHaveAttribute("action");
  });

  it("uses form pending state to disable duplicate logout submission", async () => {
    let finishLogout: (() => void) | undefined;
    const logoutAction = vi.fn(
      () => new Promise<void>((resolve) => (finishLogout = resolve)),
    );
    renderShell("console", { logoutAction });
    const button = screen.getByRole("button", { name: /退出登录/ });

    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(logoutAction).toHaveBeenCalledOnce();

    await act(async () => finishLogout?.());
  });
});
