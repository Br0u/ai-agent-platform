"use client";

import Link from "next/link";
import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type DownloadResource,
  downloadNotices,
  downloadOverview,
  downloadProducts,
  downloadResources,
  downloadSections,
  downloadSoftware,
} from "./download-center-content";

const MOBILE_DIRECTORY_QUERY = "(max-width: 780px)";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const directoryGroups = [
  {
    ...downloadSections[0],
    children: downloadResources.materials.map(({ key, short }) => ({
      href: `/downloads#dl-${key}`,
      label: short,
    })),
  },
  {
    ...downloadSections[1],
    children: [
      {
        href: `/downloads#dl-${downloadSoftware.key}`,
        label: downloadSoftware.short,
      },
    ],
  },
  {
    ...downloadSections[2],
    children: downloadResources.deployment.map(({ key, short }) => ({
      href: `/downloads#dl-${key}`,
      label: short,
    })),
  },
  {
    ...downloadSections[3],
    children: downloadResources.whitepapers.map(({ key, short }) => ({
      href: `/downloads#dl-${key}`,
      label: short,
    })),
  },
] as const;

function trapFocus(event: KeyboardEvent<HTMLElement>, root: HTMLElement) {
  if (event.key !== "Tab") return;
  const focusables = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.tabIndex >= 0 && !element.closest("[hidden]"));
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

function ResourceCard({
  resource,
  material = false,
  showToast,
}: {
  resource: DownloadResource;
  material?: boolean;
  showToast: (message: string) => void;
}) {
  const product = resource.product
    ? downloadProducts[resource.product]
    : undefined;
  const previewLabel = material ? "在线预览" : "在线阅读";
  const fileLabel = material ? "下载资料" : "下载文档";

  return (
    <article className="download-card" data-download-key={resource.key}>
      <div className="download-card__cover">
        <strong>{product?.name ?? resource.title}</strong>
        <span>{resource.file}</span>
      </div>
      <div className="download-card__body">
        {product ? <span className="download-tag">{product.tag}</span> : null}
        <h4>{resource.title}</h4>
        <p>{resource.desc}</p>
        <div className="download-actions">
          <button
            type="button"
            aria-label={`${previewLabel}${resource.title}`}
            onClick={() => showToast(downloadNotices.preview(resource.title))}
          >
            {previewLabel}
          </button>
          <button
            type="button"
            className="download-button--primary"
            aria-label={`${fileLabel}${resource.title}`}
            onClick={() => showToast(downloadNotices.file(resource.title))}
          >
            {fileLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

export function DownloadCenter() {
  const [query, setQuery] = useState("");
  const [directoryCollapsed, setDirectoryCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [toast, setToast] = useState("");
  const [softwareOpen, setSoftwareOpen] = useState(false);
  const [environmentConfirmed, setEnvironmentConfirmed] = useState(false);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const directory = useRef<HTMLElement>(null);
  const directorySearch = useRef<HTMLInputElement>(null);
  const softwareTrigger = useRef<HTMLButtonElement>(null);
  const softwareDialog = useRef<HTMLDivElement>(null);
  const softwareClose = useRef<HTMLButtonElement>(null);
  const restoreMobileFocus = useRef(false);
  const restoreSoftwareFocus = useRef(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = directoryGroups.flatMap((group) => {
    if (!normalizedQuery) return [group];
    const groupMatches = group.label.toLowerCase().includes(normalizedQuery);
    const children = groupMatches
      ? group.children
      : group.children.filter((child) =>
          child.label.toLowerCase().includes(normalizedQuery),
        );
    return children.length ? [{ ...group, children }] : [];
  });

  const closeMobileDirectory = (restoreFocus = true) => {
    restoreMobileFocus.current = restoreFocus;
    setMobileOpen(false);
  };

  const closeSoftwareDialog = () => {
    restoreSoftwareFocus.current = true;
    setSoftwareOpen(false);
  };

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOBILE_DIRECTORY_QUERY);
    const update = (matches: boolean) => {
      setIsMobile(matches);
      if (!matches) setMobileOpen(false);
    };
    const onChange = (event: MediaQueryListEvent) => update(event.matches);

    update(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    if (isMobile && mobileOpen) {
      restoreMobileFocus.current = false;
      directorySearch.current?.focus();
    } else if (restoreMobileFocus.current) {
      restoreMobileFocus.current = false;
      mobileTrigger.current?.focus();
    }
  }, [isMobile, mobileOpen]);

  useLayoutEffect(() => {
    if (softwareOpen) {
      restoreSoftwareFocus.current = false;
      softwareClose.current?.focus();
    } else if (restoreSoftwareFocus.current) {
      restoreSoftwareFocus.current = false;
      softwareTrigger.current?.focus();
    }
  }, [softwareOpen]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!mobileOpen && !softwareOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (softwareOpen) closeSoftwareDialog();
      else closeMobileDirectory();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, softwareOpen]);

  const openSoftwareDialog = () => {
    setEnvironmentConfirmed(false);
    setSoftwareOpen(true);
  };

  const confirmSoftwareDownload = () => {
    if (!environmentConfirmed) return;
    closeSoftwareDialog();
    setToast(downloadNotices.softwareConfirmed);
  };

  return (
    <main className="download-page">
      <button
        ref={mobileTrigger}
        type="button"
        className="download-directory-mobile"
        hidden={!isMobile}
        aria-controls="download-directory"
        aria-expanded={mobileOpen}
        inert={isMobile && mobileOpen ? true : undefined}
        onClick={() => setMobileOpen(true)}
      >
        下载中心目录
      </button>
      <button
        type="button"
        className="download-directory-backdrop"
        aria-label="关闭下载中心目录"
        data-open={mobileOpen}
        onClick={() => closeMobileDirectory()}
      />
      <div
        className="download-shell"
        data-directory-collapsed={directoryCollapsed}
      >
        <aside
          ref={directory}
          id="download-directory"
          className="download-directory"
          aria-label="下载中心目录"
          aria-hidden={isMobile && !mobileOpen ? "true" : undefined}
          aria-modal={isMobile && mobileOpen ? "true" : undefined}
          data-mobile-open={mobileOpen}
          inert={isMobile && !mobileOpen ? true : undefined}
          onKeyDown={(event) => {
            if (isMobile && mobileOpen && directory.current) {
              trapFocus(event, directory.current);
            }
          }}
          role={isMobile && mobileOpen ? "dialog" : undefined}
        >
          <div className="download-directory__tools">
            <input
              ref={directorySearch}
              type="search"
              aria-label="在下载中心目录中筛选"
              placeholder="在下载中心目录中筛选"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="download-directory__collapse"
              hidden={isMobile}
              aria-expanded={!directoryCollapsed}
              aria-label={
                directoryCollapsed ? "展开下载中心目录" : "收起下载中心目录"
              }
              onClick={() => setDirectoryCollapsed((value) => !value)}
            >
              {directoryCollapsed ? "›" : "‹"}
            </button>
          </div>
          <nav aria-label="下载中心完整目录">
            <Link
              href="/downloads#dl-hero"
              onClick={() => closeMobileDirectory(false)}
            >
              下载中心总览
            </Link>
            {filteredGroups.length ? (
              <ul>
                {filteredGroups.map((group) => (
                  <li key={group.anchor}>
                    <Link
                      className="download-directory__section"
                      href={`/downloads#${group.anchor}`}
                      onClick={() => closeMobileDirectory(false)}
                    >
                      {group.label}
                    </Link>
                    <ul>
                      {group.children.map((child) => (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={() => closeMobileDirectory(false)}
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="download-directory__empty">
                <p>未找到匹配目录</p>
                <button type="button" onClick={() => setQuery("")}>
                  清除筛选
                </button>
              </div>
            )}
          </nav>
        </aside>

        <div
          className="download-main"
          inert={mobileOpen || softwareOpen ? true : undefined}
        >
          <section id="dl-hero" className="download-hero">
            <p className="download-eyebrow">{downloadOverview.eyebrow}</p>
            <h1>{downloadOverview.title}</h1>
            <p className="download-lead">{downloadOverview.lead}</p>
            <div className="download-tags" aria-label="资源类型">
              {downloadOverview.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="download-actions">
              <Link className="download-button--primary" href="/product">
                了解产品
              </Link>
              <Link href="/trial">申请体验</Link>
            </div>
            <div className="download-path">
              {downloadOverview.path.map(([title, desc, href], index) => (
                <article key={title}>
                  <span>{index + 1}</span>
                  <strong>{title}</strong>
                  <p>{desc}</p>
                  <Link href={href}>{title} →</Link>
                </article>
              ))}
            </div>
            <p className="download-note">
              下载中心是产品推广与客户转化链路的资源入口，资源均与产品价值关联呈现。
            </p>
          </section>

          <section id="dl-materials" className="download-section">
            <header>
              <h2>01｜产品资料</h2>
              <p>
                快速了解元启平台与码多多 2.0
                的产品定位、核心能力与产品价值，先建立产品认知，再进入体验。
              </p>
            </header>
            {(
              Object.keys(downloadProducts) as (keyof typeof downloadProducts)[]
            ).map((productKey) => {
              const product = downloadProducts[productKey];
              return (
                <div className="download-product-group" key={productKey}>
                  <div className="download-product-group__header">
                    <h3>{product.name}</h3>
                    <Link href={product.href}>
                      {productKey === "yuanqi"
                        ? "进入产品总览 →"
                        : "进入码多多 2.0 →"}
                    </Link>
                  </div>
                  <div className="download-grid">
                    {downloadResources.materials
                      .filter((resource) => resource.product === productKey)
                      .map((resource) => (
                        <ResourceCard
                          material
                          key={resource.key}
                          resource={resource}
                          showToast={setToast}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
          </section>

          <section id="dl-software" className="download-section">
            <header>
              <h2>02｜软件资源下载</h2>
              <p>获取码多多 2.0 客户端安装包，进入安装体验环节。</p>
            </header>
            <article
              id={`dl-${downloadSoftware.key}`}
              className="download-software"
              data-download-key={downloadSoftware.key}
            >
              <div>
                <span className="download-tag">独立产品</span>
                <h3>{downloadSoftware.name}</h3>
                <p>
                  企业级智能编码客户端，私有化部署、代码不出域。下载安装前请阅读《码多多
                  2.0 安装部署指南》。
                </p>
                <div className="download-software__meta">
                  <span>版本：{downloadSoftware.version}</span>
                  <span>{downloadSoftware.systems}</span>
                  <span>{downloadSoftware.size}</span>
                </div>
                <div className="download-actions">
                  <button
                    ref={softwareTrigger}
                    type="button"
                    className="download-button--primary"
                    aria-label={`下载安装${downloadSoftware.name}`}
                    onClick={openSoftwareDialog}
                  >
                    下载安装
                  </button>
                  <Link href="/product/code-agent">查看码多多 2.0 →</Link>
                </div>
              </div>
              <div className="download-software__path">
                <strong>安装体验路径</strong>
                <p>下载安装包 → 阅读部署文档 → 安装部署 → 进入使用</p>
              </div>
            </article>
            <p className="download-note">{downloadNotices.software}</p>
          </section>

          <section id="dl-deployment" className="download-section">
            <header>
              <h2>03｜产品部署文档</h2>
              <p>安装部署与使用说明，降低产品体验门槛。</p>
            </header>
            <div className="download-grid">
              {downloadResources.deployment.map((resource) => (
                <ResourceCard
                  key={resource.key}
                  resource={resource}
                  showToast={setToast}
                />
              ))}
            </div>
          </section>

          <section id="dl-whitepapers" className="download-section">
            <header>
              <h2>04｜白皮书与技术资料</h2>
              <p>
                企业 AI、大模型与智能体相关专业资料，增强产品专业性与可信度。
              </p>
            </header>
            <div className="download-grid">
              {downloadResources.whitepapers.map((resource) => (
                <ResourceCard
                  key={resource.key}
                  resource={resource}
                  showToast={setToast}
                />
              ))}
            </div>
          </section>

          <section id="dl-cta" className="download-section download-cta">
            <div>
              <h2>资料之外，更进一步了解华鲲产品</h2>
              <p>从产品认知到申请体验，下载中心只是开始。</p>
            </div>
            <div className="download-actions">
              <Link className="download-button--primary" href="/product">
                进入产品中心
              </Link>
              <Link href="/trial">申请体验</Link>
              <Link href="/contact?topic=下载与资料咨询">商务咨询</Link>
            </div>
          </section>
        </div>
      </div>

      {softwareOpen ? (
        <div className="download-dialog-backdrop">
          <div
            ref={softwareDialog}
            className="download-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-dialog-title"
            onKeyDown={(event) => {
              if (softwareDialog.current)
                trapFocus(event, softwareDialog.current);
            }}
          >
            <header>
              <h2 id="download-dialog-title">确认下载安装包</h2>
              <button
                ref={softwareClose}
                type="button"
                aria-label="关闭"
                onClick={closeSoftwareDialog}
              >
                ×
              </button>
            </header>
            <div className="download-dialog__body">
              <p>
                <strong>{downloadSoftware.name}</strong>
              </p>
              <p>版本：{downloadSoftware.version}</p>
              <p>
                支持系统：{downloadSoftware.systems}｜{downloadSoftware.size}
              </p>
              <p>安装前请阅读《码多多 2.0 安装部署指南》。</p>
              <label>
                <input
                  type="checkbox"
                  checked={environmentConfirmed}
                  onChange={(event) =>
                    setEnvironmentConfirmed(event.target.checked)
                  }
                />
                我已了解该版本的适用环境和使用说明
              </label>
            </div>
            <footer>
              <button type="button" onClick={closeSoftwareDialog}>
                取消
              </button>
              <button
                type="button"
                className="download-button--primary"
                disabled={!environmentConfirmed}
                onClick={confirmSoftwareDownload}
              >
                确认下载
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="download-toast" role="status">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
