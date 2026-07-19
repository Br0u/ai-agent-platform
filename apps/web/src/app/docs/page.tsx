import type { Metadata } from "next";
import { DocCategoryCards } from "@/components/doc-category-cards";
import {
  DocReaderLayout,
  PublicDocsChrome,
} from "@/components/doc-reader-layout";
import {
  isPublicDocumentsAvailabilityError,
  readPublishedDocumentCatalog,
} from "@/components/docs-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "文档中心 · AI Agent Platform",
  description:
    "基于 Nextra 构建的企业级技术文档平台，覆盖快速开始、部署指南、升级手册、运维手册、API 文档、硬件适配与 FAQ。",
};

function DocumentsUnavailable() {
  return (
    <PublicDocsChrome documents={[]}>
      <main className="doc-reader__unavailable" role="alert">
        文档暂不可用，请稍后重试。
      </main>
    </PublicDocsChrome>
  );
}

export default async function DocsPage() {
  let catalog;
  try {
    catalog = await readPublishedDocumentCatalog();
  } catch (error) {
    if (isPublicDocumentsAvailabilityError(error)) {
      return <DocumentsUnavailable />;
    }
    throw error;
  }

  return (
    <DocReaderLayout documents={catalog.documents}>
      <h2 className="doc-section-title">浏览文档</h2>
      <p className="doc-section-desc">
        按使用阶段查找对应主题，从快速开始逐步深入部署、运维与平台集成。
      </p>

      <DocCategoryCards documents={catalog.documents} />
    </DocReaderLayout>
  );
}
