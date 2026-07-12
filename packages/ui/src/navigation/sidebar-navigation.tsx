"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import "./navigation.css";
import {
  isNavigationChildActive,
  isNavigationHrefItem,
} from "./navigation-match";
import { NavigationStatusBadge } from "./navigation-status";
import type {
  NavigationHrefItem,
  NavigationLink,
  NavigationSection,
} from "./navigation-types";

const LOCAL_URL_BASE = "https://local.invalid";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function isActuallyFocusable(element: HTMLElement) {
  return (
    element.tabIndex >= 0 &&
    !element.closest("[hidden]") &&
    element.getAttribute("aria-hidden") !== "true"
  );
}

function canViewItem(
  item: NavigationLink,
  grantedPermissions: readonly string[] | undefined,
) {
  return (
    grantedPermissions === undefined ||
    item.permission === undefined ||
    grantedPermissions.includes(item.permission)
  );
}

function filterNavigation(
  groups: NavigationSection[],
  utilities: NavigationLink[],
  grantedPermissions: readonly string[] | undefined,
) {
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        canViewItem(item, grantedPermissions),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return {
    groups: visibleGroups,
    utilities: utilities.filter((item) =>
      canViewItem(item, grantedPermissions),
    ),
  };
}

function normalizePathname(pathname: string) {
  return pathname !== "/" && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function activeScore(item: NavigationHrefItem, activeHref: string) {
  if (isNavigationChildActive(item.href, activeHref)) {
    return 100_000 + item.href.length;
  }

  const configured = new URL(item.href, LOCAL_URL_BASE);
  const active = new URL(activeHref, LOCAL_URL_BASE);
  if (configured.search || configured.hash) {
    return -1;
  }

  const base = normalizePathname(configured.pathname);
  const candidate = normalizePathname(active.pathname);
  return candidate === base || candidate.startsWith(`${base}/`)
    ? base.length
    : -1;
}

function findActiveHref(
  groups: NavigationSection[],
  utilities: NavigationLink[],
  activeHref: string,
) {
  const hrefItems = [
    ...groups.flatMap((group) => group.items),
    ...utilities,
  ].filter(isNavigationHrefItem);
  let current: NavigationHrefItem | undefined;
  let currentScore = -1;

  for (const item of hrefItems) {
    const score = activeScore(item, activeHref);
    if (score > currentScore) {
      current = item;
      currentScore = score;
    }
  }

  return currentScore >= 0 ? current?.href : undefined;
}

function ItemMarker({ label }: { label: string }) {
  return (
    <span aria-hidden="true" className="sidebar-navigation__marker">
      {label.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function LogoutButton({
  children,
  disabled,
  title,
}: {
  children: ReactNode;
  disabled: boolean;
  title: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-busy={pending ? "true" : undefined}
      className="sidebar-navigation__item sidebar-navigation__item--action"
      disabled={disabled || pending}
      title={title}
      type="submit"
    >
      {children}
    </button>
  );
}

function NavigationItem({
  item,
  currentHref,
  onActivate,
  logoutAction,
}: {
  item: NavigationLink;
  currentHref: string | undefined;
  onActivate?: () => void;
  logoutAction?: () => Promise<void>;
}) {
  const content = (
    <>
      <ItemMarker label={item.label} />
      <span className="sidebar-navigation__item-copy">
        <span className="sidebar-navigation__item-label">
          {item.label}
          <NavigationStatusBadge status={item.status} />
        </span>
        {item.description ? (
          <small className="sidebar-navigation__description">
            {item.description}
          </small>
        ) : null}
      </span>
    </>
  );

  if (isNavigationHrefItem(item)) {
    return (
      <a
        aria-current={item.href === currentHref ? "page" : undefined}
        className="sidebar-navigation__item"
        href={item.href}
        onClick={onActivate}
        title={item.label}
      >
        {content}
      </a>
    );
  }

  return (
    <form action={logoutAction}>
      <LogoutButton
        disabled={Boolean(item.disabled || !logoutAction)}
        title={item.label}
      >
        {content}
      </LogoutButton>
    </form>
  );
}

function NavigationContent({
  brandLabel,
  groups,
  utilities,
  currentHref,
  onActivate,
  showUtilityTestId = false,
  logoutAction,
}: {
  brandLabel: string;
  groups: NavigationSection[];
  utilities: NavigationLink[];
  currentHref: string | undefined;
  onActivate?: () => void;
  showUtilityTestId?: boolean;
  logoutAction?: () => Promise<void>;
}) {
  return (
    <>
      <div className="sidebar-navigation__identity">
        <span aria-hidden="true" className="sidebar-navigation__identity-mark">
          AI
        </span>
        <strong className="sidebar-navigation__brand">{brandLabel}</strong>
      </div>

      <div className="sidebar-navigation__groups">
        {groups.map((group) => (
          <section className="sidebar-navigation__group" key={group.label}>
            <h2>{group.label}</h2>
            <div className="sidebar-navigation__items">
              {group.items.map((item) => (
                <NavigationItem
                  currentHref={currentHref}
                  item={item}
                  key={item.href ?? item.action}
                  logoutAction={logoutAction}
                  onActivate={onActivate}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {utilities.length > 0 ? (
        <div
          className="sidebar-navigation__utilities"
          data-testid={showUtilityTestId ? "sidebar-utilities" : undefined}
        >
          {utilities.map((item) => (
            <NavigationItem
              currentHref={currentHref}
              item={item}
              key={item.href ?? item.action}
              logoutAction={logoutAction}
              onActivate={onActivate}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

export type SidebarNavigationProps = {
  ariaLabel: string;
  brandLabel: string;
  activeHref: string;
  groups: NavigationSection[];
  utilities: NavigationLink[];
  grantedPermissions?: readonly string[];
  logoutAction?: () => Promise<void>;
};

export function SidebarNavigation({
  ariaLabel,
  brandLabel,
  activeHref,
  groups,
  utilities,
  grantedPermissions,
  logoutAction,
}: SidebarNavigationProps) {
  const drawerId = `${useId()}-sidebar-drawer`;
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const allowFocusReturnRef = useRef(false);
  const focusAfterCloseRef = useRef<"mobile" | "desktop" | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const visible = useMemo(
    () => filterNavigation(groups, utilities, grantedPermissions),
    [grantedPermissions, groups, utilities],
  );
  const currentHref = findActiveHref(
    visible.groups,
    visible.utilities,
    activeHref,
  );

  function closeDrawer() {
    allowFocusReturnRef.current = true;
    focusAfterCloseRef.current = "mobile";
    setIsDrawerOpen(false);
  }

  function closeDrawerForDesktop() {
    allowFocusReturnRef.current = true;
    focusAfterCloseRef.current = "desktop";
    setIsDrawerOpen(false);
  }

  function handleDrawerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;

    const focusables = Array.from(
      drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
        [],
    ).filter(isActuallyFocusable);
    const first = focusables[0];
    const last = focusables.at(-1);

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  useLayoutEffect(() => {
    if (isDrawerOpen) {
      allowFocusReturnRef.current = false;
      closeRef.current?.focus();
      return;
    }

    if (focusAfterCloseRef.current === "desktop") {
      collapseRef.current?.focus();
    } else if (focusAfterCloseRef.current === "mobile") {
      openerRef.current?.focus();
    }
    focusAfterCloseRef.current = null;
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }

    function handleFocusIn(event: FocusEvent) {
      if (
        !allowFocusReturnRef.current &&
        event.target instanceof Node &&
        !drawerRef.current?.contains(event.target)
      ) {
        closeRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [isDrawerOpen]);

  useEffect(() => {
    if (!isDrawerOpen || typeof window.matchMedia !== "function") return;

    const desktopQuery = window.matchMedia("(min-width: 1181px)");
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeDrawerForDesktop();
    };

    if (typeof desktopQuery.addEventListener === "function") {
      desktopQuery.addEventListener("change", handleBreakpointChange);
      return () =>
        desktopQuery.removeEventListener("change", handleBreakpointChange);
    }

    desktopQuery.addListener(handleBreakpointChange);
    return () => desktopQuery.removeListener(handleBreakpointChange);
  }, [isDrawerOpen]);

  return (
    <div className="sidebar-navigation">
      <button
        aria-controls={drawerId}
        aria-expanded={isDrawerOpen}
        aria-label={`打开${ariaLabel}`}
        className="sidebar-navigation__mobile-opener"
        onClick={() => setIsDrawerOpen(true)}
        ref={openerRef}
        type="button"
      >
        菜单
      </button>

      <nav
        aria-hidden={isDrawerOpen ? "true" : undefined}
        aria-label={ariaLabel}
        className="sidebar-navigation__desktop"
        data-collapsed={isCollapsed}
        inert={isDrawerOpen ? true : undefined}
      >
        <NavigationContent
          brandLabel={brandLabel}
          currentHref={currentHref}
          groups={visible.groups}
          logoutAction={logoutAction}
          showUtilityTestId
          utilities={visible.utilities}
        />
        <button
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "展开侧栏" : "折叠侧栏"}
          className="sidebar-navigation__collapse"
          onClick={() => setIsCollapsed((current) => !current)}
          ref={collapseRef}
          type="button"
        >
          <span aria-hidden="true">{isCollapsed ? "展开" : "折叠"}</span>
        </button>
      </nav>

      <div className="sidebar-navigation__overlay" hidden={!isDrawerOpen}>
        <button
          aria-label={`关闭${ariaLabel}遮罩`}
          className="sidebar-navigation__backdrop"
          onClick={closeDrawer}
          tabIndex={-1}
          type="button"
        />
        <div
          aria-label={ariaLabel}
          aria-modal="true"
          className="sidebar-navigation__drawer"
          id={drawerId}
          onKeyDown={handleDrawerKeyDown}
          ref={drawerRef}
          role="dialog"
        >
          <button
            aria-label={`关闭${ariaLabel}`}
            className="sidebar-navigation__close"
            onClick={closeDrawer}
            ref={closeRef}
            type="button"
          >
            <span aria-hidden="true">关闭</span>
          </button>
          <NavigationContent
            brandLabel={brandLabel}
            currentHref={currentHref}
            groups={visible.groups}
            logoutAction={logoutAction}
            onActivate={closeDrawer}
            utilities={visible.utilities}
          />
        </div>
      </div>
    </div>
  );
}
