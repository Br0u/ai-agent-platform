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
