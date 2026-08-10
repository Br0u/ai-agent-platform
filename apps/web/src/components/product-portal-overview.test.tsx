import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProductPortalOverview } from "./product-portal-overview";

afterEach(cleanup);

describe("ProductPortalOverview", () => {
  it("renders the prototype overview in its original section order", () => {
    const { container } = render(<ProductPortalOverview />);
    const headings = Array.from(container.querySelectorAll("h1, h2")).map(
      (heading) => heading.textContent,
    );

    expect(headings).toEqual([
      "让企业 AI 落地，深度建设与快速使用双路径",
      "企业 AI 落地，元启回答三个核心问题",
      "从模型到应用，一条链路走通",
      "元启平台六大中心，覆盖企业 AI 全生命周期",
      "独立产品中心：每个产品，单独可用",
      "深度建设与快速使用，两条路都值得走",
      "从你的目标出发，继续了解",
    ]);
  });

  it("renders all challenges, chain nodes, centers and independent products", () => {
    render(<ProductPortalOverview />);

    expect(screen.getAllByTestId("product-challenge")).toHaveLength(3);
    expect(screen.getAllByTestId("product-chain-node")).toHaveLength(4);
    expect(screen.getAllByTestId("product-center")).toHaveLength(6);
    expect(screen.getAllByTestId("independent-product")).toHaveLength(3);
    expect(screen.getByText("七大中心")).toBeVisible();
    expect(screen.getByText("元启六大中心，能力完整可组合")).toBeVisible();
  });

  it("keeps exact routes and does not add a second chat entry", () => {
    const { container } = render(<ProductPortalOverview />);

    expect(
      within(screen.getByTestId("independent-products")).getByRole("link", {
        name: "查看码多多 2.0 →",
      }),
    ).toHaveAttribute("href", "/product/code-agent");
    expect(
      screen.getByRole("link", { name: "查看独立产品中心 →" }),
    ).toHaveAttribute("href", "/product/standalone");
    for (const link of screen.getAllByRole("link", { name: "申请体验" })) {
      expect(link).toHaveAttribute("href", "/trial");
    }
    expect(container.querySelector(".floating-assistant")).toBeNull();
    expect(container.querySelector("article:empty")).toBeNull();
  });
});
