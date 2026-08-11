import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AgentKnowledgeBasePage, {
  metadata as agentKnowledgeBaseMetadata,
} from "../app/product/agent-knowledge-base/page";
import KnowledgeMetricsPage, {
  metadata as knowledgeMetricsMetadata,
} from "../app/product/knowledge-metrics/page";
import {
  capabilityFoundationSlugs,
  getCapabilityFoundation,
} from "./capability-foundation-content";
import { PlatformPageDetail } from "./platform-center-detail";

afterEach(cleanup);

const routedPages = [
  {
    slug: "agent-knowledge-base",
    Page: AgentKnowledgeBasePage,
    metadata: agentKnowledgeBaseMetadata,
    title: "能力底座：让智能体懂知识、懂数据",
    description:
      "企业知识库把文档变成可检索的知识，数据源与指标把数据变成可问数的底座——这是智能体「回答有据、问数有果」的底层支撑。",
  },
  {
    slug: "knowledge-metrics",
    Page: KnowledgeMetricsPage,
    metadata: knowledgeMetricsMetadata,
    title: "数据源与指标：让业务数据能被 AI 直接问数",
    description:
      "接入企业数据源、同步原始数据、开发统一指标，为数据智能体提供「看得懂、查得准」的数据底座，不懂 SQL 也能随问随答。",
  },
] as const;

describe("capability foundation family", () => {
  it.each(routedPages)(
    "wires the $slug Page to its fixed content and metadata",
    ({ Page, description, metadata, title }) => {
      const { container } = render(<Page />);

      expect(
        screen.getAllByRole("heading", {
          level: 1,
          name: title,
        }),
      ).toHaveLength(1);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(metadata).toMatchObject({ title, description });
    },
  );

  it.each(capabilityFoundationSlugs)("renders the complete %s page", (slug) => {
    const page = getCapabilityFoundation(slug)!;
    const { container } = render(<PlatformPageDetail page={page} />);

    expect(
      screen.getByRole("heading", { level: 1, name: page.hero.title }),
    ).toBeVisible();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getAllByTestId("platform-center-section")).toHaveLength(
      page.sections.length,
    );
    expect(screen.getByTestId("platform-center-cta")).toBeVisible();
    expect(container.querySelector("main")).toHaveClass(
      "platform-center--dense",
    );
    expect(container.querySelector(".floating-assistant")).toBeNull();
  });

  it("renders every ability-base material slot and semantic product link", () => {
    const page = getCapabilityFoundation("agent-knowledge-base")!;
    render(<PlatformPageDetail page={page} />);

    for (const slot of [
      "能力底座架构图素材槽位（知识底座 + 数据底座 → 智能体）",
      "知识线 + 数据线 → 智能体 关系示意图素材槽位",
      "企业知识库界面截图素材槽位",
      "数据源与指标界面截图素材槽位",
    ]) {
      expect(screen.getByText(slot)).toBeVisible();
    }

    for (const [name, href] of [
      ["进入企业知识库 →", "/product/knowledge"],
      ["进入数据源与指标 →", "/product/knowledge-metrics"],
      ["查看知识智能体 →", "/product/agent-knowledge"],
      ["查看数据智能体 →", "/product/data-agent"],
    ] as const) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("renders every metrics material slot and downstream link", () => {
    const page = getCapabilityFoundation("knowledge-metrics")!;
    render(<PlatformPageDetail page={page} />);

    for (const slot of [
      "数据源与指标管理界面截图素材槽位",
      "「数据源 → 数据同步 → 指标开发 → 智能问数」链路示意图素材槽位",
      "数据源管理界面截图素材槽位",
      "原始数据界面截图素材槽位",
      "数据抽取任务界面截图素材槽位",
      "指标开发界面截图素材槽位",
    ]) {
      expect(screen.getByText(slot)).toBeVisible();
    }

    for (const [name, href] of [
      ["查看数据智能体 →", "/product/data-agent"],
      ["查看行业应用中心 →", "/product/applications"],
      ["查看数据问答与分析方案 →", "/solutions/finance-data"],
    ] as const) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});
