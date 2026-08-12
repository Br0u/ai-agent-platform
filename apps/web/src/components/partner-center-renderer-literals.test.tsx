import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PartnerCenter } from "./partner-center";

const visibleText = (element: Element | null) =>
  element?.textContent?.replace(/\s+/gu, " ").trim() ?? "";

function projectMain(container: HTMLElement) {
  const main = container.querySelector<HTMLElement>(".partner-main")!;
  const sections = Array.from(
    main.querySelectorAll<HTMLElement>(".partner-section"),
  ).flatMap((section) => {
    const heading = section.querySelector(
      ":scope > header > h2, :scope > div:first-child > h2",
    );
    if (!heading) return [];
    const lead = section.querySelector(
      ":scope > header > p, :scope > div:first-child > p",
    );
    return [
      {
        id: section.id,
        heading: visibleText(heading),
        lead: visibleText(lead),
        notes: Array.from(
          section.querySelectorAll(":scope > .partner-note"),
          visibleText,
        ),
      },
    ];
  });

  return {
    eyebrow: visibleText(main.querySelector(".partner-eyebrow")),
    heroLead: visibleText(main.querySelector(".partner-lead")),
    sections,
    actions: Array.from(
      main.querySelectorAll(
        ".partner-actions > button, .partner-actions > a, .partner-card > button, .partner-card--button > strong",
      ),
      visibleText,
    ),
  };
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("PartnerCenter renderer literals from prototype HTML", () => {
  it("renders every view's eyebrow, leads, notes, headings and actions in source order", () => {
    const expected = [
      {
        href: "/partners?view=overview#po-hero",
        projection: {
          eyebrow: "合作伙伴｜生态总览",
          heroLead:
            "面向渠道、交付与技术伙伴，提供多元合作模式、清晰分润政策与全链路赋能支持，共同开拓企业 AI 市场。",
          sections: [
            {
              id: "po-value",
              heading: "为什么选择华鲲生态",
              lead: "从商业模式到赋能支持，为伙伴提供清晰可预期的成长回报。",
              notes: [],
            },
            {
              id: "po-modules",
              heading: "三大合作模块，从了解到落地",
              lead: "选择最适合你的合作方向，开始你的 AI 生态之旅。",
              notes: [],
            },
            {
              id: "po-flow",
              heading: "合作流程一目了然",
              lead: "六步完成伙伴入驻，快速启动业务。",
              notes: [],
            },
            {
              id: "po-cta",
              heading: "选择华鲲元启，选择共赢",
              lead: "立即申请成为华鲲合作伙伴，开启 AI 时代新机遇。",
              notes: [],
            },
          ],
          actions: [
            "成为合作伙伴",
            "了解商业模式",
            "联系生态负责人",
            "申请成为伙伴",
            "联系生态负责人",
            "了解元启平台 →",
          ],
        },
      },
      {
        href: "/partners?view=business#pb-hero",
        projection: {
          eyebrow: "合作伙伴｜商业模式",
          heroLead:
            "无论您是代理商、ISV 还是系统集成商，都能找到与华鲲元启最佳合作方式。灵活的商业模式，让每一位伙伴都能获得丰厚回报。",
          sections: [
            {
              id: "pb-modes",
              heading: "三种合作模式",
              lead: "灵活适配不同伙伴类型，选择最适合的合作方式。",
              notes: [],
            },
            {
              id: "pb-compare",
              heading: "模式对比一览",
              lead: "同一平台能力，不同合作深度与收益结构。",
              notes: [],
            },
            {
              id: "pb-tiers",
              heading: "分润政策：四级伙伴体系",
              lead: "能力越强、回报越高，等级逐级晋级，权益逐级提升。",
              notes: [
                "等级根据年度承诺销售额与认证团队综合评定，具体以双方签署协议为准。",
              ],
            },
            {
              id: "pb-benefits",
              heading: "伙伴权益",
              lead: "全方位支持，助力伙伴业务成功。",
              notes: [],
            },
            {
              id: "pb-flow",
              heading: "加入流程",
              lead: "六步完成伙伴入驻，快速启动业务。",
              notes: [],
            },
            {
              id: "pb-cta",
              heading: "选择华鲲元启，选择共赢",
              lead: "立即申请成为华鲲合作伙伴，开启 AI 时代新机遇。",
              notes: [],
            },
          ],
          actions: [
            "查看合作模式",
            "成为合作伙伴",
            "咨询该模式",
            "咨询该模式",
            "咨询该模式",
            "申请成为伙伴",
            "咨询商业模式",
          ],
        },
      },
      {
        href: "/partners?view=policy#pp-hero",
        projection: {
          eyebrow: "合作伙伴｜伙伴政策",
          heroLead:
            "清晰的准入标准、完善的认证体系、丰富的支持资源，为每一位伙伴提供明确的成长路径和坚实的后盾。",
          sections: [
            {
              id: "pp-types",
              heading: "伙伴类型与准入条件",
              lead: "三大伙伴类型，找到适合您的合作角色。",
              notes: [],
            },
            {
              id: "pp-choose",
              heading: "如何选择伙伴类型",
              lead: "结合自身能力定位合作角色，三类能力可叠加。",
              notes: [
                "伙伴类型用于判断合作方向，不代表自动通过准入审核；同一企业可具备多项能力。",
              ],
            },
            {
              id: "pp-cert",
              heading: "认证体系",
              lead: "三大认证方向、三级能力进阶，为伙伴团队赋能。",
              notes: [],
            },
            {
              id: "pp-resources",
              heading: "支持资源",
              lead: "全方位赋能伙伴，让成功更简单。",
              notes: [],
            },
            {
              id: "pp-cta",
              heading: "加入华鲲元启伙伴网络",
              lead: "立即申请，开启您的 AI 事业新篇章。",
              notes: [],
            },
          ],
          actions: [
            "查看准入条件",
            "成为合作伙伴",
            "按此类型申请",
            "按此类型申请",
            "按此类型申请",
            "申请成为伙伴",
            "咨询伙伴政策",
          ],
        },
      },
      {
        href: "/partners?view=training#pt-hero",
        projection: {
          eyebrow: "合作伙伴｜伙伴培训",
          heroLead:
            "系统化的培训课程、清晰的认证路径、丰富的学习资源，帮助每一位伙伴快速掌握元启平台，赢得市场先机。",
          sections: [
            {
              id: "pt-system",
              heading: "四位一体培训体系",
              lead: "全方位赋能伙伴成长。",
              notes: [],
            },
            {
              id: "pt-courses",
              heading: "三大课程方向",
              lead: "满足不同角色学习需求。",
              notes: [],
            },
            {
              id: "pt-path",
              heading: "三级认证路径",
              lead: "从入门到专家，清晰成长路线。",
              notes: [],
            },
            {
              id: "pt-resources",
              heading: "学习资源",
              lead: "丰富多样的学习资源，满足不同学习偏好。",
              notes: [],
            },
          ],
          actions: ["查看课程体系", "联系咨询"],
        },
      },
      {
        href: "/partners?view=become#pbc-hero",
        projection: {
          eyebrow: "合作对接",
          heroLead:
            "选择合作方向，准备基础企业与能力信息，通过人工渠道进一步沟通。",
          sections: [
            {
              id: "pbc-types",
              heading: "选择合作方向",
              lead: "根据自身能力选择合作角色。",
              notes: [
                "同一企业可具备多项能力；当前选择只用于调整联系提示，不提交后台。",
              ],
            },
            {
              id: "pbc-flow",
              heading: "六步入驻流程",
              lead: "从申请到业务启动，全程有专人支持。",
              notes: [],
            },
            {
              id: "pbc-prepare",
              heading: "需要准备的信息",
              lead: "提前准备以下资料，加快合作对接。",
              notes: [],
            },
          ],
          actions: [
            "立即申请",
            "查看准入条件",
            "选择此方向 →",
            "选择此方向 →",
            "选择此方向 →",
          ],
        },
      },
    ] as const;

    for (const { href, projection } of expected) {
      window.history.replaceState(null, "", href);
      const { container, unmount } = render(<PartnerCenter />);
      expect(projectMain(container)).toEqual(projection);
      unmount();
    }
  });
});
