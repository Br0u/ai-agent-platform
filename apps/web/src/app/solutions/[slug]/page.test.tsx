import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getSolutionDetail, solutionSlugs } from "../solution-detail-content";
import SolutionDetailPage, {
  generateMetadata,
  generateStaticParams,
} from "./page";

afterEach(cleanup);

describe("SolutionDetailPage", () => {
  it("prebuilds every approved solution route", () => {
    expect(generateStaticParams()).toEqual(
      solutionSlugs.map((slug) => ({ slug })),
    );
  });

  it.each(solutionSlugs)(
    "renders %s as a solution rather than a product",
    async (slug) => {
      const solution = getSolutionDetail(slug);
      expect(solution).toBeDefined();

      const page = await SolutionDetailPage({
        params: Promise.resolve({ slug }),
      });
      render(page);

      expect(
        screen.getByRole("heading", { level: 1, name: solution?.title }),
      ).toBeVisible();
      expect(
        screen.getByRole("heading", {
          name: "从输入到交付的完整方案路径",
        }),
      ).toBeVisible();
      expect(screen.getByRole("heading", { name: "方案概述" })).toBeVisible();
      expect(
        screen.getByRole("img", { name: solution?.media.alt }),
      ).toBeVisible();
      expect(screen.getByRole("heading", { name: "方案特性" })).toBeVisible();
      expect(
        screen.getByRole("heading", { name: "常见问题解答" }),
      ).toBeVisible();
      expect(
        screen.getByRole("heading", { name: "支撑本方案的产品能力" }),
      ).toBeVisible();
      expect(
        screen.getByRole("link", { name: /返回方案总览/u }),
      ).toHaveAttribute("href", "/solutions");

      for (const product of solution?.relatedProducts ?? []) {
        expect(
          screen.getByRole("link", { name: new RegExp(product.title, "u") }),
        ).toHaveAttribute("href", product.href);
      }

      if (solution?.cases?.length) {
        expect(screen.getByRole("heading", { name: "典型案例" })).toBeVisible();
        for (const caseItem of solution.cases) {
          expect(
            screen.getByRole("heading", { name: caseItem.title }),
          ).toBeVisible();
        }
      } else {
        expect(
          screen.queryByRole("heading", { name: "典型案例" }),
        ).not.toBeInTheDocument();
      }

      for (const heading of screen.getAllByRole("heading")) {
        expect(heading.textContent?.trim()).not.toMatch(/[。.]$/u);
      }
    },
  );

  it("builds solution-specific metadata", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "visual-search" }),
    });

    expect(metadata).toMatchObject({
      title: "视觉检索解决方案 · 华鲲元启",
    });
  });
});
