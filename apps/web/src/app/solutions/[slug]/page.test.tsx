import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import Page, { generateMetadata } from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SolutionDetailPage", () => {
  it("renders the complete common solution structure", async () => {
    render(
      await Page({ params: Promise.resolve({ slug: "knowledge-service" }) }),
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "企业知识问答与知识服务",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "需要建设员工知识助手、客户服务知识入口或专业知识服务的组织。",
      ),
    ).toBeVisible();
    expect(document.querySelectorAll(".solution-detail-tag")).toHaveLength(4);
    expect(screen.getAllByTestId("solution-problem")).toHaveLength(3);
    expect(screen.getAllByTestId("solution-component")).toHaveLength(6);
    expect(screen.getAllByTestId("solution-flow-step")).toHaveLength(7);
    expect(screen.getAllByTestId("solution-product")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "咨询当前方案" })).toHaveAttribute(
      "href",
      "/contact?topic=企业知识问答与知识服务咨询",
    );
    expect(screen.getAllByRole("link", { name: "申请体验" })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "申请体验" })) {
      expect(link).toHaveAttribute("href", "/trial");
    }
    expect(screen.getByText("案例内容待授权补充")).toBeVisible();
    expect(
      screen.getByText(
        "正式官网没有可公开案例时隐藏案例内容，不虚构客户名称、成果和数字。",
      ),
    ).toBeVisible();
  });

  it("renders the complete industry solution structure", async () => {
    render(await Page({ params: Promise.resolve({ slug: "finance-data" }) }));

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "经营数据问答与业务分析",
      }),
    ).toBeVisible();
    expect(screen.getByText("经营管理、产品运营与数据分析团队")).toBeVisible();
    expect(screen.getAllByTestId("solution-problem")).toHaveLength(1);
    expect(screen.getAllByTestId("solution-component")).toHaveLength(4);
    expect(screen.getAllByTestId("solution-flow-step")).toHaveLength(4);
    expect(screen.getAllByTestId("solution-product")).toHaveLength(3);
    expect(screen.getByText("查询结果与分析说明")).toBeVisible();
    expect(
      screen.getByText(
        "页面不虚构客户痛点、量化结果或行业判断；医疗场景只用于信息处理、知识服务、运营及行政辅助。",
      ),
    ).toBeVisible();
  });

  it("generates metadata from the exact solution title and summary", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "process-automation" }),
      }),
    ).resolves.toEqual({
      title: "业务流程自动化与智能协同 · 华鲲解决方案",
      description:
        "通过可视化流程将模型、知识、数据、工具和业务逻辑组合为可执行的智能工作流。",
    });
  });

  it("returns not found for unknown solution slugs", async () => {
    await expect(
      Page({ params: Promise.resolve({ slug: "unknown-solution" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate the shell-owned assistant", async () => {
    render(
      await Page({
        params: Promise.resolve({ slug: "government-knowledge" }),
      }),
    );

    expect(document.querySelector(".floating-assistant")).toBeNull();
  });
});
