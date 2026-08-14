export const downloadProducts = {
  yuanqi: {
    name: "元启 AI 开发赋能平台",
    tag: "元启平台",
    href: "/product",
  },
  mdd2: {
    name: "码里奥",
    tag: "独立产品",
    href: "/product/code-agent",
  },
} as const;

export type DownloadResource = {
  key: string;
  short: string;
  title: string;
  file: string;
  desc: string;
  product?: keyof typeof downloadProducts;
};

export const downloadResources = {
  materials: [
    {
      key: "yuanqi-intro",
      short: "元启·平台产品介绍",
      product: "yuanqi",
      title: "元启 AI 开发赋能平台产品介绍",
      file: "PDF · 12 页",
      desc: "面向企业 AI 建设者的平台产品手册，介绍平台定位、六大中心能力与典型应用路径。",
    },
    {
      key: "yuanqi-features",
      short: "元启·平台功能清单",
      product: "yuanqi",
      title: "元启平台功能清单",
      file: "PDF · 8 页",
      desc: "模型、知识、智能体、应用与治理六大中心核心能力与关键功能速览。",
    },
    {
      key: "yuanqi-arch",
      short: "元启·平台架构说明",
      product: "yuanqi",
      title: "元启平台架构说明",
      file: "PDF · 10 页",
      desc: "平台分层架构、部署形态与运行机制说明，辅助企业评估平台适配性。",
    },
    {
      key: "mdd2-intro",
      short: "码里奥·产品介绍",
      product: "mdd2",
      title: "码里奥 产品介绍",
      file: "PDF · 10 页",
      desc: "面向企业研发与高密级代码资产场景的产品手册，介绍双形态、安全与部署方式。",
    },
    {
      key: "mdd2-features",
      short: "码里奥·功能清单",
      product: "mdd2",
      title: "码里奥 功能清单",
      file: "PDF · 6 页",
      desc: "自然语言开发、工程落地、技能与多智能体等核心能力清单。",
    },
    {
      key: "mdd2-env",
      short: "码里奥·支持环境说明",
      product: "mdd2",
      title: "码里奥 支持环境说明",
      file: "PDF · 4 页",
      desc: "支持的操作系统、运行环境与部署要求说明。",
    },
  ],
  deployment: [
    {
      key: "mdd2-deploy",
      short: "码里奥 安装部署指南",
      title: "码里奥 安装部署指南",
      file: "PDF · 16 页",
      desc: "从环境准备、安装部署到初始化验证的完整说明，帮助快速完成私有化部署。",
    },
    {
      key: "mdd2-usage",
      short: "码里奥 使用说明",
      title: "码里奥 使用说明",
      file: "PDF · 20 页",
      desc: "项目管理、会话管理、移动接入与编程规范的使用方法说明。",
    },
    {
      key: "yuanqi-deploy",
      short: "元启平台部署文档",
      title: "元启平台部署文档",
      file: "PDF · 24 页",
      desc: "元启 AI 开发赋能平台的部署环境要求与安装流程说明。",
    },
  ],
  whitepapers: [
    {
      key: "wp-ai",
      short: "企业 AI 落地白皮书",
      title: "企业 AI 落地白皮书",
      file: "PDF · 32 页",
      desc: "从模型、知识、智能体到应用，梳理企业 AI 建设的路径、关键能力与落地方法。",
    },
    {
      key: "wp-llm",
      short: "大模型应用实践白皮书",
      title: "大模型应用实践白皮书",
      file: "PDF · 28 页",
      desc: "面向业务场景的大模型选型、微调、部署与效果验证实践参考。",
    },
    {
      key: "wp-agent",
      short: "智能体与业务自动化技术资料",
      title: "智能体与业务自动化技术资料",
      file: "PDF · 20 页",
      desc: "智能体构建、流程编排与业务协同的技术说明，助力企业设计智能应用。",
    },
  ],
} as const satisfies Record<string, readonly DownloadResource[]>;

export const downloadSections = [
  {
    no: "01",
    label: "产品资料",
    anchor: "dl-materials",
    desc: "快速了解元启平台与码多多 2.0 的产品定位、核心能力与产品价值。",
  },
  {
    no: "02",
    label: "软件资源下载",
    anchor: "dl-software",
    desc: "获取码多多 2.0 客户端安装包与版本信息，进入安装体验。",
  },
  {
    no: "03",
    label: "产品部署文档",
    anchor: "dl-deployment",
    desc: "安装部署与使用说明，降低产品体验门槛。",
  },
  {
    no: "04",
    label: "白皮书与技术资料",
    anchor: "dl-whitepapers",
    desc: "企业 AI、大模型与智能体相关专业资料，增强产品可信度。",
  },
] as const;

export const downloadSoftware = {
  key: "mdd2-client",
  short: "码里奥 桌面客户端",
  name: "码里奥 桌面客户端",
  version: "v2.0.0",
  systems: "Windows 10/11 · macOS 12+",
  size: "安装包约 240 MB",
} as const;

export const downloadNotices = {
  software:
    "软件版本与支持系统以正式发布为准；原型阶段下载按钮唤起确认流程，不实际下载。",
  preview: (title: string) =>
    `「${title}」在线预览：正式版提供，原型以内容槽位示意`,
  file: (title: string) =>
    `「${title}」下载：原型阶段暂不提供真实文件，正式版上线后开放`,
  softwareConfirmed: "已创建下载任务：原型阶段不实际下载，正式版提供安装包",
} as const;

export const downloadOverview = {
  title: "从产品资料到安装体验，一站式获取华鲲资源",
  lead: "下载中心集中提供元启平台与码多多 2.0 的产品资料、软件安装包、部署文档与白皮书，帮助您了解产品能力、获取资源并进入产品体验。",
  tags: ["产品资料", "软件下载", "部署文档", "白皮书"],
  path: [
    ["了解产品", "查看元启平台与码多多 2.0 产品能力", "/product"],
    ["获取资料", "浏览产品资料、白皮书与部署文档", "/downloads#dl-materials"],
    ["安装体验", "下载码多多 2.0 客户端并部署", "/downloads#dl-software"],
    ["申请体验", "联系华鲲团队进入产品体验", "/trial"],
  ],
} as const;
