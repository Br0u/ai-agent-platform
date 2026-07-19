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
import type { PublicDocument } from "./docs-content";
import { DocCategoryCards } from "./doc-category-cards";
import { DocReaderLayout } from "./doc-reader-layout";

const documents = [
  {
    id: "first",
    revision: 2,
    slug: "first",
    title: "第一篇",
    summary: "第一篇摘要",
    body: { source: "PRIVATE_BODY_TOKEN" },
    navigation: { code: "D1", label: "第一篇", position: 1 },
  },
  {
    id: "second",
    revision: 4,
    slug: "second",
    title: "第二篇",
    summary: "第二篇摘要",
    body: { source: "SECOND_PRIVATE_BODY_TOKEN" },
    navigation: { code: "D2", label: "第二篇", position: 2 },
  },
] as unknown as PublicDocument[];

describe("DocReaderLayout", () => {
  it("keeps the real overview cards aligned with both document navigations", () => {
    const { container } = render(
      <DocReaderLayout documents={documents}>
        <DocCategoryCards documents={documents} />
      </DocReaderLayout>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "文档中心" }),
    ).toBeVisible();
    const chrome = container.querySelector<HTMLElement>(
      ".public-docs-chrome__navbar",
    );
    expect(chrome).not.toBeNull();
    const banner = within(chrome!).getByRole("banner");
    expect(
      within(banner).getByRole("link", { name: "第一篇" }),
    ).toHaveAttribute("href", "/docs/first");
    expect(
      within(banner).getByRole("searchbox", { name: "搜索文档" }),
    ).toBeVisible();
    const search = within(banner).getByRole("searchbox", { name: "搜索文档" });
    fireEvent.change(search, { target: { value: "第二篇摘要" } });
    const searchResults = within(banner).getByRole("list", {
      name: "搜索结果",
    });
    expect(
      within(searchResults).getByRole("link", { name: /第二篇/u }),
    ).toHaveAttribute("href", "/docs/second");
    fireEvent.change(search, { target: { value: "PRIVATE_BODY_TOKEN" } });
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
    for (const navigation of navigations) {
      expect(
        within(navigation).getByRole("link", {
          name: /D0\s*文档总览/,
        }),
      ).toHaveAttribute("aria-current", "page");
    }

    expect(screen.getByText("文档总览", { selector: "strong" })).toBeVisible();

    const overviewCards =
      container.querySelector<HTMLElement>(".doc-cards-grid");
    expect(overviewCards).not.toBeNull();
    for (const document of documents) {
      const accessibleName = new RegExp(document.title, "u");
      const expectedHref = `/docs/${document.slug}`;
      const card = within(overviewCards!).getByRole("link", {
        name: accessibleName,
      });
      expect(within(card).getByText(document.title)).toBeVisible();
      expect(card).toHaveAttribute("href", expectedHref);

      const desktopLink = within(navigations[0]!).getByRole("link", {
        name: new RegExp(
          `${document.navigation.code}\\s*${document.title}`,
          "u",
        ),
      });
      const mobileLink = within(navigations[1]!).getByRole("link", {
        name: new RegExp(
          `${document.navigation.code}\\s*${document.title}`,
          "u",
        ),
      });
      expect(desktopLink).toHaveAttribute("href", expectedHref);
      expect(mobileLink).toHaveAttribute("href", expectedHref);
      expect(mobileLink).toHaveAttribute(
        "href",
        desktopLink.getAttribute("href"),
      );
    }
  });

  it("limits broad CMS search results to eight links", () => {
    const manyDocuments = Array.from({ length: 10 }, (_, index) => ({
      ...documents[0]!,
      id: `shared-${index}`,
      slug: `shared-${index}`,
      title: `共享文档 ${index}`,
      summary: "共享摘要",
      navigation: {
        code: `D${index}`,
        label: `共享文档 ${index}`,
        position: index,
      },
    }));

    const { container } = render(
      <DocReaderLayout documents={manyDocuments}>
        <DocCategoryCards documents={manyDocuments} />
      </DocReaderLayout>,
    );
    const chrome = container.querySelector<HTMLElement>(
      ".public-docs-chrome__navbar",
    );
    expect(chrome).not.toBeNull();
    const banner = within(chrome!).getByRole("banner");

    fireEvent.change(
      within(banner).getByRole("searchbox", { name: "搜索文档" }),
      { target: { value: "共享" } },
    );

    expect(within(banner).getByRole("status")).toHaveTextContent(
      "找到 10 篇文档",
    );
    expect(
      within(
        within(banner).getByRole("list", { name: "搜索结果" }),
      ).getAllByRole("link"),
    ).toHaveLength(8);
  });
});
