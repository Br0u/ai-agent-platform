import { describe, expect, it } from "vitest";

import {
  getStandaloneProduct,
  productOverview,
  standaloneCenter,
  standaloneProductSlugs,
} from "./product-portal-content";

describe("prototype product portal content contract", () => {
  it("locks the overview copy and destination routes", () => {
    expect(productOverview.hero.title).toBe(
      "让企业 AI 落地，深度建设与快速使用双路径",
    );
    expect(productOverview.hero.tags).toStrictEqual([
      "深度构建 · 元启平台",
      "快速使用 · 独立产品",
      "统一运营 · 平台治理",
    ]);
    expect(productOverview.challenges.items).toHaveLength(3);
    expect(productOverview.chain.items).toHaveLength(4);
    expect(productOverview.centers.eyebrow).toBe("七大中心");
    expect(productOverview.centers.title).toBe(
      "元启平台六大中心，覆盖企业 AI 全生命周期",
    );
    expect(productOverview.centers.items).toHaveLength(5);
    expect(productOverview.independent.items.map((item) => item.href)).toEqual([
      "/product/code-agent",
      "/product/aippt",
      "/product/aishrek",
    ]);
  });

  it("locks the independent product center", () => {
    expect(standaloneCenter.hero.title).toBe(
      "独立产品中心：成熟企业级 AI 产品，开箱即用",
    );
    expect(standaloneCenter.products.map((item) => item.slug)).toEqual([
      "code-agent",
      "aippt",
      "aishrek",
    ]);
    expect(standaloneCenter.products[0]?.recommended).toBe("优先推荐");
    expect(standaloneCenter.comparison.columns).toStrictEqual([
      "产品",
      "给谁用",
      "解决什么问题",
      "典型形态",
    ]);
    expect(standaloneCenter.comparison.rows).toHaveLength(3);
    expect(standaloneCenter.relations.items.map((item) => item.title)).toEqual([
      "独立部署、独立使用",
      "与元启组合、能力互通",
    ]);
  });

  it("registers exactly the three standalone product details", () => {
    expect(standaloneProductSlugs).toStrictEqual([
      "code-agent",
      "aippt",
      "aishrek",
    ]);
  });

  it.each([
    {
      slug: "code-agent",
      title: "企业级的智能编码产品，代码不出域、说需求就落地",
      introductionTitle: "不是又一个 AI 工具，而是企业级智能编码产品",
      flow: ["说需求", "分析项目上下文", "生成代码", "运行验证"],
      scene: "高密级代码资产企业",
      securityCount: 4,
    },
    {
      slug: "aippt",
      title: "一站式智能演示文稿创作平台，需求直达、分钟级成稿",
      introductionTitle: "从模板套用到智能创作，覆盖内容、结构与版式的完整链路",
      flow: ["输入需求 / 上传资料", "生成大纲与页面", "预览调整 · 导出交付"],
      scene: "工作汇报",
      securityCount: 0,
    },
    {
      slug: "aishrek",
      title: "AI 机械设计工作台，导入即解读、对话改参数",
      introductionTitle: "从 3D 查看器到 AI 建模工作台，覆盖设计修改全流程",
      flow: ["导入设计文件", "对话修改参数", "验证与交付"],
      scene: "零件设计与改型",
      securityCount: 0,
    },
  ])(
    "locks the complete $slug page structure",
    ({ flow, introductionTitle, scene, securityCount, slug, title }) => {
      const product = getStandaloneProduct(slug);

      expect(product?.hero.title).toBe(title);
      expect(product?.hero.tags).toHaveLength(4);
      expect(product?.hero.actions).toHaveLength(2);
      expect(product?.introduction.title).toBe(introductionTitle);
      expect(product?.introduction.items).toHaveLength(3);
      expect(product?.capabilities.items).toHaveLength(4);
      expect(
        product?.capabilities.items.every((item) => item.features.length >= 3),
      ).toBe(true);
      expect(product?.experience.flow).toStrictEqual(flow);
      expect(product?.business.scenes).toHaveLength(3);
      expect(
        product?.business.scenes.some((item) => item.title === scene),
      ).toBe(true);
      expect(product?.security?.items ?? []).toHaveLength(securityCount);
      expect(product?.cta.actions.length).toBeGreaterThanOrEqual(2);
    },
  );

  it("does not invent fallback content for unknown slugs", () => {
    expect(getStandaloneProduct("unknown")).toBeUndefined();
  });
});
