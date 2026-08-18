import { describe, expect, it } from "vitest";

import { homeContent } from "./home-content";

describe("uploaded homepage content contract", () => {
  it("locks the hero and ordered four-product matrix", () => {
    expect(homeContent.hero).toStrictEqual({
      title: "双轨架构驱动，赋能企业全域 AI 转型",
      lead: "华鲲信息构建全生命周期 AI 能力，采用元启基座平台 + 独立产品矩阵双轨架构，向下夯实底层 AI 支撑能力，向上承载多元智能化业务，赋能企业全域 AI 转型。",
      actions: [
        { label: "查看解决方案", href: "/solutions", variant: "primary" },
        {
          label: "联系我们",
          href: "/contact?topic=官网咨询",
          variant: "secondary",
        },
      ],
    });

    expect(homeContent.featuredProducts).toStrictEqual([
      {
        icon: "platform",
        title: "元启",
        description:
          "企业 AI 开发平台：六大中心覆盖模型到应用，构建企业专属 AI。",
        cta: "进入产品中心 →",
        href: "/product",
      },
      {
        icon: "code",
        title: "码里奥",
        description:
          "全域AI工作台：自然语言驱动工程落地，技能工具联动工程执行。",
        cta: "查看码里奥 →",
        href: "/product/code-agent",
      },
      {
        icon: "presentation",
        title: "AIPPT",
        description: "智能演示文稿：需求直达成稿，支持在线编辑、多格式交付。",
        cta: "查看 AIPPT →",
        href: "/product/aippt",
      },
      {
        icon: "cube",
        title: "AISHREK",
        description: "3D 设计大师：支持自然语言修改通用格式与原生高精度模式。",
        cta: "查看 AISHREK →",
        href: "/product/aishrek",
      },
    ]);
  });

  it("locks the ordered V2 six-center matrix", () => {
    expect(homeContent.centers.title).toBe(
      "元启平台六大中心，覆盖企业 AI 全生命周期",
    );
    expect(homeContent.centers.items.map((item) => item.title)).toStrictEqual([
      "智能体中心",
      "行业应用中心",
      "模型中心",
      "技能中心",
      "编程中心",
      "权限中心",
    ]);
    expect("eyebrow" in homeContent.centers).toBe(false);
    expect(homeContent.centers.items.map((item) => item.icon)).toStrictEqual([
      "workflow",
      "platform",
      "database",
      "cube",
      "code",
      "inspection",
    ]);
    expect(homeContent.centers.items[0]?.description).toContain(
      "构建可对话、可发布、可复用的智能体",
    );
    expect(homeContent.centers.items[1]?.description).toContain(
      "快速验证业务价值",
    );
  });

  it("does not retain the homepage-only agent showcase omitted by V2", () => {
    expect("agents" in homeContent).toBe(false);
  });

  it("locks all six uploaded solution cards and routes", () => {
    expect(homeContent.solutions).toStrictEqual({
      title: "从通用场景到重点行业，AI 案例随需落地",
      lead: "覆盖企业高频通用场景，深入铁路、经营管理、公安、政务、金融与半导体等重点行业，以真实业务场景为依托，提供可落地、可复用的 AI 应用能力。",
      items: [
        {
          icon: "knowledge-search",
          category: "铁路",
          title: "党建知识库智能问答",
          description:
            "将海量规章制度与党建文献沉淀为可问答、可溯源的知识库，知识图谱 + RAG 双重保障回答严谨可信。",
          href: "/solutions/railway-exam",
        },
        {
          icon: "analytics",
          category: "企业通用管理",
          title: "销售经营智能问数",
          description:
            "面向销售经营管理场景，自然语言查询经营指标、目标达成与订单回款，自动生成分析结论与可视化图表。",
          href: "/solutions/enterprise-data",
        },
        {
          icon: "video",
          category: "公安",
          title: "视频智能布控与检索",
          description:
            "以自然语言描述即可检索视频目标、识别异常行为，分钟级创建算法、小时级上线，实现全天候智能布控预警。",
          href: "/solutions/ps-ghost-rider",
        },
        {
          icon: "government",
          category: "政务",
          title: "工商注册智能导办",
          description:
            "通过意图识别自主完成在线工商注册审批流程，材料自动核验、结果即时反馈。",
          href: "/solutions/government-process",
        },
        {
          icon: "finance",
          category: "金融",
          title: "交易监测模型智能开发",
          description:
            "面向金融机构反洗钱合规场景，以 AI 编程能力快速构建客户画像与可疑交易监测模型，减少误报、提升识别能力。",
          href: "/solutions/finance-aml",
        },
        {
          icon: "cube",
          category: "半导体",
          title: "光刻胶研发模型微调",
          description:
            "基于领域数据对基座模型进行微调，打造光刻胶研发专属 AI 科学家，专业题综合得分超越通用大模型。",
          href: "/solutions/semi-ai-scientist",
        },
      ],
      allLabel: "查看更多应用案例 →",
      allHref: "/solutions",
    });
  });

  it("locks the contact information and actions", () => {
    expect(homeContent.contact).toStrictEqual({
      title: "与华鲲一起，把企业 AI 真正落地",
      lead: "无论是平台建设、方案选型还是独立产品体验，留下您的需求，我们的顾问将尽快与您联系。",
      cardTitle: "联系信息",
      address: "四川省成都市双流区新程南一路 19 号 · AI 创新中心 F6 栋",
      businessEmail: "商务合作邮箱待确认",
      hotline: "客服热线待确认",
      serviceHours: "工作日 9:00 – 18:00",
      description:
        "我们提供产品咨询、方案交流、体验申请与商务合作等服务，欢迎与华鲲团队沟通。",
      actions: [
        {
          label: "联系我们",
          href: "/contact?topic=官网咨询",
          variant: "primary",
        },
        { label: "申请体验", href: "/trial", variant: "secondary" },
      ],
      note: "客户案例墙素材整理中，正式上线后以真实客户案例展示替换本区域。",
    });
  });
});
