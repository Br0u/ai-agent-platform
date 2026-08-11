import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import Page, { generateMetadata, generateStaticParams } from "./page";

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
    expect(screen.getByRole("link", { name: "返回解决方案" })).toHaveAttribute(
      "href",
      "/solutions?view=scenarios&category=knowledge#solution-scenarios-directory",
    );
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
    expect(screen.getByRole("link", { name: "返回解决方案" })).toHaveAttribute(
      "href",
      "/solutions?view=industries&industry=finance#industry-solutions-list",
    );
  });

  it("renders one H1 and explicit no-authorization copy for the pending case", async () => {
    render(
      await Page({
        params: Promise.resolve({ slug: "case-pending-enterprise-knowledge" }),
        searchParams: Promise.resolve({ mode: "scenario" }),
      }),
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "案例详情结构占位（待授权案例）",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "当前案例未获公开授权，不代表真实公开项目；客户、建设内容与成果均须在获得授权后替换。",
      ),
    ).toBeVisible();
    for (const product of [
      "企业知识库",
      "智能体中心",
      "行业应用中心",
      "安全中心",
    ]) {
      expect(screen.getByText(product, { exact: true })).toBeVisible();
    }
    for (const outcome of [
      "企业知识服务能力结构占位",
      "智能体应用建设成果占位",
      "实际业务成果待授权补充",
    ]) {
      expect(screen.getByText(outcome, { exact: true })).toBeVisible();
    }
    for (const media of [
      "需求调研记录或场景清单素材槽位",
      "知识资料盘点或数据评估素材槽位",
      "项目总体架构或方案说明素材槽位",
      "脱敏部署环境或产品配置素材槽位",
      "知识库、智能体或应用配置素材槽位",
      "测试过程或效果验证素材槽位",
      "应用上线或培训交付素材槽位",
      "运营反馈或持续优化素材槽位",
    ]) {
      expect(screen.getByText(media, { exact: true })).toBeVisible();
    }
    expect(
      screen.getByText("没有统计口径和授权前不展示百分比、金额或排名。"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "返回实践案例" })).toHaveAttribute(
      "href",
      "/solutions?view=cases&mode=scenario#practice-cases-list",
    );
  });

  it("generates all 32 detail pages as static params", () => {
    expect(generateStaticParams()).toStrictEqual(
      [
        "private-yuanqi",
        "cluster-planning",
        "compute-monitoring",
        "model-evaluation",
        "model-deployment",
        "knowledge-service",
        "document-intelligence",
        "data-insight",
        "knowledge-assets",
        "unstructured-data",
        "process-automation",
        "enterprise-assistant",
        "multi-agent",
        "video-intelligence",
        "government-knowledge",
        "government-data",
        "government-document",
        "government-process",
        "finance-knowledge",
        "finance-data",
        "finance-document",
        "finance-assistant",
        "healthcare-knowledge",
        "healthcare-data",
        "healthcare-document",
        "healthcare-process",
        "enterprise-knowledge",
        "enterprise-data",
        "enterprise-document",
        "enterprise-process",
        "enterprise-multi-agent",
        "case-pending-enterprise-knowledge",
      ].map((slug) => ({ slug })),
    );
  });

  it("renders exactly one H1 for every static solution detail page", async () => {
    for (const { slug } of generateStaticParams()) {
      cleanup();
      render(await Page({ params: Promise.resolve({ slug }) }));
      expect(screen.getAllByRole("heading", { level: 1 }), slug).toHaveLength(
        1,
      );
    }
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
