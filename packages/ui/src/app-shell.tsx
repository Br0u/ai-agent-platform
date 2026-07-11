import type { ReactNode } from "react";
import "./app-shell.css";
import { PortalHeader } from "./navigation/portal-header";
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
};

export function AppShell({
  children,
  variant,
  activeHref,
  portalNavigation,
  footerNavigation,
}: AppShellProps) {
  if (variant !== "portal") {
    return (
      <div
        className={`workspace-shell workspace-shell--${variant}`}
        data-shell-variant={variant}
      >
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
