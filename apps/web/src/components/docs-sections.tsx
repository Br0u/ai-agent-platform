"use client";

import React from "react";
import "./docs-center.css";
import {
  docsTechCapabilities,
  docsCategories,
  docsLayoutSpec,
} from "./docs-static-content";

/* ========================================================================
   文档中心主页组件
   包含四大区块：Hero、技术底座、布局预览、核心目录体系
   ======================================================================== */

/* ---------- S1: Hero 区块 ---------- */
export function DocsHero() {
  return (
    <header className="docs-hero">
      <h1 className="docs-hero__title">
        <span>文档中心</span>
      </h1>
      <p className="docs-hero__subtitle">
        基于 Nextra 构建的企业级技术文档平台，支持多版本管理、全文检索、 Mermaid
        架构图、OpenAPI 接口渲染与 PDF 导出，为您的团队提供一站式知识查阅体验。
      </p>
      <div className="docs-hero__search" role="searchbox" tabIndex={0}>
        <span className="docs-hero__search-icon" aria-hidden="true">
          🔍
        </span>
        <span>搜索文档、API、部署指南...</span>
        <span className="docs-hero__search-kbd" aria-hidden="true">
          ⌘ K
        </span>
      </div>
    </header>
  );
}

/* ---------- S2: 技术底座能力 ---------- */
export function DocsTechStack() {
  return (
    <section className="docs-tech" aria-labelledby="docs-tech-title">
      <h2 id="docs-tech-title" className="docs-section__title">
        技术底座
      </h2>
      <p className="docs-section__desc">
        文档系统原生支持以下企业级能力，所有功能开箱即用，无需额外集成。
      </p>
      <div className="docs-tech__grid">
        {docsTechCapabilities.map((cap, i) => (
          <div className="docs-tech__card" key={i}>
            <div className="docs-tech__card-icon" aria-hidden="true">
              {cap.icon}
            </div>
            <h3>{cap.title}</h3>
            <p>{cap.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- S3: 三栏布局预览（线框图） ---------- */
export function DocsLayoutPreview() {
  const spec = docsLayoutSpec;
  // 树形导航内容（用于左侧面板演示）
  const navGroups = [
    {
      label: "快速开始",
      items: ["新手入门", "快速部署", "快速体验"],
    },
    {
      label: "部署指南",
      items: ["单机部署", "集群部署", "离线部署", "HA 高可用"],
    },
    {
      label: "运维手册",
      items: ["日常运维", "日志查看", "故障排查"],
    },
  ];

  return (
    <section
      className="docs-layout-preview"
      aria-labelledby="docs-layout-title"
    >
      <div className="docs-layout-preview__inner">
        <h2 id="docs-layout-title" className="docs-section__title">
          页面布局规范
        </h2>
        <p className="docs-section__desc">
          文档页面采用经典的三栏布局：顶部全局搜索与版本切换、左侧固定悬浮树形导航、右侧正文渲染与目录锚点。
        </p>

        {/* 线框图 */}
        <div className="docs-layout__wireframe" aria-label="文档页面布局示意图">
          {/* 顶栏 */}
          <div className="docs-wireframe__top">
            {spec.top.features.map((f, i) => (
              <div className="docs-wireframe__top-item" key={i}>
                {f}
              </div>
            ))}
            <div className="docs-wireframe__top-search">🔍 搜索文档...</div>
          </div>

          {/* 左侧导航 */}
          <div className="docs-wireframe__sidebar">
            {navGroups.map((group, gi) => (
              <div className="docs-wireframe__nav-group" key={gi}>
                <h4>{group.label}</h4>
                {group.items.map((item, ii) => (
                  <div
                    className={`docs-wireframe__nav-item${
                      gi === 0 && ii === 0
                        ? " docs-wireframe__nav-item--active"
                        : ""
                    }`}
                    key={ii}
                  >
                    {item}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 右侧正文 */}
          <div className="docs-wireframe__content">
            <h3 className="docs-wireframe__content-title">新手入门</h3>
            <div className="docs-wireframe__content-bar">
              <span className="docs-wireframe__content-tag">快速开始</span>
              <span className="docs-wireframe__content-tag">v3.2</span>
              {spec.right.features.slice(3).map((f, i) => (
                <span className="docs-wireframe__content-tag" key={i}>
                  {f}
                </span>
              ))}
            </div>
            <div className="docs-wireframe__content-lines">
              <div className="docs-wireframe__line docs-wireframe__line--long" />
              <div className="docs-wireframe__line docs-wireframe__line--medium" />
              <div className="docs-wireframe__line docs-wireframe__line--long" />
              <div className="docs-wireframe__line docs-wireframe__line--short" />
              <div className="docs-wireframe__line docs-wireframe__line--long" />
              <div className="docs-wireframe__line docs-wireframe__line--medium" />
              <div className="docs-wireframe__line docs-wireframe__line--short" />
              <div className="docs-wireframe__line docs-wireframe__line--long" />
            </div>
            <div className="docs-wireframe__content-nav">
              <span>← 上一篇</span>
              <span>下一篇 →</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- S4: 核心文档目录体系 ---------- */
export function DocsCategoryIndex() {
  return (
    <section
      className="docs-categories"
      aria-labelledby="docs-categories-title"
    >
      <h2 id="docs-categories-title" className="docs-section__title">
        核心文档目录
      </h2>
      <p className="docs-section__desc">
        面向企业落地导向的文档体系，覆盖从快速上手到深度运维的完整知识链路。
      </p>
      <div className="docs-categories__grid">
        {docsCategories.map((cat) => (
          <div className="docs-category" key={cat.code}>
            <div className="docs-category__header">
              <span className="docs-category__icon" aria-hidden="true">
                {cat.icon}
              </span>
              <div className="docs-category__info">
                <h3>{cat.title}</h3>
                <p>{cat.description}</p>
              </div>
            </div>
            <div className="docs-category__articles">
              {cat.subCategories.map((article, ai) => (
                <a
                  className="docs-category__article"
                  href={`#${article.id}`}
                  key={ai}
                >
                  <span
                    className="docs-category__article-arrow"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
