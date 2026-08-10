import { describe, expect, it } from "vitest";

import {
  getPlatformCenter,
  platformCenterSlugs,
} from "./platform-center-content";

describe("prototype platform center content contract", () => {
  it("registers exactly the seven platform centers", () => {
    expect(platformCenterSlugs).toStrictEqual([
      "model",
      "knowledge",
      "agents",
      "applications",
      "skills",
      "coding",
      "governance",
    ]);
    expect(getPlatformCenter("unknown")).toBeUndefined();
  });

  it.each([
    ["model", "企业模型工程，从资产管理到上线服务", 4, "模型中心咨询"],
    [
      "knowledge",
      "企业知识库：让企业文档变成 AI 能用的知识",
      4,
      "企业知识库咨询",
    ],
    [
      "agents",
      "让企业拥有懂知识、懂业务、懂流程的 AI 助手",
      4,
      "智能体中心咨询",
    ],
    ["applications", "成熟业务 AI 应用，拿来即用", 4, "行业应用中心咨询"],
    ["skills", "可复用的业务技能，拿来即用", 3, "技能中心咨询"],
    ["coding", "码多多：让智能编程走进企业日常开发", 4, "编程中心咨询"],
    ["governance", "平台用得安全，权限管得清楚", 4, "安全中心咨询"],
  ])("locks the %s hero copy", (slug, title, tagCount, topic) => {
    const center = getPlatformCenter(slug);

    expect(center?.hero.title).toBe(title);
    expect(center?.hero.tags).toHaveLength(tagCount);
    expect(center?.hero.actions.map((action) => action.href)).toStrictEqual([
      "/trial",
      `/contact?topic=${topic}`,
    ]);
    expect(center?.hero.visual).toBeDefined();
  });

  it("keeps the complete model center structure without adding a final CTA", () => {
    const center = getPlatformCenter("model");

    expect(center?.sections).toHaveLength(5);
    expect(center?.sections[0]?.cards).toHaveLength(3);
    expect(center?.sections[2]?.table?.rows).toHaveLength(3);
    expect(center?.sections[3]?.cards).toHaveLength(3);
    expect(center?.sections[4]?.flow).toStrictEqual([
      "任务中心创建推理 / 训练 / 评估任务",
      "配置运行资源",
      "任务调度执行",
      "查看运行状态",
    ]);
    expect(center?.business?.workflow).toStrictEqual([
      "模型接入",
      "数据训练",
      "效果评估",
      "部署使用",
    ]);
    expect(center?.business?.scenes).toHaveLength(3);
    expect(center?.cta).toBeUndefined();
  });

  it("keeps the knowledge center capabilities, consumers and final CTA", () => {
    const center = getPlatformCenter("knowledge");

    expect(center?.sections).toHaveLength(4);
    expect(center?.sections[1]?.cards).toHaveLength(6);
    expect(
      center?.sections[2]?.cards?.map((card) => card.actions?.[0]?.href),
    ).toStrictEqual(["/product/knowledge-agent", "/product/applications"]);
    expect(center?.sections[3]?.cards).toHaveLength(2);
    expect(center?.business).toBeUndefined();
    expect(center?.cta?.actions).toHaveLength(2);
  });

  it("keeps the four agent families and their platform foundations", () => {
    const center = getPlatformCenter("agents");

    expect(center?.sections).toHaveLength(3);
    expect(center?.sections[0]?.cards).toHaveLength(4);
    expect(center?.sections[1]?.cards?.map((card) => card.title)).toStrictEqual(
      [
        "把企业文档、制度、经验，变成随时可问的智能知识库",
        "不用写 SQL，问一句就能拿到数据答案",
        "让视频从「被观看」变成「可理解」",
        "把多步骤、跨系统的复杂业务，变成一条自动流程",
      ],
    );
    expect(center?.sections[2]?.cards).toHaveLength(2);
    expect(center?.business?.scenes).toHaveLength(3);
    expect(center?.cta?.actions).toHaveLength(2);
  });

  it("keeps the application shelf and its platform support chain", () => {
    const center = getPlatformCenter("applications");

    expect(center?.sections).toHaveLength(3);
    expect(center?.sections[1]?.cards?.map((card) => card.title)).toStrictEqual(
      ["通用文本写作", "投标智能助手", "合同智能审查"],
    );
    expect(center?.sections[2]?.flow).toStrictEqual([
      "模型",
      "知识",
      "智能体",
      "应用",
    ]);
    expect(center?.business?.scenes).toHaveLength(3);
    expect(center?.cta?.actions).toHaveLength(3);
  });

  it("keeps the three skill categories and their product consumers", () => {
    const center = getPlatformCenter("skills");

    expect(center?.sections).toHaveLength(3);
    expect(
      center?.sections[1]?.cards?.map((card) => card.actions?.[0]?.href),
    ).toStrictEqual([
      "/product/skills-programming",
      "/product/skills-application",
      "/product/skills-office",
    ]);
    expect(center?.sections[2]?.cards).toHaveLength(4);
    expect(center?.business?.workflow).toStrictEqual([
      "选用技能",
      "组装调用",
      "完成任务",
      "沉淀复用",
    ]);
    expect(center?.cta?.actions).toHaveLength(2);
  });

  it("keeps the coding questions, core capabilities and workflow", () => {
    const center = getPlatformCenter("coding");

    expect(center?.sections).toHaveLength(3);
    expect(center?.sections[0]?.cards).toHaveLength(3);
    expect(
      center?.sections[2]?.cards?.map((card) => card.actions?.[0]?.href),
    ).toStrictEqual([
      "/product/coding-project",
      "/product/coding-session",
      "/product/coding-mobile",
      "/product/coding-standard",
    ]);
    expect(center?.business?.workflow).toStrictEqual([
      "输入需求",
      "生成方案",
      "落地执行",
      "验证交付",
    ]);
    expect(center?.cta?.actions).toHaveLength(2);
  });

  it("keeps all four governance controls and the source limitation note", () => {
    const center = getPlatformCenter("governance");

    expect(center?.sections).toHaveLength(3);
    expect(center?.sections[1]?.cards).toHaveLength(4);
    expect(center?.sections[2]?.groups?.map((group) => group.id)).toStrictEqual(
      ["gov-users", "gov-roles", "gov-menu", "gov-permission"],
    );
    expect(center?.business?.note).toBe(
      "安全中心是元启平台内部的用户、权限与授权治理能力，不等同于独立网络安全产品或等保产品。",
    );
    expect(center?.cta?.actions).toHaveLength(2);
  });
});
