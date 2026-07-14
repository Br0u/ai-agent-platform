import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "./page";

describe("ContactPage", () => {
  it("keeps the originating scenario and exposes real contact channels", async () => {
    render(
      await Page({
        searchParams: Promise.resolve({
          solution: "visual-retrieval",
          scene: "urban-governance-control",
        }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "城市治理视觉布控" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /400-855-0189/ })).toHaveAttribute(
      "href",
      "tel:4008550189",
    );
    expect(
      screen.getByText("在线预约接口已预留，尚未接入表单后端"),
    ).toBeInTheDocument();
  });

  it("explains a generic consultation without claiming a saved source", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByText("尚未选择具体方案，可直接联系或先浏览方案"),
    ).toBeInTheDocument();
    expect(screen.queryByText("系统已保留咨询来源")).not.toBeInTheDocument();
  });
});
