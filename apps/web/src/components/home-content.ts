export type HomeIconName =
  | "analytics"
  | "clock"
  | "code"
  | "cube"
  | "database"
  | "finance"
  | "government"
  | "inspection"
  | "knowledge"
  | "knowledge-search"
  | "location"
  | "mail"
  | "phone"
  | "platform"
  | "presentation"
  | "video"
  | "workflow";

export const homeContent = {
  hero: {
    title: "双轨架构驱动，赋能企业全域 AI 转型",
    lead: "华鲲信息构建全生命周期 AI 能力，采用元启基座平台 + 独立产品矩阵双轨架构，向下夯实底层 AI 支撑能力，向上承载多元智能化业务，赋能企业全域 AI 转型。",
    actions: [
      { label: "查看解决方案", href: "/solutions", variant: "primary" },
      { label: "申请体验", href: "/trial", variant: "secondary" },
    ],
  },
  featuredProducts: [
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
      description: "全域AI工作台：自然语言驱动工程落地，技能工具联动工程执行。",
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
  ],
  centers: {
    title: "元启平台六大中心，覆盖企业 AI 全生命周期",
    lead: "六大中心覆盖模型、智能体、应用、技能与权限，支撑企业 AI 全生命周期建设。",
    items: [
      {
        icon: "workflow",
        tag: "核心 · 重点",
        title: "智能体中心",
        position: "覆盖知识、数据、视频与流程编排的企业级 AI 智能体",
        description:
          "平台预置零代码构建模板，关联企业知识、数据或视频资源即可快速搭建；复杂业务通过低代码流程编排实现，构建可对话、可发布、可复用的智能体。",
        cta: "进入智能体中心 →",
        href: "/product/agents",
      },
      {
        icon: "platform",
        tag: "成熟应用",
        title: "行业应用中心",
        position: "面向高频业务场景的成熟 AI 应用",
        description:
          "通用文本写作、投标智能助手与合同智能审查等成熟应用，开箱即用、无需从零搭建，快速验证业务价值。",
        cta: "进入行业应用中心 →",
        href: "/product/applications",
      },
      {
        icon: "database",
        title: "模型中心",
        position: "资产管理、部署与优化",
        description: "统一管理企业模型资产，覆盖资产管理、部署、训练与评估。",
        cta: "查看模型中心 →",
        href: "/product/model",
      },
      {
        icon: "cube",
        title: "技能中心",
        position: "编程、应用、办公三类技能",
        description: "可复用业务技能标准封装、随取随用。",
        cta: "查看技能中心 →",
        href: "/product/skills",
      },
      {
        icon: "code",
        title: "编程中心",
        position: "码多多 1.0 智能编程",
        description: "自然语言驱动开发、双模式工作流与内置工具链。",
        cta: "查看编程中心 →",
        href: "/product/coding",
      },
      {
        icon: "inspection",
        title: "权限中心",
        position: "用户、角色、权限与授权治理",
        description: "横向支撑各中心，让平台权限边界清晰可控。",
        cta: "查看权限中心 →",
        href: "/product/governance",
      },
    ],
  },
  solutions: {
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
  },
  contact: {
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
  },
} as const;
