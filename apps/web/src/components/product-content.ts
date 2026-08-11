export const productCapabilities = [
  "私有化部署",
  "异构算力调度",
  "低代码智能体开发",
  "模型全生命周期管理",
  "企业级知识工程",
  "统一权限管控",
] as const;

// 复杂的 华鲲振宇AI全栈解决方案全景图 数据结构
export const fullStackArchitecture = {
  apps: {
    title: "智能应用广场",
    items: [
      "智能办公机器人",
      "智能问数机器人",
      "智能视觉机器人",
      "智能编程机器人",
    ],
  },
  aiDev: {
    title: "智能体开发中心",
    platform: "元启AI开发平台 · 华鲲元启",
    categories: [
      {
        name: "知识智能体",
        items: ["智能问答", "知识库", "知识图谱"],
      },
      {
        name: "数据智能体",
        items: ["智能问数", "指标开发", "数据接入"],
      },
      {
        name: "视频智能体",
        items: ["即时检索", "实时布控", "设备接入"],
      },
      {
        name: "流程编排智能体",
        items: ["文生工作流", "会话工作流", "流程工作流"],
      },
    ],
  },
  skills: {
    title: "技能开发中心",
    items: ["技能花园", "文生技能", "龙虾技能", "技能规范"],
  },
  coding: {
    title: "智能编程中心",
    items: ["项目管理", "会话管理", "移动接入", "编程规范"],
  },
  modelEngineering: {
    title: "模型工程中心",
    items: [
      "模型花园",
      "模型部署",
      "模型训练",
      "模型评估",
      "密钥管理",
      "流量统计",
    ],
  },
  modelManagement: {
    title: "模型管理平台",
    models: [
      { name: "deepseek", desc: "语言大模型", logo: "deepseek-logo" },
      { name: "通义千问", desc: "多模态大模型", logo: "qwen-logo" },
      { name: "华鲲视觉", desc: "视觉大模型", logo: "huakun-vision-logo" },
    ],
  },
  computeIntegration: {
    title: "算力融合平台",
    items: ["算力资产", "分层池化", "智能调度", "可信空间", "运维监控"],
  },
  hardware: {
    title: "算力硬件平台",
    items: [
      { name: "AT958 B3", spec: "(8*910C 128G)" },
      { name: "AT3500 G3", spec: "(8*910B4 64G/32G)" },
      { name: "AT9508 G3", spec: "(6*300I A2)" },
      { name: "AT800", spec: "(Model 3000) (2*300I A2)" },
    ],
  },
};

export const platformArchLayers = [
  {
    code: "L1",
    title: "数据与知识",
    subtitle: "Data & Knowledge",
    description: "结构化与非结构化数据的统一接入、处理与存储方案。",
    items: ["知识库", "知识图谱", "向量数据库", "关系型数据源"],
    color: "#6366f1", // Indigo
  },
  {
    code: "L2",
    title: "开发与编排",
    subtitle: "Development",
    description: "可视化工作流、智能体构建与工具链集成环境。",
    items: ["流程编排", "Prompt 提示词", "插件扩展 (MCP)"],
    color: "#8b5cf6", // Violet
  },
  {
    code: "L3",
    title: "模型与运行",
    subtitle: "Model Runtime",
    description: "大模型全生命周期管理与高性能推理服务。",
    items: ["模型仓库", "微调训练", "推理网关", "模型评测"],
    color: "#3b82f6", // Blue
  },
  {
    code: "L4",
    title: "企业底座",
    subtitle: "Enterprise Base",
    description: "安全可信的企业级权限、配额与审计控制面。",
    items: ["角色权限 (RBAC)", "数据隔离", "算力配额", "操作审计"],
    color: "#64748b", // Slate
  },
] as const;

export const supportedModels = [
  {
    category: "开源/商业大语言模型",
    models: [
      "DeepSeek-V3",
      "DeepSeek-R1",
      "Qwen2.5 系列",
      "Llama-3 系列",
      "Baichuan 系列",
      "ChatGLM 系列",
    ],
    note: "全面兼容 OpenAI 接口规范，支持无缝切换底层引擎",
  },
  {
    category: "多模态与垂直模型",
    models: [
      "Qwen-VL (视觉理解)",
      "SenseVoice (语音识别)",
      "BGE-m3 (向量化)",
      "Stable Diffusion (图像生成)",
    ],
    note: "预置专用模型，开箱即用支持复杂场景",
  },
] as const;

export const industrySolutions = [
  {
    code: "IND-01",
    title: "政务办公",
    description: "基于安全可信底座，提供公文写作、政策问答与智能政务大厅。",
    icon: "🏛️",
  },
  {
    code: "IND-02",
    title: "金融服务",
    description: "金融研报分析、合规审查、智能投研与财富管理助手。",
    icon: "💰",
  },
  {
    code: "IND-03",
    title: "智能制造",
    description: "设备故障诊断手册问答、生产流程数据分析与工艺知识沉淀。",
    icon: "⚙️",
  },
  {
    code: "IND-04",
    title: "能源电力",
    description: "电网规程检索、巡检报告自动生成与专家系统辅助。",
    icon: "⚡",
  },
  {
    code: "IND-05",
    title: "教育科研",
    description: "智能导师、文献综述辅助提取与科研数据图表分析。",
    icon: "🎓",
  },
  {
    code: "IND-06",
    title: "公共安全",
    description: "视觉即时检索、实时布控与复杂治安事件研判流。",
    icon: "🛡️",
  },
] as const;

export const customerValues = [
  {
    title: "数据留在企业边界内",
    description: "支持全栈国产化私有部署，确保核心知识产权与业务数据绝对安全。",
  },
  {
    title: "非结构化数据转化为数字资产",
    description:
      "强大的知识工程流水线，让沉睡的文档、图纸变为随时可调用的智能大脑。",
  },
  {
    title: "降低开发门槛，缩短落地路径",
    description:
      "通过可视化工作流与丰富的预置智能体，将模型能力低成本融入业务。",
  },
  {
    title: "权限、数据、算力统一管控",
    description:
      "企业级控制面板，实现多租户资源隔离、成本分摊与细粒度权限审计。",
  },
] as const;

export const productResources = [
  {
    title: "查阅部署文档",
    description: "了解硬件要求与详细安装步骤",
    href: "/docs/deployment",
  },
  {
    title: "硬件兼容列表",
    description: "查看支持的异构算力与 GPU 型号",
    href: "/downloads#dl-mdd2-env",
  },
  {
    title: "API 参考手册",
    description: "平台外部系统集成接口说明",
    href: "/docs/api",
  },
] as const;
