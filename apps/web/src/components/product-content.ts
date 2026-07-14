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

export const coreModules = [
  {
    code: "M01",
    name: "Agent Studio",
    title: "智能体应用开发平台",
    description: "可视化构建与编排企业级 AI 智能体，集成外部知识与 API。",
    capabilities: ["零代码编排", "内置多场景模板", "灵活集成业务 API"],
    href: "/product/agent-studio",
  },
  {
    code: "M02",
    name: "Knowledge Base",
    title: "多模态企业知识库",
    description: "企业私有数据的清洗、分片、向量化存储与智能检索管理。",
    capabilities: ["高精度分片引擎", "混合检索策略", "安全数据隔离"],
    href: "/product/knowledge-base",
  },
  {
    code: "M03",
    name: "Workflow",
    title: "高级复杂工作流",
    description: "将多个模型节点与工具节点串联，处理复杂长周期的业务逻辑。",
    capabilities: ["复杂 DAG 编排", "长时任务监控", "可视化调试"],
    href: "/product/workflow",
  },
  {
    code: "M04",
    name: "Model Gateway",
    title: "模型网关服务",
    description: "统一的企业模型接入点，提供负载均衡、限流与高可用代理。",
    capabilities: ["多模型统一接口", "动态路由与熔断", "全链路监控"],
    href: "/product/model-gateway",
  },
  {
    code: "M05",
    name: "Agent Runtime",
    title: "智能体运行引擎",
    description: "高性能、低延迟的沙盒运行环境，确保智能体安全稳定执行。",
    capabilities: ["高并发调度", "沙盒隔离机制", "资源弹性伸缩"],
    href: "/product/agent-runtime",
  },
  {
    code: "M06",
    name: "Observability",
    title: "全链路观测中心",
    description: "实时监控资源消耗、日志追踪与告警，提供可追溯的运营视图。",
    capabilities: ["调用链追踪", "Token 用量计费", "可视化大盘"],
    href: "/product/observability",
  },
] as const;

export const officeAgents = [
  {
    code: "OA01",
    name: "公文写作助手",
    description:
      "覆盖 15 类法定公文和事务公文的全流程 AI 写作工具，支持模板生成、AI 润色、内容校审与合规审核。",
    detailDescription:
      "整体页面分为左侧主编辑区、右侧多功能侧边栏。侧边栏包含：生成大纲、生成公文、格式排版、AI 润色、公文校检、提炼总结、对话写作功能。",
    capabilities: [
      "15+ 法定/事务公文模板",
      "AI 辅助写作 (拟纲/扩写)",
      "智能纠错与合规校检",
    ],
    highlights: [
      "法定公文 + 事务公文全覆盖",
      "一键沉浸式排版与打印",
      "边写边聊的 Copilot 体验",
    ],
    workflow: [
      {
        step: "选择公文类型",
        description: "从预置的 15 种类型中选择并提供核心素材。",
      },
      {
        step: "生成与调整大纲",
        description: "AI 自动生成大纲，用户可手动微调。",
      },
      {
        step: "全文生成与润色",
        description: "一键生成全文，使用 AI 进行局部扩写或风格润色。",
      },
      {
        step: "合规校验与定稿",
        description: "自动检查错别字、敏感词及公文格式合规性。",
      },
    ],
    model: "Qwen2.5-72B 及以上",
  },
  {
    code: "OA02",
    name: "投标助手",
    description:
      "针对招投标场景深度优化的技术标辅助工具，支持长文档多模态解析、历史标书参考与评分项检查。",
    detailDescription:
      "内置长文档处理引擎与多模态解析模型（如 Qwen2-VL），支持图文并茂的标书内容提取与结构化理解，提供从大纲到正文的一站式撰写。",
    capabilities: ["超长上下文理解", "多模态历史标书参考", "复杂图表自动生成"],
    highlights: [
      "万字长文档精准解析",
      "历史优秀标书智能关联检索",
      "自动生成技术架构图表",
    ],
    workflow: [
      {
        step: "解析招标文件",
        description: "上传招标文件，AI 提取核心评分点与要求。",
      },
      {
        step: "搭建标书大纲",
        description: "结合要求自动生成技术标或商务标大纲。",
      },
      {
        step: "调用私有知识库",
        description: "在生成正文时自动引用企业历史优秀案例段落。",
      },
      {
        step: "合规与评分预估",
        description: "对照招标要求检查遗漏项并给出优化建议。",
      },
    ],
    model: "DeepSeek-V3 / Qwen-Long",
  },
  {
    code: "OA03",
    name: "合同审核",
    description:
      "面向法务与业务人员的智能合同审阅系统，提供三级风险预警、条款对比与智能修订建议。",
    detailDescription:
      "支持 Word/PDF 格式合同比对，结合企业法务知识库，自动识别履约风险、违约金比例异常、主体资质等 50+ 类潜在风险。",
    capabilities: [
      "三级风险红绿灯预警",
      "双屏条款智能比对",
      "合规修订建议生成",
    ],
    highlights: [
      "毫秒级全文风险扫描",
      "法务知识库无缝对接",
      "修改轨迹全程追踪",
    ],
    workflow: [
      { step: "上传合同文件", description: "支持单文件审核或双文件差异比对。" },
      {
        step: "自动风险扫描",
        description: "识别并高亮高、中、低三个等级的风险条款。",
      },
      {
        step: "查看修订建议",
        description: "针对风险条款提供符合企业法务要求的修改建议。",
      },
      {
        step: "导出审阅报告",
        description: "一键生成包含所有风险点与建议的审阅报告。",
      },
    ],
    model: "DeepSeek-R1 (推理版) 或 Qwen-Max",
  },
  {
    code: "OA04",
    name: "智能会议",
    description:
      "覆盖会前准备、会中记录、会后总结的端到端会议助手，支持语音转录与待办事项自动提取。",
    detailDescription:
      "实时语音转写（ASR）接入，自动区分发言人。会后快速提炼会议纪要、生成思维导图，并将 Action Items 分配给相关责任人。",
    capabilities: [
      "实时多语种语音转录",
      "发言人声纹分离",
      "决议与待办自动提取",
    ],
    highlights: [
      "会后一键输出标准纪要",
      "思维导图脑图生成",
      "多角色独立记录线索",
    ],
    workflow: [
      { step: "会前议程设置", description: "提供背景资料，生成会议议程建议。" },
      {
        step: "会中实时转录",
        description: "语音实时转化为文字，动态提取关键讨论点。",
      },
      {
        step: "会后纪要生成",
        description: "五分钟内输出完整会议记录、决议与待办事项清单。",
      },
      {
        step: "任务追踪分发",
        description: "将提取的待办事项自动对接至项目管理工具。",
      },
    ],
    model: "SenseVoice (ASR) + Qwen2.5-14B",
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
    href: "/compatibility#gpu",
  },
  {
    title: "API 参考手册",
    description: "平台外部系统集成接口说明",
    href: "/docs/api",
  },
] as const;
