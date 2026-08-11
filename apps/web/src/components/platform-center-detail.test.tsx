import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import KnowledgeCenterPage, {
  metadata as knowledgeCenterMetadata,
} from "../app/product/knowledge/page";
import ModelCenterPage, {
  metadata as modelCenterMetadata,
} from "../app/product/model/page";
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
