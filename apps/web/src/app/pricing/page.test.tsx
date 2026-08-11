import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PricingPage, { metadata } from "./page";

describe("PricingPage", () => {
  it("只呈现原型确认的价格待确认标题", () => {
    const { container } = render(<PricingPage />);

    expect(metadata).toMatchObject({
      title: "价格与服务 · 华鲲",
      description: "价格与服务内容待后续确认",
    });
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "价格与服务内容待后续确认",
      }),
    ).toBeVisible();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(
      container.querySelectorAll("p, form, section, button, a"),
    ).toHaveLength(0);
    expect(container).not.toHaveTextContent("价格计算");
    expect(container).not.toHaveTextContent("需求配置");
    expect(container).not.toHaveTextContent("方案摘要");
  });
});
