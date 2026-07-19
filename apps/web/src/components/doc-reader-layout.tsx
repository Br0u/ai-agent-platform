import type { ReactNode } from "react";
import "./doc-reader-layout.css";
import { DocsMobileNavigation, DocsNavigation } from "./docs-navigation";

export function DocReaderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="doc-reader">
      <aside className="doc-reader__sidebar">
        <DocsNavigation />
      </aside>

      <main className="doc-reader__main">
        <DocsMobileNavigation currentTitle="文档总览" />

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
  );
}
