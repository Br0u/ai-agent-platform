import type { Heading } from "@ai-agent-platform/document-content";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicDocument } from "./docs-content";
import { PublicDocsChrome } from "./doc-reader-layout";
import { DocsMobileNavigation, DocsNavigation } from "./docs-navigation";

type DocsDetailLayoutProps = {
  documents: readonly PublicDocument[];
  currentSlug: string;
  title: string;
  description?: string;
  toc: Heading[];
  children: ReactNode;
};

export function DocsDetailLayout({
  documents,
  currentSlug,
  title,
  description,
  toc,
  children,
}: DocsDetailLayoutProps) {
  const currentIndex = documents.findIndex(
    (document) => document.slug === currentSlug,
  );
  const previous = currentIndex > 0 ? documents[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < documents.length - 1
      ? documents[currentIndex + 1]
      : null;

  return (
    <PublicDocsChrome documents={documents}>
      <div className="docs-detail">
        <aside className="docs-detail__sidebar">
          <DocsNavigation documents={documents} currentSlug={currentSlug} />
        </aside>

        <main className="docs-detail__main">
          <DocsMobileNavigation
            documents={documents}
            currentSlug={currentSlug}
            currentTitle={title}
          />

          <div className="docs-detail__breadcrumb" aria-label="面包屑导航">
            <Link href="/docs">文档中心</Link>
            <span aria-hidden="true">/</span>
            <span>{title}</span>
          </div>

          <article className="docs-detail__article">
            <header className="docs-detail__header">
              <h1>{title}</h1>
              {description ? <p>{description}</p> : null}
            </header>

            <div className="docs-detail__body">{children}</div>
          </article>

          <nav className="docs-detail__pager" aria-label="相邻文档">
            {previous ? (
              <Link href={`/docs/${previous.slug}`} rel="prev">
                <span>上一篇</span>
                <strong>{previous.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/docs/${next.slug}`} rel="next">
                <span>下一篇</span>
                <strong>{next.title}</strong>
              </Link>
            ) : null}
          </nav>
        </main>

        {toc.length > 0 ? (
          <aside className="docs-detail__toc">
            <div className="docs-detail__toc-title">本页内容</div>
            <nav aria-label="本页目录">
              {toc.map((heading) => (
                <a
                  href={`#${heading.id}`}
                  key={heading.id}
                  className={heading.depth > 2 ? "is-nested" : undefined}
                >
                  {heading.title}
                </a>
              ))}
            </nav>
            <Link className="docs-detail__feedback" href="/support#bug">
              反馈文档问题
            </Link>
          </aside>
        ) : null}
      </div>
    </PublicDocsChrome>
  );
}
