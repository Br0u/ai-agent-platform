import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StandaloneProductDetail } from "./standalone-product-detail";

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

const contracts = [
  {
    slug: "code-agent",
    h1: "码里奥：让每一位企业工作者，都有 AI 搭档。",
    h2: [
      "码里奥：自然语言驱动工程落地的企业级 AI 编程软件",
      "Skill 技能生态：可复用技能，随需调用与编排",
      "MCP 工具集成：打破工具边界，连接企业系统",
      "自然语言开发：描述需求，直接生成工程文件",
      "研发生态协同：多模型集成，融入企业研发体系",
      "让企业 AI 编程真正落地，持续创造价值",
    ],
    images: [
      [
        "码多多 2.0 主界面：项目与会话、自然语言开发",
        "/assets/product/code-agent/main.png",
      ],
      ["Skill 技能与多智能体协同界面", "/assets/product/code-agent/skill.png"],
      ["MCP 工具集成界面", "/assets/product/code-agent/mcp.png"],
      ["自然语言开发界面", "/assets/product/code-agent/natural-language.png"],
      [
        "研发生态协同：多模型接入与管理",
        "/assets/product/code-agent/model-management.png",
      ],
    ],
    capabilityCount: 4,
    capabilityIds: ["mdd2-skill", "mdd2-mcp", "mdd2-dev", "mdd2-eco"],
    href: "/contact?topic=码多多 2.0 咨询",
  },
  {
    slug: "aippt",
    h1: "AIPPT：一站式智能演示文稿创作平台",
    h2: [
      "AIPPT：从内容梳理到版式生成的一站式智能创作",
      "参考资料驱动：内容有据可依，贴合原始材料",
      "三种渲染模式：按需成稿，从简约到臻制",
      "自然语言微调：对话调整，所见即所得",
      "人机双写内容：AI 生成初稿，逐字逐图可编辑",
      "开启高效智能的演示文稿创作体验",
    ],
    images: [
      ["Aurora 创作台主界面", "/assets/product/aippt/main.png"],
      ["参考资料驱动", "/assets/product/aippt/reference-materials.png"],
      ["三种渲染模式界面", "/assets/product/aippt/rendering-modes.png"],
      [
        "自然语言微调演示内容",
        "/assets/product/aippt/natural-language-tuning.png",
      ],
      [
        "人机双写：逐字逐图可编辑",
        "/assets/product/aippt/human-ai-editing.png",
      ],
    ],
    capabilityCount: 4,
    capabilityIds: ["aippt-ref", "aippt-mode", "aippt-gen", "aippt-export"],
    href: "/contact?topic=AIPPT 咨询",
  },
  {
    slug: "aishrek",
    h1: "AISHREK：AI 机械设计工作台，导入即解读、文生即改型",
    h2: [
      "AISHREK：自然语言驱动改型的机械设计工作台",
      "自然语言 CAD：以自然语言描述需求，直接驱动参数改型",
      "原生精密联动：原生改参数，精密动装配",
      "多维仿真 CAE：结构仿真与动力学分析一体",
      "开启智能机械设计体验",
    ],
    images: [
      ["AISHREK 机械设计工作台", "/assets/product/aishrek/main.png"],
      ["自然语言 CAD 界面", "/assets/product/aishrek/natural-language-cad.png"],
      ["原生精密联动界面", "/assets/product/aishrek/native-linkage.png"],
      ["多维仿真 CAE 界面", "/assets/product/aishrek/cae.png"],
    ],
    capabilityCount: 3,
    capabilityIds: ["aishrek-import", "aishrek-chat", "aishrek-link"],
    href: "/contact?topic=AISHREK 咨询",
  },
] as const;

describe("StandaloneProductDetail V2 contract", () => {
  it.each(contracts)(
    "renders only the faithful $slug structure",
    (contract) => {
      const { container } = render(
        <StandaloneProductDetail slug={contract.slug} />,
      );

      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        contract.h1,
      );
      expect(
        screen
          .getAllByRole("heading", { level: 2 })
          .map((node) => node.textContent),
      ).toEqual(contract.h2);
      expect(screen.getAllByTestId("detail-introduction-card")).toHaveLength(2);
      expect(screen.getAllByTestId("detail-introduction-tag")).not.toHaveLength(
        0,
      );
      expect(screen.getAllByTestId("detail-use-tag")).not.toHaveLength(0);
      expect(screen.getAllByTestId("detail-capability")).toHaveLength(
        contract.capabilityCount,
      );
      expect(
        screen
          .getAllByTestId("detail-capability")
          .map((node) => node.closest("section")?.id),
      ).toEqual(contract.capabilityIds);
      expect(screen.getAllByTestId("detail-capability-step")).toHaveLength(
        contract.capabilityCount * 3,
      );
      expect(screen.getAllByTestId("detail-capability-note")).toHaveLength(
        contract.capabilityCount,
      );

      for (const [alt, src] of contract.images) {
        const image = screen.getByRole("img", { name: alt });
        expect(decodeURIComponent(image.getAttribute("src") ?? "")).toContain(
          src,
        );
      }

      for (const action of screen.getAllByRole("link", { name: "联系我们" })) {
        expect(action).toHaveAttribute("href", contract.href);
      }

      expect(
        container.querySelector("[data-testid='detail-security-item']"),
      ).toBeNull();
      expect(
        container.querySelector("[data-testid='detail-experience-flow']"),
      ).toBeNull();
      expect(
        container.querySelector("[data-testid='detail-scene']"),
      ).toBeNull();
      expect(container.querySelector(".product-portal-business")).toBeNull();
      expect(container.querySelector(".product-portal-demo")).toBeNull();
      expect(container.querySelector(".product-portal-reason-grid")).toBeNull();
    },
  );

  it("uses notFound for unknown standalone product slugs", () => {
    expect(() => render(<StandaloneProductDetail slug="unknown" />)).toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });
});
