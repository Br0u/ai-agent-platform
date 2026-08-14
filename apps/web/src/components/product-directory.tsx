"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DirectoryProgressRail,
  useDirectoryProgress,
} from "./directory-progress";
import "./product-directory.css";

type DirectoryItem = {
  label: string;
  href: string;
  children?: readonly DirectoryItem[];
};

const directory: readonly DirectoryItem[] = [
  {
    label: "独立产品中心",
    href: "/product",
    children: [
      {
        label: "码里奥",
        href: "/product/code-agent",
        children: [
          { label: "Skill 技能生态", href: "/product/code-agent#mdd2-skill" },
          { label: "MCP 工具集成", href: "/product/code-agent#mdd2-mcp" },
          { label: "自然语言开发", href: "/product/code-agent#mdd2-dev" },
          { label: "研发生态协同", href: "/product/code-agent#mdd2-eco" },
        ],
      },
      {
        label: "AIPPT",
        href: "/product/aippt",
        children: [
          { label: "参考资料驱动", href: "/product/aippt#aippt-ref" },
          { label: "三种渲染模式", href: "/product/aippt#aippt-mode" },
          { label: "自然语言微调", href: "/product/aippt#aippt-gen" },
          { label: "人机双写内容", href: "/product/aippt#aippt-export" },
        ],
      },
      {
        label: "AISHREK",
        href: "/product/aishrek",
        children: [
          { label: "自然语言 CAD", href: "/product/aishrek#aishrek-import" },
          { label: "原生精密联动", href: "/product/aishrek#aishrek-chat" },
          { label: "多维仿真 CAE", href: "/product/aishrek#aishrek-link" },
        ],
      },
    ],
  },
  {
    label: "智能体中心",
    href: "/product/agents",
    children: [
      { label: "知识智能体", href: "/product/agent-knowledge" },
      { label: "数据智能体", href: "/product/data-agent" },
      { label: "视频智能体", href: "/product/agent-video" },
      { label: "流程编排智能体", href: "/product/agent-orchestration" },
    ],
  },
  {
    label: "行业应用中心",
    href: "/product/applications",
    children: [
      { label: "通用文本写作", href: "/product/app-writing" },
      { label: "投标智能助手", href: "/product/app-bidding" },
      { label: "合同智能审查", href: "/product/app-contract" },
    ],
  },
  {
    label: "技能中心",
    href: "/product/skills",
    children: [
      { label: "研发类技能", href: "/product/skills-programming" },
      { label: "应用类技能", href: "/product/skills-application" },
      { label: "办公类技能", href: "/product/skills-office" },
    ],
  },
  {
    label: "模型中心",
    href: "/product/model",
    children: [
      { label: "模型资产管理", href: "/product/model-assets" },
      { label: "模型部署与服务", href: "/product/model-deploy" },
      { label: "模型训练", href: "/product/model-training" },
      { label: "模型评估", href: "/product/model-evaluation" },
    ],
  },
  {
    label: "编程中心",
    href: "/product/coding",
    children: [
      { label: "自然语言开发", href: "/product/coding-session" },
      { label: "双模式工作流", href: "/product/coding-project" },
      { label: "内置工具链", href: "/product/coding-standard" },
    ],
  },
  {
    label: "权限中心",
    href: "/product/governance",
    children: [
      { label: "权限管理", href: "/product/governance#gov-caps" },
      { label: "行级权限", href: "/product/governance#gov-permission" },
    ],
  },
] as const;

function filterDirectory(
  items: readonly DirectoryItem[],
  query: string,
): DirectoryItem[] {
  if (!query) return [...items];
  return items.flatMap((item) => {
    const children: DirectoryItem[] = filterDirectory(
      item.children ?? [],
      query,
    );
    return item.label.toLocaleLowerCase().includes(query) || children.length
      ? [{ ...item, children }]
      : [];
  });
}

function getCapabilityAnchorIds(
  items: readonly DirectoryItem[],
  pathname: string,
): string[] {
  return items.flatMap((item) => {
    const [targetPath, targetAnchor] = item.href.split("#");
    return [
      ...(targetPath === pathname && targetAnchor ? [targetAnchor] : []),
      ...getCapabilityAnchorIds(item.children ?? [], pathname),
    ];
  });
}

function containsActiveCapability(
  item: DirectoryItem,
  pathname: string,
  activeHash: string,
): boolean {
  const [targetPath, targetAnchor] = item.href.split("#");
  return (
    (targetPath === pathname &&
      Boolean(targetAnchor) &&
      activeHash === `#${targetAnchor}`) ||
    (item.children ?? []).some((child) =>
      containsActiveCapability(child, pathname, activeHash),
    )
  );
}

function DirectoryTree({
  activeHash,
  folded,
  items,
  onNavigate,
  pathname,
  queryActive,
  toggleFolded,
}: {
  activeHash: string;
  folded: ReadonlySet<string>;
  items: readonly DirectoryItem[];
  onNavigate: (href: string) => void;
  pathname: string;
  queryActive: boolean;
  toggleFolded: (href: string) => void;
}) {
  const renderItems = (nodes: readonly DirectoryItem[], depth = 0) =>
    nodes.map((item) => {
      const [targetPath, targetAnchor] = item.href.split("#");
      const current =
        pathname === targetPath &&
        activeHash === (targetAnchor ? `#${targetAnchor}` : "");
      const hasChildren = Boolean(item.children?.length);
      const expanded =
        queryActive ||
        containsActiveCapability(item, pathname, activeHash) ||
        !folded.has(item.href);

      return (
        <li
          className={
            depth === 0 ? "product-directory-group" : "product-directory-node"
          }
          key={item.href}
        >
          <div className="product-directory-row">
            <Link
              aria-current={
                current ? (targetAnchor ? "location" : "page") : undefined
              }
              className={`product-directory-link${
                depth === 0 ? " product-directory-link--root" : ""
              }`}
              href={item.href}
              onClick={() => onNavigate(item.href)}
            >
              <span>{item.label}</span>
            </Link>
            {hasChildren ? (
              <button
                aria-expanded={expanded}
                aria-label={`展开或收起${item.label}`}
                className="product-directory-toggle"
                onClick={() => toggleFolded(item.href)}
                type="button"
              >
                {expanded ? "⌄" : "›"}
              </button>
            ) : null}
          </div>
          {hasChildren && expanded ? (
            <ul className="product-directory-children">
              {renderItems(item.children ?? [], depth + 1)}
            </ul>
          ) : null}
        </li>
      );
    });

  return (
    <nav aria-label="产品目录导航">
      <ul className="product-directory-list">{renderItems(items)}</ul>
      {items.length === 0 ? (
        <p className="product-directory-empty">未找到匹配目录</p>
      ) : null}
    </nav>
  );
}

export function ProductDirectory() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [directoryState, setDirectoryState] = useState(() => ({
    collapsed: true,
    pathname,
  }));
  const collapsed =
    directoryState.pathname === pathname ? directoryState.collapsed : true;
  const [activeHash, setActiveHash] = useState("");
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const mobileLayerRef = useRef<HTMLDivElement>(null);
  const previousPathnameRef = useRef(pathname);
  const activePathname =
    pathname === "/product/standalone" ? "/product" : pathname;
  const capabilityAnchorIds = useMemo(
    () => getCapabilityAnchorIds(directory, activePathname),
    [activePathname],
  );
  const { activeHash: trackedHash, progress } =
    useDirectoryProgress(capabilityAnchorIds);
  const currentHash = trackedHash || activeHash;
  const filtered = useMemo(
    () => filterDirectory(directory, query.trim().toLocaleLowerCase()),
    [query],
  );

  useEffect(() => {
    const syncHash = () => setActiveHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, [pathname]);

  const closeMobile = useCallback(() => {
    if (!mobileOpen) return;
    setMobileOpen(false);
  }, [mobileOpen]);

  const onNavigate = useCallback(
    (href: string) => {
      const [targetPath, targetAnchor] = href.split("#");
      if (activePathname === targetPath) {
        setActiveHash(targetAnchor ? `#${targetAnchor}` : "");
      }
      closeMobile();
    },
    [activePathname, closeMobile],
  );

  const toggleFolded = useCallback((href: string) => {
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobile();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), a[href]",
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeMobile, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const layer = mobileLayerRef.current;
    const mobileTrigger = mobileTriggerRef.current;
    const boundary = layer?.closest(".app-shell") ?? document.body;
    const background: {
      element: HTMLElement;
      ariaHidden: string | null;
      inert: boolean;
    }[] = [];
    let current: Element | null = layer;

    while (current && current !== boundary) {
      const parent = current.parentElement;
      if (!parent) break;
      for (const sibling of parent.children) {
        if (sibling === current || !(sibling instanceof HTMLElement)) continue;
        background.push({
          element: sibling,
          ariaHidden: sibling.getAttribute("aria-hidden"),
          inert: sibling.hasAttribute("inert"),
        });
        sibling.setAttribute("aria-hidden", "true");
        sibling.setAttribute("inert", "");
      }
      current = parent;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      for (const { element, ariaHidden, inert } of background) {
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
        if (inert) element.setAttribute("inert", "");
        else element.removeAttribute("inert");
      }
      document.body.style.overflow = previousOverflow;
      mobileTrigger?.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;
    closeMobile();
  }, [closeMobile, pathname]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const desktopBreakpoint = window.matchMedia("(min-width: 901px)");
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeMobile();
    };
    desktopBreakpoint.addEventListener("change", handleBreakpointChange);
    return () =>
      desktopBreakpoint.removeEventListener("change", handleBreakpointChange);
  }, [closeMobile]);

  const search = (
    <input
      aria-label="在产品目录中筛选"
      onChange={(event) => setQuery(event.target.value)}
      placeholder="在产品目录中筛选"
      type="search"
      value={query}
    />
  );

  return (
    <>
      <aside
        aria-label="产品目录"
        className={`product-directory ${collapsed ? "is-collapsed" : ""}`}
      >
        <DirectoryProgressRail collapsed={collapsed} progress={progress} />
        <div className="product-directory-tools">
          {search}
          <button
            aria-label={collapsed ? "展开产品目录" : "收起产品目录"}
            aria-expanded={!collapsed}
            onClick={() =>
              setDirectoryState({ collapsed: !collapsed, pathname })
            }
            type="button"
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
        <div className="product-directory-tree">
          <DirectoryTree
            activeHash={currentHash}
            folded={folded}
            items={filtered}
            onNavigate={onNavigate}
            pathname={activePathname}
            queryActive={Boolean(query.trim())}
            toggleFolded={toggleFolded}
          />
        </div>
      </aside>

      <button
        aria-label="打开产品目录"
        aria-expanded={mobileOpen}
        className="product-directory-mobile-trigger"
        onClick={() => setMobileOpen(true)}
        ref={mobileTriggerRef}
        type="button"
      >
        产品目录
      </button>
      <div
        aria-hidden={!mobileOpen}
        className={`product-directory-mobile-layer ${mobileOpen ? "is-open" : ""}`}
        inert={!mobileOpen}
        ref={mobileLayerRef}
      >
        <button
          aria-label="关闭产品目录"
          className="product-directory-backdrop"
          onClick={closeMobile}
          tabIndex={-1}
          type="button"
        />
        <section
          aria-label="产品目录"
          aria-modal="true"
          className="product-directory-drawer"
          ref={drawerRef}
          role="dialog"
        >
          <div className="product-directory-drawer__header">
            <strong>产品目录</strong>
            <button
              aria-label="关闭产品目录"
              onClick={closeMobile}
              ref={closeButtonRef}
              type="button"
            >
              ×
            </button>
          </div>
          {search}
          <div className="product-directory-tree">
            <DirectoryTree
              activeHash={currentHash}
              folded={folded}
              items={filtered}
              onNavigate={onNavigate}
              pathname={activePathname}
              queryActive={Boolean(query.trim())}
              toggleFolded={toggleFolded}
            />
          </div>
        </section>
      </div>
    </>
  );
}
