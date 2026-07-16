import type { ReactNode } from "react";
import "./app-shell.css";
import {
  AdminShell,
  type AdminBreadcrumbItem,
} from "./admin-shell/admin-shell";
import { PortalHeader } from "./navigation/portal-header";
import { SidebarNavigation } from "./navigation/sidebar-navigation";
import { SiteFooter } from "./navigation/site-footer";
import type {
  NavigationSection,
  NavigationLinkComponent,
  PortalNavigationItem,
  SidebarNavigationConfig,
} from "./navigation/navigation-types";

export type AppShellProps = {
  children: ReactNode;
  assistantEntry?: ReactNode;
  variant: "portal" | "assistant" | "auth" | "console" | "admin";
  activeHref: string;
  portalNavigation: PortalNavigationItem[];
  portalLinkComponent?: NavigationLinkComponent;
  consoleNavigation: SidebarNavigationConfig;
  adminNavigation: SidebarNavigationConfig;
  footerNavigation: NavigationSection[];
  grantedPermissions?: readonly string[];
  logoutAction?: () => Promise<void>;
  adminBreadcrumb?: readonly AdminBreadcrumbItem[];
  environmentStatus?: string;
  administratorDisplayName?: string;
};

export function AppShell({
  children,
  assistantEntry,
  variant,
  activeHref,
  portalNavigation,
  portalLinkComponent,
  consoleNavigation,
  adminNavigation,
  footerNavigation,
  grantedPermissions,
  logoutAction,
  adminBreadcrumb,
  environmentStatus,
  administratorDisplayName,
}: AppShellProps) {
  if (variant === "auth") {
    return (
      <div className="auth-site-shell" data-shell-variant="auth">
        {children}
      </div>
    );
  }

  if (variant === "console") {
    const navigation = {
      ariaLabel: "客户控制台导航",
      brandLabel: "客户控制台",
      config: consoleNavigation,
    };

    return (
      <div
        className="workspace-shell workspace-shell--console"
        data-shell-variant="console"
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

  if (variant === "admin") {
    if (
      adminBreadcrumb === undefined ||
      environmentStatus === undefined ||
      administratorDisplayName === undefined
    ) {
      throw new Error("Admin shell context is required");
    }

    return (
      <div data-shell-variant="admin">
        <AdminShell
          administratorDisplayName={administratorDisplayName}
          breadcrumb={adminBreadcrumb}
          environmentStatus={environmentStatus}
          navigation={
            <SidebarNavigation
              activeHref={activeHref}
              ariaLabel="CMS 运营后台导航"
              brandLabel="CMS 运营后台"
              grantedPermissions={grantedPermissions}
              groups={adminNavigation.groups}
              logoutAction={logoutAction}
              utilities={adminNavigation.utilities}
            />
          }
        >
          {children}
        </AdminShell>
      </div>
    );
  }

  return (
    <div
      className="app-shell"
      data-assistant-background-root
      data-shell-variant={variant}
    >
      <PortalHeader
        activeHref={activeHref}
        assistantEntry={assistantEntry}
        items={portalNavigation}
        linkComponent={portalLinkComponent}
      />
      <div className="site-content">{children}</div>
      {variant === "portal" ? (
        <SiteFooter
          groups={footerNavigation}
          linkComponent={portalLinkComponent}
        />
      ) : null}
    </div>
  );
}
