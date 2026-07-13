import React from "react";
import { notFound } from "next/navigation";
import { docsCategories } from "@/components/docs-content";
import { DocReaderLayout } from "@/components/doc-reader-layout";
import { DocCategoryCards } from "@/components/doc-category-cards";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ category: string }>;
};

// 根据 URL 的 category 参数找到对应的文档大类
function findCategoryBySlug(slug: string) {
  return docsCategories.find((cat) => {
    // 之前是用 articles[0].href，现在直接根据约定的 slug 规则或为了简便这里我们用 code 小写代替
    // 为了兼容，我们假设 slug 类似于 D1, D2 的小写形式，或者我们需要更新 href 映射。
    // 但是这里最安全的是返回 cat.code === slug
    return cat.code.toLowerCase() === slug.toLowerCase() || 
           // 兼容之前的：如果之前的路由是 quick-start, deployment 等，我们这里做硬编码映射
           (slug === "quick-start" && cat.code === "D1") ||
           (slug === "deployment" && cat.code === "D2") ||
           (slug === "upgrade" && cat.code === "D3") ||
           (slug === "operations" && cat.code === "D4") ||
           (slug === "api" && cat.code === "D5") ||
           (slug === "hardware" && cat.code === "D6") ||
           (slug === "faq" && cat.code === "D7");
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const catData = findCategoryBySlug(category);

  if (!catData) {
    return { title: "页面未找到 · AI Agent Platform" };
  }

  return {
    title: `${catData.title} - 文档中心 · AI Agent Platform`,
    description: catData.description,
  };
}

export default async function DocCategoryPage({ params }: PageProps) {
  const { category } = await params;
  const catData = findCategoryBySlug(category);

  if (!catData) {
    notFound();
  }

  const renderContent = () => {
    // 渲染通用分类页
    return (
      <>
        <h2 className="doc-section-title">由浅入深，开始使用平台</h2>
        <p className="doc-section-desc">
          在这里，您可以快速找到{catData.title}所需的所有文档与资源。
        </p>
        
        {/* 使用客户端组件渲染卡片，以便触发 Context 联动 */}
        <DocCategoryCards subCategories={catData.subCategories} />
      </>
    );
  };

  return (
    <DocReaderLayout currentCategoryCode={catData.code}>
      {renderContent()}
    </DocReaderLayout>
  );
}
