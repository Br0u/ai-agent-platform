import type { ReactNode } from "react";
import "./app-shell.css";
import { PortalHeader } from "./navigation/portal-header";
import { SidebarNavigation } from "./navigation/sidebar-navigation";
import { SiteFooter } from "./navigation/site-footer";
import type {
  NavigationSection,
  PortalNavigationItem,
  SidebarNavigationConfig,
} from "./navigation/navigation-types";

export type AppShellProps = {
  children: ReactNode;
  variant: "portal" | "console" | "admin";
  activeHref: string;
  portalNavigation: PortalNavigationItem[];
  consoleNavigation: SidebarNavigationConfig;
  adminNavigation: SidebarNavigationConfig;
  footerNavigation: NavigationSection[];
  grantedPermissions?: readonly string[];
  logoutAction?: () => Promise<void>;
};

export function AppShell({
  children,
  variant,
  activeHref,
  portalNavigation,
  consoleNavigation,
  adminNavigation,
  footerNavigation,
  grantedPermissions,
  logoutAction,
}: AppShellProps) {
  if (variant !== "portal") {
    const navigation =
      variant === "console"
        ? {
            ariaLabel: "客户控制台导航",
            brandLabel: "客户控制台",
            config: consoleNavigation,
          }
        : {
            ariaLabel: "CMS 运营后台导航",
            brandLabel: "CMS 运营后台",
            config: adminNavigation,
          };

    return (
      <div
        className={`workspace-shell workspace-shell--${variant}`}
        data-shell-variant={variant}
      >
        <SidebarNavigation
          activeHref={activeHref}
          ariaLabel={navigation.ariaLabel}
          brandLabel={navigation.brandLabel}
          grantedPermissions={grantedPermissions}
          groups={navigation.config.groups}
          logoutAction={logoutAction}
          utilities={navigation.config.utilities}
        />
        <div className="workspace-shell__content">{children}</div>
      </div>
    );
  }

  return (
    <div className="app-shell" data-shell-variant="portal">
      <PortalHeader activeHref={activeHref} items={portalNavigation} />
      <div className="site-content">{children}</div>
      <SiteFooter groups={footerNavigation} />
    </div>
  );
}
