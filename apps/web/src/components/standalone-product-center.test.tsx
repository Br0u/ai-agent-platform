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
        name: "独立产品中心：成熟企业级 AI 产品，开箱即用",
      }),
    ).toBeVisible();
    expect(screen.getAllByTestId("standalone-product-card")).toHaveLength(3);
    expect(screen.getByText("优先推荐")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "查看码多多 2.0 →" }),
    ).toHaveAttribute("href", "/product/code-agent");
    expect(screen.getByRole("link", { name: "查看 AIPPT →" })).toHaveAttribute(
      "href",
      "/product/aippt",
    );
    expect(
      screen.getByRole("link", { name: "查看 AISHREK →" }),
    ).toHaveAttribute("href", "/product/aishrek");
  });

  it("renders the four-column comparison table and two platform relations", () => {
    render(<StandaloneProductCenter />);
    const table = screen.getByRole("table", {
      name: "按你的岗位与目标选择产品",
    });

    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(screen.getAllByTestId("platform-relation")).toHaveLength(2);
    expect(screen.getByText("独立部署、独立使用")).toBeVisible();
    expect(screen.getByText("与元启组合、能力互通")).toBeVisible();
  });

  it("keeps both closing actions and leaves chat to the site shell", () => {
    const { container } = render(<StandaloneProductCenter />);

    expect(screen.getAllByRole("link", { name: "申请体验" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "商务咨询" })).toHaveLength(2);
    expect(container.querySelector(".floating-assistant")).toBeNull();
  });
});
