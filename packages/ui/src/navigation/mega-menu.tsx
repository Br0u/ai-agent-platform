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
import type {
  NavigationLinkComponent,
  PortalNavigationItem,
} from "./navigation-types";

const CLOSE_DELAY_MS = 180;

export function MegaMenu({
  items,
  activeHref,
  linkComponent: Link = "a",
}: {
  items: PortalNavigationItem[];
  activeHref: string;
  linkComponent?: NavigationLinkComponent;
}) {
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverOpenIndexRef = useRef<number | null>(null);
  const pinnedIndexRef = useRef<number | null>(null);
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
    hoverOpenIndexRef.current = null;
    pinnedIndexRef.current = index;
    setOpenIndex(index);
  }

  function close() {
    cancelClose();
    hoverOpenIndexRef.current = null;
    pinnedIndexRef.current = null;
    setOpenIndex(null);
  }

  function openFromPointer(index: number) {
    cancelClose();
    if (openIndex !== index) {
      hoverOpenIndexRef.current = index;
      pinnedIndexRef.current = null;
      setOpenIndex(index);
    }
  }

  function scheduleClose() {
    if (pinnedIndexRef.current === openIndex) {
      return;
    }
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      hoverOpenIndexRef.current = null;
      pinnedIndexRef.current = null;
      setOpenIndex(null);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }

  function handleTriggerKeyDown(
    event: ReactKeyboardEvent<HTMLAnchorElement>,
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
        hoverOpenIndexRef.current = null;
        panelRefs.current[index]
          ?.querySelector<HTMLAnchorElement>("a")
          ?.focus();
        return;
      }
      focusPanelOnOpenRef.current = true;
      open(index);
    }
  }

  useLayoutEffect(() => {
    if (openIndex !== null && focusPanelOnOpenRef.current) {
      focusPanelOnOpenRef.current = false;
      panelRefs.current[openIndex]
        ?.querySelector<HTMLAnchorElement>("a")
        ?.focus();
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

  return (
    <div className="mega-menu" ref={rootRef}>
      <div className="mega-menu__triggers">
        {items.map((item, index) => {
          const panelId = `${baseId}-panel-${index}`;
          const triggerId = `${baseId}-trigger-${index}`;
          const isOpen = openIndex === index;

          return (
            <Link
              aria-controls={panelId}
              aria-current={
                isNavigationParentActive(item, activeHref) ? "page" : undefined
              }
              aria-expanded={isOpen}
              className="mega-menu__trigger"
              href={item.href}
              id={triggerId}
              key={item.href}
              onClick={close}
              onKeyDown={(event) => handleTriggerKeyDown(event, index)}
              onPointerEnter={() => openFromPointer(index)}
              onPointerLeave={scheduleClose}
              ref={(element) => {
                triggerRefs.current[index] = element;
              }}
            >
              <span>{item.label}</span>
              <NavigationStatusBadge status={item.status} />
            </Link>
          );
        })}
      </div>

      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const sectionColumnCount = Math.min(
          4,
          Math.max(1, item.children.length),
        );

        return (
          <div
            aria-labelledby={`${baseId}-trigger-${index}`}
            className={`mega-menu__panel mega-menu__panel--${sectionColumnCount}`}
            hidden={!isOpen}
            id={`${baseId}-panel-${index}`}
            key={item.href}
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
            ref={(element) => {
              panelRefs.current[index] = element;
            }}
            role="region"
          >
            <Link
              aria-current={
                isNavigationChildActive(item.href, activeHref)
                  ? "page"
                  : undefined
              }
              className="mega-menu__overview"
              href={item.href}
            >
              <span>{item.label}概览</span>
              <span aria-hidden="true">→</span>
            </Link>

            <div className="mega-menu__sections">
              {item.children.map((section, sectionIndex) => (
                <section
                  className="mega-menu__section"
                  key={`${section.label}-${sectionIndex}`}
                >
                  <h2>{section.label}</h2>
                  <div className="mega-menu__links">
                    {section.items.filter(isNavigationHrefItem).map((child) => (
                      <Link
                        aria-current={
                          isNavigationChildActive(child.href, activeHref)
                            ? "page"
                            : undefined
                        }
                        href={child.href}
                        key={child.href}
                      >
                        <span className="mega-menu__link-label">
                          <span>{child.label}</span>
                          <NavigationStatusBadge status={child.status} />
                        </span>
                        {child.description ? (
                          <small>{child.description}</small>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
