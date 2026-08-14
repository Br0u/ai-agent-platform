"use client";

import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { partnerFlow } from "./partner-become-content";
import {
  allPartnerDirectoryNodes,
  partnerContact,
  partnerDirectory,
  partnerHref,
  partnerNodeForLocation,
  type PartnerAction,
  type PartnerClosingCta,
  type PartnerDirectoryNode,
  type PartnerVisual,
  type PartnerView,
  partnerViewContent,
} from "./partner-center-content";
import { partnerPolicyContent } from "./partner-policy-content";
import { PartnerIcon } from "./partner-icon";
import {
  DirectoryProgressRail,
  useDirectoryProgress,
} from "./directory-progress";

const MOBILE_DIRECTORY_QUERY = "(max-width: 900px)";
const PARTNER_LOCATION_EVENT = "partner-location-change";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

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

function locationState(href: string) {
  const url = new URL(href, "https://local.invalid");
  const params = url.searchParams;
  const candidate = params.get("view") as PartnerView | null;
  const view =
    candidate && Object.hasOwn(partnerViewContent, candidate)
      ? candidate
      : "overview";
  return {
    view,
    node: partnerNodeForLocation(view, url.hash),
    type: params.get("type") ?? "",
    hash: url.hash,
  };
}

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(PARTNER_LOCATION_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(PARTNER_LOCATION_EVENT, onChange);
  };
}

const getLocationSnapshot = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;
const getServerLocationSnapshot = () => "/partners?view=overview#po-hero";

function CardGrid({
  children,
  columns = 3,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div className={`partner-grid partner-grid--${columns}`}>{children}</div>
  );
}

function Points({ points }: { points: readonly string[] }) {
  return (
    <ul>
      {points.map((point) => (
        <li key={point}>{point}</li>
      ))}
    </ul>
  );
}

function Flow() {
  return (
    <div className="partner-flow">
      {partnerFlow.map(([title, desc, duration], index) => (
        <article key={title}>
          <span>{index + 1}</span>
          <strong>{title}</strong>
          <p>{desc}</p>
          {duration ? <small>{duration}</small> : null}
        </article>
      ))}
    </div>
  );
}

export function PartnerCenter() {
  const locationHref = useSyncExternalStore(
    subscribeToLocation,
    getLocationSnapshot,
    getServerLocationSnapshot,
  );
  const location = locationState(locationHref);
  const view = location.view;
  const activeKey = location.node?.key ?? view;
  const selectedType = location.type;
  const [query, setQuery] = useState("");
  const [expandedDirectoryView, setExpandedDirectoryView] =
    useState<PartnerView | null>(null);
  const directoryCollapsed = expandedDirectoryView !== view;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [contactTopic, setContactTopic] = useState("");
  const [copyToast, setCopyToast] = useState(false);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const directory = useRef<HTMLElement>(null);
  const directorySearch = useRef<HTMLInputElement>(null);
  const contactDialog = useRef<HTMLDivElement>(null);
  const contactClose = useRef<HTMLButtonElement>(null);
  const contactTrigger = useRef<HTMLElement | null>(null);
  const safeEntry = useRef<HTMLButtonElement>(null);
  const copyToastTimer = useRef<number | null>(null);
  const restoreMobileFocus = useRef(false);
  const restoreContactFocus = useRef(false);
  const allowFocusReturn = useRef(false);
  const normalizedQuery = query.trim().toLowerCase();
  const partnerAnchorIds = useMemo(
    () =>
      allPartnerDirectoryNodes
        .filter((node) => node.view === view)
        .map((node) => node.anchor),
    [view],
  );
  const { activeHash: trackedHash, progress } =
    useDirectoryProgress(partnerAnchorIds);
  const directoryActiveHash = trackedHash || location.hash;

  const filteredDirectory = partnerDirectory.flatMap((node) => {
    if (!normalizedQuery) return [node];
    const ownText = `${node.label} ${partnerViewContent[node.view].searchText}`;
    const children = (node.children ?? []).filter((child) =>
      `${child.label} ${partnerViewContent[child.view].searchText}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
    if (ownText.toLowerCase().includes(normalizedQuery) || children.length) {
      return [{ ...node, children }];
    }
    return [];
  });

  const closeMobileDirectory = useCallback((restoreFocus = true) => {
    allowFocusReturn.current = true;
    restoreMobileFocus.current = restoreFocus;
    setMobileOpen(false);
  }, []);

  const closeContact = useCallback(() => {
    allowFocusReturn.current = true;
    restoreContactFocus.current = true;
    setContactTopic("");
    if (location.hash === "#partner-contact") {
      window.history.replaceState(null, "", "/partners?view=overview#po-hero");
      window.dispatchEvent(new Event(PARTNER_LOCATION_EVENT));
    }
  }, [location.hash]);

  const openContact = (topic: string, trigger: HTMLElement) => {
    allowFocusReturn.current = false;
    contactTrigger.current = trigger;
    setMobileOpen(false);
    setContactTopic(topic);
  };

  const copyContact = (value: string) => {
    navigator.clipboard?.writeText(value);
    if (copyToastTimer.current !== null)
      window.clearTimeout(copyToastTimer.current);
    setCopyToast(true);
    copyToastTimer.current = window.setTimeout(() => {
      setCopyToast(false);
      copyToastTimer.current = null;
    }, 2_600);
  };

  const navigate = (href: string, record = true) => {
    if (record) window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
    window.dispatchEvent(new Event(PARTNER_LOCATION_EVENT));
    setMobileOpen(false);
  };

  const onPartnerLink = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    event.preventDefault();
    navigate(href);
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
      allowFocusReturn.current = false;
      restoreMobileFocus.current = false;
      directorySearch.current?.focus();
    } else if (restoreMobileFocus.current) {
      restoreMobileFocus.current = false;
      mobileTrigger.current?.focus();
    }
  }, [isMobile, mobileOpen]);

  const visibleContactTopic =
    contactTopic ||
    (location.hash === "#partner-contact" ? partnerContact.defaultTopic : "");

  useLayoutEffect(() => {
    if (visibleContactTopic) {
      allowFocusReturn.current = false;
      restoreContactFocus.current = false;
      contactClose.current?.focus();
    } else if (restoreContactFocus.current) {
      restoreContactFocus.current = false;
      (contactTrigger.current ?? safeEntry.current)?.focus();
    }
  }, [visibleContactTopic]);

  useLayoutEffect(() => {
    if (visibleContactTopic) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView?.({ block: "start" });
    if (
      !target ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    target.classList.add("is-targeted");
    const timer = window.setTimeout(
      () => target.classList.remove("is-targeted"),
      1_800,
    );
    return () => {
      window.clearTimeout(timer);
      target.classList.remove("is-targeted");
    };
  }, [location.hash, view, visibleContactTopic]);

  useEffect(
    () => () => {
      if (copyToastTimer.current !== null)
        window.clearTimeout(copyToastTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!mobileOpen && !visibleContactTopic) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (visibleContactTopic) closeContact();
      else closeMobileDirectory();
    };
    const onFocusIn = (event: FocusEvent) => {
      const activeRoot = visibleContactTopic
        ? contactDialog.current
        : directory.current;
      if (
        !allowFocusReturn.current &&
        event.target instanceof Node &&
        !activeRoot?.contains(event.target)
      ) {
        if (visibleContactTopic) contactClose.current?.focus();
        else directorySearch.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [
    closeContact,
    closeMobileDirectory,
    isMobile,
    mobileOpen,
    visibleContactTopic,
  ]);

  const link = (node: PartnerDirectoryNode) => {
    const href = partnerHref(node);
    return (
      <a
        href={href}
        aria-current={
          node.view === view && directoryActiveHash === `#${node.anchor}`
            ? "location"
            : undefined
        }
        onClick={(event) => onPartnerLink(event, href)}
      >
        {node.label}
      </a>
    );
  };

  const directoryTree = (
    <nav aria-label="合作伙伴完整目录">
      {filteredDirectory.length ? (
        <ul>
          {filteredDirectory.map((node) => {
            const activeChild = (node.children ?? []).some(
              (child) =>
                child.view === view &&
                directoryActiveHash === `#${child.anchor}`,
            );
            const groupExpanded =
              Boolean(normalizedQuery) ||
              activeChild ||
              !collapsedGroups.has(node.key);

            return (
              <li key={node.key}>
                {node.children?.length ? (
                  <div className="partner-directory__group">
                    {link(node)}
                    <button
                      type="button"
                      aria-expanded={groupExpanded}
                      aria-label={`${
                        !groupExpanded ? "展开" : "收起"
                      }${node.label}目录`}
                      onClick={() =>
                        setCollapsedGroups((current) => {
                          const next = new Set(current);
                          if (next.has(node.key)) next.delete(node.key);
                          else next.add(node.key);
                          return next;
                        })
                      }
                    >
                      {groupExpanded ? "⌄" : "›"}
                    </button>
                  </div>
                ) : (
                  link(node)
                )}
                {node.children?.length ? (
                  groupExpanded ? (
                    <ul>
                      {node.children.map((child) => (
                        <li key={child.key}>{link(child)}</li>
                      ))}
                    </ul>
                  ) : null
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="partner-directory__empty">
          <p>未找到匹配目录</p>
          <button type="button" onClick={() => setQuery("")}>
            清除筛选
          </button>
        </div>
      )}
    </nav>
  );

  const content = partnerViewContent[view];

  return (
    <main className="partner-page">
      <button
        ref={mobileTrigger}
        type="button"
        className="partner-directory-mobile"
        hidden={!isMobile}
        aria-controls="partner-directory"
        aria-expanded={mobileOpen}
        inert={isMobile && mobileOpen ? true : undefined}
        onClick={() => setMobileOpen(true)}
      >
        合作伙伴目录
      </button>
      {mobileOpen ? (
        <button
          type="button"
          className="partner-directory-backdrop"
          aria-label="关闭合作伙伴目录"
          onClick={() => closeMobileDirectory()}
        />
      ) : null}

      <div
        className="partner-shell"
        data-directory-collapsed={directoryCollapsed}
        inert={visibleContactTopic ? true : undefined}
      >
        <aside
          ref={directory}
          id="partner-directory"
          className="partner-directory"
          aria-label="合作伙伴目录"
          aria-hidden={isMobile && !mobileOpen ? "true" : undefined}
          aria-modal={isMobile && mobileOpen ? "true" : undefined}
          data-mobile-open={mobileOpen}
          inert={isMobile && !mobileOpen ? true : undefined}
          onKeyDown={(event) => {
            if (isMobile && mobileOpen && directory.current)
              trapFocus(event, directory.current);
          }}
          role={isMobile && mobileOpen ? "dialog" : undefined}
        >
          <DirectoryProgressRail
            collapsed={directoryCollapsed}
            progress={progress}
          />
          <div className="partner-directory__tools">
            <input
              ref={directorySearch}
              type="search"
              aria-label="在合作伙伴目录中筛选"
              placeholder="在合作伙伴目录中筛选"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              hidden={isMobile}
              aria-expanded={!directoryCollapsed}
              aria-label={
                directoryCollapsed ? "展开合作伙伴目录" : "收起合作伙伴目录"
              }
              onClick={() =>
                setExpandedDirectoryView((current) =>
                  current === view ? null : view,
                )
              }
            >
              {directoryCollapsed ? "›" : "‹"}
            </button>
          </div>
          {directoryTree}
        </aside>

        <article
          className="partner-main"
          data-partner-view={view}
          inert={mobileOpen ? true : undefined}
        >
          <Hero
            eyebrow={content.eyebrow}
            title={content.title}
            lead={content.lead}
            tags={content.tags}
            visual={content.visual}
            actions={content.heroActions}
            view={view}
            entryRef={safeEntry}
            onContact={openContact}
            onNavigate={navigate}
          />
          {view === "overview" ? (
            <Overview onContact={openContact} onNavigate={navigate} />
          ) : null}
          {view === "business" ? (
            <Business onContact={openContact} onNavigate={navigate} />
          ) : null}
          {view === "policy" ? (
            <Policy onContact={openContact} onNavigate={navigate} />
          ) : null}
          {view === "training" ? <Training /> : null}
          {view === "become" ? (
            <Become
              selectedType={selectedType}
              onContact={openContact}
              onSelectType={(type) => {
                window.history.replaceState(
                  null,
                  "",
                  `/partners?view=become&type=${type}#pbc-types`,
                );
                window.dispatchEvent(new Event(PARTNER_LOCATION_EVENT));
              }}
            />
          ) : null}
        </article>
      </div>

      {visibleContactTopic ? (
        <div
          className="partner-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeContact();
          }}
        >
          <div
            ref={contactDialog}
            className="partner-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-contact-title"
            onKeyDown={(event) => {
              if (contactDialog.current)
                trapFocus(event, contactDialog.current);
            }}
          >
            <header>
              <div>
                <span>生态合作联系</span>
                <h2 id="partner-contact-title">{visibleContactTopic}</h2>
              </div>
              <button
                ref={contactClose}
                type="button"
                aria-label="关闭"
                onClick={closeContact}
              >
                ×
              </button>
            </header>
            <p>
              伙伴类型：
              {selectedType
                ? partnerPolicyContent.types.find(
                    (type) => type.key === selectedType,
                  )?.title
                : "综合合作咨询"}
            </p>
            <p>
              来源：
              {allPartnerDirectoryNodes.find((node) => node.key === activeKey)
                ?.label ?? content.title}
            </p>
            <div className="partner-contact-cards">
              <article>
                <strong>生态合作电话</strong>
                <p>{partnerContact.phone}</p>
                <button
                  type="button"
                  onClick={() => copyContact(partnerContact.phoneCopy)}
                >
                  复制电话
                </button>
              </article>
              <article>
                <strong>生态合作邮箱</strong>
                <p>{partnerContact.email}</p>
                <button
                  type="button"
                  onClick={() => copyContact(partnerContact.emailCopy)}
                >
                  复制邮箱
                </button>
              </article>
              <article>
                <strong>企业微信</strong>
                <p>{partnerContact.qr}</p>
              </article>
            </div>
            <p>{partnerContact.privacy}</p>
          </div>
        </div>
      ) : null}
      {copyToast ? (
        <div className="partner-toast" role="status">
          联系信息已复制
        </div>
      ) : null}
    </main>
  );
}

function Hero({
  eyebrow,
  title,
  lead,
  tags,
  visual,
  actions,
  view,
  entryRef,
  onContact,
  onNavigate,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  tags: readonly string[];
  visual: PartnerVisual;
  actions: readonly PartnerAction[];
  view: PartnerView;
  entryRef: RefObject<HTMLButtonElement | null>;
  onContact: (topic: string, trigger: HTMLElement) => void;
  onNavigate: (href: string) => void;
}) {
  const anchor = allPartnerDirectoryNodes.find(
    (node) => node.view === view,
  )?.anchor;
  return (
    <section id={anchor} className="partner-hero" data-partner-target={view}>
      <div>
        <p className="partner-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="partner-lead">{lead}</p>
        <div className="partner-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <PartnerActions
          actions={actions}
          entryRef={entryRef}
          onContact={onContact}
          onNavigate={onNavigate}
        />
      </div>
      <div className="partner-visual" aria-label={visual.title}>
        <strong>{visual.title}</strong>
        <div className="partner-visual__body">
          {visual.items.map((item, index) => {
            if (item.kind === "connector")
              return (
                <span
                  className="partner-visual__connector"
                  key={`${item.title}-${index}`}
                >
                  {item.title}
                </span>
              );
            if (item.kind === "media")
              return (
                <div className="partner-visual__media" key={item.title}>
                  {item.title}
                </div>
              );
            if (item.kind === "progress")
              return (
                <div className="partner-visual__progress" key={item.title}>
                  <span>
                    <b>{item.title}</b>
                    <small>{item.value}</small>
                  </span>
                  <progress
                    aria-label={`${item.title} ${item.value}`}
                    max={100}
                    value={Number.parseInt(item.value, 10)}
                  />
                </div>
              );
            return (
              <div className="partner-visual__node" key={item.title}>
                <b>{item.title}</b>
                {item.detail ? <small>{item.detail}</small> : null}
                {item.badge ? <span>{item.badge}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PartnerActions({
  actions,
  entryRef,
  onContact,
  onNavigate,
}: {
  actions: readonly PartnerAction[];
  entryRef?: RefObject<HTMLButtonElement | null>;
  onContact: (topic: string, trigger: HTMLElement) => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <div className="partner-actions">
      {actions.map((action, index) =>
        "topic" in action ? (
          <button
            ref={index === 0 ? entryRef : undefined}
            type="button"
            key={action.label}
            onClick={(event) => onContact(action.topic, event.currentTarget)}
          >
            {action.label}
          </button>
        ) : action.href.startsWith("/partners") ? (
          <button
            ref={index === 0 ? entryRef : undefined}
            type="button"
            key={action.label}
            onClick={() => onNavigate(action.href)}
          >
            {action.label}
          </button>
        ) : (
          <a href={action.href} key={action.label}>
            {action.label}
          </a>
        ),
      )}
    </div>
  );
}

function ClosingCta({
  content,
  onContact,
  onNavigate,
}: {
  content: PartnerClosingCta;
  onContact: (topic: string, trigger: HTMLElement) => void;
  onNavigate: (href: string) => void;
}) {
  return (
    <section id={content.anchor} className="partner-section partner-cta">
      <div>
        <h2>{content.title}</h2>
        <p>{content.lead}</p>
      </div>
      <PartnerActions
        actions={content.actions}
        onContact={onContact}
        onNavigate={onNavigate}
      />
    </section>
  );
}

function Overview({
  onContact,
  onNavigate,
}: {
  onContact: (topic: string, trigger: HTMLElement) => void;
  onNavigate: (href: string) => void;
}) {
  const content = partnerViewContent.overview;
  return (
    <>
      <section id="po-stats" className="partner-section partner-stats">
        {content.stats.map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </section>
      <section id="po-value" className="partner-section">
        <header>
          <h2>为什么选择华鲲生态</h2>
          <p>从商业模式到赋能支持，为伙伴提供清晰可预期的成长回报。</p>
        </header>
        <CardGrid columns={2}>
          {content.values.map((item) => (
            <article className="partner-card" key={item.title}>
              <PartnerIcon name={item.icon} />
              <h3>{item.title}</h3>
              <p>{item.lead}</p>
              <Points points={item.points} />
            </article>
          ))}
        </CardGrid>
      </section>
      <section id="po-modules" className="partner-section">
        <header>
          <h2>三大合作模块，从了解到落地</h2>
          <p>选择最适合你的合作方向，开始你的 AI 生态之旅。</p>
        </header>
        <CardGrid>
          {content.modules.map((item) => (
            <button
              className="partner-card partner-card--button"
              type="button"
              key={item.no}
              onClick={() => onNavigate(item.href)}
            >
              <span>{item.no}</span>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
              <Points points={item.points} />
            </button>
          ))}
        </CardGrid>
      </section>
      <section id="po-flow" className="partner-section">
        <header>
          <h2>合作流程一目了然</h2>
          <p>六步完成伙伴入驻，快速启动业务。</p>
        </header>
        <Flow />
      </section>
      <ClosingCta
        content={content.closingCta}
        onContact={onContact}
        onNavigate={onNavigate}
      />
    </>
  );
}

function Business({
  onContact,
  onNavigate,
}: {
  onContact: (topic: string, trigger: HTMLElement) => void;
  onNavigate: (href: string) => void;
}) {
  const content = partnerViewContent.business;
  return (
    <>
      <section
        id="pb-modes"
        className="partner-section"
        data-partner-target="business-modes"
      >
        <header>
          <h2>三种合作模式</h2>
          <p>灵活适配不同伙伴类型，选择最适合的合作方式。</p>
        </header>
        <CardGrid>
          {content.modes.map((mode) => (
            <article className="partner-card" key={mode.title}>
              <PartnerIcon name={mode.icon} />
              <h3>{mode.title}</h3>
              <p>{mode.desc}</p>
              <dl>
                <div>
                  <dt>适合对象</dt>
                  <dd>{mode.fit}</dd>
                </div>
                <div>
                  <dt>合作模式</dt>
                  <dd>{mode.model}</dd>
                </div>
                <div>
                  <dt>收益方式</dt>
                  <dd>{mode.revenue}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={(event) =>
                  onContact(`${mode.title}咨询`, event.currentTarget)
                }
              >
                咨询该模式
              </button>
            </article>
          ))}
        </CardGrid>
      </section>
      <section id="pb-compare" className="partner-section">
        <header>
          <h2>模式对比一览</h2>
          <p>同一平台能力，不同合作深度与收益结构。</p>
        </header>
        <div className="partner-table-wrap">
          <table>
            <thead>
              <tr>
                <th>对比维度</th>
                {content.modes.map((mode) => (
                  <th key={mode.title}>{mode.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.comparison.map(([label, ...values]) => (
                <tr key={label}>
                  <th>{label}</th>
                  {values.map((value) => (
                    <td key={value}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section
        id="pb-tiers"
        className="partner-section"
        data-partner-target="business-tiers"
      >
        <header>
          <h2>分润政策：四级伙伴体系</h2>
          <p>能力越强、回报越高，等级逐级晋级，权益逐级提升。</p>
        </header>
        <CardGrid columns={2}>
          {content.tiers.map((tier) => (
            <article className="partner-card" key={tier.name}>
              <h3>{tier.name}</h3>
              <strong>{tier.target}</strong>
              <p>{tier.desc}</p>
              <h4>准入条件</h4>
              <Points points={tier.admit} />
              <h4>伙伴权益</h4>
              <Points points={tier.benefits} />
            </article>
          ))}
        </CardGrid>
        <p className="partner-note">
          等级根据年度承诺销售额与认证团队综合评定，具体以双方签署协议为准。
        </p>
      </section>
      <section
        id="pb-benefits"
        className="partner-section"
        data-partner-target="business-benefits"
      >
        <header>
          <h2>伙伴权益</h2>
          <p>全方位支持，助力伙伴业务成功。</p>
        </header>
        <CardGrid>
          {content.benefits.map(([icon, title, lead, points]) => (
            <article className="partner-card" key={title}>
              <PartnerIcon name={icon} />
              <h3>{title}</h3>
              <p>{lead}</p>
              <Points points={points} />
            </article>
          ))}
        </CardGrid>
      </section>
      <section id="pb-flow" className="partner-section">
        <header>
          <h2>加入流程</h2>
          <p>六步完成伙伴入驻，快速启动业务。</p>
        </header>
        <Flow />
      </section>
      <ClosingCta
        content={content.closingCta}
        onContact={onContact}
        onNavigate={onNavigate}
      />
    </>
  );
}

function Policy({
  onContact,
  onNavigate,
}: {
  onContact: (topic: string, trigger: HTMLElement) => void;
  onNavigate: (href: string) => void;
}) {
  const content = partnerViewContent.policy;
  return (
    <>
      <section
        id="pp-types"
        className="partner-section"
        data-partner-target="policy-types"
      >
        <header>
          <h2>伙伴类型与准入条件</h2>
          <p>三大伙伴类型，找到适合您的合作角色。</p>
        </header>
        <CardGrid>
          {content.types.map((type) => (
            <article className="partner-card" key={type.key}>
              <span>{type.who}</span>
              <h3>{type.title}</h3>
              <p>{type.lead}</p>
              <ul>
                {type.qual.map(([label, value]) => (
                  <li key={label}>
                    <strong>{label}</strong> {value}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  onNavigate(`/partners?view=become&type=${type.key}#pbc-types`)
                }
              >
                按此类型申请
              </button>
            </article>
          ))}
        </CardGrid>
      </section>
      <section
        id="pp-choose"
        className="partner-section partner-section--muted"
      >
        <header>
          <h2>如何选择伙伴类型</h2>
          <p>结合自身能力定位合作角色，三类能力可叠加。</p>
        </header>
        <CardGrid>
          {content.choose.map(([condition, type, result]) => (
            <article className="partner-card partner-path" key={type}>
              <span>{condition}</span>
              <strong>→</strong>
              <h3>{type}</h3>
              <p>{result}</p>
            </article>
          ))}
        </CardGrid>
        <p className="partner-note">
          伙伴类型用于判断合作方向，不代表自动通过准入审核；同一企业可具备多项能力。
        </p>
      </section>
      <section
        id="pp-cert"
        className="partner-section"
        data-partner-target="policy-cert"
      >
        <header>
          <h2>认证体系</h2>
          <p>三大认证方向、三级能力进阶，为伙伴团队赋能。</p>
        </header>
        <CardGrid>
          {content.certifications.map((cert) => (
            <article className="partner-card" key={cert.title}>
              <h3>{cert.title}</h3>
              <p>{cert.direction}</p>
              {cert.levels.map(([name, condition, courses], index) => (
                <div className="partner-level" key={name}>
                  <strong>
                    {name} · Lv.{index + 1}
                  </strong>
                  <p>达成条件：{condition}</p>
                  <p>必修课程：{courses}</p>
                </div>
              ))}
            </article>
          ))}
        </CardGrid>
        <article className="partner-card partner-certification-value">
          <h3>{content.certificationValue.title}</h3>
          <p>{content.certificationValue.lead}</p>
          <div className="partner-tags">
            {content.certificationValue.points.map((point) => (
              <span key={point}>{point}</span>
            ))}
          </div>
        </article>
      </section>
      <section
        id="pp-resources"
        className="partner-section"
        data-partner-target="policy-resources"
      >
        <header>
          <h2>支持资源</h2>
          <p>全方位赋能伙伴，让成功更简单。</p>
        </header>
        <CardGrid>
          {content.resources.map(([icon, title, lead, points]) => (
            <article className="partner-card" key={title}>
              <PartnerIcon name={icon} />
              <h3>{title}</h3>
              <p>{lead}</p>
              <small>{points}</small>
            </article>
          ))}
        </CardGrid>
      </section>
      <ClosingCta
        content={content.closingCta}
        onContact={onContact}
        onNavigate={onNavigate}
      />
    </>
  );
}

function Training() {
  const content = partnerViewContent.training;
  return (
    <>
      <section
        id="pt-system"
        className="partner-section"
        data-partner-target="training-system"
      >
        <header>
          <h2>四位一体培训体系</h2>
          <p>全方位赋能伙伴成长。</p>
        </header>
        <CardGrid columns={4}>
          {content.system.map(([icon, title, lead, points]) => (
            <article className="partner-card" key={title}>
              <PartnerIcon name={icon} />
              <h3>{title}</h3>
              <p>{lead}</p>
              <small>{points}</small>
            </article>
          ))}
        </CardGrid>
      </section>
      <section
        id="pt-courses"
        className="partner-section"
        data-partner-target="training-courses"
      >
        <header>
          <h2>三大课程方向</h2>
          <p>满足不同角色学习需求。</p>
        </header>
        <CardGrid>
          {content.courses.map((course) => (
            <article className="partner-card" key={course.title}>
              <h3>{course.title}</h3>
              <p>{course.note}</p>
              {course.items.map(([name, hours, goal, points]) => (
                <div className="partner-course" key={name}>
                  <strong>
                    {name}
                    <span>{hours}</span>
                  </strong>
                  <p>{goal}</p>
                  <small>{points}</small>
                </div>
              ))}
            </article>
          ))}
        </CardGrid>
      </section>
      <section
        id="pt-path"
        className="partner-section"
        data-partner-target="training-path"
      >
        <header>
          <h2>三级认证路径</h2>
          <p>从入门到专家，清晰成长路线。</p>
        </header>
        <CardGrid>
          {content.path.map(([level, name, desc, steps]) => (
            <article className="partner-card" key={level}>
              <span>{level}</span>
              <h3>{name}</h3>
              <p>{desc}</p>
              <Points points={steps} />
            </article>
          ))}
        </CardGrid>
      </section>
      <section
        id="pt-resources"
        className="partner-section"
        data-partner-target="training-resources"
      >
        <header>
          <h2>学习资源</h2>
          <p>丰富多样的学习资源，满足不同学习偏好。</p>
        </header>
        <CardGrid>
          {content.resources.map(([icon, title, lead, points]) => (
            <article className="partner-card" key={title}>
              <PartnerIcon name={icon} />
              <h3>{title}</h3>
              <p>{lead}</p>
              <small>{points}</small>
            </article>
          ))}
        </CardGrid>
      </section>
    </>
  );
}

function Become({
  selectedType,
  onSelectType,
  onContact,
}: {
  selectedType: string;
  onSelectType: (type: string) => void;
  onContact: (topic: string, trigger: HTMLElement) => void;
}) {
  const content = partnerViewContent.become;
  return (
    <>
      <section id="pbc-types" className="partner-section">
        <header>
          <h2>选择合作方向</h2>
          <p>根据自身能力选择合作角色。</p>
        </header>
        <CardGrid>
          {partnerPolicyContent.types.map((type) => (
            <button
              type="button"
              className="partner-card partner-card--button"
              aria-pressed={selectedType === type.key}
              key={type.key}
              onClick={(event) => {
                onSelectType(type.key);
                onContact(`申请成为${type.title}`, event.currentTarget);
              }}
            >
              <span>{type.who}</span>
              <h3>{type.title}</h3>
              <p>{type.lead}</p>
              <strong>选择此方向 →</strong>
            </button>
          ))}
        </CardGrid>
        <p className="partner-note">
          同一企业可具备多项能力；当前选择只用于调整联系提示，不提交后台。
        </p>
      </section>
      <section id="pbc-flow" className="partner-section">
        <header>
          <h2>六步入驻流程</h2>
          <p>从申请到业务启动，全程有专人支持。</p>
        </header>
        <Flow />
      </section>
      <section id="pbc-prepare" className="partner-section">
        <header>
          <h2>需要准备的信息</h2>
          <p>提前准备以下资料，加快合作对接。</p>
        </header>
        <CardGrid>
          {content.prepare.map(([icon, title, points]) => (
            <article className="partner-card" key={title}>
              <PartnerIcon name={icon} />
              <h3>{title}</h3>
              <Points points={points} />
            </article>
          ))}
        </CardGrid>
      </section>
    </>
  );
}
