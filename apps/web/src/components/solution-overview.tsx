"use client";

import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  type SolutionDirectoryNode,
  solutionDirectory,
  solutionOverviewContent as content,
} from "./solution-overview-content";

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
  closeMobile,
}: {
  node: SolutionDirectoryNode;
  closeMobile: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = node.children ?? [];

  return (
    <li className="solution-directory__item">
      <div className="solution-directory__row">
        <Link href={node.href} onClick={closeMobile}>
          {node.label}
        </Link>
        {children.length ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`展开或收起${node.label}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "−" : "+"}
          </button>
        ) : null}
      </div>
      {children.length ? (
        <ul hidden={!expanded}>
          {children.map((child) => (
            <DirectoryBranch
              closeMobile={closeMobile}
              key={`${child.key}-${child.href}`}
              node={child}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function SolutionOverview() {
  const [query, setQuery] = useState("");
  const [directoryCollapsed, setDirectoryCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeMethod, setActiveMethod] = useState(0);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const methodTabs = useRef<(HTMLButtonElement | null)[]>([]);
  const filteredDirectory = filterDirectory(
    solutionDirectory,
    query.trim().toLowerCase(),
  );
  const method = content.methods[activeMethod];

  useEffect(() => {
    if (mobileOpen) searchInput.current?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileTrigger.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  const selectMethod = (index: number) => {
    setActiveMethod(index);
    methodTabs.current[index]?.focus();
  };

  const onMethodKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next = activeMethod;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (activeMethod + 1) % content.methods.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next =
        (activeMethod - 1 + content.methods.length) % content.methods.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = content.methods.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    selectMethod(next);
  };

  return (
    <main className="solutions-page">
      <button
        ref={mobileTrigger}
        type="button"
        className="solution-directory-mobile"
        aria-controls="solution-directory"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}
      >
        解决方案目录
      </button>
      <button
        type="button"
        className="solution-directory-backdrop"
        aria-label="关闭解决方案目录"
        data-open={mobileOpen}
        onClick={() => {
          setMobileOpen(false);
          mobileTrigger.current?.focus();
        }}
      />
      <div
        className="solution-shell"
        data-directory-collapsed={directoryCollapsed}
      >
        <aside
          id="solution-directory"
          className="solution-directory"
          aria-label="解决方案目录"
          data-mobile-open={mobileOpen}
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
                    closeMobile={() => setMobileOpen(false)}
                    key={`${node.key}-${node.href}`}
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

        <div className="solution-content">
          <section id="solution-overview-hero" className="solution-hero">
            <div className="solution-hero__copy">
              <p className="solution-eyebrow">{content.hero.eyebrow}</p>
              <h1>{content.hero.title}</h1>
              <p className="solution-lead">{content.hero.lead}</p>
              <div
                className="solution-problems"
                aria-labelledby="solution-problem-title"
              >
                <h2 id="solution-problem-title">{content.hero.problemTitle}</h2>
                <div>
                  {content.hero.problems.map(([label, anchor]) => (
                    <Link href={`/solutions#${anchor}`} key={anchor}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="solution-actions">
                {content.hero.actions.map(([label, href], index) => (
                  <Link
                    className={
                      index === 0
                        ? "solution-button solution-button--primary"
                        : "solution-button"
                    }
                    href={href}
                    key={href}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            <div
              className="solution-map"
              aria-label="业务问题到业务成果关系图素材槽位"
            >
              <span className="solution-tag">{content.hero.map.label}</span>
              <h2>{content.hero.map.title}</h2>
              <div className="solution-map__flow">
                {content.hero.map.columns.map(([title, ...items], index) => (
                  <div className="solution-map__column" key={title}>
                    <article>
                      <b>{title}</b>
                      {items.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </article>
                    {index < content.hero.map.columns.length - 1 ? (
                      <i aria-hidden="true">→</i>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="solution-map__governance">
                {content.hero.map.governance}
              </div>
              <p className="solution-note">{content.hero.map.note}</p>
            </div>
          </section>

          <section id="solution-common-scenes" className="solution-section">
            <div className="solution-section__heading">
              <div>
                <p className="solution-eyebrow">02｜通用场景方案</p>
                <h2>从常见业务问题进入对应解决方案</h2>
                <p>
                  总览页优先展示六个客户容易理解的方案；其余模型、算力、知识资产、非结构化数据和视频检索方案保留在完整列表中。
                </p>
              </div>
              <Link
                className="solution-button"
                href="/solutions?view=common#solution-scenarios-directory"
              >
                查看全部通用场景方案
              </Link>
            </div>
            <div className="solution-scenes">
              {content.scenes.map((scene) => (
                <article
                  id={scene.id}
                  data-solution-scene
                  key={scene.id}
                  tabIndex={-1}
                >
                  <span className="solution-tag">{scene.category}</span>
                  <h3>{scene.title}</h3>
                  <div className="solution-card-fields">
                    <p>
                      <b>业务问题</b> {scene.problem}
                    </p>
                    <p>
                      <b>适用对象</b> {scene.audience}
                    </p>
                    <p>
                      <b>核心价值</b> {scene.value}
                    </p>
                  </div>
                  <div className="solution-visual">{scene.visual}</div>
                  <div className="solution-capabilities">
                    {scene.capabilities.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <Link href={`/solutions/${scene.key}#${scene.anchor}`}>
                    查看解决方案 →
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section
            id="solution-methodology"
            className="solution-section solution-methodology"
          >
            <p className="solution-eyebrow">03｜解决方案建设方法</p>
            <h2>将平台能力转化为可落地的业务方案</h2>
            <p>
              从问题识别到上线运营形成连续建设路径。点击步骤可查看该阶段的目标、主要工作与输出。
            </p>
            <div
              className="solution-methods"
              role="tablist"
              aria-label="解决方案建设方法"
            >
              {content.methods.map((item, index) => (
                <button
                  ref={(button) => {
                    methodTabs.current[index] = button;
                  }}
                  type="button"
                  id={`solution-method-${item[0]}`}
                  role="tab"
                  aria-controls="solution-method-panel"
                  aria-selected={activeMethod === index}
                  tabIndex={activeMethod === index ? 0 : -1}
                  key={item[0]}
                  onClick={() => selectMethod(index)}
                  onKeyDown={onMethodKeyDown}
                >
                  {item[1]}
                </button>
              ))}
            </div>
            <div
              id="solution-method-panel"
              className="solution-method-panel"
              role="tabpanel"
              aria-labelledby={`solution-method-${method[0]}`}
              tabIndex={0}
            >
              <div>
                <b>阶段目标</b>
                <p>{method[2]}</p>
              </div>
              <div>
                <b>主要工作</b>
                <p>{method[3]}</p>
              </div>
              <div>
                <b>阶段输出</b>
                <p>{method[4]}</p>
              </div>
            </div>
          </section>

          <section
            id="solution-industries-overview"
            className="solution-section"
          >
            <div className="solution-section__heading">
              <div>
                <p className="solution-eyebrow">04｜行业解决方案</p>
                <h2>面向成熟行业继续细分具体业务场景</h2>
                <p>
                  行业只作为分类，用户进入行业列表后选择具体行业场景方案；正式官网仅展示已经确认可对外推广的内容。
                </p>
              </div>
              <Link
                className="solution-button"
                href="/solutions?view=industry#industry-solutions-list"
              >
                查看全部行业方案
              </Link>
            </div>
            <div className="solution-industries">
              {content.industries.map(
                ([key, title, problem, scenes, status, visual, link]) => (
                  <article data-solution-industry key={key}>
                    <span className="solution-tag">行业分类入口</span>
                    <h3>{title}</h3>
                    <p>
                      <b>行业问题：</b>
                      {problem}
                    </p>
                    <p>
                      <b>具体场景：</b>
                      {scenes}
                    </p>
                    <p>
                      <b>内容状态：</b>
                      {status}
                    </p>
                    <div className="solution-visual">{visual}</div>
                    <Link
                      href={`/solutions?view=industry&category=${key}#industry-solutions-list`}
                    >
                      {link}
                    </Link>
                  </article>
                ),
              )}
            </div>
            <p className="solution-context">{content.industryNote}</p>
          </section>

          <section id="solution-product-support" className="solution-section">
            <p className="solution-eyebrow">05｜华鲲产品与能力支撑</p>
            <h2>华鲲能力如何支撑解决方案</h2>
            <p>
              本模块只说明解决方案由哪些能力支撑，不重复产品页面的完整功能介绍。
            </p>
            <div className="solution-support">
              {content.support.map(([title, description, href]) => (
                <Link href={href} key={title}>
                  <b>{title}</b>
                  <span>{description}</span>
                </Link>
              ))}
            </div>
            <Link className="solution-governance" href={content.governance[3]}>
              <b>{content.governance[0]}</b>
              <span>{content.governance[1]}</span>
              <em>{content.governance[2]}</em>
            </Link>
          </section>

          <section id="solution-cases-overview" className="solution-section">
            <div className="solution-section__heading">
              <div>
                <p className="solution-eyebrow">06｜实践案例</p>
                <h2>通过真实实践验证解决方案价值</h2>
                <p>案例资料、客户名称和成果数据仅在获得公开授权后展示。</p>
              </div>
              <Link
                className="solution-button"
                href="/solutions?view=cases#practice-cases-hero"
              >
                进入实践案例
              </Link>
            </div>
            <article
              id="solution-case-pending"
              className="solution-case"
              tabIndex={0}
            >
              <div className="solution-visual">
                {content.case.visual.split("\n").map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
              <div>
                <span className="solution-tag">{content.case.label}</span>
                <h3>{content.case.title}</h3>
                {content.case.fields.map(([label, value]) => (
                  <p key={label}>
                    <b>{label}</b>
                    {value}
                  </p>
                ))}
                <Link href={content.case.link[1]}>{content.case.link[0]}</Link>
              </div>
            </article>
          </section>

          <section id="solution-final-cta" className="solution-section">
            <div className="solution-cta">
              <div>
                <p className="solution-eyebrow">07｜行动收口</p>
                <h2>{content.cta.title}</h2>
                <p>{content.cta.description}</p>
              </div>
              <div className="solution-actions">
                {content.cta.actions.map(([label, href], index) => (
                  <Link
                    className={
                      index === 0
                        ? "solution-button solution-button--primary"
                        : "solution-button"
                    }
                    href={href}
                    key={href}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
            <p className="solution-context">{content.cta.note}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
