"use client";

import { AppShell, AssistantHeaderEntry } from "@ai-agent-platform/ui";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { shouldShowAssistant } from "../../config/assistant-visibility";
import {
  adminNavigation,
  consoleNavigation,
  footerNavigation,
  portalNavigation,
} from "../../config/navigation";
import { matchRoute } from "../../config/routes";
import {
  customerLogoutAction,
  staffLogoutAction,
} from "../../server/auth/server-actions";
import {
  AssistantExperienceProvider,
  useAssistantExperience,
} from "../assistant/assistant-experience-provider";
import { FloatingChatWidget } from "../ui/floating-chat-widget-shadcnui";
import { PortalNavigationLink } from "./portal-navigation-link";
import { classifyShellRoute, type ShellRoute } from "./shell-route";
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
const ENVIRONMENT_STATUS =
  process.env.NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT?.trim() || "开发环境";

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

function parseWorkspaceSession(
  variant: "console" | "admin",
  value: unknown,
): { displayName: string; permissions: string[] } {
  if (
    !isRecord(value) ||
    typeof value.displayName !== "string" ||
    value.displayName.trim().length === 0
  ) {
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
    return { displayName: value.displayName, permissions: [] };
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
  return {
    displayName: value.displayName,
    permissions: [...new Set(value.permissions)].sort(),
  };
}

function currentBrowserHref() {
  return (
    window.location.pathname + window.location.search + window.location.hash
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activeHref, setActiveHref] = useState(pathname);
  const variant = classifyShellRoute(pathname);

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

  if (variant === "console" || variant === "admin") {
    return (
      <ProtectedSiteShell
        activeHref={activeHref}
        pathname={pathname}
        variant={variant}
      >
        {children}
      </ProtectedSiteShell>
    );
  }

  const shell = (
    <AppShell
      activeHref={activeHref}
      adminNavigation={adminNavigation}
      consoleNavigation={consoleNavigation}
      footerNavigation={footerNavigation}
      portalNavigation={portalNavigation}
      portalLinkComponent={PortalNavigationLink}
      variant={variant}
    >
      {variant === "portal" || variant === "assistant" ? (
        <div className="site-route-transition" key={pathname}>
          {children}
        </div>
      ) : (
        children
      )}
    </AppShell>
  );

  if (!shouldShowAssistant(pathname)) return shell;

  return (
    <AssistantExperienceProvider pathname={pathname}>
      <AssistantEnabledShell
        activeHref={activeHref}
        variant={variant === "assistant" ? "assistant" : "portal"}
      >
        <div className="site-route-transition" key={pathname}>
          {children}
        </div>
      </AssistantEnabledShell>
    </AssistantExperienceProvider>
  );
}

function ProtectedSiteShell({
  activeHref,
  children,
  pathname,
  variant,
}: {
  activeHref: string;
  children: ReactNode;
  pathname: string;
  variant: Extract<ShellRoute, "console" | "admin">;
}) {
  const { replace } = useRouter();
  const [workspace, setWorkspace] = useState<{
    variant: "console" | "admin";
    status: "loading" | "ready" | "redirecting";
    permissions: string[];
    displayName: string | null;
  }>(() => ({
    variant,
    status: "loading",
    permissions: [],
    displayName: null,
  }));

  useEffect(() => {
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
          setWorkspace({
            variant,
            status: "redirecting",
            permissions: [],
            displayName: null,
          });
          replace(
            `${loginPath}?returnTo=${encodeURIComponent(currentBrowserHref())}`,
          );
          return;
        }
        if (!response.ok) throw new Error("Workspace session unavailable");

        const body: unknown = await response.json();
        if (!current) return;
        const parsed = parseWorkspaceSession(variant, body);
        setWorkspace({ variant, status: "ready", ...parsed });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        void error;
        setWorkspace({
          variant,
          status: "redirecting",
          permissions: [],
          displayName: null,
        });
        replace(
          `${loginPath}?returnTo=${encodeURIComponent(currentBrowserHref())}`,
        );
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [replace, variant]);

  if (workspace.variant !== variant || workspace.status !== "ready") {
    return (
      <main className="workspace-session-loading" role="status">
        <span aria-hidden="true" className="workspace-session-loading__mark" />
        <span>正在验证工作区会话…</span>
      </main>
    );
  }

  const route = matchRoute(pathname);
  const adminBreadcrumb =
    pathname === "/admin"
      ? [{ label: "运营后台" }]
      : [
          { label: "运营后台", href: "/admin" },
          { label: route?.title ?? "当前页面" },
        ];
  return (
    <AppShell
      activeHref={activeHref}
      adminBreadcrumb={adminBreadcrumb}
      adminNavigation={adminNavigation}
      administratorDisplayName={workspace.displayName ?? undefined}
      consoleNavigation={consoleNavigation}
      environmentStatus={ENVIRONMENT_STATUS}
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
      portalLinkComponent={PortalNavigationLink}
      variant={variant}
    >
      {children}
    </AppShell>
  );
}

function AssistantEnabledShell({
  activeHref,
  children,
  variant,
}: {
  activeHref: string;
  children: ReactNode;
  variant: Extract<ShellRoute, "portal" | "assistant">;
}) {
  const experience = useAssistantExperience();
  const router = useRouter();
  const activateHeaderEntry = (trigger: HTMLButtonElement) => {
    if (variant === "assistant") {
      experience.focusComposer();
      return;
    }
    void trigger;
    router.push("/assistant");
  };

  return (
    <AppShell
      activeHref={activeHref}
      adminNavigation={adminNavigation}
      assistantEntry={
        <span>
          <AssistantHeaderEntry
            isOpen={experience.surface !== "closed"}
            mode={variant === "assistant" ? "workspace" : "launcher"}
            onActivate={activateHeaderEntry}
          />
        </span>
      }
      consoleNavigation={consoleNavigation}
      footerNavigation={footerNavigation}
      portalNavigation={portalNavigation}
      portalLinkComponent={PortalNavigationLink}
      variant={variant}
    >
      {children}
      <FloatingChatWidget showLauncher={variant === "portal"} />
    </AppShell>
  );
}
