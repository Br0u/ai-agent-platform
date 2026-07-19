import { cleanup, render, screen, within } from "@testing-library/react";
import { computeSafeDocumentChecksum } from "@ai-agent-platform/document-content";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fulfilled = new Map<string, unknown>();
  return {
    execute: vi.fn(),
    fulfilled,
    getDatabase: vi.fn(),
    notFound: vi.fn(),
    permanentRedirect: vi.fn(),
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
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  permanentRedirect: mocks.permanentRedirect,
}));

import DocsDocumentPage, { dynamic, generateMetadata } from "./page";

const notFoundError = new Error("NEXT_NOT_FOUND");
const redirectError = new Error("NEXT_REDIRECT");

function safeBody(
  slug: string,
  position: number,
  title: string,
  marker = title,
) {
  const unsigned = {
    format: "safe-markdown-v1" as const,
    source: `## ${marker}`,
    navigation: { label: title, code: slug.toUpperCase(), position },
    renderModel: {
      version: 1 as const,
      root: {
        type: "root" as const,
        children: [
          {
            type: "element" as const,
            tagName: "h2",
            properties: { id: `doc-content-${slug}` },
            children: [{ type: "text" as const, value: marker }],
          },
        ],
      },
      toc: [{ id: `doc-content-${slug}`, title: marker, depth: 2 }],
    },
  };
  return { ...unsigned, checksum: computeSafeDocumentChecksum(unsigned) };
}

function canonicalRow(
  id: string,
  slug: string,
  title: string,
  position: number,
  marker = title,
) {
  return {
    id,
    revision: position + 5,
    revisionSlug: slug,
    canonicalSlug: slug,
    title,
    summary: `${title}摘要`,
    body: safeBody(slug, position, title, marker),
    routeSlug: slug,
    routeState: "canonical" as const,
  };
}

beforeEach(() => {
  mocks.fulfilled.clear();
  mocks.execute.mockReset();
  mocks.getDatabase.mockReset();
  mocks.notFound.mockReset();
  mocks.permanentRedirect.mockReset();
  mocks.getDatabase.mockReturnValue({ execute: mocks.execute });
  mocks.execute.mockResolvedValue({ rows: [] });
  mocks.notFound.mockImplementation(() => {
    throw notFoundError;
  });
  mocks.permanentRedirect.mockImplementation(() => {
    throw redirectError;
  });
});

afterEach(cleanup);

describe("public document route", () => {
  it("renders the exact published revision body, toc and ordered pager", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        canonicalRow("a", "alpha", "Alpha", 1),
        canonicalRow("b", "beta", "Beta", 2, "PUBLISHED BODY ONLY"),
        canonicalRow("c", "gamma", "Gamma", 3),
      ],
    });

    render(
      await DocsDocumentPage({
        params: Promise.resolve({ category: "beta" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Beta" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "PUBLISHED BODY ONLY" }),
    ).toHaveAttribute("id", "doc-content-beta");
    const outline = screen.getByRole("navigation", { name: "本页目录" });
    expect(
      within(outline).getByRole("link", { name: "PUBLISHED BODY ONLY" }),
    ).toHaveAttribute("href", "#doc-content-beta");
    const pager = screen.getByRole("navigation", { name: "相邻文档" });
    expect(
      within(pager).getByRole("link", { name: /上一篇\s*Alpha/u }),
    ).toHaveAttribute("href", "/docs/alpha");
    expect(
      within(pager).getByRole("link", { name: /下一篇\s*Gamma/u }),
    ).toHaveAttribute("href", "/docs/gamma");
  });

  it("permanently redirects a live alias to its canonical slug", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        canonicalRow("a", "alpha", "Alpha", 1),
        {
          ...canonicalRow("a", "alpha", "Alpha", 1),
          routeSlug: "old-alpha",
          routeState: "alias",
        },
      ],
    });

    await expect(
      DocsDocumentPage({
        params: Promise.resolve({ category: "old-alpha" }),
      }),
    ).rejects.toBe(redirectError);
    expect(mocks.permanentRedirect).toHaveBeenCalledWith("/docs/alpha");
  });

  it.each(["missing", "reserved", "deleted", "archived"])(
    "returns 404 for %s routes",
    async (scenario) => {
      mocks.execute.mockResolvedValue({
        rows:
          scenario === "reserved"
            ? [
                canonicalRow("a", "alpha", "Alpha", 1),
                {
                  ...canonicalRow("a", "alpha", "Alpha", 1),
                  routeSlug: "reserved",
                  routeState: "reserved",
                },
              ]
            : [],
      });

      await expect(
        DocsDocumentPage({
          params: Promise.resolve({ category: scenario }),
        }),
      ).rejects.toBe(notFoundError);
    },
  );

  it("rejects malformed and oversized route segments before the cached reader", async () => {
    for (const category of ["NOT-A-SLUG", `a${"b".repeat(96)}`]) {
      await expect(
        DocsDocumentPage({ params: Promise.resolve({ category }) }),
      ).rejects.toBe(notFoundError);
      await expect(
        generateMetadata({ params: Promise.resolve({ category }) }),
      ).rejects.toBe(notFoundError);
    }

    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("shares one bounded catalog cache across many valid missing slugs", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });

    for (let index = 0; index < 32; index += 1) {
      await expect(
        DocsDocumentPage({
          params: Promise.resolve({ category: `missing-${index}` }),
        }),
      ).rejects.toBe(notFoundError);
    }

    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("does not swallow Next redirect or not-found control flow", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        canonicalRow("a", "alpha", "Alpha", 1),
        {
          ...canonicalRow("a", "alpha", "Alpha", 1),
          routeSlug: "alias",
          routeState: "alias",
        },
      ],
    });
    await expect(
      DocsDocumentPage({ params: Promise.resolve({ category: "missing" }) }),
    ).rejects.toBe(notFoundError);
    await expect(
      generateMetadata({ params: Promise.resolve({ category: "alias" }) }),
    ).rejects.toBe(redirectError);
  });

  it("renders only a fixed unavailable state for typed publication failures", async () => {
    mocks.execute.mockRejectedValue(
      new Error("database host private.internal"),
    );

    render(
      await DocsDocumentPage({
        params: Promise.resolve({ category: "alpha" }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "文档暂不可用，请稍后重试。",
    );
    expect(screen.queryByText(/private\.internal/u)).toBeNull();
    expect(screen.getByRole("searchbox", { name: "搜索文档" })).toBeVisible();
    expect(
      screen.getByText("AI Agent Platform · 企业级 AI 开发文档", {
        selector: "small",
      }),
    ).toBeVisible();
  });
});

describe("public document metadata", () => {
  it("uses the immutable published revision title and summary", async () => {
    mocks.execute.mockResolvedValue({
      rows: [canonicalRow("a", "alpha", "Published Alpha", 1)],
    });

    await expect(
      generateMetadata({ params: Promise.resolve({ category: "alpha" }) }),
    ).resolves.toMatchObject({
      title: "Published Alpha",
      description: "Published Alpha摘要",
    });
  });

  it("uses a safe noindex fallback only for publication availability failures", async () => {
    mocks.execute.mockRejectedValue(new Error("database unavailable"));

    await expect(
      generateMetadata({ params: Promise.resolve({ category: "alpha" }) }),
    ).resolves.toEqual({
      title: "文档暂不可用 · AI Agent Platform",
      robots: { index: false, follow: false },
    });
  });

  it("returns 404 rather than metadata fallback for a missing route", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ category: "missing" }) }),
    ).rejects.toBe(notFoundError);
  });

  it("is request-time rendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
