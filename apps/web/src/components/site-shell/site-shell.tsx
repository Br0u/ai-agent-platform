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
import { shouldShowAssistant } from "../assistant/assistant-visibility";
import { FloatingChatWidget } from "../ui/floating-chat-widget-shadcnui";
import "./site-shell.css";

const ADMIN_PERMISSION_KEYS = new Set(
  adminNavigation.groups.flatMap((group) =>
    group.items.flatMap((item) =>
      item.permission === undefined ? [] : [item.permission],
    ),
  ),
);
const CUSTOMER_STATUSES = new Set(["pending_review", "active", "rejected"]);
const EMAIL_VERIFICATION_STATUSES = new Set([
  "unverified",
  "pending",
  "verified",
]);
const ORGANIZATION_STATUSES = new Set([
  "pending_review",
  "active",
  "disabled",
  "rejected",
]);
const ORGANIZATION_ROLES = new Set(["owner", "admin", "member"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCustomerOrganization(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.legalName === "string" &&
      typeof value.status === "string" &&
      ORGANIZATION_STATUSES.has(value.status) &&
      typeof value.role === "string" &&
      ORGANIZATION_ROLES.has(value.role))
  );
}

function parseWorkspacePermissions(
  variant: "console" | "admin",
  value: unknown,
): string[] {
  if (!isRecord(value) || typeof value.displayName !== "string") {
    throw new Error("Invalid workspace session");
  }
  if (variant === "console") {
    if (
      value.realm !== "customer" ||
      typeof value.status !== "string" ||
      !CUSTOMER_STATUSES.has(value.status) ||
      typeof value.emailVerificationStatus !== "string" ||
      !EMAIL_VERIFICATION_STATUSES.has(value.emailVerificationStatus) ||
      !isCustomerOrganization(value.organization)
    ) {
      throw new Error("Invalid customer session");
    }
    return [];
  }
  if (
    value.realm !== "workforce" ||
    value.status !== "active" ||
    typeof value.mustChangePassword !== "boolean" ||
    typeof value.twoFactorEnabled !== "boolean" ||
    !Array.isArray(value.permissions) ||
    !value.permissions.every(
      (permission) =>
        typeof permission === "string" && ADMIN_PERMISSION_KEYS.has(permission),
    )
  ) {
    throw new Error("Invalid workforce session");
  }
  return [...new Set(value.permissions)].sort();
}

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
    permissions: string[];
  }>(() => ({
    variant,
    status: variant === "portal" ? "ready" : "loading",
    permissions: [],
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
          setWorkspace({ variant, status: "redirecting", permissions: [] });
          replace(
            `${loginPath}?returnTo=${encodeURIComponent(currentBrowserHref())}`,
          );
          return;
        }
        if (!response.ok) throw new Error("Workspace session unavailable");

        const body: unknown = await response.json();
        if (!current) return;
        const permissions = parseWorkspacePermissions(variant, body);
        setWorkspace({ variant, status: "ready", permissions });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        void error;
        setWorkspace({ variant, status: "redirecting", permissions: [] });
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
    <>
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
      {shouldShowAssistant(pathname) ? (
        <FloatingChatWidget pathname={pathname} />
      ) : null}
    </>
  );
}
