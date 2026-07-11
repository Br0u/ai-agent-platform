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
import { NavigationStatus } from "./navigation-status";
import type {
  NavigationHrefItem,
  PortalNavigationItem,
} from "./navigation-types";

const LOCAL_URL_BASE = "https://local.invalid";
const CLOSE_DELAY_MS = 180;

function normalizeUrl(href: string) {
  return new URL(href, LOCAL_URL_BASE);
}

function normalizePathname(pathname: string) {
  return pathname !== "/" && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function pathIncludes(basePath: string, candidatePath: string) {
  const base = normalizePathname(basePath);
  const candidate = normalizePathname(candidatePath);
  return candidate === base || candidate.startsWith(`${base}/`);
}

function isChildActive(href: string, activeHref: string) {
  const configured = normalizeUrl(href);
  const active = normalizeUrl(activeHref);
  return (
    configured.pathname === active.pathname &&
    configured.search === active.search &&
    configured.hash === active.hash
  );
}

function isHrefItem(
  item: PortalNavigationItem["children"][number]["items"][number],
): item is NavigationHrefItem {
  return typeof item.href === "string";
}

function hasActiveChild(item: PortalNavigationItem, activeHref: string) {
  return item.children.some((section) =>
    section.items.some(
      (child) => isHrefItem(child) && isChildActive(child.href, activeHref),
    ),
  );
}

function isParentActive(item: PortalNavigationItem, activeHref: string) {
  const parent = normalizeUrl(item.href);
  const active = normalizeUrl(activeHref);
  return (
    pathIncludes(parent.pathname, active.pathname) ||
    hasActiveChild(item, activeHref)
  );
}

export function MegaMenu({
  items,
  activeHref,
}: {
  items: PortalNavigationItem[];
  activeHref: string;
}) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusPanelOnOpenRef = useRef(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function cancelClose() {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function open(index: number) {
    cancelClose();
    setOpenIndex(index);
  }

  function close() {
    cancelClose();
    setOpenIndex(null);
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setOpenIndex(null);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }

  function handleTriggerKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + offset + items.length) % items.length;
      triggerRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (openIndex === index) {
        panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
        return;
      }
      focusPanelOnOpenRef.current = true;
      open(index);
    }
  }

  useLayoutEffect(() => {
    if (openIndex !== null && focusPanelOnOpenRef.current) {
      focusPanelOnOpenRef.current = false;
      panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    }
  }, [openIndex]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        openIndex !== null &&
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        close();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && openIndex !== null) {
        const indexToFocus = openIndex;
        close();
        triggerRefs.current[indexToFocus]?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openIndex]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  const openItem = openIndex === null ? null : items[openIndex];
  const sectionColumnCount = openItem
    ? Math.min(4, Math.max(3, openItem.children.length))
    : 3;

  return (
    <div className="mega-menu" ref={rootRef}>
      <div className="mega-menu__triggers">
        {items.map((item, index) => {
          const panelId = `${baseId}-panel-${index}`;
          const triggerId = `${baseId}-trigger-${index}`;
          const isOpen = openIndex === index;

          return (
            <button
              aria-controls={panelId}
              aria-current={
                isParentActive(item, activeHref) ? "page" : undefined
              }
              aria-expanded={isOpen}
              className="mega-menu__trigger"
              id={triggerId}
              key={item.href}
              onClick={() => (isOpen ? close() : open(index))}
              onKeyDown={(event) => handleTriggerKeyDown(event, index)}
              onPointerEnter={() => open(index)}
              onPointerLeave={scheduleClose}
              ref={(element) => {
                triggerRefs.current[index] = element;
              }}
              type="button"
            >
              <span>{item.label}</span>
              <NavigationStatus status={item.status} />
            </button>
          );
        })}
      </div>

      {openItem && openIndex !== null ? (
        <div
          aria-labelledby={`${baseId}-trigger-${openIndex}`}
          className={`mega-menu__panel mega-menu__panel--${sectionColumnCount}`}
          id={`${baseId}-panel-${openIndex}`}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          ref={panelRef}
          role="region"
        >
          <a
            aria-current={
              isChildActive(openItem.href, activeHref) ? "page" : undefined
            }
            className="mega-menu__overview"
            href={openItem.href}
          >
            <span>{openItem.label}概览</span>
            <span aria-hidden="true">→</span>
          </a>

          <div className="mega-menu__sections">
            {openItem.children.map((section, sectionIndex) => (
              <section
                className="mega-menu__section"
                key={`${section.label}-${sectionIndex}`}
              >
                <h2>{section.label}</h2>
                <div className="mega-menu__links">
                  {section.items.filter(isHrefItem).map((child) => (
                    <a
                      aria-current={
                        isChildActive(child.href, activeHref)
                          ? "page"
                          : undefined
                      }
                      href={child.href}
                      key={child.href}
                    >
                      <span className="mega-menu__link-label">
                        <span>{child.label}</span>
                        <NavigationStatus status={child.status} />
                      </span>
                      {child.description ? (
                        <small>{child.description}</small>
                      ) : null}
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
