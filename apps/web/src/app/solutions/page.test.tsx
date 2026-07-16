import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SolutionsPage, { metadata } from "./page";

afterEach(cleanup);

describe("SolutionsPage", () => {
  it("keeps the approved five-solution information architecture", () => {
    render(<SolutionsPage />);

    expect(metadata).toMatchObject({
      title: "解决方案 · AI Agent Platform",
    });
    expect(
      screen.getByRole("heading", {
        name: "五类方案，覆盖从试点到规模化",
      }),
    ).toBeVisible();

    const scenarioGroup = screen.getByRole("heading", {
      name: "场景方案",
    }).parentElement?.parentElement;
    const platformGroup = screen.getByRole("heading", {
      name: "平台方案",
    }).parentElement?.parentElement;

    expect(scenarioGroup).not.toBeNull();
    expect(platformGroup).not.toBeNull();
    expect(
      within(scenarioGroup as HTMLElement).getAllByRole("article"),
    ).toHaveLength(3);
    expect(
      within(platformGroup as HTMLElement).getAllByRole("article"),
    ).toHaveLength(2);
    expect(screen.queryByText("数据分析与决策")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "从方案评估，到持续运营" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "咨询与规划" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "实施与落地" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "运维与优化" })).toBeVisible();
  });

  it.each([
    ["把高频工作交给可控的智能体", "/solutions/smart-office"],
    ["让群众一次问清、一次办成", "/solutions/intelligent-guidance"],
    ["从视频与图像中定位业务线索", "/solutions/visual-search"],
    ["从模型能力走向业务交付", "/solutions/agent-development"],
    ["在企业边界内构建 AI 能力", "/solutions/ai-infrastructure"],
  ])("links %s to its solution detail route", (title, href) => {
    render(<SolutionsPage />);

    const card = screen
      .getByRole("heading", { name: title })
      .closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      href,
    );
  });
});
