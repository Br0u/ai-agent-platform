import type { Heading } from "nextra";
import Link from "next/link";
import type { ReactNode } from "react";
import { docsCategories } from "./docs-content";
import {
  DocsMobileNavigation,
  DocsNavigation,
  staticDocumentSlug,
} from "./docs-navigation";

type DocsDetailLayoutProps = {
  currentSlug: string;
  title: string;
  description?: string;
  toc: Heading[];
  children: ReactNode;
};

export function DocsDetailLayout({
  currentSlug,
  title,
  description,
  toc,
  children,
}: DocsDetailLayoutProps) {
  const currentIndex = docsCategories.findIndex(
    (category) => staticDocumentSlug(category.code) === currentSlug,
  );
  const previous = currentIndex > 0 ? docsCategories[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < docsCategories.length - 1
      ? docsCategories[currentIndex + 1]
      : null;

  return (
    <div className="docs-detail">
      <aside className="docs-detail__sidebar">
        <DocsNavigation currentSlug={currentSlug} />
      </aside>

      <main className="docs-detail__main">
        <DocsMobileNavigation currentSlug={currentSlug} currentTitle={title} />

        <div className="docs-detail__breadcrumb" aria-label="面包屑导航">
          <Link href="/docs">文档中心</Link>
          <span aria-hidden="true">/</span>
          <span>{title}</span>
        </div>

        <article className="docs-detail__article">
          <header className="docs-detail__header">
            <span className="docs-detail__eyebrow">{currentSlug}</span>
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
          </header>

          <div className="docs-detail__body">{children}</div>
        </article>

        <nav className="docs-detail__pager" aria-label="相邻文档">
          {previous ? (
            <Link
              href={`/docs/${staticDocumentSlug(previous.code)}`}
              rel="prev"
            >
              <span>上一篇</span>
              <strong>{previous.title}</strong>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/docs/${staticDocumentSlug(next.code)}`} rel="next">
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
                {heading.value}
              </a>
            ))}
          </nav>
          <Link className="docs-detail__feedback" href="/support#bug">
            反馈文档问题
          </Link>
        </aside>
      ) : null}
    </div>
  );
}
