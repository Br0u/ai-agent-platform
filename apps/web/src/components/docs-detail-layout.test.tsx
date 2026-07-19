import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocsDetailLayout } from "./docs-detail-layout";
import { docsCategories } from "./docs-content";

const expectedSlugs: Readonly<Record<string, string>> = {
  D1: "quick-start",
  D2: "deployment",
  D3: "upgrade",
  D4: "operations",
  D5: "api",
  D6: "hardware",
  D7: "faq",
};

describe("DocsDetailLayout", () => {
  it("keeps both navigations and the pager aligned with category order", () => {
    const currentIndex = docsCategories.findIndex(
      (category) => category.code === "D3",
    );
    const current = docsCategories[currentIndex]!;
    const previous = docsCategories[currentIndex - 1]!;
    const next = docsCategories[currentIndex + 1]!;

    render(
      <DocsDetailLayout
        currentSlug={expectedSlugs[current.code]!}
        title={current.title}
        description={current.description}
        toc={[
          { id: "path", value: "上手路径", depth: 2 },
          { id: "prepare", value: "准备环境", depth: 3 },
        ]}
      >
        <p>文档正文</p>
      </DocsDetailLayout>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: current.title }),
    ).toBeVisible();
    expect(screen.getByText("文档正文")).toBeVisible();

    const navigations = screen.getAllByRole("navigation", {
      name: "文档目录",
    });
    expect(navigations).toHaveLength(2);
    expect(
      screen.getByText(current.title, { selector: "strong" }),
    ).toBeVisible();

    for (const navigation of navigations) {
      for (const category of docsCategories) {
        const link = within(navigation).getByRole("link", {
          name: new RegExp(`${category.code}\\s*${category.title}`, "u"),
        });
        expect(link).toHaveAttribute(
          "href",
          `/docs/${expectedSlugs[category.code]}`,
        );
        if (category.code === current.code) {
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
    ).toHaveAttribute("href", `/docs/${expectedSlugs[previous.code]}`);
    expect(
      within(pager).getByRole("link", {
        name: new RegExp(`下一篇\\s*${next.title}`, "u"),
      }),
    ).toHaveAttribute("href", `/docs/${expectedSlugs[next.code]}`);
  });
});
