"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import "./navigation.css";
import {
  isNavigationChildActive,
  isNavigationHrefItem,
  isNavigationParentActive,
} from "./navigation-match";
import { NavigationStatusBadge } from "./navigation-status";
import type { PortalNavigationItem } from "./navigation-types";

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

export function MobileNavigation({
  items,
  activeHref,
  actionLabel = "登录 / 进入控制台",
  actionHref = "/login",
}: {
  items: PortalNavigationItem[];
  activeHref: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  const baseId = useId();
  const drawerId = `${baseId}-mobile-drawer`;
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const allowFocusReturnRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function closeNavigation() {
    allowFocusReturnRef.current = true;
    setIsOpen(false);
    setOpenIndex(null);
    openerRef.current?.focus();
  }

  function handleDrawerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

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
    if (isOpen) {
      allowFocusReturnRef.current = false;
      closeRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeNavigation();
      }
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

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof window.matchMedia !== "function") {
      return;
    }

    const desktopQuery = window.matchMedia("(min-width: 1181px)");
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        closeNavigation();
      }
    };

    if (typeof desktopQuery.addEventListener === "function") {
      desktopQuery.addEventListener("change", handleBreakpointChange);
      return () =>
        desktopQuery.removeEventListener("change", handleBreakpointChange);
    }

    desktopQuery.addListener(handleBreakpointChange);
    return () => desktopQuery.removeListener(handleBreakpointChange);
  }, [isOpen]);

  return (
    <div className="mobile-navigation">
      <button
        aria-controls={drawerId}
        aria-expanded={isOpen}
        aria-label="打开导航"
        className="mobile-navigation__opener"
        onClick={() => setIsOpen(true)}
        ref={openerRef}
        type="button"
      >
        <span aria-hidden="true">菜单</span>
      </button>

      <div className="mobile-navigation__overlay" hidden={!isOpen}>
        <button
          aria-label="关闭导航遮罩"
          className="mobile-navigation__backdrop"
          onClick={closeNavigation}
          tabIndex={-1}
          type="button"
        />
        <div
          aria-label="全站导航"
          aria-modal="true"
          className="mobile-navigation__drawer"
          id={drawerId}
          onKeyDown={handleDrawerKeyDown}
          ref={drawerRef}
          role="dialog"
        >
          <div className="mobile-navigation__header">
            <span className="mobile-navigation__title">全站导航</span>
            <button
              aria-label="关闭导航"
              className="mobile-navigation__close"
              onClick={closeNavigation}
              ref={closeRef}
              type="button"
            >
              <span aria-hidden="true">关闭</span>
            </button>
          </div>

          <div className="mobile-navigation__body">
            {items.map((item, index) => {
              const triggerId = `${baseId}-mobile-trigger-${index}`;
              const panelId = `${baseId}-mobile-panel-${index}`;
              const isExpanded = openIndex === index;

              return (
                <div className="mobile-navigation__group" key={item.href}>
                  <button
                    aria-controls={panelId}
                    aria-current={
                      isNavigationParentActive(item, activeHref)
                        ? "page"
                        : undefined
                    }
                    aria-expanded={isExpanded}
                    className="mobile-navigation__accordion"
                    id={triggerId}
                    onClick={() =>
                      setOpenIndex((current) =>
                        current === index ? null : index,
                      )
                    }
                    type="button"
                  >
                    <span>{item.label}</span>
                    <span className="mobile-navigation__accordion-meta">
                      <NavigationStatusBadge status={item.status} />
                      <span aria-hidden="true">{isExpanded ? "−" : "+"}</span>
                    </span>
                  </button>

                  <div
                    aria-labelledby={triggerId}
                    className="mobile-navigation__panel"
                    hidden={!isExpanded}
                    id={panelId}
                    role="region"
                  >
                    <a
                      aria-current={
                        isNavigationChildActive(item.href, activeHref)
                          ? "page"
                          : undefined
                      }
                      className="mobile-navigation__overview"
                      href={item.href}
                      onClick={closeNavigation}
                    >
                      {item.label}概览
                    </a>
                    {item.children.map((section, sectionIndex) => (
                      <section key={`${section.label}-${sectionIndex}`}>
                        <h2>{section.label}</h2>
                        {section.items
                          .filter(isNavigationHrefItem)
                          .map((child) => (
                            <a
                              aria-current={
                                isNavigationChildActive(child.href, activeHref)
                                  ? "page"
                                  : undefined
                              }
                              className="mobile-navigation__child"
                              href={child.href}
                              key={child.href}
                              onClick={closeNavigation}
                            >
                              <span>
                                <span className="mobile-navigation__child-label">
                                  {child.label}
                                  <NavigationStatusBadge
                                    status={child.status}
                                  />
                                </span>
                                {child.description ? (
                                  <small>{child.description}</small>
                                ) : null}
                              </span>
                            </a>
                          ))}
                      </section>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mobile-navigation__action-wrap">
            <a
              className="mobile-navigation__action"
              href={actionHref}
              onClick={closeNavigation}
            >
              {actionLabel}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
