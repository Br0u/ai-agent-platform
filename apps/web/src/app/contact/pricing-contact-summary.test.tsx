import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parsePricingContactQuery } from "@/features/pricing/pricing-query";
import { PricingContactSummary } from "./pricing-contact-summary";

describe("PricingContactSummary", () => {
  it("renders the allowlisted human-readable pricing selection and disclaimer", () => {
    const selection = parsePricingContactQuery({
      source: "pricing",
      deployment: "dedicated-cloud",
      scale: "enterprise",
      modules: "workflow,agent-studio",
      term: "3y",
    });

    expect(selection).not.toBeNull();
    render(<PricingContactSummary selection={selection!} />);

    const summary = screen.getByRole("region", { name: "价格计算需求摘要" });
    expect(summary).toHaveTextContent("部署方式：专有云");
    expect(summary).toHaveTextContent("使用规模：企业级");
    expect(summary).toHaveTextContent("功能模块：AI Agent Studio、Workflow");
    expect(summary).toHaveTextContent("服务周期：三年");
    expect(summary).toHaveTextContent("此摘要仅用于需求沟通，不是正式报价");
    expect(summary).not.toHaveTextContent("dedicated-cloud");
  });

  it("ignores unknown IDs and never renders hostile query text", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const selection = parsePricingContactQuery({
      source: "pricing",
      deployment: hostile,
      scale: hostile,
      modules: ["workflow", hostile],
      term: hostile,
    });

    expect(selection).not.toBeNull();
    const { container } = render(
      <PricingContactSummary selection={selection!} />,
    );

    expect(container).not.toHaveTextContent(hostile);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("功能模块：Workflow")).toBeVisible();
    expect(container).not.toHaveTextContent("部署方式：本地私有化");
    expect(container).not.toHaveTextContent("使用规模：体验验证");
    expect(container).not.toHaveTextContent("服务周期：待商务确认");
  });
});
