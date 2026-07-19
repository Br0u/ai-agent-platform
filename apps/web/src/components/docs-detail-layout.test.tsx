import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
import { DocsDetailLayout } from "./docs-detail-layout";
import type { PublicDocument } from "./docs-content";

const documents = ["alpha", "beta", "gamma"].map(
  (slug, index) =>
    ({
      id: slug,
      revision: index + 1,
      slug,
      title: slug.toUpperCase(),
      summary: `${slug}摘要`,
      body: {},
      navigation: {
        code: `D${index + 1}`,
        label: slug.toUpperCase(),
        position: index + 1,
      },
    }) as unknown as PublicDocument,
);

describe("DocsDetailLayout", () => {
  it("keeps both navigations and the pager aligned with category order", () => {
    const currentIndex = 1;
    const current = documents[currentIndex]!;
    const previous = documents[currentIndex - 1]!;
    const next = documents[currentIndex + 1]!;

    const { container } = render(
      <DocsDetailLayout
        documents={documents}
        currentSlug={current.slug}
        title={current.title}
        description={current.summary}
        toc={[
          { id: "path", title: "上手路径", depth: 2 },
          { id: "prepare", title: "准备环境", depth: 3 },
        ]}
      >
        <p>文档正文</p>
      </DocsDetailLayout>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: current.title }),
    ).toBeVisible();
    expect(screen.getByText("文档正文")).toBeVisible();

    const chrome = container.querySelector<HTMLElement>(
      ".public-docs-chrome__navbar",
    );
    expect(chrome).not.toBeNull();
    const banner = within(chrome!).getByRole("banner");
    expect(
      within(banner).getByRole("link", { name: current.title }),
    ).toHaveAttribute("href", `/docs/${current.slug}`);
    expect(
      within(banner).getByRole("searchbox", { name: "搜索文档" }),
    ).toBeVisible();
    const search = within(banner).getByRole("searchbox", { name: "搜索文档" });
    fireEvent.change(search, { target: { value: "d3" } });
    const searchResults = within(banner).getByRole("list", {
      name: "搜索结果",
    });
    expect(
      within(searchResults).getByRole("link", { name: /GAMMA/u }),
    ).toHaveAttribute("href", "/docs/gamma");
    fireEvent.change(search, { target: { value: "不存在的文档" } });
    expect(within(banner).getByRole("status")).toHaveTextContent(
      "没有匹配的文档",
    );
    expect(
      screen.getByText("AI Agent Platform · 企业级 AI 开发文档", {
        selector: "small",
      }),
    ).toBeVisible();

    const navigations = screen.getAllByRole("navigation", {
      name: "文档目录",
    });
    expect(navigations).toHaveLength(2);
    expect(
      screen.getByText(current.title, { selector: "strong" }),
    ).toBeVisible();

    for (const navigation of navigations) {
      for (const document of documents) {
        const link = within(navigation).getByRole("link", {
          name: new RegExp(
            `${document.navigation.code}\\s*${document.title}`,
            "u",
          ),
        });
        expect(link).toHaveAttribute("href", `/docs/${document.slug}`);
        if (document.slug === current.slug) {
          expect(link).toHaveAttribute("aria-current", "page");
        } else {
          expect(link).not.toHaveAttribute("aria-current");
        }
      }
    }

    const outline = screen.getByRole("navigation", { name: "本页目录" });
    expect(
      within(outline).getByRole("link", { name: "上手路径" }),
    ).toHaveAttribute("href", "#path");
    expect(
      within(outline).getByRole("link", { name: "准备环境" }),
    ).toHaveAttribute("href", "#prepare");

    const pager = screen.getByRole("navigation", { name: "相邻文档" });
    expect(
      within(pager).getByRole("link", {
        name: new RegExp(`上一篇\\s*${previous.title}`, "u"),
      }),
    ).toHaveAttribute("href", `/docs/${previous.slug}`);
    expect(
      within(pager).getByRole("link", {
        name: new RegExp(`下一篇\\s*${next.title}`, "u"),
      }),
    ).toHaveAttribute("href", `/docs/${next.slug}`);
  });
});
