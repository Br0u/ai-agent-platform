import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PricingPage, { metadata } from "./page";

describe("PricingPage", () => {
  it("has pricing-specific metadata and the approved enterprise page hierarchy", () => {
    render(<PricingPage />);

    expect(metadata).toMatchObject({
      title: "产品定价",
      description: "配置华鲲元启 AI 开发赋能平台需求并联系商务获取正式报价。",
    });
    expect(screen.getByRole("main", { name: "产品定价" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "按企业需求配置方案" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "需求配置" })).toBeVisible();
    expect(screen.getByRole("region", { name: "方案摘要" })).toBeVisible();
  });
});
