export const capabilities = [
  "私有化部署",
  "异构算力调度",
  "低代码智能体开发",
  "模型全生命周期管理",
] as const;

export const platformLayers = [
  {
    code: "L1",
    title: "数据与知识",
    description: "知识库、多模态文档、知识图谱、数据源接入与数据预览。",
  },
  {
    code: "L2",
    title: "开发与编排",
    description: "流程编排、Prompt、MCP 接入与智能体应用发布。",
  },
  {
    code: "L3",
    title: "模型与运行",
    description: "模型仓库、训练中心、推理中心、评估中心与多种部署方式。",
  },
  {
    code: "L4",
    title: "企业底座",
    description: "权限管理、用户管理、数据权限与算力分配。",
  },
] as const;

export const enterpriseProofs = [
  {
    title: "数据留在企业边界内",
    description: "围绕私有化部署与数据本地化要求组织模型、知识与应用能力。",
  },
  {
    title: "非结构化数据进入知识工程",
    description:
      "支持文档上传、自动分片、语料处理和知识图谱，让企业资料成为可用知识。",
  },
  {
    title: "低代码缩短落地路径",
    description:
      "通过可视化流程编排和预置智能体，把模型能力连接到具体业务过程。",
  },
  {
    title: "权限、数据和算力统一管控",
    description: "将用户、操作、数据权限与异构资源管理纳入同一企业级控制边界。",
  },
] as const;

export const solutions = [
  {
    title: "智能办公一体化",
    description: "覆盖智能写作、合同审核、投标辅助和智能会议。",
    groupLabel: "场景方案",
    href: "/solutions/smart-office",
  },
  {
    title: "智能导办一体化",
    description: "连接政策咨询、材料识别、智能填表与辅助审核。",
    groupLabel: "场景方案",
    href: "/solutions/intelligent-guidance",
  },
  {
    title: "视觉检索一体化",
    description: "通过自然语言完成即时检索、持续布控和预警管理。",
    groupLabel: "场景方案",
    href: "/solutions/visual-search",
  },
  {
    title: "企业智能体开发",
    description: "组合模型、知识库和工作流，完成智能体构建与发布。",
    groupLabel: "平台方案",
    href: "/solutions/agent-development",
  },
  {
    title: "AI 超融合与私有部署",
    description: "统一承载异构算力、虚拟化资源与企业 AI 任务。",
    groupLabel: "平台方案",
    href: "/solutions/ai-infrastructure",
  },
] as const;

export const resources = [
  {
    title: "产品文档",
    description: "了解平台结构、部署与使用方式",
    href: "/docs",
  },
  {
    title: "版本更新",
    description: "查看版本说明与能力变化",
    href: "/releases",
  },
  {
    title: "兼容矩阵",
    description: "查询算力、系统与软件适配范围",
    href: "/compatibility",
  },
  {
    title: "客户支持",
    description: "获取部署、使用与问题处理入口",
    href: "/support",
  },
] as const;
