import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SolutionsPage, { metadata } from "./page";

afterEach(cleanup);

describe("SolutionsPage prototype overlay", () => {
  it("renders the exact overview structure and content", () => {
    const { container } = render(<SolutionsPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "面向企业实际业务问题的 AI 解决方案",
      }),
    ).toBeVisible();
    expect(screen.getByText("您希望解决什么问题？")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "从业务问题到业务成果" }),
    ).toBeVisible();

    const sceneHeadings = [
      "企业知识问答与知识服务",
      "数据问答、分析与业务洞察",
      "文档理解、知识检索与智能审核",
      "业务流程自动化与智能协同",
      "企业内部智能助手",
      "多智能体协同与复杂任务处理",
    ];
    expect(container.querySelectorAll("[data-solution-scene]")).toHaveLength(6);
    for (const heading of sceneHeadings) {
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    }

    expect(
      screen.getByRole("heading", {
        name: "将平台能力转化为可落地的业务方案",
      }),
    ).toBeVisible();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(6);

    expect(container.querySelectorAll("[data-solution-industry]")).toHaveLength(
      4,
    );
    for (const industry of ["政务", "金融", "医疗", "企业智能化"]) {
      expect(screen.getByRole("heading", { name: industry })).toBeVisible();
    }

    expect(
      screen.getByRole("heading", { name: "华鲲能力如何支撑解决方案" }),
    ).toBeVisible();
    expect(screen.getByText("案例内容待授权补充")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "希望围绕实际业务问题规划 AI 解决方案？",
      }),
    ).toBeVisible();
  });

  it("keeps all overview links internal and uses the confirmed anchors", () => {
    const { container } = render(<SolutionsPage />);
    const hrefs = Array.from(container.querySelectorAll("a[href]"), (link) =>
      link.getAttribute("href"),
    );

    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((href) => href?.startsWith("/"))).toBe(true);
    for (const id of [
      "solution-common-scenes",
      "solution-methodology",
      "solution-industries-overview",
      "solution-product-support",
      "solution-cases-overview",
      "solution-final-cta",
    ]) {
      expect(document.getElementById(id)).toBeInstanceOf(HTMLElement);
    }
  });

  it("keeps one real page H1 and the public metadata contract", () => {
    const { container } = render(<SolutionsPage />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(metadata).toEqual({
      title: "解决方案 · AI Agent Platform",
      description:
        "面向企业实际业务问题，组合算力、模型、知识、数据、智能体与应用能力的 AI 解决方案。",
    });
  });
});
