"use client";

import React from "react";
import Link from "next/link";
import "./module-detail.css";
import { type coreModules } from "./product-content";

type ModuleData = (typeof coreModules)[number];

type ExtendedModuleData = ModuleData & {
  relatedDocs?: { href: string; title: string }[];
  scenarios?: string[];
  guide?: { step: string; description: string }[];
};

export function ModuleDetailPage({ moduleData }: { moduleData: ModuleData }) {
  const extendedData = moduleData as ExtendedModuleData;
  // 辅助函数：根据能力生成一些“形容词”标题，模拟 PAI 的“功能全面、性能更高”等
  const featureTitles = ["功能全面", "性能更高", "稳定可靠", "简单易用", "安全合规", "弹性扩容"];
  
  return (
    <article className="module-detail">
      {/* 1. Hero Section (复刻图2 PAI Header) */}
      <header className="module-hero-pai">
        <div className="module-hero-pai__content">
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "24px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="华鲲元启" style={{ height: "40px" }} />
          </div>
          <h1 className="module-hero-pai__title">
            <span className="module-hero-pai__brand">AI Agent Platform</span>
            {moduleData.name} {moduleData.title}
          </h1>
          <h2 className="module-hero-pai__subtitle">
            最新支持国产化适配与全栈私有化部署，构建更安全的智能体
          </h2>
          <p className="module-hero-pai__desc">{moduleData.description}</p>
          
          <div className="module-hero-pai__actions">
            <button className="pai-btn pai-btn--primary">立即购买</button>
            <button className="pai-btn pai-btn--outline">免费试用</button>
          </div>
        </div>
      </header>

      {/* 2. 产品功能 (Capabilities - 4 列平铺) */}
      {moduleData.capabilities && moduleData.capabilities.length > 0 && (
        <section className="pai-section pai-features">
          <div className="pai-container">
            <div className="pai-features__grid">
              {moduleData.capabilities.map((cap, i) => (
                <div key={i} className="pai-feature-card">
                  <h3 className="pai-feature-card__title">
                    {featureTitles[i % featureTitles.length]}
                  </h3>
                  <p className="pai-feature-card__desc">
                    通过 {moduleData.name} 提供 {cap} 的核心能力，深度优化企业级 AI 任务的处理效率与响应速度，满足全场景需求。
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 3. 产品动态 (Related Docs 模拟) */}
      {extendedData.relatedDocs && extendedData.relatedDocs.length > 0 && (
        <section className="pai-section pai-news">
          <div className="pai-container">
            <h2 className="pai-section__title">产品动态</h2>
            <div className="pai-news__grid">
              {extendedData.relatedDocs.map((doc, i: number) => (
                <Link key={i} href={doc.href} className="pai-news-card">
                  <div className="pai-news-card__meta">
                    <span className="pai-news-card__tag">新发布</span>
                    <span className="pai-news-card__date">2026-03-1{i}</span>
                  </div>
                  <h3 className="pai-news-card__title">{doc.title} 上线</h3>
                  <p className="pai-news-card__desc">
                    {moduleData.name} 最新发布了 {doc.title} 功能，涵盖多种部署架构下的性能调优、运维管理与开发环境适配，满足企业级场景需求。
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 4. 产品简介 (大图架构模拟) */}
      <section className="pai-section pai-intro">
        <div className="pai-container">
          <h2 className="pai-section__title">产品简介</h2>
          <p className="pai-intro__desc">
            {moduleData.title} ({moduleData.name}) 是面向开发者和企业的人工智能平台，提供包含模型构建、推理优化在内的 AI 开发全链路服务，内置多种行业场景插件，为用户提供低门槛、高性能的云原生 AI 工程化能力。
          </p>
          <div className="pai-intro__architecture">
            {/* 用 CSS 绘制的高级架构图骨架屏 */}
            <div className="pai-arch-mock">
              <div className="pai-arch-mock__layer pai-arch-mock__layer--top">
                <span>场景化解决方案 (Scenario-specific Solutions)</span>
                <div className="pai-arch-mock__boxes">
                  <div>AI Agent</div><div>自动驾驶</div><div>具身智能</div><div>金融风控</div>
                </div>
              </div>
              <div className="pai-arch-mock__layer pai-arch-mock__layer--mid">
                <span>模型服务 (Model as a Service)</span>
                <div className="pai-arch-mock__boxes">
                  <div className="wide">内部私有模型仓库</div>
                  <div className="wide">外部开源模型池</div>
                </div>
              </div>
              <div className="pai-arch-mock__layer pai-arch-mock__layer--bottom">
                <span>平台底座 (Platform Foundation)</span>
                <div className="pai-arch-mock__boxes">
                  <div className="full">异构算力调度集群 (GPU / NPU)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 产品优势 (左右交替排版) */}
      {(((extendedData.scenarios?.length ?? 0) > 0) || ((extendedData.guide?.length ?? 0) > 0)) && (
        <section className="pai-section pai-advantages">
          <div className="pai-container">
            <h2 className="pai-section__title">产品优势</h2>
            <p className="pai-advantages__subtitle">
              通过 {moduleData.name}，零代码快速实现模型集成、评测、部署的全方位服务，给您带来更快、更高效、更便捷的 AI 应用体验。
            </p>
            
            <div className="pai-adv-list">
              {/* 合并 scenarios 和 guide 作为优势条目 */}
              {[...(extendedData.scenarios || []), ...(extendedData.guide?.map((g) => g.description) || [])].map((item, i) => (
                <div key={i} className="pai-adv-item">
                  <div className="pai-adv-item__image">
                    {/* CSS 模拟的控制台截图骨架屏 */}
                    <div className="pai-screenshot-mock">
                      <div className="pai-screenshot-mock__header">
                        <span className="dot dot-r"></span>
                        <span className="dot dot-y"></span>
                        <span className="dot dot-g"></span>
                      </div>
                      <div className="pai-screenshot-mock__body">
                        <div className="pai-mock-sidebar"></div>
                        <div className="pai-mock-content">
                          <div className="pai-mock-line w-60"></div>
                          <div className="pai-mock-line w-40"></div>
                          <div className="pai-mock-chart"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="pai-adv-item__text">
                    <h3 className="pai-adv-item__title">
                      {extendedData.guide && extendedData.guide[i] ? extendedData.guide[i].step : "企业级 AI 核心场景突破"}
                    </h3>
                    <p className="pai-adv-item__desc">
                      {item}
                    </p>
                    <Link href="/docs" className="pai-adv-item__link">查看更多 &gt;</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
