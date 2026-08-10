import { describe, expect, it } from "vitest";

import { homeContent } from "./home-content";

describe("prototype homepage content contract", () => {
  it("locks the hero and featured product copy", () => {
    expect(homeContent.hero).toStrictEqual({
      eyebrow: "华鲲 · 元启 AI 开发赋能平台",
      title: "一站式企业 AI 开发赋能平台，让 AI 能力真正落地业务",
      lead: "元启平台基于 LLMOPS 提供模型、知识、智能体、应用与治理的全栈能力，帮助企业快速构建专属智能体；码多多 2.0、AISHREK 等独立产品开箱即用。从能力建设到业务落地，覆盖企业 AI 全链路。",
      tags: ["模型全栈管理", "知识工程", "智能体构建", "流程编排", "行业应用"],
      actions: [
        { label: "了解元启平台", href: "/product", variant: "primary" },
        { label: "查看解决方案", href: "/solutions", variant: "secondary" },
        { label: "申请体验", href: "/trial", variant: "secondary" },
      ],
      visualCaption: "Banner 大图素材槽位：元启平台整体架构 / 主视觉",
    });

    expect(homeContent.featuredProducts).toStrictEqual([
      {
        badge: "码",
        title: "码多多 2.0",
        description:
          "企业级智能编码产品：代码不出域、说需求就落地，支持私有化部署与 VS Code 双形态。",
        cta: "查看码多多 2.0 →",
        href: "/product/code-agent",
      },
      {
        badge: "设",
        title: "AISHREK",
        description:
          "AI 机械设计工作台：导入即解读、对话改参数，覆盖机械设计到交付全流程。",
        cta: "查看 AISHREK →",
        href: "/product/aishrek",
      },
    ]);
  });

  it("locks all five agent capabilities and their destination anchors", () => {
    expect(homeContent.agents).toStrictEqual({
      eyebrow: "五大智能体能力",
      title: "五大智能体，快速搭建、即配即用",
      lead: "平台预置知识问答、知识加工、知识图谱、数据问答、视频检索五类智能体，零代码快速构建，关联知识与数据即可投入使用。",
      items: [
        {
          badge: "问",
          title: "知识问答",
          description: "预置问答模板，关联企业知识库即配即用，回答有据可查。",
          cta: "了解知识问答 →",
          href: "/product/agent-knowledge#agent-k-qa",
        },
        {
          badge: "理",
          title: "知识加工",
          description: "预置加工模板，上传资料即整理成可用内容，快速沉淀。",
          cta: "了解知识加工 →",
          href: "/product/agent-knowledge#agent-k-processing",
        },
        {
          badge: "谱",
          title: "知识图谱",
          description: "预置图谱模板，关联知识库生成图谱，即问即答。",
          cta: "了解知识图谱 →",
          href: "/product/agent-knowledge#agent-k-graph",
        },
        {
          badge: "数",
          title: "数据问答",
          description: "预置问数模板，关联数据源即可随问随答，口径统一。",
          cta: "了解数据问答 →",
          href: "/product/data-agent#agent-data-qa",
        },
        {
          badge: "视",
          title: "视频检索",
          description: "预置检索模板，接入视频即可检索与实时预警。",
          cta: "了解视频检索 →",
          href: "/product/agent-video#agent-video-search",
        },
      ],
    });
  });

  it("locks all six solution cards and detail routes", () => {
    expect(homeContent.solutions).toStrictEqual({
      eyebrow: "高价值解决方案",
      title: "从通用场景到重点行业，AI 方案随需落地",
      lead: "方案既覆盖企业高频通用场景，也深入政务、金融、医疗与企业智能化等重点行业，提供可落地、可复用的 AI 能力组合。",
      items: [
        {
          category: "通用场景",
          title: "企业知识问答与知识服务",
          description: "把企业知识转化为可检索、可问答、可持续维护的智能服务。",
          href: "/solutions/knowledge-service",
        },
        {
          category: "通用场景",
          title: "业务流程自动化与智能协同",
          description:
            "把多步骤、跨系统的复杂业务编排成自动流程，自动执行、结果可控。",
          href: "/solutions/process-automation",
        },
        {
          category: "政务",
          title: "政务知识问答与政策服务",
          description:
            "统一沉淀政务知识，为工作人员和服务对象提供可追溯的知识查询与问答。",
          href: "/solutions/government-knowledge",
        },
        {
          category: "金融",
          title: "金融经营数据问答与业务分析",
          description: "授权用户用自然语言查询业务数据，辅助快速理解经营情况。",
          href: "/solutions/finance-data",
        },
        {
          category: "医疗",
          title: "医院知识与制度问答",
          description:
            "统一管理院内制度与服务知识，为工作人员提供知识查询辅助。",
          href: "/solutions/healthcare-knowledge",
        },
        {
          category: "企业智能化",
          title: "多智能体复杂任务处理",
          description:
            "组合多个智能体协同完成跨系统的复杂任务，结果可控、可追溯。",
          href: "/solutions/enterprise-multi-agent",
        },
      ],
      allLabel: "查看更多通用与行业解决方案 →",
      allHref: "/solutions",
    });
  });

  it("locks contact copy while preserving unresolved source fields", () => {
    expect(homeContent.contact).toStrictEqual({
      eyebrow: "联系我们",
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
