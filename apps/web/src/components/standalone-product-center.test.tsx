import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StandaloneProductCenter } from "./standalone-product-center";

afterEach(cleanup);

describe("StandaloneProductCenter", () => {
  it("renders all three independent products and their exact routes", () => {
    render(<StandaloneProductCenter />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "独立产品中心：成熟企业级 AI 产品，独立安装、下载即用",
      }),
    ).toBeVisible();
    const cards = screen.getAllByTestId("standalone-product-card");
    expect(cards).toHaveLength(3);

    const products = [
      { name: "码里奥", href: "/product/code-agent" },
      { name: "AIPPT", href: "/product/aippt" },
      { name: "AISHREK", href: "/product/aishrek" },
    ] as const;

    products.forEach(({ name, href }, index) => {
      const card = within(cards[index]);
      expect(card.getByRole("heading", { name })).toBeVisible();
      expect(
        card.getByRole("link", { name: `查看${name}产品详情` }),
      ).toHaveAttribute("href", href);
    });
  });

  it("renders two value cards and three FAQ cards instead of legacy sections", () => {
    render(<StandaloneProductCenter />);

    expect(screen.getAllByTestId("standalone-value-card")).toHaveLength(2);
    expect(screen.getAllByTestId("standalone-faq-card")).toHaveLength(3);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("platform-relation")).not.toBeInTheDocument();
  });

  it("matches the V2 visible structure without extra eyebrows", () => {
    const { container } = render(<StandaloneProductCenter />);

    expect(screen.getByText("点击卡片查看产品详情。")).toBeVisible();
    expect(screen.queryByText("产品｜独立产品中心")).not.toBeInTheDocument();
    expect(screen.queryByText("01｜产品矩阵")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "如需了解或采购码多多 2.0、AIPPT、AISHREK，欢迎与华鲲团队联系，获取产品详情与选型建议。",
      ),
    ).toBeVisible();
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "独立产品中心：面向明确场景、即装即用的企业级 AI 产品",
      "三个独立产品，各自解决一类问题",
      "关于独立产品，你可能关心的问题",
      "需要为业务引入成熟 AI 产品？",
    ]);
    expect(container.querySelectorAll(".product-portal-closing")).toHaveLength(
      1,
    );
  });

  it("keeps both closing actions and leaves chat to the site shell", () => {
    const { container } = render(<StandaloneProductCenter />);

    expect(screen.getAllByRole("link", { name: "联系我们" })).toHaveLength(2);
    expect(container.querySelector(".floating-assistant")).toBeNull();
  });
});
