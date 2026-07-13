"use client";

import React, { useState, createContext, useContext } from "react";
import Link from "next/link";
import "./doc-reader-layout.css";
import { docsCategories } from "./docs-content";

interface DocContextType {
  expandedLevel1: string | null;
  expandedLevel2: string | null;
  setExpandedLevel1: (code: string | null) => void;
  setExpandedLevel2: (id: string | null) => void;
}

export const DocReaderContext = createContext<DocContextType>({
  expandedLevel1: null,
  expandedLevel2: null,
  setExpandedLevel1: () => {},
  setExpandedLevel2: () => {},
});

export function useDocReader() {
  return useContext(DocReaderContext);
}

export function DocReaderLayout({
  currentCategoryCode,
  children,
}: {
  currentCategoryCode?: string;
  children: React.ReactNode;
}) {
  const [expandedLevel1, setExpandedLevel1] = useState<string | null>(
    currentCategoryCode || null,
  );
  const [expandedLevel2, setExpandedLevel2] = useState<string | null>(null);

  const currentIndex = docsCategories.findIndex(
    (c) => c.code === currentCategoryCode,
  );
  const currentCategory =
    currentIndex !== -1 ? docsCategories[currentIndex] : null;

  const toggleLevel1 = (code: string) => {
    setExpandedLevel1((prev) => (prev === code ? null : code));
  };

  const toggleLevel2 = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedLevel2((prev) => (prev === id ? null : id));
  };

  return (
    <DocReaderContext.Provider
      value={{
        expandedLevel1,
        expandedLevel2,
        setExpandedLevel1,
        setExpandedLevel2,
      }}
    >
      <div className="doc-reader">
        {/* 左侧边栏导航 */}
        <aside className="doc-reader__sidebar">
          <div className="doc-reader__sidebar-header">
            <h2 className="doc-reader__sidebar-title">全部产品文档</h2>
            <div className="doc-reader__search">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span>搜索相关词</span>
            </div>
          </div>

          <div className="doc-reader__nav-group">
            <Link href="/docs" className="doc-reader__nav-overview">
              <span>全部产品文档</span>
              <span className="doc-reader__nav-overview-arrow">→</span>
            </Link>
          </div>

          {docsCategories.map((cat) => {
            const isExpanded1 = expandedLevel1 === cat.code;
            return (
              <div
                className={`doc-reader__nav-group ${isExpanded1 ? "is-expanded" : ""}`}
                key={cat.code}
              >
                <h4
                  onClick={() => toggleLevel1(cat.code)}
                  className="doc-reader__nav-group-title"
                >
                  <span>{cat.title}</span>
                  <span
                    className={`doc-reader__nav-arrow ${isExpanded1 ? "is-open" : ""}`}
                  >
                    ›
                  </span>
                </h4>
                <div
                  className={`doc-reader__nav-tree-wrapper ${isExpanded1 ? "is-open" : ""}`}
                >
                  <nav
                    aria-label={`${cat.title} 导航`}
                    className="doc-reader__nav-tree"
                  >
                    {cat.subCategories.map((sub) => {
                      const isExpanded2 = expandedLevel2 === sub.id;
                      return (
                        <div key={sub.id} className="doc-reader__nav-sub">
                          <div
                            className={`doc-reader__nav-sub-title ${isExpanded2 ? "is-open" : ""}`}
                            onClick={(e) => toggleLevel2(sub.id, e)}
                          >
                            <span>
                              {sub.title} ({sub.docs.length})
                            </span>
                            <span
                              className={`doc-reader__nav-arrow-small ${isExpanded2 ? "is-open" : ""}`}
                            >
                              ›
                            </span>
                          </div>

                          {/* 真正的第三级：由于目前为空，这里渲染出来也会是空的 */}
                          <div
                            className={`doc-reader__nav-docs-wrapper ${isExpanded2 ? "is-open" : ""}`}
                          >
                            <div className="doc-reader__nav-docs">
                              {sub.docs.map(
                                (doc: { href: string; title: string }, i) => (
                                  <Link
                                    key={i}
                                    href={doc.href}
                                    className="doc-reader__nav-doc-link"
                                  >
                                    {doc.title}
                                  </Link>
                                ),
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </nav>
                </div>
              </div>
            );
          })}
        </aside>

        {/* 中侧正文区域 */}
        <main className="doc-reader__main">
          {currentCategory ? (
            <header className="doc-reader__header">
              <div className="doc-reader__header-inner">
                <h1 className="doc-reader__title">{currentCategory.title}</h1>
                <p className="doc-reader__desc">
                  {currentCategory.description}
                </p>
              </div>
            </header>
          ) : (
            <header className="doc-reader__header">
              <div className="doc-reader__header-inner">
                <h1 className="doc-reader__title">欢迎来到官方文档</h1>
                <p className="doc-reader__desc">
                  覆盖产品介绍、操作指南、场景化用例、开发参考等信息，帮助您更好地上手平台、用好
                  AI 智能体。
                </p>
              </div>
            </header>
          )}

          <div className="doc-content">{children}</div>
        </main>

        {/* 右侧目录 (TOC) */}
        {currentCategory && (
          <aside className="doc-reader__toc">
            <h4 className="doc-reader__toc-title">本页目录</h4>
            <ul className="doc-reader__toc-list">
              {currentCategory.subCategories.map((sub, i) => (
                <li key={i}>
                  <a href={`#${sub.id}`}>{sub.title}</a>
                </li>
              ))}
            </ul>

            <Link href="/support#bug" className="doc-reader__feedback">
              <span aria-hidden="true">💬</span> 意见反馈
            </Link>
          </aside>
        )}
      </div>
    </DocReaderContext.Provider>
  );
}
