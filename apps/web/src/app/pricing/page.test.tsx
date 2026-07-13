import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PricingPage, { metadata } from "./page";

describe("PricingPage", () => {
  it("has pricing-specific metadata and the approved enterprise page hierarchy", () => {
    render(<PricingPage />);

    expect(metadata).toMatchObject({
      title: "价格计算",
      description: "配置华鲲元启 AI 开发赋能平台需求并联系商务获取正式报价。",
    });
    expect(screen.getByRole("main", { name: "价格计算" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "价格计算" })).toBeVisible();
    expect(screen.queryByText("产品定价")).not.toBeInTheDocument();
    expect(screen.queryByText("按企业需求配置方案")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "需求配置" })).toBeVisible();
    expect(screen.getByRole("region", { name: "方案摘要" })).toBeVisible();
  });

  it("uses the approved token-based 7:5 enterprise layout", () => {
    const css = readFileSync(
      "src/components/portal/pricing/pricing-calculator.css",
      "utf8",
    );

    expect(css).toContain(
      "grid-template-columns: minmax(0, 7fr) minmax(0, 5fr)",
    );
    expect(css).toMatch(/var\(--color-/u);
    expect(css).toMatch(/var\(--space-/u);
    expect(css).not.toMatch(/#[\da-f]{3,8}|rgba?\(/iu);
    expect(css).not.toMatch(/border-radius|box-shadow/iu);
  });

  it("keeps the summary in document flow below the sticky site header", () => {
    const css = readFileSync(
      "src/components/portal/pricing/pricing-calculator.css",
      "utf8",
    );

    expect(css).not.toContain("position: sticky");
  });

  it("uses the primary color for interactive focus outlines", () => {
    const css = readFileSync(
      "src/components/portal/pricing/pricing-calculator.css",
      "utf8",
    );

    expect(css).toContain("outline: 2px solid var(--color-primary)");
    expect(css).not.toContain("outline: 2px solid var(--color-signal)");
  });
});
