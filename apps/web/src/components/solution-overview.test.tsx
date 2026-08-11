import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SolutionOverview } from "./solution-overview";

afterEach(cleanup);

describe("SolutionOverview", () => {
  it("renders the overview sections and only absolute internal links", () => {
    const { container } = render(<SolutionOverview />);

    expect(container.querySelectorAll("[data-solution-scene]")).toHaveLength(6);
    expect(container.querySelectorAll("[data-solution-industry]")).toHaveLength(
      4,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByText("案例内容待授权补充")).toBeVisible();
    expect(screen.getByText("平台治理横向贯穿")).toBeVisible();

    for (const link of container.querySelectorAll<HTMLAnchorElement>(
      "a[href]",
    )) {
      expect(link.getAttribute("href")).toMatch(/^\//);
    }
  });

  it("switches methodology details with click and keyboard navigation", () => {
    render(<SolutionOverview />);
    const assessment = screen.getByRole("tab", { name: "02 能力与数据评估" });
    fireEvent.click(assessment);
    expect(
      within(screen.getByRole("tabpanel")).getByText(
        "能力与数据评估结果、风险清单和建设前提。",
      ),
    ).toBeVisible();

    fireEvent.keyDown(assessment, { key: "ArrowRight" });
    const design = screen.getByRole("tab", { name: "03 方案设计" });
    expect(design).toHaveFocus();
    expect(design).toHaveAttribute("aria-selected", "true");
    expect(
      within(screen.getByRole("tabpanel")).getByText(
        "解决方案说明、总体架构图和场景建设清单。",
      ),
    ).toBeVisible();
  });

  it("searches, clears and folds the directory", () => {
    render(<SolutionOverview />);
    const search = screen.getByRole("searchbox", {
      name: "在解决方案目录中筛选",
    });

    fireEvent.change(search, { target: { value: "政务知识问答" } });
    expect(
      screen.getByRole("link", { name: "政务知识问答与政策服务" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "金融文档理解与合规辅助审核" }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "不存在的方案" } });
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(search).toHaveValue("");

    const toggle = screen.getByRole("button", {
      name: "展开或收起基础设施与模型工程",
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("link", { name: "元启私有化部署方案" }),
    ).not.toBeInTheDocument();
  });

  it("collapses the desktop directory", () => {
    render(<SolutionOverview />);
    const collapse = screen.getByRole("button", { name: "收起解决方案目录" });
    fireEvent.click(collapse);
    expect(
      screen.getByRole("button", { name: "展开解决方案目录" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the mobile drawer with Escape and restores focus", () => {
    render(<SolutionOverview />);
    const trigger = screen.getByRole("button", { name: "解决方案目录" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("complementary", { name: "解决方案目录" }),
    ).toHaveAttribute("data-mobile-open", "true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
