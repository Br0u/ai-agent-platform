import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarNavigation } from "./sidebar-navigation";
import type { NavigationLink, NavigationSection } from "./navigation-types";

const consoleGroups: NavigationSection[] = [
  {
    label: "工作台",
    items: [
      { label: "控制台首页", href: "/console" },
      { label: "账号资料", href: "/console/profile" },
      { label: "账号安全", href: "/console/security" },
    ],
  },
  {
    label: "企业服务",
    items: [
      {
        label: "我的 License",
        href: "/console/licenses",
        status: "placeholder",
        description: "授权能力尚未接入",
      },
    ],
  },
];

const consoleUtilities: NavigationLink[] = [
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
];

const cmsGroups: NavigationSection[] = [
  {
    label: "系统管理",
    items: [
      { label: "站点设置", href: "/admin/site" },
      {
        label: "用户管理",
        href: "/admin/users",
        permission: "admin:users",
      },
      {
        label: "角色权限",
        href: "/admin/roles",
        permission: "admin:roles",
      },
    ],
  },
  {
    label: "仅受限项",
    items: [
      {
        label: "操作审计",
        href: "/admin/audit-logs",
        permission: "admin:audit",
      },
    ],
  },
];

function renderConsole(activeHref = "/console/profile") {
  return render(
    <SidebarNavigation
      activeHref={activeHref}
      ariaLabel="客户控制台导航"
      brandLabel="客户控制台"
      groups={consoleGroups}
      utilities={consoleUtilities}
    />,
  );
}

function openDrawer() {
  const opener = screen.getByRole("button", { name: "打开客户控制台导航" });
  fireEvent.click(opener);
  return {
    dialog: screen.getByRole("dialog", { name: "客户控制台导航" }),
    opener,
  };
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

describe("SidebarNavigation", () => {
  it("renders the supplied identity, groups and placeholder state", () => {
    renderConsole();

    const navigation = screen.getByRole("navigation", {
      name: "客户控制台导航",
    });
    expect(within(navigation).getByText("客户控制台")).toBeInTheDocument();
    expect(within(navigation).getByText("工作台")).toBeInTheDocument();
    expect(within(navigation).getByText("企业服务")).toBeInTheDocument();
    expect(within(navigation).getAllByText("尚未开放")).not.toHaveLength(0);
  });

  it("marks only the most specific segment-safe route as current", () => {
    const { rerender } = renderConsole("/console/profile?tab=security");

    expect(screen.getByRole("link", { name: "账号资料" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "控制台首页" }),
    ).not.toHaveAttribute("aria-current");

    rerender(
      <SidebarNavigation
        activeHref="/console-old"
        ariaLabel="客户控制台导航"
        brandLabel="客户控制台"
        groups={consoleGroups}
        utilities={consoleUtilities}
      />,
    );
    expect(
      screen.queryByRole("link", { current: "page" }),
    ).not.toBeInTheDocument();
  });

  it("honors exact hash routes before the matching pathname", () => {
    renderConsole("/console/profile#account-menu");

    expect(screen.getByRole("link", { name: "当前账号" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "账号资料" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows the complete scaffold without permissions and filters restricted items when supplied", () => {
    const { rerender } = render(
      <SidebarNavigation
        activeHref="/admin"
        ariaLabel="CMS 导航"
        brandLabel="CMS 运营后台"
        groups={cmsGroups}
        utilities={[]}
      />,
    );
    expect(screen.getByRole("link", { name: "用户管理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "角色权限" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "CMS 导航" })).getByText(
        "仅受限项",
      ),
    ).toBeInTheDocument();

    rerender(
      <SidebarNavigation
        activeHref="/admin"
        ariaLabel="CMS 导航"
        brandLabel="CMS 运营后台"
        grantedPermissions={["admin:users"]}
        groups={cmsGroups}
        utilities={[]}
      />,
    );
    expect(screen.getByRole("link", { name: "站点设置" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "用户管理" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "角色权限" }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "CMS 导航" })).queryByText(
        "仅受限项",
      ),
    ).not.toBeInTheDocument();
  });

  it("collapses desktop labels visually without removing accessible names", () => {
    renderConsole();

    const navigation = screen.getByRole("navigation", {
      name: "客户控制台导航",
    });
    const toggle = within(navigation).getByRole("button", { name: "折叠侧栏" });
    fireEvent.click(toggle);

    expect(navigation).toHaveAttribute("data-collapsed", "true");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      within(navigation).getByRole("link", { name: "账号资料" }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole("link", { name: "账号资料" }),
    ).toHaveAttribute("title", "账号资料");
    expect(
      within(navigation).getByRole("link", { name: "账号安全" }),
    ).toHaveAttribute("title", "账号安全");
    expect(
      within(navigation).getByRole("button", { name: /退出登录/ }),
    ).toHaveAttribute("title", "退出登录");
    expect(
      within(navigation).getByRole("button", { name: "展开侧栏" }),
    ).toBeInTheDocument();
  });

  it("renders Console utilities and keeps logout as an honest disabled action", () => {
    renderConsole();

    for (const name of ["返回公开门户", "帮助与支持", "当前账号"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    const logout = screen.getByRole("button", { name: /退出登录/ });
    expect(logout).toBeDisabled();
    expect(logout).toHaveTextContent("账号会话尚未接入");
    expect(logout).toHaveTextContent("尚未开放");
  });

  it("omits the utility region when CMS supplies no utilities", () => {
    render(
      <SidebarNavigation
        activeHref="/admin"
        ariaLabel="CMS 导航"
        brandLabel="CMS 运营后台"
        groups={cmsGroups}
        utilities={[]}
      />,
    );

    expect(
      within(screen.getByRole("navigation", { name: "CMS 导航" })).getByText(
        "CMS 运营后台",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-utilities")).not.toBeInTheDocument();
  });

  it("opens a labeled drawer, closes from the overlay and returns focus", () => {
    renderConsole();
    const { dialog, opener } = openDrawer();
    const desktopNavigation = document.querySelector(
      ".sidebar-navigation__desktop",
    );

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(desktopNavigation).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(
      screen.getByRole("button", { name: "关闭客户控制台导航遮罩" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "客户控制台导航" }),
    ).not.toBeInTheDocument();
    expect(desktopNavigation).not.toHaveAttribute("inert");
    expect(opener).toHaveFocus();
  });

  it("closes the drawer on Escape and link activation", () => {
    renderConsole();
    const { opener } = openDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    openDrawer();
    const accountLink = screen.getByRole("link", { name: "账号资料" });
    accountLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(accountLink);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("moves focus into the drawer and traps Tab at both edges", () => {
    renderConsole();
    const { dialog } = openDrawer();
    const close = within(dialog).getByRole("button", {
      name: "关闭客户控制台导航",
    });
    const lastLink = within(dialog).getByRole("link", { name: "当前账号" });

    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(lastLink).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
  });

  it("restores the exact body overflow value when closed and unmounted", () => {
    document.body.style.overflow = "clip";
    const view = renderConsole();
    openDrawer();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("clip");

    openDrawer();
    view.unmount();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("closes the mobile drawer when the desktop breakpoint activates", () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQuery = {
      matches: false,
      media: "(min-width: 1181px)",
      addEventListener: vi.fn(
        (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.add(listener);
        },
      ),
      removeEventListener: vi.fn(
        (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.delete(listener);
        },
      ),
    } as unknown as MediaQueryList;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery),
    );
    const view = renderConsole();
    const { opener } = openDrawer();

    act(() => {
      listeners.forEach((listener) =>
        listener({ matches: true } as MediaQueryListEvent),
      );
    });

    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "折叠侧栏" })).toHaveFocus();
    view.unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
