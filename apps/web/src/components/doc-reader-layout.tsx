import type { PageMapItem } from "nextra";
import { Footer, Navbar } from "nextra-theme-blog";
import type { ReactNode } from "react";
import { DocsSearch, type PublicDocsSearchItem } from "@/app/docs/docs-search";
import "./doc-reader-layout.css";
import type { PublicDocument } from "./docs-content";
import { DocsMobileNavigation, DocsNavigation } from "./docs-navigation";

function publicDocsPageMap(
  documents: readonly PublicDocument[],
): PageMapItem[] {
  return [
    {
      name: "index",
      route: "/docs",
      frontMatter: { title: "文档总览", type: "page" },
    },
    ...documents.map((document) => ({
      name: document.slug,
      route: `/docs/${document.slug}`,
      frontMatter: { title: document.navigation.label, type: "page" },
    })),
  ];
}

export function PublicDocsChrome({
  children,
  documents,
}: {
  children: ReactNode;
  documents: readonly PublicDocument[];
}) {
  const searchDocuments: PublicDocsSearchItem[] = documents.map((document) => ({
    slug: document.slug,
    title: document.title,
    summary: document.summary,
    navigation: {
      label: document.navigation.label,
      code: document.navigation.code,
    },
  }));

  return (
    <>
      <div className="public-docs-chrome__navbar">
        <Navbar pageMap={publicDocsPageMap(documents)}>
          <DocsSearch documents={searchDocuments} />
        </Navbar>
      </div>
      {children}
      <Footer>AI Agent Platform · 企业级 AI 开发文档</Footer>
    </>
  );
}

export function DocReaderLayout({
  children,
  documents,
}: {
  children: ReactNode;
  documents: readonly PublicDocument[];
}) {
  return (
    <PublicDocsChrome documents={documents}>
      <div className="doc-reader">
        <aside className="doc-reader__sidebar">
          <DocsNavigation documents={documents} />
        </aside>

        <main className="doc-reader__main">
          <DocsMobileNavigation documents={documents} currentTitle="文档总览" />

          <div className="doc-reader__breadcrumb" aria-label="面包屑导航">
            <span>文档中心</span>
            <span aria-hidden="true">/</span>
            <span>总览</span>
          </div>

          <header className="doc-reader__header">
            <span className="doc-reader__header-kicker">overview</span>
            <h1 className="doc-reader__title">文档中心</h1>
            <p className="doc-reader__desc">
              从首次部署到生产运维，按清晰路径查找平台概念、操作指南、API
              参考与硬件适配说明。
            </p>
          </header>

          <div className="doc-content">{children}</div>
        </main>
      </div>
    </PublicDocsChrome>
  );
}
