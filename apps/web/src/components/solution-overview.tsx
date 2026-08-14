"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type SolutionDirectoryNode,
  solutionDirectory,
} from "./solution-overview-content";
import "./product-directory.css";

const MOBILE_DIRECTORY_QUERY = "(max-width: 780px)";
const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

function filterDirectory(
  nodes: readonly SolutionDirectoryNode[],
  query: string,
): readonly SolutionDirectoryNode[] {
  if (!query) return nodes;
  return nodes.flatMap((node) => {
    const children = filterDirectory(node.children ?? [], query);
    return node.label.toLowerCase().includes(query) || children.length
      ? [{ ...node, children }]
      : [];
  });
}

function DirectoryBranch({
  node,
  activeInternalId,
  closeMobile,
  forceExpanded,
}: {
  node: SolutionDirectoryNode;
  activeInternalId: string;
  closeMobile: () => void;
  forceExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = node.children ?? [];
  const open = forceExpanded || expanded;

  return (
    <li className="solution-directory__item">
      <div className="solution-directory__row">
        <Link
          aria-current={
            node.internalId === activeInternalId ? "page" : undefined
          }
          href={node.href}
          onClick={closeMobile}
        >
          {node.label}
        </Link>
        {children.length ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`展开或收起${node.label}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {open ? "−" : "+"}
          </button>
        ) : null}
      </div>
      {children.length ? (
        <ul hidden={!open}>
          {children.map((child) => (
            <DirectoryBranch
              activeInternalId={activeInternalId}
              closeMobile={closeMobile}
              forceExpanded={forceExpanded}
              key={child.internalId}
              node={child}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function SolutionOverview({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const slug = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const activeInternalId = `solution-${slug}`;
  const [query, setQuery] = useState("");
  const [directoryCollapsed, setDirectoryCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const directory = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(false);
  const filteredDirectory = filterDirectory(
    solutionDirectory,
    query.trim().toLowerCase(),
  );

  const closeMobile = (returnFocus = true) => {
    restoreFocus.current = returnFocus;
    setMobileOpen(false);
  };

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_DIRECTORY_QUERY);
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    if (isMobile && mobileOpen) searchInput.current?.focus();
    else if (restoreFocus.current) {
      restoreFocus.current = false;
      mobileTrigger.current?.focus();
    }
  }, [isMobile, mobileOpen]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeMobile();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobile, mobileOpen]);

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (!isMobile || !mobileOpen || event.key !== "Tab") return;
    const focusable = Array.from(
      directory.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
        [],
    ).filter(
      (element) => element.tabIndex >= 0 && !element.closest("[hidden]"),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <main className="solutions-page">
      <button
        ref={mobileTrigger}
        type="button"
        className="solution-directory-mobile"
        aria-controls="solution-directory"
        aria-expanded={mobileOpen}
        inert={isMobile && mobileOpen ? true : undefined}
        onClick={() => setMobileOpen(true)}
      >
        解决方案目录
      </button>
      <button
        type="button"
        className="solution-directory-backdrop"
        aria-label="关闭解决方案目录"
        data-open={mobileOpen}
        onClick={() => closeMobile()}
      />
      <div
        className="solution-shell"
        data-directory-collapsed={directoryCollapsed}
      >
        <aside
          ref={directory}
          id="solution-directory"
          className="solution-directory"
          aria-label="解决方案目录"
          aria-hidden={isMobile && !mobileOpen ? "true" : undefined}
          aria-modal={isMobile && mobileOpen ? "true" : undefined}
          data-mobile-open={mobileOpen}
          inert={isMobile && !mobileOpen ? true : undefined}
          onKeyDown={trapFocus}
          role={isMobile && mobileOpen ? "dialog" : undefined}
        >
          <div className="solution-directory__tools">
            <input
              ref={searchInput}
              type="search"
              aria-label="在解决方案目录中筛选"
              placeholder="在解决方案目录中筛选"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="solution-directory__desktop-collapse"
              hidden={isMobile}
              aria-expanded={!directoryCollapsed}
              aria-label={
                directoryCollapsed ? "展开解决方案目录" : "收起解决方案目录"
              }
              onClick={() => setDirectoryCollapsed((value) => !value)}
            >
              {directoryCollapsed ? "›" : "‹"}
            </button>
          </div>
          <nav aria-label="解决方案完整目录">
            {filteredDirectory.length ? (
              <ul className="solution-directory__tree">
                {filteredDirectory.map((node) => (
                  <DirectoryBranch
                    activeInternalId={activeInternalId}
                    closeMobile={() => closeMobile(false)}
                    forceExpanded={Boolean(query.trim())}
                    key={node.internalId}
                    node={node}
                  />
                ))}
              </ul>
            ) : (
              <div className="solution-directory__empty">
                <p>未找到匹配目录</p>
                <button type="button" onClick={() => setQuery("")}>
                  清除筛选
                </button>
              </div>
            )}
          </nav>
        </aside>
        <div
          className="solution-content"
          inert={isMobile && mobileOpen ? true : undefined}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
