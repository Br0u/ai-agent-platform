"use client";

import { AppShell } from "@ai-agent-platform/ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  adminNavigation,
  consoleNavigation,
  footerNavigation,
  portalNavigation,
} from "../../config/navigation";
import {
  customerLogoutAction,
  staffLogoutAction,
} from "../../server/auth/server-actions";
import "./site-shell.css";

function currentBrowserHref() {
  return (
    window.location.pathname + window.location.search + window.location.hash
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { replace } = useRouter();
  const [activeHref, setActiveHref] = useState(pathname);
  const isRouteRoot = (root: string) =>
    pathname === root || pathname.startsWith(`${root}/`);
  const variant = isRouteRoot("/admin")
    ? "admin"
    : isRouteRoot("/console")
      ? "console"
      : "portal";
  const [workspace, setWorkspace] = useState<{
    variant: "console" | "admin" | "portal";
    status: "loading" | "ready" | "redirecting";
    permissions?: string[];
  }>(() => ({
    variant,
    status: variant === "portal" ? "ready" : "loading",
  }));

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

  useEffect(() => {
    if (variant === "portal") return;

    const controller = new AbortController();
    let current = true;
    const endpoint =
      variant === "console"
        ? "/api/v1/session/customer"
        : "/api/v1/session/staff";
    const loginPath = variant === "console" ? "/login" : "/staff/login";
    void fetch(endpoint, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!current) return;
        if (response.status === 401 || response.status === 403) {
          setWorkspace({ variant, status: "redirecting" });
          replace(
            `${loginPath}?returnTo=${encodeURIComponent(currentBrowserHref())}`,
          );
          return;
        }
        if (!response.ok) throw new Error("Workspace session unavailable");

        const body: unknown = await response.json();
        if (!current) return;
        const permissions =
          variant === "admin" &&
          body &&
          typeof body === "object" &&
          Array.isArray((body as Record<string, unknown>).permissions) &&
          (body as Record<string, unknown>).permissions instanceof Array &&
          ((body as Record<string, unknown>).permissions as unknown[]).every(
            (permission) => typeof permission === "string",
          )
            ? [
                ...new Set(
                  (body as Record<string, unknown>).permissions as string[],
                ),
              ].sort()
            : undefined;
        setWorkspace({ variant, status: "ready", permissions });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        void error;
        setWorkspace({ variant, status: "redirecting" });
        replace(
          `${loginPath}?returnTo=${encodeURIComponent(currentBrowserHref())}`,
        );
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [replace, variant]);

  if (
    variant !== "portal" &&
    (workspace.variant !== variant || workspace.status !== "ready")
  ) {
    return (
      <main className="workspace-session-loading" role="status">
        <span aria-hidden="true" className="workspace-session-loading__mark" />
        <span>正在验证工作区会话…</span>
      </main>
    );
  }

  return (
    <AppShell
      activeHref={activeHref}
      adminNavigation={adminNavigation}
      consoleNavigation={consoleNavigation}
      footerNavigation={footerNavigation}
      grantedPermissions={workspace.permissions}
      logoutAction={
        variant === "console"
          ? customerLogoutAction
          : variant === "admin"
            ? staffLogoutAction
            : undefined
      }
      portalNavigation={portalNavigation}
      variant={variant}
    >
      {children}
    </AppShell>
  );
}
