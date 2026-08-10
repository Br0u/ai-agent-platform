export type HomeIconName =
  | "activity"
  | "box"
  | "code"
  | "database"
  | "eye"
  | "file"
  | "headphones"
  | "image"
  | "layers"
  | "message"
  | "monitor"
  | "network"
  | "shield";

type Capability = {
  code: string;
  title: string;
  description: string;
  icon: HomeIconName;
};

type PlatformLayer = {
  code: string;
  title: string;
  description: string;
  icon: HomeIconName;
};

type HomeCard = {
  title: string;
  description: string;
  icon: HomeIconName;
};

type Solution = HomeCard & {
  subsetLabel: string | undefined;
};

type Resource = HomeCard & {
  href: string;
};

export const homeCopy = {
  hero: {
    technicalLine: "国产算力 · 私有化部署 · 企业级 AI 开发",
    heading: {
      before: "让企业 ",
      emphasis: "AI",
      after: " 从模型走向业务",
    },
    productName: "华鲲元启 AI开发赋能平台",
    productCode: "TGDataXAI",
    summary:
      "以异构算力智能调度为底座，把模型仓库、知识工程、流程编排、训练、推理与评估连接为一套企业级开发体系，让智能体开发像搭积木一样简单。",
    primaryCta: { label: "了解平台", href: "/product" },
    secondaryCta: { label: "阅读文档", href: "/docs" },
    evidenceLabel: "PLATFORM / UI-01",
    evidenceProduct: "TGDataXAI",
    evidenceCaption: "应用广场界面 · 用户提供的华鲲元启平台截图",
  },
  platform: {
    kicker: "PLATFORM / 01",
    heading: {
      before: "一套平台，贯通企业 ",
      emphasis: "AI",
      after: " 开发全流程",
    },
    intro:
      "从企业数据进入知识工程，到智能体发布与模型运行，能力被组织为可理解、可管理的开发路径。",
    primaryCta: { label: "了解平台", href: "/product" },
    secondaryCta: { label: "阅读文档", href: "/docs" },
  },
  enterprise: {
    kicker: "ENTERPRISE / 02",
    heading: "为企业边界而设计",
  },
  solutions: {
    kicker: "SOLUTIONS / 03",
    heading: {
      before: "从平台能力，走向",
      emphasis: "行业场景",
      after: "",
    },
    intro:
      "行业方案建立在统一平台之上。视觉检索是其中的多模态子能力，不是独立上位平台。",
  },
  resources: {
    kicker: "RESOURCES / 01",
    heading: {
      before: "下一步，从这里",
      emphasis: "开始",
      after: "",
    },
    intro: "为您准备了关键的资源与文档，助力快速上手平台，开启高效开发之旅。",
  },
} as const;

export const capabilities = [
  {
    code: "01",
    title: "私有化部署",
    description: "安全合规 · 数据可控",
    icon: "shield",
  },
  {
    code: "02",
    title: "异构算力调度",
    description: "多源算力 · 高效调度",
    icon: "box",
  },
  {
    code: "03",
    title: "低代码智能体开发",
    description: "可视编排 · 快速构建",
    icon: "code",
  },
  {
    code: "04",
    title: "模型全生命周期管理",
    description: "从训练到治理 · 全链路管理",
    icon: "activity",
  },
] as const satisfies readonly Capability[];

export const platformLayers = [
  {
    code: "L1",
    title: "数据与知识",
    description: "知识库、多模态文档、知识图谱、数据源接入与数据预览。",
    icon: "database",
  },
  {
    code: "L2",
    title: "开发与编排",
    description: "流程编排、Prompt、MCP 接入与智能体应用发布。",
    icon: "code",
  },
  {
    code: "L3",
    title: "模型与运行",
    description: "模型仓库、训练中心、推理中心、评估中心与多种部署方式。",
    icon: "layers",
  },
  {
    code: "L4",
    title: "企业底座",
    description: "权限管理、用户管理、数据权限与算力分配。",
    icon: "shield",
  },
] as const satisfies readonly PlatformLayer[];

export const enterpriseProofs = [
  {
    title: "数据留在企业边界内",
    description: "围绕私有化部署与数据本地化要求组织模型、知识与应用能力。",
    icon: "database",
  },
  {
    title: "非结构化数据进入知识工程",
    description:
      "支持文档上传、自动分片、语料处理和知识图谱，让企业资料成为可用知识。",
    icon: "file",
  },
  {
    title: "低代码缩短落地路径",
    description:
      "通过可视化流程编排和预置智能体，把模型能力连接到具体业务过程。",
    icon: "code",
  },
  {
    title: "权限、数据和算力统一管控",
    description: "将用户、操作、数据权限与异构资源管理纳入同一企业级控制边界。",
    icon: "shield",
  },
] as const satisfies readonly HomeCard[];

export const solutions = [
  {
    title: "知识问答与知识加工",
    description: "企业资料进入知识库后，用于检索、问答与内容加工。",
    subsetLabel: undefined,
    icon: "message",
  },
  {
    title: "数据问答与报告生成",
    description: "连接结构化数据，形成面向业务人员的数据理解入口。",
    subsetLabel: undefined,
    icon: "file",
  },
  {
    title: "知识图谱",
    description: "构建实体与关系网络，支撑更明确的知识连接。",
    subsetLabel: undefined,
    icon: "network",
  },
  {
    title: "图像与多模态处理",
    description: "承载图像、语音和视频等多模态模型接入与业务处理。",
    subsetLabel: undefined,
    icon: "image",
  },
  {
    title: "视觉检索解决方案",
    description: "即时检索、持续布控、自然语言配置与预警管理。",
    subsetLabel: "基于华鲲元启的行业子能力",
    icon: "eye",
  },
] as const satisfies readonly Solution[];

export const resources = [
  {
    title: "产品文档",
    description: "了解产品功能、使用方法和规范。",
    href: "/docs",
    icon: "file",
  },
  {
    title: "版本更新",
    description: "查看最新版本说明与迭代优化。",
    href: "/releases",
    icon: "monitor",
  },
  {
    title: "集成指南",
    description: "集成方式、流程与最佳实践说明。",
    href: "/compatibility",
    icon: "layers",
  },
  {
    title: "客户支持",
    description: "快速解决问题，获取帮助与反馈入口。",
    href: "/support",
    icon: "headphones",
  },
] as const satisfies readonly Resource[];

export const homeContent = {
  hero: {
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
  },
  featuredProducts: [
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
  ],
  agents: {
    eyebrow: "五大智能体能力",
    title: "五大智能体，快速搭建、即配即用",
    lead: "平台预置知识问答、知识加工、知识图谱、数据问答、视频检索五类智能体，零代码快速构建，关联知识与数据即可投入使用。",
    items: [
      {
        badge: "问",
        title: "知识问答",
        description: "预置问答模板，关联企业知识库即配即用，回答有据可查。",
        cta: "了解知识问答 →",
        href: "/product/knowledge-agent#agent-k-qa",
      },
      {
        badge: "理",
        title: "知识加工",
        description: "预置加工模板，上传资料即整理成可用内容，快速沉淀。",
        cta: "了解知识加工 →",
        href: "/product/knowledge-agent#agent-k-processing",
      },
      {
        badge: "谱",
        title: "知识图谱",
        description: "预置图谱模板，关联知识库生成图谱，即问即答。",
        cta: "了解知识图谱 →",
        href: "/product/knowledge-agent#agent-k-graph",
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
        href: "/product/video-agent#agent-video-search",
      },
    ],
  },
  solutions: {
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
        description: "统一管理院内制度与服务知识，为工作人员提供知识查询辅助。",
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
  },
  contact: {
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
  },
} as const;
