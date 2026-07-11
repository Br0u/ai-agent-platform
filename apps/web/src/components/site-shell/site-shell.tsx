"use client";

import { AppShell } from "@ai-agent-platform/ui";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  adminNavigation,
  consoleNavigation,
  footerNavigation,
  portalNavigation,
} from "../../config/navigation";

function currentBrowserHref() {
  return (
    window.location.pathname + window.location.search + window.location.hash
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activeHref, setActiveHref] = useState(pathname);
  const isRouteRoot = (root: string) =>
    pathname === root || pathname.startsWith(`${root}/`);
  const variant = isRouteRoot("/admin")
    ? "admin"
    : isRouteRoot("/console")
      ? "console"
      : "portal";

  useEffect(() => {
    const synchronizeActiveHref = () => setActiveHref(currentBrowserHref());

    synchronizeActiveHref();
    window.addEventListener("popstate", synchronizeActiveHref);
    window.addEventListener("hashchange", synchronizeActiveHref);

    return () => {
      window.removeEventListener("popstate", synchronizeActiveHref);
      window.removeEventListener("hashchange", synchronizeActiveHref);
    };
  }, [pathname]);

  return (
    <AppShell
      activeHref={activeHref}
      adminNavigation={adminNavigation}
      consoleNavigation={consoleNavigation}
      footerNavigation={footerNavigation}
      portalNavigation={portalNavigation}
      variant={variant}
    >
      {children}
    </AppShell>
  );
}
