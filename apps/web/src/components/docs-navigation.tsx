import Link from "next/link";
import { docsCategories } from "./docs-content";

type DocsNavigationProps = {
  currentSlug?: string;
};

type DocsMobileNavigationProps = DocsNavigationProps & {
  currentTitle: string;
};

const staticDocumentSlugs: Readonly<Record<string, string>> = {
  D1: "quick-start",
  D2: "deployment",
  D3: "upgrade",
  D4: "operations",
  D5: "api",
  D6: "hardware",
  D7: "faq",
};

export function staticDocumentSlug(code: string): string {
  return staticDocumentSlugs[code] ?? code.toLowerCase();
}

export function DocsNavigation({ currentSlug }: DocsNavigationProps) {
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
        {docsCategories.map((category) => {
          const slug = staticDocumentSlug(category.code);
          return (
            <Link
              href={`/docs/${slug}`}
              key={category.code}
              className="docs-navigation__link"
              aria-current={currentSlug === slug ? "page" : undefined}
            >
              <span className="docs-navigation__code">{category.code}</span>
              <span>{category.title}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function DocsMobileNavigation({
  currentSlug,
  currentTitle,
}: DocsMobileNavigationProps) {
  return (
    <details className="docs-mobile-navigation">
      <summary>
        <span>浏览文档</span>
        <strong>{currentTitle}</strong>
      </summary>
      <DocsNavigation currentSlug={currentSlug} />
    </details>
  );
}
