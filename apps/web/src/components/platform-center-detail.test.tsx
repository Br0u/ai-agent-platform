import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AgentCenterPage, {
  metadata as agentMetadata,
} from "../app/product/agents/page";
import ApplicationCenterPage, {
  metadata as applicationMetadata,
} from "../app/product/applications/page";
import CodingProjectPage from "../app/product/coding-project/page";
import CodingCenterPage, {
  metadata as codingMetadata,
} from "../app/product/coding/page";
import GovernanceCenterPage, {
  metadata as governanceMetadata,
} from "../app/product/governance/page";
import KnowledgeCenterPage, {
  metadata as knowledgeMetadata,
} from "../app/product/knowledge/page";
import ModelCenterPage, {
  metadata as modelMetadata,
} from "../app/product/model/page";
import SkillCenterPage, {
  metadata as skillMetadata,
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
    metadata: modelMetadata,
    title: "模型中心：覆盖模型全生命周期的企业模型工程",
    description:
      "模型花园与纳管统一资产管理，数据、训练、评估持续优化，三种部署方式让模型服务上线，任务中心统一调度运行，让模型从「能用」到「更懂业务、更好用」。",
    tags: 4,
    capabilities: 4,
    images: 5,
  },
  {
    slug: "knowledge",
    Page: KnowledgeCenterPage,
    metadata: knowledgeMetadata,
    title: "企业知识库：让企业文档变成 AI 能用的知识",
    description:
      "把制度、产品资料、技术文档等企业知识上传、解析、分片，沉淀为可检索、可问答、可溯源的 AI 知识底座，支撑知识智能体与上层应用。",
    tags: 4,
    capabilities: 0,
    images: 0,
  },
  {
    slug: "agents",
    Page: AgentCenterPage,
    metadata: agentMetadata,
    title: "智能体中心：零代码快速搭建，低代码灵活编排",
    description:
      "预置知识、数据、视频与流程编排四类智能体，常规场景零代码快速搭建、即配即用，复杂业务低代码流程编排，构建可对话、可发布、可复用的企业 AI 智能体。",
    tags: 4,
    capabilities: 4,
    images: 8,
  },
  {
    slug: "applications",
    Page: ApplicationCenterPage,
    metadata: applicationMetadata,
    title: "行业应用中心：高频业务场景，成熟应用开箱即用",
    description:
      "面向高频业务场景打磨成熟的 AI 应用，无需从零搭建模型、知识库与工作流，直接上手使用、快速验证价值。",
    tags: 3,
    capabilities: 3,
    images: 3,
  },
  {
    slug: "skills",
    Page: SkillCenterPage,
    metadata: skillMetadata,
    title: "技能中心：专业能力标准封装，统一管理、随取随用",
    description:
      "技能中心面向编程、应用与办公场景，将专业能力沉淀为标准化的可复用技能，通过技能货架统一发布与管理、按需安装与调用，随取随用。",
    tags: 3,
    capabilities: 3,
    images: 1,
  },
  {
    slug: "coding",
    Page: CodingCenterPage,
    metadata: codingMetadata,
    title: "码多多：自然语言驱动开发，双模式执行与工具链落地",
    description:
      "以自然语言对话覆盖从需求理解、代码生成到真实环境落地的完整开发链路；深度集成 VS Code，支持命令行与终端 UI 多端接入。",
    tags: 3,
    capabilities: 3,
    images: 2,
  },
  {
    slug: "governance",
    Page: GovernanceCenterPage,
    metadata: governanceMetadata,
    title: "权限中心：用户角色授权统一管理，权限边界清晰可控",
    description:
      "从「谁在平台上」到「能看什么、能做什么、能碰哪些数据」，一条授权链路让权限边界清晰可控：用户、角色、菜单与行级权限四道关口逐层收敛，操作与数据双权限管控。",
    tags: 4,
    capabilities: 1,
    images: 1,
  },
] as const;

describe("PlatformCenterDetail", () => {
  it.each(routedCenters)(
    "wires the $slug route to its V2 content and metadata",
    ({ Page, description, metadata, title }) => {
      const { container } = render(<Page />);

      expect(
        screen.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(metadata).toMatchObject({ title, description });
    },
  );

  it.each(routedCenters)(
    "renders the complete $slug center structure",
    ({ capabilities, images, slug, tags }) => {
      const { container } = render(<PlatformCenterDetail slug={slug} />);

      expect(screen.getAllByTestId("platform-center-hero-tag")).toHaveLength(
        tags,
      );
      expect(screen.getAllByTestId("platform-center-hero-action")).toHaveLength(
        1,
      );
      expect(screen.getAllByTestId("platform-center-section")).toHaveLength(
        slug === "knowledge" ? 4 : 1,
      );
      expect(
        screen.queryAllByTestId("platform-center-capability"),
      ).toHaveLength(capabilities);
      expect(screen.queryAllByRole("img")).toHaveLength(images);
      expect(screen.queryByTestId("platform-center-business")).toBeNull();
      expect(screen.getByTestId("platform-center-cta")).toBeVisible();
      expect(container.querySelector("main")).not.toHaveClass(
        "platform-center--dense",
      );
      expect(container.querySelector(".floating-assistant")).toBeNull();
    },
  );

  it("renders the V2 agent center copy, screenshots and no obsolete business stage", () => {
    const { container } = render(<AgentCenterPage />);

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "常规场景 · 零代码快速搭建",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "以自然语言提出查询需求，自动生成数据查询，结果以表格或图表呈现。",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "智能体中心架构图" }),
    ).toHaveAttribute("src", expect.stringContaining("hero.png"));
    expect(container.querySelector(".product-portal-reason-grid")).toBeNull();
    expect(container.querySelector(".product-portal-scenes")).toBeNull();
    expect(container.querySelector(".product-portal-demo")).toBeNull();
    expect(
      screen.queryByText("让企业拥有懂知识、懂业务、懂流程的 AI 助手"),
    ).not.toBeInTheDocument();
  });

  it("renders governance directory anchors on the actual controls", () => {
    const { container } = render(<GovernanceCenterPage />);

    for (const id of ["gov-users", "gov-roles", "gov-menu", "gov-permission"]) {
      expect(container.querySelector(`#${id}`)).toBeTruthy();
    }
    expect(
      screen.queryByText(
        "安全中心是元启平台内部的用户、权限与授权治理能力，不等同于独立网络安全产品或等保产品。",
      ),
    ).not.toBeInTheDocument();
  });

  it.each(["model", "agents", "applications", "skills", "governance"])(
    "uses the approved closing CTA copy for %s",
    (slug) => {
      render(<PlatformCenterDetail slug={slug} />);

      expect(screen.getByTestId("platform-center-cta")).toHaveTextContent(
        "欢迎与华鲲团队沟通并联系我们申请试用。",
      );
      expect(screen.getByTestId("platform-center-cta")).not.toHaveTextContent(
        "欢迎与华鲲团队沟通并申请试用。",
      );
    },
  );

  it("keeps the coding closing CTA copy unchanged", () => {
    render(<PlatformCenterDetail slug="coding" />);

    expect(screen.getByTestId("platform-center-cta")).toHaveTextContent(
      "申请体验编程中心，或与华鲲团队沟通企业级部署方案。",
    );
  });

  it("keeps citations nested in assistant messages on existing subpages", () => {
    render(<CodingProjectPage />);

    const demo = within(screen.getByTestId("platform-center-business"))
      .getAllByTestId("platform-page-demo")
      .find((element) =>
        element.textContent?.includes("项目工作台 · 会话示例"),
      );
    expect(demo).toBeDefined();
    const finalAnswer = within(demo!).getAllByTestId(
      "platform-demo-message",
    )[2]!;
    expect(
      within(finalAnswer).getByText("上下文：订单系统 · 已引用 8 条历史会话"),
    ).toHaveClass("product-portal-demo-cite");
  });

  it("omits optional copy and actions instead of rendering empty wrappers", () => {
    const page: PlatformPage = {
      slug: "optional-test",
      name: "可选内容测试",
      hero: {
        title: "可选内容测试",
        lead: "只渲染现有内容。",
        tags: [],
        actions: [],
      },
      sections: [{ title: "无额外文案" }],
      capabilities: [
        {
          id: "empty-actions",
          title: "无操作能力",
          lead: "没有操作按钮。",
          steps: [],
          actions: [],
        },
      ],
    };

    const { container } = render(<PlatformPageDetail page={page} />);

    expect(container.querySelector(".product-detail-hero")).toHaveClass(
      "has-no-media",
    );
    expect(container.querySelectorAll(".product-portal-actions")).toHaveLength(
      0,
    );
    expect(container.querySelectorAll(".product-portal-eyebrow")).toHaveLength(
      0,
    );
  });

  it("uses notFound for unknown center slugs", () => {
    expect(() => render(<PlatformCenterDetail slug="unknown" />)).toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });
});
