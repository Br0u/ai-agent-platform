import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import KnowledgeCenterPage, {
  metadata as knowledgeCenterMetadata,
} from "../app/product/knowledge/page";
import ModelCenterPage, {
  metadata as modelCenterMetadata,
} from "../app/product/model/page";
import AgentCenterPage, {
  metadata as agentCenterMetadata,
} from "../app/product/agents/page";
import ApplicationCenterPage, {
  metadata as applicationCenterMetadata,
} from "../app/product/applications/page";
import CodingCenterPage, {
  metadata as codingCenterMetadata,
} from "../app/product/coding/page";
import GovernanceCenterPage, {
  metadata as governanceCenterMetadata,
} from "../app/product/governance/page";
import SkillCenterPage, {
  metadata as skillCenterMetadata,
} from "../app/product/skills/page";
import {
  PlatformCenterDetail,
  PlatformPageDetail,
} from "./platform-center-detail";
import type { PlatformPage } from "./platform-page-types";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({ notFound }));

afterEach(() => {
  cleanup();
  notFound.mockClear();
});

const routedCenters = [
  {
    slug: "model",
    Page: ModelCenterPage,
    metadata: modelCenterMetadata,
    title: "企业模型工程，从资产管理到上线服务",
    description:
      "围绕企业最关心的三个问题组织能力：有哪些模型、模型怎么运行、模型怎么变强。模型花园与纳管统一资产管理，三种部署方式覆盖运行环境，数据工厂与训练评估让模型持续优化。",
  },
  {
    slug: "knowledge",
    Page: KnowledgeCenterPage,
    metadata: knowledgeCenterMetadata,
    title: "企业知识库：让企业文档变成 AI 能用的知识",
    description:
      "把制度、产品资料、技术文档等企业知识上传、解析、分片，沉淀为可检索、可问答、可溯源的 AI 知识底座，支撑知识智能体与上层应用。",
  },
  {
    slug: "agents",
    Page: AgentCenterPage,
    metadata: agentCenterMetadata,
    title: "让企业拥有懂知识、懂业务、懂流程的 AI 助手",
    description:
      "把模型、知识、数据和流程组合成可对话、可执行、可发布的智能体：企业知识助手回答问题，问数助手解读数据，视频助手看懂画面，自动化引擎跑通复杂流程——让 AI 真正开始帮企业干活。",
  },
  {
    slug: "applications",
    Page: ApplicationCenterPage,
    metadata: applicationCenterMetadata,
    title: "成熟业务 AI 应用，拿来即用",
    description:
      "不用从零搭建模型、知识库和工作流。面向高频业务场景打磨好的 AI 应用，直接上手使用，快速验证价值，再决定要不要深入建设。",
  },
  {
    slug: "skills",
    Page: SkillCenterPage,
    metadata: skillCenterMetadata,
    title: "可复用的业务技能，拿来即用",
    description:
      "技能中心沉淀面向编程、应用与办公场景的可复用能力——智能体与行业应用按需组装，能力标准化、复用化，减少重复建设。",
  },
  {
    slug: "coding",
    Page: CodingCenterPage,
    metadata: codingCenterMetadata,
    title: "码多多：让智能编程走进企业日常开发",
    description:
      "基于元启平台的智能编程助手，自然语言驱动开发、Plan/Build 双模式工作流，私有化部署、代码不出域——让团队写得更快、改得更稳、交付更规范。",
  },
  {
    slug: "governance",
    Page: GovernanceCenterPage,
    metadata: governanceCenterMetadata,
    title: "平台用得安全，权限管得清楚",
    description:
      "从「谁在平台上」到「能看什么、能做什么、能碰哪些数据」，一条授权链路让权限边界清晰可控。",
  },
] as const;

describe("PlatformCenterDetail", () => {
  it.each(routedCenters)(
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

  it.each([
    {
      slug: "model",
      title: "企业模型工程，从资产管理到上线服务",
      sectionCount: 5,
      tagCount: 4,
      hasBusiness: true,
      hasCta: false,
    },
    {
      slug: "knowledge",
      title: "企业知识库：让企业文档变成 AI 能用的知识",
      sectionCount: 4,
      tagCount: 4,
      hasBusiness: false,
      hasCta: true,
    },
    {
      slug: "agents",
      title: "让企业拥有懂知识、懂业务、懂流程的 AI 助手",
      sectionCount: 3,
      tagCount: 4,
      hasBusiness: true,
      hasCta: true,
    },
    {
      slug: "applications",
      title: "成熟业务 AI 应用，拿来即用",
      sectionCount: 3,
      tagCount: 4,
      hasBusiness: true,
      hasCta: true,
    },
    {
      slug: "skills",
      title: "可复用的业务技能，拿来即用",
      sectionCount: 3,
      tagCount: 3,
      hasBusiness: true,
      hasCta: true,
    },
    {
      slug: "coding",
      title: "码多多：让智能编程走进企业日常开发",
      sectionCount: 3,
      tagCount: 4,
      hasBusiness: true,
      hasCta: true,
    },
    {
      slug: "governance",
      title: "平台用得安全，权限管得清楚",
      sectionCount: 3,
      tagCount: 4,
      hasBusiness: true,
      hasCta: true,
    },
  ])(
    "renders the complete $slug center structure",
    ({ hasBusiness, hasCta, sectionCount, slug, tagCount, title }) => {
      const { container } = render(<PlatformCenterDetail slug={slug} />);

      expect(
        screen.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      expect(screen.getAllByTestId("platform-center-hero-tag")).toHaveLength(
        tagCount,
      );
      expect(screen.getAllByTestId("platform-center-hero-action")).toHaveLength(
        2,
      );
      expect(screen.getAllByTestId("platform-center-section")).toHaveLength(
        sectionCount,
      );
      expect(Boolean(screen.queryByTestId("platform-center-business"))).toBe(
        hasBusiness,
      );
      expect(Boolean(screen.queryByTestId("platform-center-cta"))).toBe(hasCta);
      expect(container.querySelector("main")).not.toHaveClass(
        "platform-center--dense",
      );
      expect(container.querySelector(".floating-assistant")).toBeNull();
    },
  );

  it("renders source links, flows, visual slots and optional sections", () => {
    const { rerender } = render(<PlatformCenterDetail slug="model" />);

    expect(
      screen.getByRole("link", { name: "查看模型花园 →" }),
    ).toHaveAttribute("href", "/product/model-assets#assets-garden");
    expect(screen.getAllByTestId("platform-center-table-row")).toHaveLength(3);
    expect(screen.getByText("模型花园模型卡片列表截图素材槽位")).toBeVisible();
    expect(
      within(screen.getByTestId("platform-center-workflow"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["模型接入", "数据训练", "效果评估", "部署使用"]);

    rerender(<PlatformCenterDetail slug="applications" />);

    expect(screen.queryByTestId("platform-center-workflow")).toBeNull();
    for (const link of screen.getAllByRole("link", {
      name: "查看通用文本写作 →",
    })) {
      expect(link).toHaveAttribute("href", "/product/app-writing");
    }
    expect(screen.getAllByTestId("platform-center-scene")).toHaveLength(3);
  });

  it("renders the complete coding center conversational demo through its real Page", () => {
    render(<CodingCenterPage />);

    const demo = screen
      .getAllByTestId("platform-page-demo")
      .find((element) => element.textContent?.includes("码多多 · 对话式开发"));

    expect(demo).toBeDefined();
    for (const copy of [
      "码多多 · 对话式开发",
      "给这个接口补上参数校验和单元测试",
      "正在分析代码并生成修改方案……",
      "已生成修改后的代码与单元测试，并检查通过。｜Build 模式 · 修改已落地",
      "对话式编程：输入需求 → 生成代码 → 落地执行，全程可追溯",
    ]) {
      expect(within(demo!).getByText(copy, { exact: true })).toBeVisible();
    }
    const messages = within(demo!).getAllByTestId("platform-demo-message");
    expect(messages).toHaveLength(3);
    expect(
      messages.map((message) => message.getAttribute("data-message-role")),
    ).toEqual(["user", "assistant", "assistant"]);
    expect(
      within(demo!).getByPlaceholderText("输入你的开发需求…"),
    ).toBeDisabled();
    expect(within(demo!).getByRole("button", { name: "发送" })).toBeDisabled();
    expect(messages.map((message) => message.textContent)).not.toContain(
      "输入你的开发需求…",
    );
    expect(messages.map((message) => message.textContent)).not.toContain(
      "发送",
    );
    expect(
      screen.queryByText("码多多 · 对话式开发界面素材槽位"),
    ).not.toBeInTheDocument();
  });

  it("renders the agent center source subheading and quoted data question", () => {
    render(<AgentCenterPage />);

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "构建一次，处处可用",
      }),
    ).toBeVisible();
    expect(
      screen.getByText("「查询去年销售额最高的区域」", { exact: true }),
    ).toBeVisible();
  });

  it("renders a demo cite and its following prototype caption separately", () => {
    const page: PlatformPage = {
      slug: "demo-caption-test",
      name: "演示注释测试",
      hero: {
        eyebrow: "测试",
        title: "演示注释测试",
        lead: "验证引用与演示链路说明同时保留。",
        tags: [],
        actions: [],
        visual: { title: "测试视觉" },
      },
      sections: [
        {
          eyebrow: "01｜演示",
          title: "双注释演示",
          demo: {
            title: "评估任务 · 评测结果演示",
            messages: ["正在执行自动评测……"],
            note: "评测集：行业问答 1000 条",
            caption: "选择模型与数据集 → 执行测评 → 输出结果 → 支撑决策",
          },
        },
      ],
    };

    render(<PlatformPageDetail page={page} />);

    const demo = screen.getByTestId("platform-page-demo");
    expect(within(demo).getByText("评测集：行业问答 1000 条")).toBeVisible();
    expect(
      within(demo).getByText(
        "选择模型与数据集 → 执行测评 → 输出结果 → 支撑决策",
      ),
    ).toHaveClass("product-portal-demo-caption");
  });

  it("renders governance anchors and the source scope note", () => {
    const { container } = render(<PlatformCenterDetail slug="governance" />);

    for (const id of ["gov-users", "gov-roles", "gov-menu", "gov-permission"]) {
      expect(container.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(
      screen.getByText(
        "安全中心是元启平台内部的用户、权限与授权治理能力，不等同于独立网络安全产品或等保产品。",
      ),
    ).toBeVisible();
  });

  it("omits empty group copy when tag and lead are absent", () => {
    const page: PlatformPage = {
      slug: "group-copy-test",
      name: "能力组测试",
      hero: {
        eyebrow: "测试",
        title: "能力组测试",
        lead: "验证可选文案不会生成空节点。",
        tags: [],
        actions: [],
        visual: { title: "测试视觉" },
      },
      sections: [
        {
          eyebrow: "能力分组",
          title: "能力分组",
          groups: [
            {
              id: "group-without-copy",
              title: "质量保障",
              cards: [
                {
                  title: "生成记录",
                  description: "生成记录全程留存。",
                },
              ],
            },
          ],
        },
      ],
    };

    const { container } = render(<PlatformPageDetail page={page} />);
    const group = container.querySelector("#group-without-copy");

    expect(group).toBeTruthy();
    expect(group?.querySelector(":scope > .product-portal-tag")).toBeNull();
    expect(group?.querySelector(":scope > p")).toBeNull();
    expect(
      within(group as HTMLElement).getByRole("heading", {
        level: 3,
        name: "质量保障",
      }),
    ).toBeVisible();
    expect(
      within(group as HTMLElement).getByRole("heading", {
        level: 4,
        name: "生成记录",
      }),
    ).toBeVisible();
  });

  it("uses notFound for unknown platform center slugs", () => {
    expect(() => render(<PlatformCenterDetail slug="unknown" />)).toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });
});
