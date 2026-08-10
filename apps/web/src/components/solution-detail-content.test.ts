import { describe, expect, it } from "vitest";

import {
  getSolutionDetail,
  solutionDetailSlugs,
} from "./solution-detail-content";

describe("solution detail content", () => {
  it("registers exactly the six homepage solution slugs", () => {
    expect(solutionDetailSlugs).toStrictEqual([
      "knowledge-service",
      "process-automation",
      "government-knowledge",
      "finance-data",
      "healthcare-knowledge",
      "enterprise-multi-agent",
    ]);
  });

  it.each([
    {
      slug: "knowledge-service",
      title: "企业知识问答与知识服务",
      summary:
        "将企业文档、制度、产品资料和专业知识转化为可检索、可问答的智能知识服务。",
      audience: "需要建设员工知识助手、客户服务知识入口或专业知识服务的组织。",
      componentCount: 6,
      flowCount: 7,
    },
    {
      slug: "process-automation",
      title: "业务流程自动化与智能协同",
      summary:
        "通过可视化流程将模型、知识、数据、工具和业务逻辑组合为可执行的智能工作流。",
      audience: "希望减少重复操作、连接多项能力并实现跨步骤协同的组织。",
      componentCount: 6,
      flowCount: 7,
    },
  ])(
    "preserves the common solution copy for $slug",
    ({ audience, componentCount, flowCount, slug, summary, title }) => {
      const detail = getSolutionDetail(slug);

      expect(detail).toMatchObject({
        kind: "common",
        title,
        summary,
        audience,
      });
      expect(detail?.problems).toHaveLength(3);
      expect(detail?.components).toHaveLength(componentCount);
      expect(detail?.flow).toHaveLength(flowCount);
      expect(detail?.products.length).toBeGreaterThan(0);
    },
  );

  it.each([
    {
      slug: "government-knowledge",
      category: "政务",
      title: "政务知识问答与政策服务",
      problem: "政策、制度和办事知识分散，查询与答复依赖人工。",
      audience: "政务服务部门、业务处室与内部工作人员",
      summary:
        "统一沉淀政务知识，为工作人员和服务对象提供可追溯的知识查询与问答。",
      tags: [
        "统一政策知识入口",
        "提升查询效率",
        "支持知识持续维护",
        "形成可发布智能服务",
      ],
    },
    {
      slug: "finance-data",
      category: "金融",
      title: "经营数据问答与业务分析",
      problem: "经营数据查询口径复杂，临时分析依赖取数和报表人员。",
      audience: "经营管理、产品运营与数据分析团队",
      summary: "让授权用户使用自然语言查询业务数据，辅助快速理解经营情况。",
      tags: ["经营数据快查", "自然语言分析", "查询口径可控", "辅助运营判断"],
    },
    {
      slug: "healthcare-knowledge",
      category: "医疗",
      title: "医院知识与制度问答",
      problem: "院内制度、行政规范和服务知识分散，工作人员查询不便。",
      audience: "医院行政、运营、信息及内部服务部门",
      summary: "统一管理院内制度和服务知识，为工作人员提供知识查询辅助。",
      tags: ["院内制度统一", "知识查询便捷", "维护更新可控", "限定授权范围"],
    },
    {
      slug: "enterprise-multi-agent",
      category: "企业智能化",
      title: "多智能体复杂任务处理",
      problem: "复杂业务任务需要多个专业能力连续协同，单一智能体难以完整覆盖。",
      audience: "复杂业务运营、项目管理和跨部门协同团队",
      summary: "组合多个智能体与流程能力，分工处理复杂任务并汇总业务结果。",
      tags: ["多智能体分工", "复杂任务协同", "知识数据组合", "统一结果输出"],
    },
  ])(
    "preserves the industry solution copy for $slug",
    ({ audience, category, problem, slug, summary, tags, title }) => {
      const detail = getSolutionDetail(slug);

      expect(detail).toMatchObject({
        kind: "industry",
        category,
        title,
        problem,
        audience,
        summary,
        tags,
      });
      expect(detail?.components).toHaveLength(4);
      expect(detail?.flow).toHaveLength(4);
      expect(detail?.products).toHaveLength(3);
    },
  );

  it("does not fall back for unknown solution slugs", () => {
    expect(getSolutionDetail("unknown-solution")).toBeUndefined();
  });
});
