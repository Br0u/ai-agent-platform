import { render, screen, within } from "@testing-library/react";
import DocsPage from "@/app/docs/page";
import { describe, expect, it } from "vitest";
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

describe("DocReaderLayout", () => {
  it("keeps the real overview cards aligned with both document navigations", () => {
    const { container } = render(<DocsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "文档中心" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 2 })).toBeVisible();

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
    for (const category of docsCategories) {
      const accessibleName = new RegExp(category.title, "u");
      const expectedHref = `/docs/${expectedSlugs[category.code]}`;
      const card = within(overviewCards!).getByRole("link", {
        name: accessibleName,
      });
      expect(within(card).getByText(category.title)).toBeVisible();
      expect(card).toHaveAttribute("href", expectedHref);

      const desktopLink = within(navigations[0]!).getByRole("link", {
        name: new RegExp(`${category.code}\\s*${category.title}`, "u"),
      });
      const mobileLink = within(navigations[1]!).getByRole("link", {
        name: new RegExp(`${category.code}\\s*${category.title}`, "u"),
      });
      expect(desktopLink).toHaveAttribute("href", expectedHref);
      expect(mobileLink).toHaveAttribute("href", expectedHref);
      expect(mobileLink).toHaveAttribute(
        "href",
        desktopLink.getAttribute("href"),
      );
    }
  });
});
