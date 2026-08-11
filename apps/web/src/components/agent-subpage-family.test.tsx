import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AgentKnowledgePage, {
  metadata as agentKnowledgeMetadata,
} from "../app/product/agent-knowledge/page";
import AgentOrchestrationPage, {
  metadata as agentOrchestrationMetadata,
} from "../app/product/agent-orchestration/page";
import AgentVideoPage, {
  metadata as agentVideoMetadata,
} from "../app/product/agent-video/page";
import DataAgentPage, {
  metadata as dataAgentMetadata,
} from "../app/product/data-agent/page";
import { agentSubpageSlugs, getAgentSubpage } from "./agent-subpage-content";
import { PlatformPageDetail } from "./platform-center-detail";

afterEach(cleanup);

const expected = {
  "agent-knowledge": {
    h1: "企业知识助手：把企业文档、制度、经验变成随时可问的智能库",
    sectionCount: 6,
    demoTexts: ["请假三天需要什么流程？", "发送"],
    semanticLink: ["查看知识服务方案 →", "/solutions/knowledge-service"],
    anchors: [
      ["查看智能问答 →", "/product/agent-knowledge#agent-k-qa", "agent-k-qa"],
      [
        "查看知识加工 →",
        "/product/agent-knowledge#agent-k-processing",
        "agent-k-processing",
      ],
      ["查看知识库 →", "/product/agent-knowledge#agent-k-kb", "agent-k-kb"],
      [
        "查看知识图谱 →",
        "/product/agent-knowledge#agent-k-graph",
        "agent-k-graph",
      ],
    ],
  },
  "data-agent": {
    h1: "智能问数助手：不用写 SQL，问一句就能拿到数据答案",
    sectionCount: 5,
    demoTexts: ["华东区", "约 1.28 亿元", "数据来源"],
    semanticLink: ["查看数据问答方案 →", "/solutions/finance-data"],
    anchors: [
      ["查看智能问数 →", "/product/data-agent#agent-data-qa", "agent-data-qa"],
      [
        "查看指标开发 →",
        "/product/data-agent#agent-data-metric",
        "agent-data-metric",
      ],
      [
        "查看数据接入 →",
        "/product/data-agent#agent-data-source",
        "agent-data-source",
      ],
    ],
  },
  "agent-video": {
    h1: "视频理解与智能视觉助手：让视频从「被观看」变成「可理解」",
    sectionCount: 5,
    demoTexts: ["昨晚厂区南门 21 点到 22 点有无异常？", "发送"],
    semanticLink: ["查看视频检索方案 →", "/solutions/video-intelligence"],
    anchors: [
      [
        "查看即时检索 →",
        "/product/agent-video#agent-video-search",
        "agent-video-search",
      ],
      [
        "查看实时布控 →",
        "/product/agent-video#agent-video-monitor",
        "agent-video-monitor",
      ],
      [
        "查看设备接入 →",
        "/product/agent-video#agent-video-device",
        "agent-video-device",
      ],
    ],
  },
  "agent-orchestration": {
    h1: "企业复杂任务自动化引擎：把多步骤业务变成一条自动流程",
    sectionCount: 5,
    demoTexts: ["执行完成 ✓"],
    semanticLink: ["查看流程自动化方案 →", "/solutions/process-automation"],
    anchors: [
      [
        "查看文生工作流 →",
        "/product/agent-orchestration#agent-orch-ai",
        "agent-orch-ai",
      ],
      [
        "查看会话工作流 →",
        "/product/agent-orchestration#agent-orch-chatflow",
        "agent-orch-chatflow",
      ],
      [
        "查看流程工作流 →",
        "/product/agent-orchestration#agent-orch-workflow",
        "agent-orch-workflow",
      ],
    ],
  },
} as const;

const pageEntries = [
  {
    slug: "agent-knowledge",
    Page: AgentKnowledgePage,
    metadata: agentKnowledgeMetadata,
  },
  {
    slug: "data-agent",
    Page: DataAgentPage,
    metadata: dataAgentMetadata,
  },
  {
    slug: "agent-video",
    Page: AgentVideoPage,
    metadata: agentVideoMetadata,
  },
  {
    slug: "agent-orchestration",
    Page: AgentOrchestrationPage,
    metadata: agentOrchestrationMetadata,
  },
] as const;

describe("agent subpage family", () => {
  it.each(pageEntries)(
    "wires the $slug page to its content and metadata",
    ({ slug, Page, metadata }) => {
      const page = getAgentSubpage(slug)!;
      const { container } = render(<Page />);

      expect(
        screen.getByRole("heading", { level: 1, name: expected[slug].h1 }),
      ).toBeVisible();
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(metadata.title).toBe(page.hero.title);
      expect(metadata.description).toBe(page.hero.lead);
    },
  );

  it.each(agentSubpageSlugs)("renders the complete dense %s page", (slug) => {
    const page = getAgentSubpage(slug)!;
    const { container } = render(<PlatformPageDetail page={page} />);

    expect(
      screen.getByRole("heading", { level: 1, name: expected[slug].h1 }),
    ).toBeVisible();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getAllByTestId("platform-center-section")).toHaveLength(
      expected[slug].sectionCount,
    );
    expect(screen.getByTestId("platform-center-business")).toBeVisible();
    expect(screen.queryByTestId("platform-center-cta")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toHaveClass(
      "platform-center--dense",
    );
    expect(container.querySelector("main .floating-assistant")).toBeNull();
  });

  it.each(agentSubpageSlugs)(
    "renders the %s miniature UI and semantic links",
    (slug) => {
      const page = getAgentSubpage(slug)!;
      render(<PlatformPageDetail page={page} />);

      const demos = screen.getAllByTestId("platform-page-demo");
      for (const text of expected[slug].demoTexts) {
        const match = demos
          .map((demo) => within(demo).queryByText(text, { exact: false }))
          .find((element) => element !== null);

        expect(match).toBeVisible();
      }

      const [semanticName, semanticHref] = expected[slug].semanticLink;
      for (const link of screen.getAllByRole("link", {
        name: semanticName,
      })) {
        expect(link).toBeVisible();
        expect(link).toHaveAttribute("href", semanticHref);
      }
    },
  );

  it.each(agentSubpageSlugs)(
    "keeps the %s internal links and DOM anchors",
    (slug) => {
      const page = getAgentSubpage(slug)!;
      const { container } = render(<PlatformPageDetail page={page} />);

      for (const [name, href, targetId] of expected[slug].anchors) {
        expect(screen.getByRole("link", { name })).toHaveAttribute(
          "href",
          href,
        );
        expect(container.querySelector(`#${targetId}`)).toBeTruthy();
      }
    },
  );
});
