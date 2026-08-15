export const downloadProducts = {
  yuanqi: { name: "元启 AI 开发赋能平台", tag: "元启平台" },
  mdd2: { name: "码里奥", tag: "独立产品" },
  office: { name: "智能办公应用", tag: "行业应用" },
  daoban: { name: "智能导办", tag: "行业应用" },
  vision: { name: "视觉检索智能体", tag: "独立产品" },
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
      key: "yuanqi-fullstack",
      short: "元启·全栈解决方案",
      product: "yuanqi",
      title: "元启·全栈解决方案",
      file: "PPT 演示",
      desc: "面向企业管理层的元启平台全栈解决方案，涵盖算力、模型、平台与智能体应用全景。",
    },
    {
      key: "yuanqi-appliance",
      short: "元启·开发一体机彩页",
      product: "yuanqi",
      title: "元启·开发一体机彩页",
      file: "PPT 演示",
      desc: "元启 AI 开发平台一体机产品彩页，介绍一体机形态、核心能力与适用场景。",
    },
    {
      key: "yuanqi-cases",
      short: "元启·案例集与场景汇总",
      product: "yuanqi",
      title: "元启·案例集与场景汇总",
      file: "PPT 演示",
      desc: "覆盖政务、金融、能源等行业落地案例与典型应用场景汇总。",
    },
    {
      key: "yuanqi-folder",
      short: "元启·三折叠彩页",
      product: "yuanqi",
      title: "元启·三折叠彩页",
      file: "PDF 文档",
      desc: "元启平台产品总览彩页，一页了解平台定位与核心价值。",
    },
    {
      key: "yuanqi-usage",
      short: "元启·用户使用手册",
      product: "yuanqi",
      title: "元启·用户使用手册",
      file: "Word 文档",
      desc: "元启平台用户使用手册，介绍平台各中心功能与使用流程。",
    },
    {
      key: "mdd2-intro",
      short: "码里奥·产品说明书",
      product: "mdd2",
      title: "码里奥·产品说明书",
      file: "Word 文档",
      desc: "码里奥（AI 代码生成助手）产品说明书，介绍产品定位、核心能力与使用方式。",
    },
    {
      key: "mdd2-solution",
      short: "码里奥·智能编码解决方案",
      product: "mdd2",
      title: "码里奥·智能编码解决方案",
      file: "PPT 演示",
      desc: "面向研发团队的智能编码解决方案，融合技能开发、Agent 管理与 AI 编程。",
    },
    {
      key: "office-appliance",
      short: "办公·一体机彩页",
      product: "office",
      title: "办公·一体机彩页",
      file: "PPT 演示",
      desc: "智能办公一体机产品彩页，聚焦公文写作、会议纪要等办公场景提效。",
    },
    {
      key: "office-doc",
      short: "办公·公文写作助手说明书",
      product: "office",
      title: "办公·公文写作助手说明书",
      file: "Word 文档",
      desc: "公文写作助手产品说明，支持公文拟稿、润色与格式规范。",
    },
    {
      key: "office-contract",
      short: "办公·合同审核助手说明书",
      product: "office",
      title: "办公·合同审核助手说明书",
      file: "Word 文档",
      desc: "合同审核助手产品说明，辅助合同条款核对与风险识别。",
    },
    {
      key: "office-bid",
      short: "办公·招投标智能体说明书",
      product: "office",
      title: "办公·招投标智能体说明书",
      file: "Word 文档",
      desc: "招投标智能体产品说明，覆盖标书撰写、审查与投标流程提效。",
    },
    {
      key: "daoban-appliance",
      short: "导办·一体机彩页",
      product: "daoban",
      title: "导办·一体机彩页",
      file: "PPT 演示",
      desc: "智能导办一体机产品彩页，面向政务服务场景的智能导办入口。",
    },
    {
      key: "daoban-gov",
      short: "导办·政务智能体产品介绍",
      product: "daoban",
      title: "导办·政务智能体产品介绍",
      file: "PPT 演示",
      desc: "面向政务服务领域的智能体产品介绍，覆盖事项导办、材料核验等场景。",
    },
    {
      key: "daoban-assistant",
      short: "导办·智能导办助手说明书",
      product: "daoban",
      title: "导办·智能导办助手说明书",
      file: "Word 文档",
      desc: "智能导办助手产品说明，通过意图识别辅助完成业务办理。",
    },
    {
      key: "vision-folder",
      short: "视觉·一体机三折页",
      product: "vision",
      title: "视觉·一体机三折页",
      file: "PDF 文档",
      desc: "视觉检索一体机产品三折页，介绍视频接入、检索与布控能力。",
    },
    {
      key: "vision-solution",
      short: "视觉·视频智能体解决方案",
      product: "vision",
      title: "视觉·视频智能体解决方案",
      file: "PPT 演示",
      desc: "视频大模型智能体解决方案，从“看得见”到“看得懂、能处置”。",
    },
    {
      key: "vision-intro",
      short: "视觉·产品说明书",
      product: "vision",
      title: "视觉·产品说明书",
      file: "Word 文档",
      desc: "视觉检索智能体产品说明，覆盖即时检索、持续布控与预警管理。",
    },
    {
      key: "vision-usage",
      short: "视觉·用户使用手册",
      product: "vision",
      title: "视觉·用户使用手册",
      file: "Word 文档",
      desc: "视觉检索智能体使用说明，覆盖功能操作与布控配置。",
    },
  ],
  deployment: [
    {
      key: "yuanqi-deploy",
      short: "元启·部署安装操作手册",
      title: "元启·部署安装操作手册",
      file: "Word 文档",
      desc: "元启平台部署安装操作手册，覆盖环境准备、安装部署与初始化验证。",
    },
    {
      key: "yuanqi-faq",
      short: "元启·部署安装 FAQ",
      title: "元启·部署安装 FAQ",
      file: "Word 文档",
      desc: "元启平台部署安装常见问题解答，帮助快速完成部署与排障。",
    },
  ],
  whitepapers: [
    {
      key: "wp-yuanqi-tech",
      short: "元启·技术白皮书",
      title: "元启·技术白皮书",
      file: "Word 文档",
      desc: "元启 AI 开发赋能平台技术白皮书，介绍平台架构、关键技术与企业落地路径。",
    },
  ],
} as const satisfies Record<string, readonly DownloadResource[]>;

export const downloadSections = [
  {
    no: "01",
    label: "产品资料",
    anchor: "dl-materials",
    desc: "元启平台、码里奥与行业应用的产品资料、彩页与解决方案，快速建立产品认知。",
  },
  {
    no: "02",
    label: "软件资源下载",
    anchor: "dl-software",
    desc: "获取码里奥客户端安装包与版本信息，进入安装体验。",
  },
  {
    no: "03",
    label: "产品部署文档",
    anchor: "dl-deployment",
    desc: "平台与产品的部署安装、使用手册与 FAQ，降低落地门槛。",
  },
  {
    no: "04",
    label: "白皮书与技术资料",
    anchor: "dl-whitepapers",
    desc: "平台技术白皮书等专业资料，增强产品专业性与可信度。",
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
  lead: "下载中心集中提供元启平台、码里奥与行业应用的产品资料、软件安装包、部署文档与技术白皮书，帮助您了解产品能力、获取资源并进入产品体验。",
  tags: ["产品资料", "软件下载", "部署文档", "白皮书"],
  path: [
    ["了解产品", "查看元启平台、码里奥与行业应用能力", "/product"],
    ["获取资料", "浏览产品资料、白皮书与部署文档", "/downloads#dl-materials"],
    ["安装体验", "下载码里奥客户端并部署", "/downloads#dl-software"],
    ["申请体验", "联系华鲲团队进入产品体验", "/trial"],
  ],
} as const;
