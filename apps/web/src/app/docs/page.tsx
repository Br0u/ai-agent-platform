import React from "react";
import type { Metadata } from "next";
import { DocReaderLayout } from "@/components/doc-reader-layout";
import { docsCategories } from "@/components/docs-content";

export const metadata: Metadata = {
  title: "文档中心 · AI Agent Platform",
  description:
    "基于 Nextra 构建的企业级技术文档平台，覆盖快速开始、部署指南、升级手册、运维手册、API 文档、硬件适配与 FAQ。",
};

export default function DocsPage() {
  return (
    <DocReaderLayout>

      <h2 className="doc-section-title">由浅入深，开始使用平台</h2>
      <p className="doc-section-desc">
        手把手教你快速上手核心产品，助你轻松开启 AI 智能体之旅。
      </p>

      <div className="doc-cards-grid">
        {docsCategories.map((cat, i) => {
          // 由于修改了映射，主页上的卡片点击应该跳转到该分类的详情页
          // 根据约定，我们在 findCategoryBySlug 里面做了映射
          let slug = cat.code.toLowerCase();
          if (cat.code === "D1") slug = "quick-start";
          if (cat.code === "D2") slug = "deployment";
          if (cat.code === "D3") slug = "upgrade";
          if (cat.code === "D4") slug = "operations";
          if (cat.code === "D5") slug = "api";
          if (cat.code === "D6") slug = "hardware";
          if (cat.code === "D7") slug = "faq";
          
          return (
            <a href={`/docs/${slug}`} key={i} className="doc-card">
              <div className="doc-card__icon">
                <span style={{ fontSize: "18px" }}>{cat.icon}</span>
              </div>
              <h3 className="doc-card__title">{cat.title}</h3>
              <p className="doc-card__desc">{cat.description}</p>
            </a>
          );
        })}
      </div>
    </DocReaderLayout>
  );
}
