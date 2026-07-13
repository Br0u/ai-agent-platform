import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PricingCalculator } from "./pricing-calculator";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PricingCalculator", () => {
  it("renders the exact defaults and every approved option with accessible labels", () => {
    render(<PricingCalculator />);

    expect(screen.getByLabelText("部署方式")).toHaveValue("local-private");
    expect(screen.getByLabelText("使用规模")).toHaveValue("pilot");
    expect(screen.getByLabelText("服务周期")).toHaveValue("tbd");

    expect(
      within(screen.getByLabelText("部署方式"))
        .getAllByRole("option")
        .map((option) => [option.textContent, option.getAttribute("value")]),
    ).toEqual([
      ["本地私有化", "local-private"],
      ["专有云", "dedicated-cloud"],
      ["待商务确认", "tbd"],
    ]);
    expect(
      within(screen.getByLabelText("使用规模"))
        .getAllByRole("option")
        .map((option) => [option.textContent, option.getAttribute("value")]),
    ).toEqual([
      ["体验验证", "pilot"],
      ["部门级", "department"],
      ["企业级", "enterprise"],
    ]);
    expect(
      within(screen.getByLabelText("服务周期"))
        .getAllByRole("option")
        .map((option) => [option.textContent, option.getAttribute("value")]),
    ).toEqual([
      ["一年", "1y"],
      ["三年", "3y"],
      ["待商务确认", "tbd"],
    ]);

    for (const moduleName of [
      "AI Agent Studio",
      "Knowledge Base",
      "Workflow",
      "Model Gateway",
      "Agent Runtime",
      "Observability",
    ]) {
      expect(
        screen.getByRole("checkbox", { name: moduleName }),
      ).not.toBeChecked();
    }
  });

  it("supports module multi-select and updates the live requirement summary", () => {
    render(<PricingCalculator />);

    const summary = screen.getByRole("status", { name: "当前需求摘要" });
    expect(summary).toHaveTextContent("部署方式：本地私有化");
    expect(summary).toHaveTextContent("使用规模：体验验证");
    expect(summary).toHaveTextContent("功能模块：暂未选择");
    expect(summary).toHaveTextContent("服务周期：待商务确认");

    fireEvent.change(screen.getByLabelText("部署方式"), {
      target: { value: "dedicated-cloud" },
    });
    fireEvent.change(screen.getByLabelText("使用规模"), {
      target: { value: "enterprise" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "AI Agent Studio" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Workflow" }));
    fireEvent.change(screen.getByLabelText("服务周期"), {
      target: { value: "3y" },
    });

    expect(summary).toHaveTextContent("部署方式：专有云");
    expect(summary).toHaveTextContent("使用规模：企业级");
    expect(summary).toHaveTextContent("功能模块：AI Agent Studio、Workflow");
    expect(summary).toHaveTextContent("服务周期：三年");
  });

  it("keeps the quote action focusable but non-navigating until a module is selected", () => {
    render(<PricingCalculator />);

    const contact = screen.getByRole("link", { name: "获取正式报价" });
    const explanation = screen.getByText(
      "请至少选择一个功能模块后获取正式报价。",
    );

    expect(contact).toHaveAttribute("aria-disabled", "true");
    expect(contact).toHaveAttribute("aria-describedby", explanation.id);
    expect(contact).not.toHaveAttribute("href");
    contact.focus();
    expect(contact).toHaveFocus();

    fireEvent.click(screen.getByRole("checkbox", { name: "Workflow" }));
    expect(contact).not.toHaveAttribute("aria-disabled");
    expect(contact).not.toHaveAttribute("aria-describedby");
    expect(contact).toHaveAttribute(
      "href",
      "/contact?source=pricing&deployment=local-private&scale=pilot&modules=workflow&term=tbd",
    );
  });

  it("builds the exact encoded contact URL for multiple modules", () => {
    render(<PricingCalculator />);

    fireEvent.click(screen.getByRole("checkbox", { name: "AI Agent Studio" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Workflow" }));

    expect(screen.getByRole("link", { name: "获取正式报价" })).toHaveAttribute(
      "href",
      "/contact?source=pricing&deployment=local-private&scale=pilot&modules=agent-studio%2Cworkflow&term=tbd",
    );
  });

  it("shows the fixed disclosure without requesting estimates or displaying prices", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<PricingCalculator />);

    expect(
      screen.getByText("在线估算尚未开放，最终价格以商务报价为准"),
    ).toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/￥|¥|CNY|USD|amount/iu);

    fireEvent.click(screen.getByRole("checkbox", { name: "Workflow" }));
    fireEvent.change(screen.getByLabelText("部署方式"), {
      target: { value: "dedicated-cloud" },
    });
    expect(container.textContent).not.toMatch(/￥|¥|CNY|USD|amount/iu);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
