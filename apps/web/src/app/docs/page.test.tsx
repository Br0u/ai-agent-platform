import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { computeSafeDocumentChecksum } from "@ai-agent-platform/document-content";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fulfilled = new Map<string, unknown>();
  return {
    execute: vi.fn(),
    fulfilled,
    getDatabase: vi.fn(),
    unstableCache: vi.fn(
      (callback: (...args: string[]) => unknown, keyParts: readonly string[]) =>
        async (...args: string[]) => {
          const key = JSON.stringify([keyParts, args]);
          if (fulfilled.has(key)) return fulfilled.get(key);
          const value = await callback(...args);
          fulfilled.set(key, value);
          return value;
        },
    ),
  };
});

vi.mock("@ai-agent-platform/database", () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock("next/cache", () => ({ unstable_cache: mocks.unstableCache }));
vi.mock("nextra-theme-blog", () => ({
  Navbar: ({
    children,
    pageMap,
  }: {
    children: React.ReactNode;
    pageMap: Array<{
      frontMatter?: { title?: string };
      name?: string;
      route?: string;
    }>;
  }) => (
    <header>
      <nav aria-label="顶部文档导航">
        {pageMap.map((item) =>
          item.route ? (
            <a href={item.route} key={item.route}>
              {item.frontMatter?.title ?? item.name}
            </a>
          ) : null,
        )}
      </nav>
      {children}
    </header>
  ),
  Footer: ({ children }: { children: React.ReactNode }) => (
    <small>{children}</small>
  ),
}));

import DocsPage, { dynamic } from "./page";
import {
  PublicDocumentsAvailabilityError,
  readPublishedDocumentCatalog,
} from "@/components/docs-content";
import {
  docsCategories,
  docsLayoutSpec,
  docsTechCapabilities,
} from "@/components/docs-static-content";

function safeBody(
  slug: string,
  position: number,
  title: string,
  code = slug.toUpperCase(),
) {
  const unsigned = {
    format: "safe-markdown-v1" as const,
    source: `## ${title}`,
    navigation: { label: title, code, position },
    renderModel: {
      version: 1 as const,
      root: {
        type: "root" as const,
        children: [
          {
            type: "element" as const,
            tagName: "h2",
            properties: { id: `doc-content-${slug}` },
            children: [{ type: "text" as const, value: title }],
          },
        ],
      },
      toc: [{ id: `doc-content-${slug}`, title, depth: 2 }],
    },
  };
  return { ...unsigned, checksum: computeSafeDocumentChecksum(unsigned) };
}

function row({
  id,
  slug,
  routeSlug = slug,
  routeState = "canonical",
  title,
  position,
}: {
  id: string;
  slug: string;
  routeSlug?: string;
  routeState?: "reserved" | "canonical" | "alias";
  title: string;
  position: number;
}) {
  return {
    id,
    revision: 3,
    revisionSlug: slug,
    canonicalSlug: slug,
    title,
    summary: `${title}摘要`,
    body: safeBody(slug, position, title),
    routeSlug,
    routeState,
  };
}

beforeEach(() => {
  mocks.fulfilled.clear();
  mocks.execute.mockReset();
  mocks.getDatabase.mockReset();
  mocks.getDatabase.mockReturnValue({ execute: mocks.execute });
  mocks.execute.mockResolvedValue({ rows: [] });
});

afterEach(cleanup);

describe("published document catalog", () => {
  it("uses one tagged cache boundary and the production database wiring", async () => {
    expect(mocks.unstableCache).toHaveBeenCalledTimes(1);
    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["published-document-catalog-v1"],
      { tags: ["documents"] },
    );

    mocks.execute.mockResolvedValue({
      rows: [
        row({ id: "b", slug: "beta", title: "Beta", position: 4 }),
        row({ id: "a", slug: "alpha", title: "Alpha", position: 4 }),
        row({ id: "z", slug: "first", title: "First", position: 1 }),
      ],
    });

    const catalog = await readPublishedDocumentCatalog();
    const cachedCatalog = await readPublishedDocumentCatalog();

    expect(mocks.getDatabase).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(cachedCatalog).toBe(catalog);
    expect(catalog.documents.map((document) => document.slug)).toEqual([
      "first",
      "alpha",
      "beta",
    ]);
    expect(catalog.documents[1]).toMatchObject({
      title: "Alpha",
      summary: "Alpha摘要",
      revision: 3,
      navigation: { label: "Alpha", position: 4 },
    });
  });

  it("throws a stable availability error and does not cache transient failures", async () => {
    mocks.execute
      .mockRejectedValueOnce(new Error("password=secret connection failed"))
      .mockResolvedValueOnce({
        rows: [row({ id: "a", slug: "alpha", title: "Alpha", position: 1 })],
      });

    await expect(readPublishedDocumentCatalog()).rejects.toBeInstanceOf(
      PublicDocumentsAvailabilityError,
    );
    await expect(readPublishedDocumentCatalog()).resolves.toMatchObject({
      documents: [{ slug: "alpha" }],
    });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a published revision body is malformed", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          ...row({ id: "a", slug: "alpha", title: "Alpha", position: 1 }),
          body: { format: "safe-markdown-v1", source: "unsafe" },
        },
      ],
    });

    await expect(readPublishedDocumentCatalog()).rejects.toBeInstanceOf(
      PublicDocumentsAvailabilityError,
    );
  });

  it("fails closed when a published content row has no live route", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          ...row({ id: "a", slug: "alpha", title: "Alpha", position: 1 }),
          canonicalSlug: null,
          routeSlug: null,
          routeState: null,
        },
      ],
    });

    await expect(readPublishedDocumentCatalog()).rejects.toBeInstanceOf(
      PublicDocumentsAvailabilityError,
    );
  });

  it("queries only the published immutable revision and canonical route surface", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/docs-content.ts"),
      "utf8",
    );

    expect(source).toContain("c.type = 'document'");
    expect(source).toContain("c.status = 'published'");
    expect(source).toContain("c.deleted_at IS NULL");
    expect(source).toContain("c.published_revision IS NOT NULL");
    expect(source).toContain("cr.revision = c.published_revision");
    expect(source).toContain("cr.content_id = c.id");
    expect(source).toContain("LEFT JOIN content_routes AS route");
    expect(source).toContain("LEFT JOIN content_routes AS canonical_route");
    expect(source).not.toMatch(/c\.(?:title|summary|body)\s+AS/u);
  });

  it("keeps server publication code separate from client-safe marketing data", () => {
    const readerSource = readFileSync(
      join(process.cwd(), "src/components/docs-content.ts"),
      "utf8",
    );
    const sectionsSource = readFileSync(
      join(process.cwd(), "src/components/docs-sections.tsx"),
      "utf8",
    );
    const staticSource = readFileSync(
      join(process.cwd(), "src/components/docs-static-content.ts"),
      "utf8",
    );
    const searchSource = readFileSync(
      join(process.cwd(), "src/app/docs/docs-search.tsx"),
      "utf8",
    );
    const chromeSource = readFileSync(
      join(process.cwd(), "src/components/doc-reader-layout.tsx"),
      "utf8",
    );

    expect(readerSource.startsWith('import "server-only";')).toBe(true);
    expect(readerSource).not.toContain("docsTechCapabilities");
    expect(readerSource).not.toContain("docsCategories");
    expect(readerSource).not.toContain("docsLayoutSpec");
    expect(sectionsSource).toContain('from "./docs-static-content"');
    expect(sectionsSource).not.toContain('from "./docs-content"');
    expect(staticSource).not.toContain("server-only");
    expect(searchSource).not.toContain("nextra/components");
    expect(searchSource.toLowerCase()).not.toContain("pagefind");
    expect(chromeSource).not.toContain("document.body");
    expect(docsCategories).toHaveLength(7);
    expect(docsTechCapabilities).toHaveLength(8);
    expect(docsLayoutSpec.right.features).toContain("问题反馈");
  });
});

describe("public docs overview", () => {
  it("renders the same ordered database DTO in cards and both navigations", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        row({ id: "b", slug: "second", title: "第二篇", position: 2 }),
        row({ id: "a", slug: "first", title: "第一篇", position: 1 }),
      ],
    });

    const { container } = render(await DocsPage());
    const navigations = screen.getAllByRole("navigation", {
      name: "文档目录",
    });
    const cards = container.querySelector<HTMLElement>(".doc-cards-grid");
    expect(cards).not.toBeNull();

    for (const [slug, title] of [
      ["first", "第一篇"],
      ["second", "第二篇"],
    ] as const) {
      expect(
        within(cards!).getByRole("link", { name: new RegExp(title, "u") }),
      ).toHaveAttribute("href", `/docs/${slug}`);
      for (const navigation of navigations) {
        expect(
          within(navigation).getByRole("link", {
            name: new RegExp(title, "u"),
          }),
        ).toHaveAttribute("href", `/docs/${slug}`);
      }
    }
  });

  it("renders a fixed generic unavailable state without leaking database details", async () => {
    mocks.execute.mockRejectedValue(
      new Error("postgresql://admin:secret@db.internal/documents"),
    );

    render(await DocsPage());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "文档暂不可用，请稍后重试。",
    );
    expect(screen.queryByText(/secret|postgresql|db\.internal/u)).toBeNull();
    expect(screen.getByRole("searchbox", { name: "搜索文档" })).toBeVisible();
    expect(
      screen.getByText("AI Agent Platform · 企业级 AI 开发文档", {
        selector: "small",
      }),
    ).toBeVisible();
  });

  it("is request-time rendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
