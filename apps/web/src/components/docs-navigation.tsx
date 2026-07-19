import Link from "next/link";
import type { PublicDocument } from "./docs-content";

type DocsNavigationProps = {
  documents: readonly PublicDocument[];
  currentSlug?: string;
};

type DocsMobileNavigationProps = DocsNavigationProps & {
  currentTitle: string;
};

export function DocsNavigation({
  documents,
  currentSlug,
}: DocsNavigationProps) {
  return (
    <div className="docs-navigation">
      <div className="docs-navigation__heading">
        <Link href="/docs">开发文档</Link>
        <span>AI Agent Platform</span>
      </div>

      <nav className="docs-navigation__links" aria-label="文档目录">
        <Link
          href="/docs"
          className="docs-navigation__link"
          aria-current={currentSlug ? undefined : "page"}
        >
          <span className="docs-navigation__code">D0</span>
          <span>文档总览</span>
        </Link>

        <div className="docs-navigation__label">主题</div>
        {documents.map((document) => {
          return (
            <Link
              href={`/docs/${document.slug}`}
              key={document.id}
              className="docs-navigation__link"
              aria-current={currentSlug === document.slug ? "page" : undefined}
            >
              <span className="docs-navigation__code">
                {document.navigation.code}
              </span>
              <span>{document.navigation.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function DocsMobileNavigation({
  documents,
  currentSlug,
  currentTitle,
}: DocsMobileNavigationProps) {
  return (
    <details className="docs-mobile-navigation">
      <summary>
        <span>浏览文档</span>
        <strong>{currentTitle}</strong>
      </summary>
      <DocsNavigation documents={documents} currentSlug={currentSlug} />
    </details>
  );
}
