import type { ReactNode } from "react";
import { Footer, Navbar } from "nextra-theme-blog";
import { ViewTransitions } from "next-view-transitions";
import { getPageMap } from "nextra/page-map";
import { DocsSearch } from "./docs-search";
import "nextra-theme-blog/style.css";
import "./docs-nextra.css";

export default async function DocsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pageMap = await getPageMap("/docs");

  return (
    <div className="docs-nextra-shell">
      <article
        className="x:container x:px-4 x:prose x:max-md:prose-sm x:dark:prose-invert"
        dir="ltr"
        data-pagefind-body
      >
        <ViewTransitions>
          <Navbar pageMap={pageMap}>
            <DocsSearch />
          </Navbar>
          {children}
          <Footer>AI Agent Platform · 企业级 AI 开发文档</Footer>
        </ViewTransitions>
      </article>
    </div>
  );
}
