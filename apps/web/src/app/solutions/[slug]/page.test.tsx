import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({
  notFound,
  usePathname: () => "/solutions/finance-compliance",
}));

import Page, { generateMetadata, generateStaticParams } from "./page";

afterEach(cleanup);

describe("V2 solution detail", () => {
  it("renders the exact V2 section sequence and local images", async () => {
    const { container } = render(
      await Page({ params: Promise.resolve({ slug: "finance-compliance" }) }),
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "贷款合规智能审查",
    );
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "业务场景与问题",
      "落地效果与价值",
      "解决方案落地",
      "需要落地行业 AI 解决方案？",
    ]);
    expect(
      container.querySelectorAll(".solution-detail-capabilities article"),
    ).toHaveLength(4);
    expect(screen.getByAltText("贷款合规智能审查首屏")).toHaveAttribute(
      "src",
      expect.stringContaining("finance-compliance%2Fmain.png"),
    );
    expect(screen.getByAltText("贷款合规智能审查场景")).toBeVisible();
    expect(screen.getByAltText("贷款合规智能审查效果")).toBeVisible();
    expect(screen.queryByText("解决方案建设方法")).not.toBeInTheDocument();
  });

  it("renders metric results for a V2 solution without a result image", async () => {
    render(await Page({ params: Promise.resolve({ slug: "em-forest-fire" }) }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(screen.queryByAltText("森林火灾预警效果")).not.toBeInTheDocument();
  });

  it("publishes all 29 routes and V2 metadata", async () => {
    expect(generateStaticParams()).toHaveLength(29);
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "semi-ai-scientist" }),
      }),
    ).resolves.toMatchObject({ title: "光刻胶研发模型微调 · 华鲲元启" });
  });

  it("404s unknown legacy slugs", async () => {
    await expect(
      Page({ params: Promise.resolve({ slug: "healthcare-knowledge" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
