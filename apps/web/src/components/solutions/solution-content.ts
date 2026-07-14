export type SolutionCategory = "business" | "foundation";
export type SolutionVariant =
  | "studio"
  | "vision"
  | "service"
  | "office"
  | "full-stack"
  | "infrastructure";
export type SolutionStatus = "published" | "preview";
export type ResourceState = "live" | "scaffold" | "placeholder";

export type SolutionComponent = {
  type: string;
  name: string;
  role: string;
  requirement: "核心" | "按场景" | "按规模" | "客户现有";
  href?: string;
};

export type SolutionScene = {
  solutionSlug: string;
  slug: string;
  eyebrow: string;
  title: string;
  tagline: string;
  summary: string;
  status: string;
  stakeholders: readonly string[];
  outcomes: readonly { title: string; description: string }[];
  challenges: readonly string[];
  journey: readonly {
    title: string;
    description: string;
    output: string;
  }[];
  inputs: readonly string[];
  integrations: readonly string[];
  governance: readonly string[];
  boundaries: readonly string[];
  verificationItems: readonly string[];
};

export type Solution = {
  slug: string;
  category: SolutionCategory;
  variant: SolutionVariant;
  status: SolutionStatus;
  officialName: string;
  title: string;
  shortTitle: string;
  eyebrow: string;
  statement: string;
  summary: string;
  objective: string;
  maturityNote: string;
  industries: readonly string[];
  audience: readonly string[];
  triggerEvents: readonly string[];
  deploymentSummary: string;
  challenges: readonly {
    title: string;
    current: string;
    impact: string;
  }[];
  outcomes: readonly {
    title: string;
    description: string;
  }[];
  components: readonly SolutionComponent[];
  architecture: readonly {
    code: string;
    title: string;
    description: string;
    items: readonly string[];
  }[];
  capabilities: readonly {
    title: string;
    description: string;
    value: string;
  }[];
  signature: {
    eyebrow: string;
    title: string;
    description: string;
  };
  workflow: readonly {
    title: string;
    description: string;
    output: string;
  }[];
  scenarios: readonly {
    title: string;
    users: string;
    description: string;
  }[];
  deploymentModes: readonly {
    title: string;
    fit: string;
    includes: readonly string[];
    state: "推荐" | "可选" | "验证";
  }[];
  integrations: readonly {
    name: string;
    purpose: string;
    state: ResourceState;
  }[];
  implementation: readonly {
    phase: string;
    title: string;
    description: string;
    output: string;
  }[];
  deliverables: readonly {
    title: string;
    description: string;
  }[];
  prerequisites: readonly {
    owner: "客户侧" | "华鲲侧" | "双方";
    title: string;
    description: string;
  }[];
  acceptance: readonly {
    title: string;
    description: string;
    state: "可定义" | "待实测" | "待资料";
  }[];
  resources: readonly {
    label: string;
    description: string;
    href: string;
    state: ResourceState;
  }[];
  faqs: readonly {
    question: string;
    answer: string;
  }[];
  scene: SolutionScene;
  contentStatus: string;
  lastReviewed: string;
};

export const solutionGroups = [
  {
    id: "business",
    code: "01",
    title: "业务解决方案",
    description:
      "从明确的业务问题出发，组合平台、模型、智能体、现有系统与服务，形成可实施的业务闭环。",
  },
  {
    id: "foundation",
    code: "02",
    title: "技术底座",
    description:
      "为多场景建设提供统一参考架构、算力承载、资源治理和持续运营能力。",
  },
] as const;

export const discoveryGoals = [
  {
    code: "BUILD",
    title: "建设企业 AI 应用能力",
    description: "统一知识、模型、智能体、工作流、权限和发布。",
    href: "/solutions/yuanqi-ai-development",
  },
  {
    code: "WORK",
    title: "提升组织办公效率",
    description: "让写作、合同、投标和会议在企业边界内协同。",
    href: "/solutions/intelligent-office",
  },
  {
    code: "SERVE",
    title: "优化政务办事体验",
    description: "贯通政策咨询、材料识别、填表与辅助预审。",
    href: "/solutions/intelligent-guidance",
  },
  {
    code: "SEE",
    title: "让视频进入主动治理",
    description: "利旧摄像头，形成检索、布控、复核和处置闭环。",
    href: "/solutions/visual-retrieval",
  },
] as const;

export const deliveryMethod = [
  {
    code: "01",
    title: "场景与边界评估",
    description: "确认业务目标、数据条件、现有系统、风险和验收口径。",
  },
  {
    code: "02",
    title: "受控验证",
    description: "用约定数据和环境完成 POC，记录结果、差距和人工边界。",
  },
  {
    code: "03",
    title: "生产建设",
    description: "完成部署、权限、接口、监控、安全和正式测试。",
  },
  {
    code: "04",
    title: "运营移交",
    description: "交付文档、培训、巡检、版本和持续优化机制。",
  },
] as const;

export const industryCoverage = [
  "政务服务",
  "制造与科研",
  "国央企",
  "公共安全",
  "城市治理",
  "交通运输",
  "教育科研",
  "园区与电力",
] as const;

const commonResources = [
  {
    label: "部署指南",
    description: "查看门户现有部署文档入口；正式版本内容由文档中心维护。",
    href: "/docs/deployment",
    state: "scaffold" as const,
  },
  {
    label: "环境兼容矩阵",
    description: "核对硬件、加速卡、操作系统与依赖组件的版本化支持范围。",
    href: "/compatibility",
    state: "scaffold" as const,
  },
  {
    label: "安装与离线包",
    description: "下载能力尚未连接真实制品仓库，页面会明确显示未开放状态。",
    href: "/downloads",
    state: "placeholder" as const,
  },
  {
    label: "客户案例",
    description: "只展示获得授权且口径完整的案例内容。",
    href: "/cases",
    state: "scaffold" as const,
  },
] as const;

export const solutions: readonly Solution[] = [
  {
    slug: "yuanqi-ai-development",
    category: "business",
    variant: "studio",
    status: "published",
    officialName: "元启 AI 开发一体化解决方案",
    title: "企业 AI 应用开发解决方案",
    shortTitle: "企业 AI 应用开发",
    eyebrow: "BUSINESS SOLUTION / 01",
    statement: "把分散的算力、模型、知识和流程，变成可持续运营的企业 AI 能力。",
    summary:
      "以元启 TGDataXAI 为开发与治理核心，组合国产算力、模型服务、知识工程、智能体编排和专家服务，建立从场景验证到生产运营的企业 AI 应用开发体系。",
    objective:
      "帮助已经开展 AI 试点或采购智能算力的组织，统一开发入口、沉淀可复用资产，并建立权限、评测、发布和运营边界。",
    maturityNote: "商业方案已发布；性能与兼容范围以版本化资料为准。",
    industries: ["制造", "国央企", "金融", "教育", "科研", "政务"],
    audience: [
      "CIO / IT 架构师",
      "AI 平台团队",
      "业务创新部门",
      "开发与数据团队",
    ],
    triggerEvents: [
      "多个部门同时提出 AI 应用需求",
      "模型、知识库和工作流分散在不同工具",
      "已有 POC 难以进入生产",
      "算力已到位但缺少应用闭环",
    ],
    deploymentSummary: "企业内网私有化；多节点或混合负载可组合 TGHCI。",
    challenges: [
      {
        title: "开发工具割裂",
        current: "算力、模型、知识、流程和应用分别管理。",
        impact: "集成与运维成本高，故障和版本责任难定位。",
      },
      {
        title: "业务验证门槛高",
        current: "业务人员完全依赖少量算法和开发人员。",
        impact: "需求传递失真，场景试错与迭代周期被拉长。",
      },
      {
        title: "资产无法复用",
        current: "Prompt、知识库和流程散落在单个 POC 中。",
        impact: "跨部门重复建设，成果无法规模化。",
      },
      {
        title: "治理边界缺失",
        current: "模型、知识、算力和应用权限缺少统一控制面。",
        impact: "生产发布、数据访问和审计存在风险。",
      },
    ],
    outcomes: [
      {
        title: "统一开发入口",
        description: "让业务验证与专业开发在同一平台协作。",
      },
      {
        title: "沉淀 AI 资产",
        description: "统一管理知识、模型、流程和智能体资产。",
      },
      {
        title: "建立生产治理",
        description: "形成评测、权限、发布、审计和运营机制。",
      },
    ],
    components: [
      {
        type: "平台",
        name: "元启 AI 开发平台 TGDataXAI",
        role: "统一知识工程、模型工程、智能体、工作流、评测与权限。",
        requirement: "核心",
        href: "/product/tgdataxai",
      },
      {
        type: "模型",
        name: "语言 / 多模态 / 视觉模型服务",
        role: "依据场景提供推理、训练或多模态理解能力。",
        requirement: "按场景",
      },
      {
        type: "算力",
        name: "鲲鹏 / 昇腾智能算力",
        role: "承载模型训练、推理与应用运行。",
        requirement: "按规模",
        href: "/product",
      },
      {
        type: "资源管理",
        name: "TGHCI",
        role: "在多节点环境中管理集群、资源池、设备和工作负载。",
        requirement: "按规模",
        href: "/product/hci",
      },
      {
        type: "数据",
        name: "企业知识与业务数据",
        role: "为问答、数据分析和流程提供受控数据基础。",
        requirement: "客户现有",
      },
    ],
    architecture: [
      {
        code: "ENTRY",
        title: "业务入口",
        description: "让 AI 能力进入真实业务触点。",
        items: ["企业门户", "业务系统", "移动端", "API"],
      },
      {
        code: "AGENT",
        title: "智能体与工作流",
        description: "组织任务、工具调用、人工节点和异常处理。",
        items: ["知识问答", "数据分析", "流程智能体", "行业智能体"],
      },
      {
        code: "GOV",
        title: "开发与治理",
        description: "管理构建、评测、发布、权限和审计。",
        items: ["Agent Studio", "Workflow", "评测", "发布治理"],
      },
      {
        code: "MODEL",
        title: "知识与模型",
        description: "把企业数据和模型服务变成受控能力。",
        items: ["多模态文档", "数据库", "知识图谱", "模型服务"],
      },
      {
        code: "RESOURCE",
        title: "资源与基础设施",
        description: "按容量与场景承载训练和推理。",
        items: ["TGHCI", "资源池", "鲲鹏", "昇腾"],
      },
    ],
    capabilities: [
      {
        title: "企业知识工程",
        description: "文档解析、分片、归档、检索、知识图谱和数据库连接。",
        value: "将分散资料转化为可治理的 AI 知识资产。",
      },
      {
        title: "高准度问答",
        description: "通过检索增强、上下文组织、回答约束和评测降低无依据回答。",
        value: "让知识问答更适合进入严肃业务场景。",
      },
      {
        title: "零/低代码开发",
        description: "支持可视化智能体构建与复杂工作流编排。",
        value: "兼顾业务验证速度与专业开发深度。",
      },
      {
        title: "模型工程",
        description: "覆盖模型引入、部署、训练、推理和评估。",
        value: "统一模型从试验到生产运行的生命周期。",
      },
      {
        title: "企业治理",
        description: "管理用户、知识、模型、算力和应用权限。",
        value: "支撑多部门、分级数据和内网部署。",
      },
      {
        title: "资产复用",
        description: "沉淀模板、工作流、智能体和知识资产。",
        value: "避免每个场景从零重复建设。",
      },
    ],
    signature: {
      eyebrow: "DEVELOPMENT LIFECYCLE",
      title: "从一个业务问题，到一个可运营的智能体",
      description:
        "开发流水线把场景、数据、模型、工作流、评测和运营串成一个连续过程。",
    },
    workflow: [
      {
        title: "场景发现",
        description: "确认用户、业务问题、数据、风险和目标。",
        output: "场景定义",
      },
      {
        title: "知识准备",
        description: "完成数据接入、清洗、分片、权限和质量检查。",
        output: "受控知识资产",
      },
      {
        title: "模型选型",
        description: "依据效果、时延、并发和国产化要求评估。",
        output: "模型与容量建议",
      },
      {
        title: "智能体构建",
        description: "定义工具、步骤、异常处理和人工节点。",
        output: "可测试应用",
      },
      {
        title: "评测发布",
        description: "使用约定测试集验证效果、安全和稳定性。",
        output: "生产版本",
      },
      {
        title: "运营迭代",
        description: "跟踪问题、知识更新、模型版本和资产复用。",
        output: "运营基线",
      },
    ],
    scenarios: [
      {
        title: "企业知识问答",
        users: "员工 / 客服 / 专家",
        description: "围绕制度、技术资料和业务知识提供有来源的问答。",
      },
      {
        title: "数据分析智能体",
        users: "管理者 / 数据团队",
        description: "连接受控业务数据，辅助查询、分析和解释。",
      },
      {
        title: "行业流程智能体",
        users: "业务部门 / 开发团队",
        description: "将模型能力、业务规则、工具和人工节点编排成流程。",
      },
    ],
    deploymentModes: [
      {
        title: "企业内网私有化",
        fit: "对数据、模型与访问边界有明确要求的组织。",
        includes: ["本地模型服务", "企业知识", "权限与审计", "内部业务入口"],
        state: "推荐",
      },
      {
        title: "多节点资源池",
        fit: "多个部门、模型或工作负载需要统一承载。",
        includes: ["TGHCI", "资源池", "多模型", "统一运维"],
        state: "可选",
      },
      {
        title: "受控 POC",
        fit: "首批 1—3 个场景验证技术与业务适配。",
        includes: ["脱敏数据", "测试问题集", "单场景应用", "差距报告"],
        state: "验证",
      },
    ],
    integrations: [
      { name: "企业数据库", purpose: "受控数据查询与分析", state: "scaffold" },
      {
        name: "OA / 业务系统",
        purpose: "应用入口与工作流连接",
        state: "scaffold",
      },
      {
        name: "统一身份",
        purpose: "用户、组织和权限同步",
        state: "placeholder",
      },
      {
        name: "模型与工具 API",
        purpose: "连接外部模型和业务工具",
        state: "scaffold",
      },
    ],
    implementation: [
      {
        phase: "DISCOVER",
        title: "场景与环境评估",
        description: "梳理场景、数据、算力、系统和安全边界。",
        output: "需求与适配评估报告",
      },
      {
        phase: "PROVE",
        title: "受控 POC",
        description: "部署基础环境，完成首个智能体和约定测试。",
        output: "POC、测试集与差距清单",
      },
      {
        phase: "BUILD",
        title: "生产建设",
        description: "完成权限、集成、模型、知识、监控和发布。",
        output: "生产系统与配置基线",
      },
      {
        phase: "OPERATE",
        title: "运营移交",
        description: "建立培训、资产规范、巡检和迭代机制。",
        output: "运营手册与支持计划",
      },
    ],
    deliverables: [
      {
        title: "平台与模型环境",
        description: "按确认版本完成部署和基础验证。",
      },
      { title: "首批智能体", description: "交付约定场景、流程和发布配置。" },
      {
        title: "知识与权限基线",
        description: "包含数据范围、角色和访问规则。",
      },
      {
        title: "接口与部署文档",
        description: "记录系统连接、配置和运维方式。",
      },
      { title: "测试与验收报告", description: "按约定环境和测试集记录结果。" },
      { title: "培训与运营计划", description: "帮助客户团队接管日常管理。" },
    ],
    prerequisites: [
      {
        owner: "客户侧",
        title: "首批业务场景",
        description: "明确 1—3 个场景、责任人和业务目标。",
      },
      {
        owner: "客户侧",
        title: "可合法使用的数据",
        description: "提供文档、数据和测试问题集并明确权限。",
      },
      {
        owner: "双方",
        title: "系统与安全边界",
        description: "确认网络、账号、API、数据分级和审计要求。",
      },
      {
        owner: "华鲲侧",
        title: "版本与容量建议",
        description: "依据目标提供软硬件、模型与实施建议。",
      },
    ],
    acceptance: [
      {
        title: "业务闭环",
        description: "目标用户能完成约定端到端任务。",
        state: "可定义",
      },
      {
        title: "问答/任务效果",
        description: "使用客户确认的测试集和判定规则。",
        state: "待实测",
      },
      {
        title: "容量与时延",
        description: "在最终软硬件和输入条件下验证。",
        state: "待实测",
      },
      {
        title: "权限与审计",
        description: "验证数据、模型、应用和操作边界。",
        state: "可定义",
      },
      {
        title: "兼容范围",
        description: "以版本化兼容矩阵和发布说明为准。",
        state: "待资料",
      },
    ],
    resources: [
      {
        label: "TGDataXAI 产品详情",
        description: "查看平台模块、能力和产品说明。",
        href: "/product/tgdataxai",
        state: "live",
      },
      ...commonResources,
    ],
    faqs: [
      {
        question: "零代码是否意味着所有场景都不需要开发？",
        answer:
          "不是。零/低代码适合知识问答和标准流程验证；复杂系统集成、业务规则与高风险流程仍需要专业开发和测试。",
      },
      {
        question: "可以直接复用现有服务器和模型吗？",
        answer:
          "需要先核对硬件、驱动、模型、推理引擎和平台版本。正式支持范围以兼容矩阵和项目评估为准。",
      },
      {
        question: "平台如何降低模型幻觉？",
        answer:
          "通过知识检索、上下文组织、回答约束、评测和人工复核共同降低风险，不能承诺完全消除。",
      },
      {
        question: "能否从 POC 平滑进入生产？",
        answer:
          "可以按阶段推进，但 POC 结果必须在生产网络、权限、容量和真实数据条件下重新验收。",
      },
    ],
    scene: {
      solutionSlug: "yuanqi-ai-development",
      slug: "enterprise-agent-factory",
      eyebrow: "SCENARIO / AGENT FACTORY",
      title: "企业智能体开发与运营中心",
      tagline: "让多个部门在同一治理体系下开发、发布和复用 AI 应用。",
      summary:
        "面向已有多个 AI 需求的企业，建立统一场景入口、知识与模型资产、智能体开发流程和生产运营机制。",
      status: "可开展场景评估",
      stakeholders: ["业务负责人", "AI 平台团队", "开发团队", "安全与运维"],
      outcomes: [
        {
          title: "统一入口",
          description: "多部门需求进入同一场景与发布流程。",
        },
        { title: "资产复用", description: "知识、流程和智能体可被授权复用。" },
        { title: "持续运营", description: "版本、评测、权限和问题可追踪。" },
      ],
      challenges: [
        "部门各自做 POC",
        "知识与模型重复建设",
        "生产权限和发布缺少标准",
      ],
      journey: [
        {
          title: "建立场景池",
          description: "收集需求并按价值、风险和数据成熟度排序。",
          output: "场景清单",
        },
        {
          title: "建立资产规范",
          description: "定义知识、模型、工具和工作流的归属与版本。",
          output: "资产目录",
        },
        {
          title: "形成开发门禁",
          description: "建立测试、权限、安全和发布规则。",
          output: "发布基线",
        },
        {
          title: "运营与复用",
          description: "跟踪使用、问题、成本和跨部门复用。",
          output: "运营报告",
        },
      ],
      inputs: ["首批场景", "企业知识", "模型与算力", "组织权限"],
      integrations: ["统一身份", "业务系统 API", "数据源", "监控与日志"],
      governance: ["资产负责人", "发布审批", "评测基线", "版本审计"],
      boundaries: [
        "高风险输出需人工复核",
        "支持范围以版本化兼容矩阵为准",
        "POC 不等同生产容量承诺",
      ],
      verificationItems: [
        "模型与芯片支持清单",
        "连接器与 API 文档",
        "性能测试报告",
        "可公开客户案例",
      ],
    },
    contentStatus: "公开方案",
    lastReviewed: "2026-07-14",
  },
  {
    slug: "visual-retrieval",
    category: "business",
    variant: "vision",
    status: "published",
    officialName: "视觉检索一体化解决方案",
    title: "视觉智能分析与主动治理解决方案",
    shortTitle: "视觉智能分析",
    eyebrow: "BUSINESS SOLUTION / 02",
    statement: "让既有摄像头从录像设备，变成主动发现业务事件的入口。",
    summary:
      "利用视觉多模态大模型和自然语言规则，把现有视频资源转化为可检索、可持续布控、可复核和可处置的主动治理能力。",
    objective:
      "利旧既有摄像头与视频平台，缩短长尾场景验证周期，统一在线/离线检索、布控、告警、人工复核与处置反馈。",
    maturityNote: "商业方案已发布；场景目录、协议兼容与容量指标待版本化核验。",
    industries: ["公共安全", "城市治理", "交通", "应急", "园区", "电力"],
    audience: [
      "公共安全与城管部门",
      "园区运营方",
      "视频平台建设方",
      "安防与应急团队",
    ],
    triggerEvents: [
      "传统算法无法覆盖长尾场景",
      "突发需求无法快速上线",
      "视频主要用于事后回看",
      "多厂商算法与告警分散",
    ],
    deploymentSummary:
      "客户机房私有化接入现有视频系统；可从少量视频流受控验证。",
    challenges: [
      {
        title: "专项算法交付慢",
        current: "新场景依赖样本采集、标注、训练和定制。",
        impact: "突发或长尾需求难以及时上线。",
      },
      {
        title: "人工回看压力高",
        current: "大量实时流和历史录像依靠人工查找。",
        impact: "检索耗时、容易遗漏，既有视频价值不足。",
      },
      {
        title: "告警缺少闭环",
        current: "识别、复核、工单与处置分散在不同系统。",
        impact: "结果难追踪，规则也无法依据反馈优化。",
      },
      {
        title: "高风险误判",
        current: "识别结果容易被误当作最终执法或处置结论。",
        impact: "误报、合规和责任风险放大。",
      },
    ],
    outcomes: [
      { title: "利旧既有视频", description: "连接已有摄像头和视频综合平台。" },
      {
        title: "快速验证长尾场景",
        description: "以自然语言规则缩短需求到测试的路径。",
      },
      {
        title: "形成处置闭环",
        description: "把检索、告警、复核、工单和反馈串联起来。",
      },
    ],
    components: [
      {
        type: "行业应用",
        name: "视觉检索一体机 / 视频智能体",
        role: "统一检索、布控、预警、任务和规则管理。",
        requirement: "核心",
        href: "/product/video-agent",
      },
      {
        type: "平台",
        name: "元启 TGDataXAI",
        role: "承载模型服务、流程编排、权限和场景资产。",
        requirement: "核心",
        href: "/product/tgdataxai",
      },
      {
        type: "模型",
        name: "视觉多模态大模型",
        role: "理解人员、物体、行为和环境关系。",
        requirement: "核心",
      },
      {
        type: "算力",
        name: "视觉推理算力",
        role: "按视频规模、采样方式和场景复杂度承载分析。",
        requirement: "按规模",
        href: "/product",
      },
      {
        type: "现有系统",
        name: "摄像头 / 视综 / 工单系统",
        role: "提供视频输入、结果展示和业务处置。",
        requirement: "客户现有",
      },
    ],
    architecture: [
      {
        code: "VIDEO",
        title: "视频输入",
        description: "接入实时流和历史录像。",
        items: ["既有摄像头", "历史录像", "视频平台", "授权文件"],
      },
      {
        code: "PARSE",
        title: "解析与语义",
        description: "完成解码、采样和视觉语义理解。",
        items: ["解码", "切帧", "采样", "视觉大模型"],
      },
      {
        code: "RULE",
        title: "规则与任务",
        description: "以业务语言配置目标、排除项和组合条件。",
        items: ["自然语言规则", "检索", "持续布控", "任务管理"],
      },
      {
        code: "REVIEW",
        title: "告警与复核",
        description: "对结果分级、复核并形成证据链。",
        items: ["告警", "人工复核", "审计", "结果统计"],
      },
      {
        code: "ACT",
        title: "处置与反馈",
        description: "连接视综、工单和通知系统。",
        items: ["视综平台", "工单", "通知", "规则优化"],
      },
    ],
    capabilities: [
      {
        title: "自然语言场景配置",
        description: "用业务语言描述目标、排除项和组合条件。",
        value: "降低长尾场景验证门槛。",
      },
      {
        title: "全局语义理解",
        description: "联合理解人、物、行为和环境关系。",
        value: "超越局部特征的简单匹配。",
      },
      {
        title: "在线与离线检索",
        description: "在实时流或历史录像中检索目标线索。",
        value: "减少人工逐段回看。",
      },
      {
        title: "持续布控",
        description: "执行常态或临时任务并持续分析。",
        value: "从事后查看转向主动发现。",
      },
      {
        title: "预警与任务管理",
        description: "统一统计、查询、分级、复核和运营。",
        value: "让结果可查、任务可管、过程可追溯。",
      },
      {
        title: "复杂条件组合",
        description: "支持正向、反向、串行和深度判断。",
        value: "适配更接近业务现场的规则。",
      },
    ],
    signature: {
      eyebrow: "ACTIVE GOVERNANCE LOOP",
      title: "从视频输入到处置反馈，形成可复核的主动治理闭环",
      description:
        "页面重点不是展示算法数量，而是说明视频如何被接入、理解、复核并进入业务处置。",
    },
    workflow: [
      {
        title: "视频接入",
        description: "确认协议、码流、分辨率、网络和授权。",
        output: "可用视频源",
      },
      {
        title: "语义解析",
        description: "按采样策略理解人员、物体和行为。",
        output: "语义结果",
      },
      {
        title: "规则判断",
        description: "用目标、排除项和条件组合配置任务。",
        output: "检索/告警",
      },
      {
        title: "人工复核",
        description: "对高风险结果确认、分级和补充信息。",
        output: "复核结论",
      },
      {
        title: "业务处置",
        description: "进入视综、工单或通知系统。",
        output: "处置记录",
      },
      {
        title: "反馈优化",
        description: "依据误报、漏报和处置结果调整规则。",
        output: "运营规则库",
      },
    ],
    scenarios: [
      {
        title: "公共安全",
        users: "公安 / 安保",
        description: "重点区域入侵、聚集和异常行为线索。",
      },
      {
        title: "城市治理",
        users: "城管 / 街道",
        description: "垃圾满溢、占道、道路与设施问题。",
      },
      {
        title: "交通与应急",
        users: "交管 / 应急",
        description: "拥堵、事故、火情、积水等线索。",
      },
      {
        title: "园区与生产",
        users: "园区 / 企业",
        description: "周界、违规作业、人员与设施巡检。",
      },
    ],
    deploymentModes: [
      {
        title: "少量视频流验证",
        fit: "先核对现场视频质量、场景和误报漏报。",
        includes: ["指定视频流", "规则配置", "人工复核", "测试报告"],
        state: "验证",
      },
      {
        title: "客户机房生产部署",
        fit: "需要连接全部约定设备与业务系统。",
        includes: ["私有模型", "视频接入", "权限审计", "视综/工单接口"],
        state: "推荐",
      },
      {
        title: "多节点资源池",
        fit: "多区域、多任务或大规模视频分析。",
        includes: ["TGHCI", "多节点算力", "任务调度", "统一运维"],
        state: "可选",
      },
    ],
    integrations: [
      { name: "摄像头与流媒体", purpose: "获取实时视频流", state: "scaffold" },
      {
        name: "历史录像平台",
        purpose: "离线检索与取证辅助",
        state: "scaffold",
      },
      {
        name: "视频综合平台",
        purpose: "结果展示和业务联动",
        state: "placeholder",
      },
      {
        name: "工单 / 通知系统",
        purpose: "处置、回执与闭环",
        state: "placeholder",
      },
    ],
    implementation: [
      {
        phase: "ASSESS",
        title: "现场与场景评估",
        description: "调研设备、网络、视频质量、场景和处置链路。",
        output: "接入与场景评估报告",
      },
      {
        phase: "PROVE",
        title: "少量流 POC",
        description: "接入约定视频，配置规则并统计误报漏报。",
        output: "测试数据与 POC 结果",
      },
      {
        phase: "DEPLOY",
        title: "生产部署与集成",
        description: "完成容量选型、平台接口、权限和告警配置。",
        output: "生产系统与规则库",
      },
      {
        phase: "OPERATE",
        title: "任务运营与优化",
        description: "复盘任务、迭代规则并管理模型和场景版本。",
        output: "运营报表与版本记录",
      },
    ],
    deliverables: [
      {
        title: "视频智能分析系统",
        description: "按确认版本部署应用、模型和平台。",
      },
      {
        title: "视频接入配置",
        description: "记录设备、码流、采样和网络参数。",
      },
      { title: "场景规则库", description: "交付约定目标、排除项和任务配置。" },
      { title: "系统接口", description: "按范围连接视综、工单或通知系统。" },
      {
        title: "效果与容量报告",
        description: "记录测试集、条件、误报漏报和资源使用。",
      },
      {
        title: "运维与处置手册",
        description: "明确复核、告警、升级和问题处理。",
      },
    ],
    prerequisites: [
      {
        owner: "客户侧",
        title: "视频资源授权",
        description: "提供合法可用的视频流、录像和设备信息。",
      },
      {
        owner: "客户侧",
        title: "场景与处置规则",
        description: "明确识别目标、风险等级、复核人和处置系统。",
      },
      {
        owner: "双方",
        title: "接入与网络条件",
        description: "确认协议、码流、分辨率、帧率和网络区域。",
      },
      {
        owner: "双方",
        title: "效果验收口径",
        description: "约定样本、时段、误报漏报和响应时间。",
      },
      {
        owner: "华鲲侧",
        title: "容量与部署建议",
        description: "依据采样、任务和规模完成选型。",
      },
    ],
    acceptance: [
      {
        title: "视频接入",
        description: "验证接入成功率、断流和恢复。",
        state: "可定义",
      },
      {
        title: "场景效果",
        description: "在约定样本下统计命中、误报和漏报。",
        state: "待实测",
      },
      {
        title: "告警时延",
        description: "从事件出现到复核入口可见。",
        state: "待实测",
      },
      {
        title: "处置闭环",
        description: "复核、工单、回执和审计链路完整。",
        state: "可定义",
      },
      {
        title: "兼容与容量",
        description: "按最终设备、采样和算力环境验证。",
        state: "待资料",
      },
    ],
    resources: [
      {
        label: "视觉检索一体机",
        description: "查看视频智能体和视觉检索产品能力。",
        href: "/product/video-agent",
        state: "live",
      },
      ...commonResources,
    ],
    faqs: [
      {
        question: "是否必须替换现有摄像头和视频平台？",
        answer:
          "方案优先利旧既有设备与平台，但能否接入取决于协议、码流、网络和接口兼容评估。",
      },
      {
        question: "自然语言配置是否完全不需要样本？",
        answer:
          "仍需要用现场视频验证规则、环境适配、误报和漏报；高风险场景必须建立人工复核。",
      },
      {
        question: "页面为什么不展示固定支持路数？",
        answer:
          "容量受模型、分辨率、采样、并发任务和硬件版本影响，需要在约定条件下测算。",
      },
      {
        question: "识别结果可以直接用于执法吗？",
        answer:
          "不能默认直接作为最终结论。证据链、人工复核和正式处置权限应由客户制度与系统确认。",
      },
    ],
    scene: {
      solutionSlug: "visual-retrieval",
      slug: "urban-governance-control",
      eyebrow: "SCENARIO / URBAN GOVERNANCE",
      title: "城市治理视觉布控",
      tagline: "把垃圾满溢、占道和设施问题转化为可复核、可派单的治理事件。",
      summary:
        "在既有摄像头和视综平台基础上，以自然语言规则配置城市治理任务，并把告警、人工复核和工单处置串联起来。",
      status: "可开展场景评估",
      stakeholders: [
        "城市管理部门",
        "街道与网格员",
        "视频平台团队",
        "处置单位",
      ],
      outcomes: [
        {
          title: "主动发现",
          description: "从人工巡查和事后回看转向持续发现。",
        },
        {
          title: "可复核告警",
          description: "每条告警保留规则、画面和复核状态。",
        },
        {
          title: "处置闭环",
          description: "事件进入工单并用处置结果优化规则。",
        },
      ],
      challenges: [
        "摄像头数量多但利用不足",
        "固定算法无法覆盖长尾问题",
        "告警与工单处置脱节",
      ],
      journey: [
        {
          title: "定义治理事件",
          description: "确定目标、排除项、区域、时段和风险等级。",
          output: "事件规则",
        },
        {
          title: "接入视频",
          description: "核对设备、码流、采样和网络。",
          output: "可用视频源",
        },
        {
          title: "验证与复核",
          description: "用现场样本统计误报漏报并调整条件。",
          output: "验证报告",
        },
        {
          title: "派单与反馈",
          description: "复核后进入工单，回写处置结果。",
          output: "闭环记录",
        },
      ],
      inputs: ["摄像头与录像", "治理事件定义", "区域与时段", "处置规则"],
      integrations: ["视综平台", "工单系统", "消息通知", "统一身份"],
      governance: ["人工复核", "敏感数据权限", "规则版本", "事件审计"],
      boundaries: [
        "模型输出仅作为线索和辅助判断",
        "执法证据链由客户正式系统确认",
        "容量需在现场条件下测算",
      ],
      verificationItems: [
        "摄像头协议清单",
        "版本化算法目录",
        "场景测试集",
        "容量与时延报告",
      ],
    },
    contentStatus: "公开方案",
    lastReviewed: "2026-07-14",
  },
  {
    slug: "intelligent-guidance",
    category: "business",
    variant: "service",
    status: "published",
    officialName: "智能导办一体化解决方案",
    title: "政务智能导办与辅助预审解决方案",
    shortTitle: "政务智能导办",
    eyebrow: "BUSINESS SOLUTION / 03",
    statement: "让群众少猜流程，让窗口少做重复录入，让正式审核始终留在人手中。",
    summary:
      "围绕“问、定、传、填、预审、办”组织政策知识、材料识别、表单辅助和预审工作流，为群众提供连续导办，为窗口人员提供可追溯的辅助判断。",
    objective:
      "统一政策咨询口径、提前发现材料问题、减少重复录入，并连接线上预约、材料准备、正式办件和线下窗口。",
    maturityNote: "商业方案已发布；事项范围、接口、指标与案例授权按项目确认。",
    industries: ["政务服务", "行政审批", "市场监管", "园区服务", "公共事业"],
    audience: [
      "政务服务中心",
      "行政审批部门",
      "市场监管部门",
      "窗口与运营团队",
    ],
    triggerEvents: [
      "咨询高峰排队和夜间服务缺口",
      "政策口径在多个渠道不同步",
      "材料退补与重复录入频繁",
      "线上预约与线下办理断裂",
    ],
    deploymentSummary:
      "按政务内/外网边界部署，并连接综窗、办件、小程序或自助终端。",
    challenges: [
      {
        title: "咨询响应滞后",
        current: "政策咨询依赖人工窗口和热线。",
        impact: "高峰期等待时间长，夜间与节假日覆盖不足。",
      },
      {
        title: "材料退补频繁",
        current: "群众到现场后才发现材料缺失或格式问题。",
        impact: "多次往返，窗口重复解释和录入。",
      },
      {
        title: "渠道口径不一",
        current: "网站、移动端、热线与窗口更新不同步。",
        impact: "政策解释不一致，用户难以判断正确流程。",
      },
      {
        title: "AI 权责容易模糊",
        current: "辅助预审容易被误解成自动行政审批。",
        impact: "正式决定、纠错和申诉责任存在风险。",
      },
    ],
    outcomes: [
      {
        title: "统一咨询口径",
        description: "基于已审核且有效的政策和事项知识。",
      },
      {
        title: "提前发现材料问题",
        description: "在正式受理前提示缺失、格式和一致性问题。",
      },
      {
        title: "线上线下连续服务",
        description: "连接问答、材料、表单、预审和正式办件。",
      },
    ],
    components: [
      {
        type: "行业应用",
        name: "智能导办一体机",
        role: "提供多轮咨询、事项定位、材料提示和流程引导。",
        requirement: "核心",
        href: "/product/knowledge-agent",
      },
      {
        type: "平台",
        name: "元启 TGDataXAI",
        role: "承载知识、流程、权限、模型和应用运营。",
        requirement: "核心",
        href: "/product/tgdataxai",
      },
      {
        type: "知识",
        name: "政策与事项知识库",
        role: "提供版本化、可追溯的办事依据。",
        requirement: "客户现有",
      },
      {
        type: "识别",
        name: "OCR / 材料识别",
        role: "提取身份证、合同和业务材料中的约定字段。",
        requirement: "按场景",
      },
      {
        type: "现有系统",
        name: "综窗 / 办件 / 签名 / 终端",
        role: "承载正式受理、审批、签名和多渠道服务。",
        requirement: "客户现有",
      },
    ],
    architecture: [
      {
        code: "CHANNEL",
        title: "服务渠道",
        description: "让能力复用到多种办事入口。",
        items: ["大厅", "网站", "小程序", "自助终端"],
      },
      {
        code: "GUIDE",
        title: "咨询与定位",
        description: "基于有效知识识别事项与具体情形。",
        items: ["政策问答", "多轮交互", "情形定位", "人工转接"],
      },
      {
        code: "MATERIAL",
        title: "材料与表单",
        description: "提取信息并生成待确认草稿。",
        items: ["OCR", "字段提取", "表单草稿", "用户确认"],
      },
      {
        code: "PRECHECK",
        title: "辅助预审",
        description: "依据事项规则提示问题，不替代正式审批。",
        items: ["规则校验", "问题提示", "人工复核", "审计"],
      },
      {
        code: "OFFICIAL",
        title: "正式办理",
        description: "进入客户正式系统完成受理和决定。",
        items: ["综窗", "办件系统", "电子签名", "线下窗口"],
      },
    ],
    capabilities: [
      {
        title: "政策智能问答",
        description: "基于已审核政策和事项指南提供流程解释。",
        value: "统一多渠道服务口径。",
      },
      {
        title: "意图与情形定位",
        description: "通过多轮交互定位具体事项与材料清单。",
        value: "让群众更容易理解自己该办什么。",
      },
      {
        title: "材料信息提取",
        description: "识别并提取约定材料字段。",
        value: "减少重复录入并为填表提供基础。",
      },
      {
        title: "表单辅助填写",
        description: "生成符合字段规范的待确认表单草稿。",
        value: "降低填写难度和基础错误。",
      },
      {
        title: "AI 辅助预审",
        description: "对照规则提示缺失、格式和一致性问题。",
        value: "让问题在正式受理前被发现。",
      },
      {
        title: "多渠道协同",
        description: "面向大厅、网站、小程序和终端复用能力。",
        value: "连接线上准备和线下正式办理。",
      },
    ],
    signature: {
      eyebrow: "CITIZEN SERVICE JOURNEY",
      title: "问、定、传、填、预审、办，每一步都有明确的人机责任",
      description:
        "政务方案的核心不是“AI 公务员”口号，而是连续服务、政策可追溯和正式决定始终由授权人员作出。",
    },
    workflow: [
      {
        title: "问",
        description: "群众描述需求，系统基于有效政策回答。",
        output: "咨询答复",
      },
      {
        title: "定",
        description: "多轮交互定位事项、情形和渠道。",
        output: "事项与清单",
      },
      {
        title: "传",
        description: "上传材料并识别类型和关键字段。",
        output: "结构化信息",
      },
      {
        title: "填",
        description: "生成表单草稿，由申请人核对修改。",
        output: "待确认表单",
      },
      {
        title: "预审",
        description: "依据规则提示缺失和一致性问题。",
        output: "辅助意见",
      },
      {
        title: "办",
        description: "进入正式系统或线下窗口完成办理。",
        output: "正式办件",
      },
    ],
    scenarios: [
      {
        title: "个体工商户登记",
        users: "申请人 / 窗口",
        description: "围绕事项、材料、填表和辅助预审提供连续引导。",
      },
      {
        title: "高频政策咨询",
        users: "群众 / 热线",
        description: "基于有效政策提供 7×24 小时咨询和人工兜底。",
      },
      {
        title: "大厅材料预检",
        users: "群众 / 导办员",
        description: "在取号或受理前发现基础材料问题。",
      },
    ],
    deploymentModes: [
      {
        title: "政务内网私有化",
        fit: "政策、材料和办件数据需留在政务控制边界。",
        includes: ["本地模型", "事项知识", "权限审计", "正式系统接口"],
        state: "推荐",
      },
      {
        title: "内外网分区接入",
        fit: "互联网入口与政务正式系统分处不同网络。",
        includes: ["服务入口", "数据交换边界", "接口网关", "审计"],
        state: "可选",
      },
      {
        title: "单事项试点",
        fit: "先验证一个高频且规则较清晰的事项。",
        includes: ["事项知识", "材料样本", "预审规则", "试运行"],
        state: "验证",
      },
    ],
    integrations: [
      {
        name: "综窗 / 办件系统",
        purpose: "进入正式受理与审批流程",
        state: "placeholder",
      },
      {
        name: "统一身份 / 电子证照",
        purpose: "身份与材料复用",
        state: "placeholder",
      },
      { name: "电子签名", purpose: "完成申请人正式确认", state: "placeholder" },
      {
        name: "小程序 / 自助终端",
        purpose: "复用导办和材料能力",
        state: "scaffold",
      },
    ],
    implementation: [
      {
        phase: "MODEL",
        title: "事项与政策梳理",
        description: "梳理事项、政策、材料、情形、例外和责任人。",
        output: "事项知识与规则清单",
      },
      {
        phase: "PROVE",
        title: "场景验证",
        description: "验证问答、识别、填表、预审和人工兜底。",
        output: "测试集与 POC 结果",
      },
      {
        phase: "CONNECT",
        title: "正式系统集成",
        description: "对接综窗、办件、签名和渠道入口。",
        output: "接口、权限与生产流程",
      },
      {
        phase: "PILOT",
        title: "试运行与运营",
        description: "用真实用户试运行，建立纠错和政策更新。",
        output: "试运行报告与运营机制",
      },
    ],
    deliverables: [
      {
        title: "智能导办应用",
        description: "部署问答、材料、填表和预审能力。",
      },
      {
        title: "事项知识库",
        description: "交付约定事项、来源、版本和有效期。",
      },
      { title: "材料与规则配置", description: "记录字段、校验和例外处理。" },
      { title: "系统接口", description: "按范围连接正式办件与服务渠道。" },
      {
        title: "测试与安全报告",
        description: "记录效果、权限、异常与个人信息边界。",
      },
      {
        title: "运营与更新手册",
        description: "明确政策更新、纠错、转人工和审计。",
      },
    ],
    prerequisites: [
      {
        owner: "客户侧",
        title: "正式事项与政策",
        description: "提供事项清单、有效政策、材料和更新责任人。",
      },
      {
        owner: "客户侧",
        title: "审核规则与例外",
        description: "明确正式制度、人工责任和异常情形。",
      },
      {
        owner: "双方",
        title: "网络与数据边界",
        description: "确认内外网交换、个人信息和留存规则。",
      },
      {
        owner: "双方",
        title: "正式系统接口",
        description: "确认综窗、办件、签名、证照和渠道能力。",
      },
      {
        owner: "华鲲侧",
        title: "模型与部署建议",
        description: "依据事项、并发和材料类型完成方案设计。",
      },
    ],
    acceptance: [
      {
        title: "事项定位",
        description: "约定事项与情形的定位正确性。",
        state: "待实测",
      },
      {
        title: "材料识别",
        description: "按材料类型和字段分别统计效果。",
        state: "待实测",
      },
      {
        title: "辅助预审",
        description: "统计问题发现、误报和人工一致性。",
        state: "待实测",
      },
      {
        title: "政策追溯",
        description: "来源、版本、有效期和更新可检查。",
        state: "可定义",
      },
      {
        title: "权责与隐私",
        description: "验证转人工、审计和个人信息保护。",
        state: "可定义",
      },
    ],
    resources: [
      {
        label: "智能导办一体机",
        description: "查看智能导办产品及其核心能力。",
        href: "/product/knowledge-agent",
        state: "live",
      },
      ...commonResources,
    ],
    faqs: [
      {
        question: "AI 会直接作出行政审批决定吗？",
        answer:
          "不会。方案只提供咨询、信息提取、草稿和辅助预审，正式受理、审核和决定由授权人员与系统完成。",
      },
      {
        question: "政策更新后如何保持口径一致？",
        answer:
          "需要由客户指定内容责任人，维护来源、版本、有效期和发布流程；系统不能自行认定政策有效性。",
      },
      {
        question: "能否一次覆盖所有政务事项？",
        answer:
          "不建议。应优先选择高频、规则清晰、资料完整的事项，完成试运行后再复制。",
      },
      {
        question: "材料识别准确率是多少？",
        answer:
          "应按材料类型、字段、图像质量和测试样本分别统计，不能用一个无条件数字概括。",
      },
    ],
    scene: {
      solutionSlug: "intelligent-guidance",
      slug: "business-registration-guidance",
      eyebrow: "SCENARIO / BUSINESS REGISTRATION",
      title: "个体工商户登记智能导办",
      tagline: "从“不懂办”到材料准备完成，让正式审核获得更清晰的输入。",
      summary:
        "围绕登记事项、业务情形、材料、表单和辅助预审建立连续导办，并保留人工正式审核与异常处理。",
      status: "可开展事项评估",
      stakeholders: ["申请人", "导办与窗口人员", "审批人员", "政务信息化团队"],
      outcomes: [
        {
          title: "事项更清楚",
          description: "通过多轮交互定位具体事项和材料。",
        },
        { title: "材料早发现", description: "在正式受理前提示基础问题。" },
        {
          title: "权责可追溯",
          description: "AI 建议、人工确认和正式决定边界清楚。",
        },
      ],
      challenges: [
        "事项情形与材料复杂",
        "群众反复填写和往返",
        "政策更新与多渠道口径难统一",
      ],
      journey: [
        {
          title: "事项建模",
          description: "确认事项、情形、政策、材料和例外。",
          output: "事项模型",
        },
        {
          title: "知识与材料测试",
          description: "用真实脱敏问题和材料验证。",
          output: "测试报告",
        },
        {
          title: "系统接入",
          description: "连接渠道、综窗、办件和签名。",
          output: "业务流程",
        },
        {
          title: "试运行",
          description: "跟踪咨询、转人工、退补与纠错。",
          output: "运营机制",
        },
      ],
      inputs: ["正式政策", "事项与情形", "材料样本", "审核规则"],
      integrations: ["综窗", "办件系统", "电子签名", "小程序/终端"],
      governance: [
        "政策责任人",
        "人工最终审核",
        "个人信息最小化",
        "纠错与申诉",
      ],
      boundaries: [
        "AI 仅做导办与辅助预审",
        "申请人需确认表单与材料",
        "正式决定由授权人员作出",
      ],
      verificationItems: [
        "正式事项清单",
        "OCR 测试报告",
        "系统接口文档",
        "客户案例授权",
      ],
    },
    contentStatus: "公开方案",
    lastReviewed: "2026-07-14",
  },
  {
    slug: "intelligent-office",
    category: "business",
    variant: "office",
    status: "preview",
    officialName: "智能办公一体化解决方案",
    title: "企业智能办公解决方案",
    shortTitle: "企业智能办公",
    eyebrow: "BUSINESS SOLUTION / 04",
    statement: "把重复办公交给 AI，把事实、规则和最终决定留给人。",
    summary:
      "组合智能写作、合同审核、投标辅助、智能会议、企业知识和元启平台，在企业数据边界内形成可治理的办公智能体套件。",
    objective:
      "提升内容生产和复核效率，沉淀组织模板、制度与规则，贯通会前、会中、会后流程，并让所有 AI 输出可复核。",
    maturityNote: "方案预览；正式发布状态、版本与 SKU 待产品负责人确认。",
    industries: ["机关", "国央企", "制造", "金融", "教育科研"],
    audience: [
      "行政与综合部门",
      "法务与采购",
      "投标与销售团队",
      "会议与 IT 管理团队",
    ],
    triggerEvents: [
      "文档生产包含大量重复整理",
      "合同与标书审核依赖少数专家",
      "会议纪要和待办难以沉淀",
      "公有 SaaS 不满足数据边界",
    ],
    deploymentSummary: "企业内网私有化；移动与远程访问方式需通过安全评审。",
    challenges: [
      {
        title: "内容生产重复",
        current: "公文、报告和标书依赖大量查找、摘录和格式整理。",
        impact: "员工时间被低价值工作占用，规范难统一。",
      },
      {
        title: "审核标准分散",
        current: "合同条款、投标要求和优秀经验沉淀在个人。",
        impact: "复核依赖专家，过程和依据难追溯。",
      },
      {
        title: "会议信息流失",
        current: "预约、转写、纪要、评审和待办分散。",
        impact: "决议难沉淀，任务容易断在会后。",
      },
      {
        title: "数据边界不清",
        current: "文档与会议内容可能被发送到外部 SaaS。",
        impact: "敏感信息、模型调用和留存存在风险。",
      },
    ],
    outcomes: [
      {
        title: "规范化内容生产",
        description: "用企业模板、知识和规则约束草稿。",
      },
      {
        title: "可复核风险提示",
        description: "每条建议都保留位置、规则与人工确认。",
      },
      {
        title: "会议闭环",
        description: "连接预约、转写、纪要、评审、发布和待办。",
      },
    ],
    components: [
      {
        type: "应用",
        name: "办公智能体",
        role: "组合写作、合同、投标和会议助手。",
        requirement: "核心",
        href: "/product/office-agent",
      },
      {
        type: "平台",
        name: "元启 TGDataXAI",
        role: "管理知识、工作流、模型、权限和智能体运营。",
        requirement: "核心",
        href: "/product/tgdataxai",
      },
      {
        type: "知识",
        name: "企业模板 / 制度 / 条款 / 案例",
        role: "为生成、审核和纪要提供组织依据。",
        requirement: "客户现有",
      },
      {
        type: "模型",
        name: "语言模型与 ASR / TTS",
        role: "提供内容生成、理解和语音转写。",
        requirement: "按场景",
      },
      {
        type: "现有系统",
        name: "OA / 合同 / 投标 / 会议系统",
        role: "承载正式流程、签发、评审和任务。",
        requirement: "客户现有",
      },
    ],
    architecture: [
      {
        code: "ROLE",
        title: "人员与部门",
        description: "不同角色进入各自授权的办公入口。",
        items: ["行政", "法务", "采购", "项目与管理者"],
      },
      {
        code: "ASSIST",
        title: "办公助手",
        description: "围绕高频任务提供草稿和辅助意见。",
        items: ["智能写作", "合同审核", "投标辅助", "智能会议"],
      },
      {
        code: "KNOW",
        title: "企业知识与规则",
        description: "用组织资产约束内容和判断。",
        items: ["模板", "制度", "条款", "项目资料"],
      },
      {
        code: "PLATFORM",
        title: "元启开发与治理",
        description: "管理智能体、模型、流程、权限和审计。",
        items: ["TGDataXAI", "Workflow", "权限", "评测"],
      },
      {
        code: "SYSTEM",
        title: "正式业务系统",
        description: "完成签发、法审、投标和任务流转。",
        items: ["OA", "合同系统", "会议系统", "通讯录"],
      },
    ],
    capabilities: [
      {
        title: "智能写作",
        description: "围绕企业模板、素材、润色和格式辅助生成草稿。",
        value: "减少重复整理并保持组织规范。",
      },
      {
        title: "合同审核",
        description: "依据企业立场和条款规则提示风险与修订建议。",
        value: "让审核依据可复核、过程可追踪。",
      },
      {
        title: "投标辅助",
        description: "解析招标要求、组织大纲并检查关键响应项。",
        value: "降低遗漏风险，复用企业知识资产。",
      },
      {
        title: "智能会议",
        description: "贯通预约、转写、纪要、评审、发布和待办。",
        value: "让会议信息形成持续可用的组织资产。",
      },
      {
        title: "企业知识调用",
        description: "按部门和权限引用模板、制度、条款与案例。",
        value: "让 AI 输出更贴合组织规则。",
      },
      {
        title: "私有化治理",
        description: "控制数据、模型、用户、日志和远程访问边界。",
        value: "满足敏感办公场景的安全要求。",
      },
    ],
    signature: {
      eyebrow: "ROLE × ASSISTANT × KNOWLEDGE",
      title: "不同部门使用不同助手，但共享一套企业知识、权限和人工复核机制",
      description:
        "智能办公页应呈现工作矩阵，而不是把四个助手做成四张相同功能卡。",
    },
    workflow: [
      {
        title: "选择任务与模板",
        description: "确定文种、合同立场、标书类型或会议模板。",
        output: "任务上下文",
      },
      {
        title: "调用授权知识",
        description: "从制度、条款、案例和项目资料中检索。",
        output: "可追溯素材",
      },
      {
        title: "生成或分析",
        description: "形成草稿、风险、响应清单或纪要。",
        output: "AI 辅助结果",
      },
      {
        title: "人工复核",
        description: "核对事实、法律、承诺、格式和责任。",
        output: "确认版本",
      },
      {
        title: "进入正式流程",
        description: "进入 OA、法审、投标或纪要评审。",
        output: "正式业务记录",
      },
      {
        title: "知识回流",
        description: "将批准模板、规则和优秀内容按权限沉淀。",
        output: "更新知识资产",
      },
    ],
    scenarios: [
      {
        title: "公文与报告",
        users: "行政 / 项目",
        description: "基于模板和授权素材生成、润色并检查。",
      },
      {
        title: "合同审阅",
        users: "法务 / 采购",
        description: "提示风险位置、依据和修订建议，由法务确认。",
      },
      {
        title: "投标响应",
        users: "销售 / 技术",
        description: "解析招标要求、组织大纲并检查遗漏。",
      },
      {
        title: "会议闭环",
        users: "全员 / 管理者",
        description: "预约、转写、纪要、评审、发布和待办。",
      },
    ],
    deploymentModes: [
      {
        title: "企业内网私有化",
        fit: "文档、合同、标书和会议数据需要留在企业边界。",
        includes: ["本地模型", "企业知识", "权限审计", "内部系统接口"],
        state: "推荐",
      },
      {
        title: "助手分阶段上线",
        fit: "先选择高频、规则清晰、风险可控的助手。",
        includes: ["单助手", "部门知识", "人工复核", "使用规范"],
        state: "验证",
      },
      {
        title: "办公套件统一运营",
        fit: "多个助手和部门共享平台、模型与资源。",
        includes: ["TGDataXAI", "TGHCI", "多助手", "统一运营"],
        state: "可选",
      },
    ],
    integrations: [
      {
        name: "OA / 公文系统",
        purpose: "模板、签发和正式流程",
        state: "placeholder",
      },
      {
        name: "合同 / 投标系统",
        purpose: "材料、规则和审核流转",
        state: "placeholder",
      },
      {
        name: "会议与通讯录",
        purpose: "预约、与会人、纪要和发布",
        state: "placeholder",
      },
      {
        name: "统一身份",
        purpose: "部门、角色和文档权限",
        state: "placeholder",
      },
    ],
    implementation: [
      {
        phase: "SELECT",
        title: "场景与风险选择",
        description: "选择高频、规则清晰且人工边界明确的任务。",
        output: "优先级与风险清单",
      },
      {
        phase: "GROUND",
        title: "知识与规则准备",
        description: "整理模板、制度、条款、术语和样例。",
        output: "办公知识与规则资产",
      },
      {
        phase: "PROVE",
        title: "真实材料 POC",
        description: "用脱敏文档或录音验证助手效果。",
        output: "POC 与用户反馈",
      },
      {
        phase: "ROLL",
        title: "生产集成与推广",
        description: "完成权限、系统接口、培训和使用规范。",
        output: "生产系统与运营计划",
      },
    ],
    deliverables: [
      {
        title: "办公智能体套件",
        description: "按确认范围交付写作、合同、投标或会议助手。",
      },
      {
        title: "企业知识与规则",
        description: "整理模板、制度、条款和授权资料。",
      },
      {
        title: "模型与语音环境",
        description: "按场景部署语言模型及 ASR/TTS。",
      },
      {
        title: "业务系统接口",
        description: "按范围连接 OA、合同、会议或通讯录。",
      },
      {
        title: "安全与使用规范",
        description: "明确数据、权限、人工复核和禁止事项。",
      },
      {
        title: "测试、培训与运营",
        description: "交付结果记录、管理员培训和迭代计划。",
      },
    ],
    prerequisites: [
      {
        owner: "客户侧",
        title: "模板、制度与规则",
        description: "提供正式版本、归属、权限和更新责任人。",
      },
      {
        owner: "客户侧",
        title: "可测试材料",
        description: "提供脱敏文档、合同、标书或授权录音。",
      },
      {
        owner: "双方",
        title: "人工责任边界",
        description: "明确签发、法审、投标承诺和纪要发布人。",
      },
      {
        owner: "双方",
        title: "系统与远程访问",
        description: "确认 OA、会议、通讯录、移动和运维边界。",
      },
      {
        owner: "华鲲侧",
        title: "正式版本与 SKU",
        description: "在发布确认后提供支持范围和配置建议。",
      },
    ],
    acceptance: [
      {
        title: "模板与格式",
        description: "检查约定文种、结构和必填项。",
        state: "待实测",
      },
      {
        title: "知识可追溯",
        description: "验证企业知识的引用与权限。",
        state: "可定义",
      },
      {
        title: "规则与人工一致性",
        description: "统计合同/投标规则命中和误报。",
        state: "待实测",
      },
      {
        title: "语音与纪要",
        description: "按语言、音质和模板验证转写与纪要。",
        state: "待实测",
      },
      {
        title: "版本与兼容",
        description: "Office/WPS、音视频和接口以正式清单为准。",
        state: "待资料",
      },
    ],
    resources: [
      {
        label: "办公智能体",
        description: "查看办公智能体产品入口；正式发布信息待产品确认。",
        href: "/product/office-agent",
        state: "live",
      },
      ...commonResources,
    ],
    faqs: [
      {
        question: "AI 生成的公文、合同意见或标书能直接使用吗？",
        answer:
          "不能默认直接使用。事实、格式、法律意见、资质和商业承诺必须由授权人员复核。",
      },
      {
        question: "“数据不出机房”如何成立？",
        answer:
          "需要确认模型、知识、日志、外部接口和远程运维全部在约定边界内，不能只看应用部署位置。",
      },
      {
        question: "可以一次上线四个助手吗？",
        answer:
          "可以评估，但更建议从一个高频、规则清晰的场景开始，建立知识和人工复核机制后再扩展。",
      },
      {
        question: "为什么现在标记为方案预览？",
        answer:
          "源资料标注了商业发布时间，但正式版本、SKU、兼容和发布状态仍需产品负责人确认。",
      },
    ],
    scene: {
      solutionSlug: "intelligent-office",
      slug: "private-meeting-operations",
      eyebrow: "SCENARIO / PRIVATE MEETING",
      title: "私有化智能会议闭环",
      tagline: "从会前预约到纪要评审和待办发布，让会议数据留在企业控制边界。",
      summary:
        "连接会议预约、通讯录、录音转写、纪要模板、与会人评审和待办流转，并建立录音授权、数据留存与人工确认。",
      status: "方案预览，待版本确认",
      stakeholders: ["会议组织者", "与会人员", "行政管理", "IT 与安全团队"],
      outcomes: [
        { title: "流程连续", description: "会前、会中和会后不再割裂。" },
        { title: "数据受控", description: "模型、录音、纪要和日志边界明确。" },
        { title: "责任明确", description: "纪要与待办在评审后正式发布。" },
      ],
      challenges: [
        "预约与纪要分散",
        "录音与转写可能进入外部 SaaS",
        "纪要和待办缺少人工评审",
      ],
      journey: [
        {
          title: "安全与流程设计",
          description: "确认会议类型、录音授权、访问和留存。",
          output: "安全流程",
        },
        {
          title: "模型与模板验证",
          description: "按语言、音质、模板和时长测试。",
          output: "测试报告",
        },
        {
          title: "会议系统接入",
          description: "连接预约、通讯录、录音和任务。",
          output: "生产流程",
        },
        {
          title: "试运行与运营",
          description: "跟踪转写、评审、发布和问题反馈。",
          output: "运营基线",
        },
      ],
      inputs: ["会议预约", "授权录音", "纪要模板", "通讯录与权限"],
      integrations: ["会议系统", "通讯录", "OA/待办", "统一身份"],
      governance: ["录音授权", "数据留存", "与会人评审", "纪要发布责任"],
      boundaries: [
        "AI 生成的是待评审纪要",
        "敏感会议可按策略禁用录音",
        "正式版本和兼容范围待确认",
      ],
      verificationItems: [
        "正式发布版本",
        "ASR 语言与测试报告",
        "会议接口清单",
        "数据安全说明",
      ],
    },
    contentStatus: "方案预览",
    lastReviewed: "2026-07-14",
  },
  {
    slug: "yuanqi-ai-full-stack",
    category: "foundation",
    variant: "full-stack",
    status: "published",
    officialName: "华鲲元启 AI 全栈解决方案",
    title: "企业 AI 全栈建设解决方案",
    shortTitle: "企业 AI 全栈建设",
    eyebrow: "FOUNDATION / 05",
    statement:
      "从业务战略、算力底座到行业智能体，建立一套可分阶段演进的企业 AI 架构。",
    summary:
      "以鲲鹏/昇腾算力与 TGHCI 为底座，以 TGDataXAI 为平台核心，连接模型、知识、智能体、行业应用和专家服务，分阶段建设可运营的企业 AI 能力体系。",
    objective:
      "帮助已有多个试点或计划采购国产算力的组织，统一总体架构、供应责任、场景路线和持续运营机制。",
    maturityNote: "已有全栈方案资料；组件版本、性能、HA 与服务 SLA 待补齐。",
    industries: ["数字政府", "金融", "交通", "制造", "教育科研", "医疗健康"],
    audience: [
      "企业决策者",
      "CIO / 架构师",
      "数据中心与 AI 平台团队",
      "多场景建设单位",
    ],
    triggerEvents: [
      "多个 AI 试点需要统一平台",
      "准备采购国产算力但缺少应用规划",
      "硬件、平台、模型与应用由多方割裂交付",
      "希望同时建设知识、数据和视觉智能体",
    ],
    deploymentSummary: "企业级私有部署，按阶段建设训练、推理、平台和行业应用。",
    challenges: [
      {
        title: "算力与应用脱节",
        current: "硬件采购先于业务场景与运营设计。",
        impact: "资源到位后仍难形成业务产出。",
      },
      {
        title: "多供应商责任割裂",
        current: "硬件、平台、模型、数据和应用分别交付。",
        impact: "集成、故障和升级责任难定位。",
      },
      {
        title: "单点 POC 无法复制",
        current: "部门独立建设且缺少统一资产规范。",
        impact: "数据、模型和智能体无法规模化复用。",
      },
      {
        title: "建设范围失控",
        current: "一次性希望覆盖所有场景和组件。",
        impact: "风险、预算和价值证明都变得困难。",
      },
    ],
    outcomes: [
      {
        title: "统一参考架构",
        description: "明确六层能力、数据流和责任边界。",
      },
      { title: "分阶段投资", description: "从标杆场景逐步扩展到企业级运营。" },
      {
        title: "端到端交付",
        description: "连接咨询、基础设施、平台、应用与服务。",
      },
    ],
    components: [
      {
        type: "基础设施",
        name: "鲲鹏 / 昇腾算力产品",
        role: "承载训练、推理、边缘和行业应用。",
        requirement: "核心",
        href: "/product",
      },
      {
        type: "资源管理",
        name: "TGHCI",
        role: "提供集群、池化、调度、设备和运维能力。",
        requirement: "按规模",
        href: "/product/hci",
      },
      {
        type: "平台",
        name: "元启 TGDataXAI",
        role: "统一知识、模型、智能体、流程、评测和权限。",
        requirement: "核心",
        href: "/product/tgdataxai",
      },
      {
        type: "模型与应用",
        name: "模型服务与行业智能体",
        role: "依据优先场景形成实际业务闭环。",
        requirement: "按场景",
      },
      {
        type: "服务",
        name: "咨询、开发、调优、实施与运营",
        role: "贯穿规划、建设、上线和持续优化。",
        requirement: "按场景",
      },
    ],
    architecture: [
      {
        code: "L01",
        title: "行业与业务应用",
        description: "形成政务、制造、交通、金融等业务闭环。",
        items: ["知识", "数据", "视频", "流程"],
      },
      {
        code: "L02",
        title: "智能体与工作流",
        description: "组织任务、工具、人工节点和业务系统。",
        items: ["Agent", "Workflow", "工具调用", "人工复核"],
      },
      {
        code: "L03",
        title: "AI 开发与治理平台",
        description: "统一知识、模型、评测、发布和权限。",
        items: ["TGDataXAI", "知识工程", "模型工程", "治理"],
      },
      {
        code: "L04",
        title: "模型服务",
        description: "提供语言、多模态、视觉模型和训练推理。",
        items: ["语言模型", "多模态", "视觉", "评测"],
      },
      {
        code: "L05",
        title: "资源管理",
        description: "管理集群、资源池、调度、设备和运维。",
        items: ["TGHCI", "池化", "调度", "监控"],
      },
      {
        code: "L06",
        title: "基础设施",
        description: "提供训练、推理、存储和网络承载。",
        items: ["鲲鹏", "昇腾", "存储", "网络"],
      },
    ],
    capabilities: [
      {
        title: "战略与场景规划",
        description: "从业务目标建立场景池、优先级和建设路线。",
        value: "避免算力与业务脱节。",
      },
      {
        title: "国产算力底座",
        description: "按训练、推理、边缘和规模选择基础设施。",
        value: "支撑私有化和国产化建设。",
      },
      {
        title: "统一资源治理",
        description: "通过 TGHCI 管理集群、设备、工作负载与运维。",
        value: "让通用和智能算力可管理。",
      },
      {
        title: "AI 开发与治理",
        description: "以 TGDataXAI 统一知识、模型、智能体与权限。",
        value: "让多场景共享平台与资产。",
      },
      {
        title: "行业应用落地",
        description: "组合知识、数据、视觉与流程智能体。",
        value: "把平台能力转成业务闭环。",
      },
      {
        title: "专家与运营服务",
        description: "提供咨询、开发、调优、实施、培训和维保。",
        value: "降低端到端集成和运营风险。",
      },
    ],
    signature: {
      eyebrow: "ENTERPRISE AI ROADMAP",
      title: "从蓝图、底座、标杆场景到规模化复制，分阶段建设而不是一次堆满组件",
      description: "全栈方案的核心是总体责任和演进路径，不是硬件型号大全。",
    },
    workflow: [
      {
        title: "战略与场景规划",
        description: "明确业务目标、场景优先级和治理机制。",
        output: "AI 蓝图与场景池",
      },
      {
        title: "基础底座建设",
        description: "建设算力、资源管理、模型和开发平台。",
        output: "平台与运维基线",
      },
      {
        title: "标杆场景落地",
        description: "选择 1—3 个场景形成端到端闭环。",
        output: "标杆智能体",
      },
      {
        title: "规模化复制",
        description: "建立模板、资产目录和多部门发布机制。",
        output: "复用与治理体系",
      },
      {
        title: "持续优化",
        description: "以业务指标、成本、质量和版本驱动迭代。",
        output: "运营报告",
      },
    ],
    scenarios: [
      {
        title: "企业 AI 平台建设",
        users: "CIO / AI 平台",
        description: "统一算力、模型、知识、应用和治理。",
      },
      {
        title: "多部门智能体计划",
        users: "业务创新部门",
        description: "在同一平台分阶段落地多个场景。",
      },
      {
        title: "国产算力应用闭环",
        users: "数据中心 / 业务部门",
        description: "让硬件采购与场景、平台和服务同步设计。",
      },
    ],
    deploymentModes: [
      {
        title: "单场景起步",
        fit: "已有明确标杆场景但总体平台尚未建设。",
        includes: ["场景咨询", "基础平台", "模型与算力", "首个应用"],
        state: "验证",
      },
      {
        title: "平台先行",
        fit: "多个部门需要统一开发和治理能力。",
        includes: ["TGDataXAI", "模型服务", "权限", "资产规范"],
        state: "推荐",
      },
      {
        title: "全栈规模化",
        fit: "训练、推理、多场景和混合负载共同建设。",
        includes: ["TGHCI", "多节点算力", "平台", "行业应用与服务"],
        state: "可选",
      },
    ],
    integrations: [
      {
        name: "企业数据与知识",
        purpose: "支撑知识、数据和模型场景",
        state: "scaffold",
      },
      {
        name: "统一身份与审计",
        purpose: "建立企业治理与访问边界",
        state: "placeholder",
      },
      {
        name: "业务系统 API",
        purpose: "让智能体进入真实流程",
        state: "scaffold",
      },
      {
        name: "监控与服务体系",
        purpose: "统一运营、故障和支持",
        state: "placeholder",
      },
    ],
    implementation: [
      {
        phase: "PLAN",
        title: "AI 蓝图与场景规划",
        description: "评估业务、数据、组织和基础设施现状。",
        output: "总体蓝图与分期计划",
      },
      {
        phase: "FOUND",
        title: "底座与平台建设",
        description: "部署资源、模型、开发和治理能力。",
        output: "基础平台与运维基线",
      },
      {
        phase: "VALUE",
        title: "标杆场景交付",
        description: "形成可验证的端到端业务闭环。",
        output: "智能体、集成与测试",
      },
      {
        phase: "SCALE",
        title: "规模化与运营",
        description: "建立多部门复用、发布、培训和支持。",
        output: "企业运营体系",
      },
    ],
    deliverables: [
      {
        title: "总体架构与分期蓝图",
        description: "明确场景、组件、边界、预算与演进路径。",
      },
      {
        title: "算力与资源管理底座",
        description: "按确认范围交付硬件、TGHCI 和运维。",
      },
      {
        title: "AI 开发治理平台",
        description: "部署 TGDataXAI、模型、知识和权限。",
      },
      {
        title: "标杆行业智能体",
        description: "完成首批场景、流程和系统集成。",
      },
      {
        title: "测试与安全基线",
        description: "覆盖业务、性能、权限、故障和审计。",
      },
      {
        title: "专家服务与运营移交",
        description: "交付培训、文档、巡检和持续支持。",
      },
    ],
    prerequisites: [
      {
        owner: "客户侧",
        title: "业务战略与责任组织",
        description: "明确决策人、场景负责人和跨部门机制。",
      },
      {
        owner: "客户侧",
        title: "数据与基础设施现状",
        description: "提供系统、数据、网络、机房和算力信息。",
      },
      {
        owner: "双方",
        title: "分期目标与验收",
        description: "按阶段确认范围、价值、预算和退出条件。",
      },
      {
        owner: "华鲲侧",
        title: "总体架构与产品版本",
        description: "提供可交付组件、兼容和服务边界。",
      },
    ],
    acceptance: [
      {
        title: "业务闭环",
        description: "标杆场景完成端到端任务并获得用户确认。",
        state: "可定义",
      },
      {
        title: "统一纳管",
        description: "资源、模型、知识、应用和用户可治理。",
        state: "可定义",
      },
      {
        title: "系统集成",
        description: "关键接口、故障定位和升级责任明确。",
        state: "可定义",
      },
      {
        title: "容量与可用性",
        description: "按最终架构进行性能和故障测试。",
        state: "待实测",
      },
      {
        title: "服务与 SLA",
        description: "支持范围、响应和升级机制待正式目录。",
        state: "待资料",
      },
    ],
    resources: [
      {
        label: "TGDataXAI",
        description: "查看企业 AI 开发与治理平台。",
        href: "/product/tgdataxai",
        state: "live",
      },
      {
        label: "TGHCI",
        description: "查看 AI 超融合与资源管理产品。",
        href: "/product/hci",
        state: "live",
      },
      ...commonResources,
    ],
    faqs: [
      {
        question: "全栈方案是否意味着一次采购全部组件？",
        answer: "不是。应依据场景、现有环境和分期目标选择必选与可选组件。",
      },
      {
        question: "已经采购算力还能采用该方案吗？",
        answer: "可以先进行兼容、容量与业务目标评估，再决定复用、扩容或调整。",
      },
      {
        question: "全栈方案和 AI 开发方案有什么区别？",
        answer:
          "AI 开发方案聚焦应用开发与治理；全栈方案还包括总体规划、资源底座、多场景建设和专家服务。",
      },
      {
        question: "如何避免全栈建设范围失控？",
        answer: "通过分期蓝图、标杆场景、阶段验收和明确退出条件控制范围。",
      },
    ],
    scene: {
      solutionSlug: "yuanqi-ai-full-stack",
      slug: "enterprise-ai-roadmap",
      eyebrow: "SCENARIO / ENTERPRISE ROADMAP",
      title: "企业 AI 全栈建设路线图",
      tagline: "从一个标杆场景出发，逐步建立平台、底座、资产和运营体系。",
      summary:
        "面向已有多个试点或计划建设 AI 能力中心的组织，形成业务、技术和交付一致的分期路线图。",
      status: "可开展总体规划",
      stakeholders: [
        "企业决策者",
        "CIO 与架构师",
        "业务负责人",
        "AI 与数据中心团队",
      ],
      outcomes: [
        {
          title: "统一蓝图",
          description: "业务场景、技术架构和投资阶段一致。",
        },
        { title: "标杆价值", description: "先用可验证场景证明方法与价值。" },
        { title: "规模化治理", description: "形成可复用资产和持续运营机制。" },
      ],
      challenges: [
        "硬件先行但应用滞后",
        "多个试点无法复用",
        "供应商责任与升级边界不清",
      ],
      journey: [
        {
          title: "现状评估",
          description: "盘点业务、数据、系统、组织和基础设施。",
          output: "现状与差距",
        },
        {
          title: "蓝图设计",
          description: "确定场景池、六层架构和分期路线。",
          output: "总体蓝图",
        },
        {
          title: "标杆建设",
          description: "交付底座、平台和首批业务闭环。",
          output: "标杆场景",
        },
        {
          title: "规模化运营",
          description: "复制场景并建立资产、成本和质量治理。",
          output: "运营体系",
        },
      ],
      inputs: ["企业战略", "场景需求", "数据与系统", "基础设施现状"],
      integrations: ["企业系统", "身份审计", "数据平台", "监控与服务"],
      governance: ["分期决策", "架构评审", "资产治理", "运营指标"],
      boundaries: [
        "不是固定硬件套餐",
        "每阶段都有明确验收和退出条件",
        "具体兼容与性能以正式版本为准",
      ],
      verificationItems: [
        "全栈版本矩阵",
        "高可用与容灾设计",
        "专家服务目录",
        "公开全栈案例",
      ],
    },
    contentStatus: "公开方案",
    lastReviewed: "2026-07-14",
  },
  {
    slug: "tghci-ai",
    category: "foundation",
    variant: "infrastructure",
    status: "published",
    officialName: "TGHCI AI 超融合解决方案",
    title: "AI 超融合基础设施解决方案",
    shortTitle: "AI 超融合基础设施",
    eyebrow: "FOUNDATION / 06",
    statement:
      "把通用业务、数据平台和 AI 工作负载，放进一个可管理、可扩展的资源底座。",
    summary:
      "在 X86 与 ARM 异构环境中融合计算、存储、网络、安全和运维，统一管理 CPU、GPU、NPU 与虚拟机/容器工作负载，为企业提供可扩展的 AI 基础设施。",
    objective:
      "降低传统多套基础设施的资源孤岛与运维复杂度，为通用业务、数据库、数据平台和 AI 训练推理建立统一承载与演进路径。",
    maturityNote: "已有方案资料；兼容、HA、容灾、规模上限和配置表待产品核验。",
    industries: ["数据中心", "政务", "制造", "教育", "医疗", "园区"],
    audience: [
      "CIO / IT 架构师",
      "数据中心团队",
      "虚拟化与运维团队",
      "AI 基础设施团队",
    ],
    triggerEvents: [
      "传统架构设备多、资源孤岛",
      "CPU / GPU / NPU 分散管理",
      "AI 环境依赖多个团队手工维护",
      "扩容、迁移和运维链路复杂",
    ],
    deploymentSummary:
      "客户数据中心私有部署；按工作负载与故障等级设计节点、网络和存储。",
    challenges: [
      {
        title: "多套管理面",
        current: "服务器、存储、网络、安全与虚拟化分别管理。",
        impact: "资源和故障状态难统一查看。",
      },
      {
        title: "异构算力孤岛",
        current: "CPU、GPU、NPU 按设备或项目分散。",
        impact: "容量难规划，工作负载难统一调度。",
      },
      {
        title: "AI 环境维护复杂",
        current: "驱动、框架、模型和容器环境手工维护。",
        impact: "上线慢，版本和兼容风险高。",
      },
      {
        title: "混合负载边界不清",
        current: "核心业务、数据库和 AI 共享资源时缺少设计。",
        impact: "资源争用与故障影响难控制。",
      },
    ],
    outcomes: [
      {
        title: "统一资源管理",
        description: "在一个控制面查看和管理异构资源。",
      },
      {
        title: "按节点演进",
        description: "依据业务增长扩展计算、存储和 AI 能力。",
      },
      {
        title: "降低运维割裂",
        description: "统一监控、告警、巡检、日志和生命周期。",
      },
    ],
    components: [
      {
        type: "平台",
        name: "TGHCI",
        role: "融合计算、存储、网络、安全、容器和运维。",
        requirement: "核心",
        href: "/product/hci",
      },
      {
        type: "服务器",
        name: "鲲鹏 / X86 服务器",
        role: "承载通用计算、虚拟机和容器。",
        requirement: "按规模",
        href: "/product",
      },
      {
        type: "加速",
        name: "GPU / NPU",
        role: "承载 AI 训练、推理和模型服务。",
        requirement: "按场景",
      },
      {
        type: "存储与网络",
        name: "本地 / 第三方存储与数据中心网络",
        role: "提供数据、IO、带宽和冗余。",
        requirement: "按规模",
      },
      {
        type: "工作负载",
        name: "虚拟机 / K8S / 数据库 / AI",
        role: "在资源与隔离策略下运行。",
        requirement: "客户现有",
      },
    ],
    architecture: [
      {
        code: "WORKLOAD",
        title: "业务与工作负载",
        description: "承载通用、数据库、数据与 AI 应用。",
        items: ["OA / ERP", "数据库", "数据平台", "AI 训练推理"],
      },
      {
        code: "CONTROL",
        title: "统一管理与运维",
        description: "提供资源、生命周期、监控、告警和审计。",
        items: ["资源管理", "监控", "告警", "日志"],
      },
      {
        code: "VIRTUAL",
        title: "虚拟化与容器",
        description: "融合计算、存储、网络、安全和 K8S。",
        items: ["VM", "存储池", "OVS / VLAN", "K8S"],
      },
      {
        code: "AI",
        title: "AI 使能",
        description: "提供异构算力、直通/虚拟化和模型环境。",
        items: ["GPU / NPU", "调度", "框架", "模型部署"],
      },
      {
        code: "HARDWARE",
        title: "异构基础设施",
        description: "连接 ARM、X86、加速卡、存储和网络。",
        items: ["鲲鹏", "X86", "GPU", "NPU"],
      },
    ],
    capabilities: [
      {
        title: "异构算力管理",
        description: "统一管理 CPU、GPU、NPU 资源与调度。",
        value: "减少设备和项目级算力孤岛。",
      },
      {
        title: "计算虚拟化",
        description: "管理虚拟机、迁移、克隆、快照、备份和 HA。",
        value: "支撑通用业务生命周期。",
      },
      {
        title: "存储与网络虚拟化",
        description: "管理存储池、本地/第三方存储、QoS、OVS 与 VLAN。",
        value: "将基础设施能力纳入统一架构。",
      },
      {
        title: "容器与 AI 使能",
        description: "支持 K8S、容器、加速卡和 AI 环境。",
        value: "缩短 AI 运行环境准备链路。",
      },
      {
        title: "智能运维",
        description: "覆盖监控、告警、巡检、日志和资源视图。",
        value: "降低日常运维与故障定位复杂度。",
      },
      {
        title: "弹性扩展",
        description: "以节点为步长扩展资源和工作负载。",
        value: "为业务增长保留演进空间。",
      },
    ],
    signature: {
      eyebrow: "WORKLOAD × RESOURCE FABRIC",
      title: "先定义工作负载和故障等级，再设计资源池、隔离、网络、存储和运维",
      description:
        "超融合方案页应讲清承载模型和迁移路径，而不是只列功能与三档配置。",
    },
    workflow: [
      {
        title: "资产盘点",
        description: "盘点服务器、加速卡、存储、网络、业务与依赖。",
        output: "资产与工作负载清单",
      },
      {
        title: "容量与风险",
        description: "评估峰值、故障域、迁移窗口和业务等级。",
        output: "容量与风险报告",
      },
      {
        title: "架构设计",
        description: "设计节点、网络、存储、资源池、租户和备份。",
        output: "实施架构",
      },
      {
        title: "小规模验证",
        description: "验证硬件、OS、驱动、框架和迁移流程。",
        output: "兼容与 POC 结果",
      },
      {
        title: "生产与迁移",
        description: "部署集群并按低风险到核心业务迁移。",
        output: "生产集群",
      },
      {
        title: "运维移交",
        description: "演练巡检、扩容、升级、备份、恢复和故障。",
        output: "运维基线",
      },
    ],
    scenarios: [
      {
        title: "通用虚拟化",
        users: "IT 运维",
        description: "统一承载 OA、会议、桌面和 ERP。",
      },
      {
        title: "数据库与数据平台",
        users: "DBA / 数据团队",
        description: "按认证、IO、HA 和保护要求设计。",
      },
      {
        title: "AI 训练与推理",
        users: "AI 平台团队",
        description: "管理加速卡、模型环境、容器和任务。",
      },
      {
        title: "混合负载",
        users: "数据中心",
        description: "在资源池、优先级和隔离策略下协同承载。",
      },
    ],
    deploymentModes: [
      {
        title: "通用虚拟化集群",
        fit: "以 VM、数据库和办公系统为主。",
        includes: ["计算", "存储", "网络", "HA 与运维"],
        state: "可选",
      },
      {
        title: "AI 增强集群",
        fit: "需要 GPU/NPU、容器和模型服务。",
        includes: ["异构算力", "K8S", "AI 环境", "统一监控"],
        state: "推荐",
      },
      {
        title: "混合负载验证",
        fit: "评估核心业务、数据与 AI 的资源隔离。",
        includes: ["工作负载画像", "资源策略", "故障测试", "容量报告"],
        state: "验证",
      },
    ],
    integrations: [
      {
        name: "服务器与加速卡",
        purpose: "发现、管理和分配异构资源",
        state: "scaffold",
      },
      {
        name: "第三方存储",
        purpose: "扩展数据存储与保护能力",
        state: "placeholder",
      },
      {
        name: "K8S / AI 框架",
        purpose: "承载容器和 AI 工作负载",
        state: "scaffold",
      },
      {
        name: "监控 / 日志 / 备份",
        purpose: "连接企业运维和恢复体系",
        state: "placeholder",
      },
    ],
    implementation: [
      {
        phase: "ASSESS",
        title: "资产与工作负载评估",
        description: "盘点环境、容量、业务等级和迁移窗口。",
        output: "评估与容量报告",
      },
      {
        phase: "DESIGN",
        title: "集群与故障域设计",
        description: "设计节点、网络、存储、资源池和保护策略。",
        output: "实施架构与迁移计划",
      },
      {
        phase: "VALIDATE",
        title: "兼容与故障验证",
        description: "验证硬件、软件、AI 环境、HA 和恢复。",
        output: "POC 与测试结果",
      },
      {
        phase: "MIGRATE",
        title: "生产部署与迁移",
        description: "部署集群并分批迁移工作负载。",
        output: "生产集群与运维基线",
      },
    ],
    deliverables: [
      {
        title: "TGHCI 生产集群",
        description: "按确认节点、网络、存储和软件版本部署。",
      },
      {
        title: "资源池与租户策略",
        description: "配置计算、AI、存储和网络资源边界。",
      },
      {
        title: "虚拟化与容器环境",
        description: "按范围交付 VM、K8S 和 AI 运行环境。",
      },
      {
        title: "监控、告警与日志",
        description: "建立运行指标、告警、巡检和审计。",
      },
      {
        title: "迁移、备份与恢复方案",
        description: "记录迁移顺序、保护、恢复和回滚。",
      },
      {
        title: "兼容、性能与故障报告",
        description: "在最终环境中记录验证结果。",
      },
    ],
    prerequisites: [
      {
        owner: "客户侧",
        title: "资产与业务清单",
        description: "提供服务器、网络、存储、业务和依赖信息。",
      },
      {
        owner: "客户侧",
        title: "业务等级与窗口",
        description: "明确核心业务、停机窗口、RPO/RTO 和变更流程。",
      },
      {
        owner: "双方",
        title: "工作负载与容量目标",
        description: "确认峰值、资源争用、AI 任务和扩展预期。",
      },
      {
        owner: "双方",
        title: "兼容与迁移测试",
        description: "确定验证硬件、OS、驱动、框架和应用。",
      },
      {
        owner: "华鲲侧",
        title: "产品版本与参考设计",
        description: "提供正式兼容范围、架构与实施建议。",
      },
    ],
    acceptance: [
      {
        title: "兼容性",
        description: "验证硬件、OS、驱动、固件和框架。",
        state: "待资料",
      },
      {
        title: "资源生命周期",
        description: "验证发现、分配、隔离、回收和调度。",
        state: "可定义",
      },
      {
        title: "HA 与恢复",
        description: "验证节点、网络、存储故障和恢复。",
        state: "待实测",
      },
      {
        title: "扩容与迁移",
        description: "验证节点扩展、工作负载迁移和回滚。",
        state: "待实测",
      },
      {
        title: "性能与稳定性",
        description: "按目标工作负载和最终环境验证。",
        state: "待实测",
      },
    ],
    resources: [
      {
        label: "TGHCI 产品详情",
        description: "查看 AI 超融合产品能力与现有资料。",
        href: "/product/hci",
        state: "live",
      },
      ...commonResources,
    ],
    faqs: [
      {
        question: "TGHCI 是否只适合 AI 工作负载？",
        answer:
          "不是。它同时面向通用虚拟化、数据库、数据平台与 AI，具体混部方式需按业务等级设计。",
      },
      {
        question: "现有 X86、ARM、GPU 或 NPU 能否直接纳管？",
        answer:
          "需要核对服务器、卡型、固件、驱动、OS 和平台版本，不能只凭架构名称判断。",
      },
      {
        question: "Scale-in 是否可以随时缩容？",
        answer:
          "缩容必须满足数据迁移、容量、故障域和业务窗口条件，需要受控执行。",
      },
      {
        question: "为什么不直接展示固定配置套餐？",
        answer:
          "节点、存储、网络和加速卡取决于工作负载、HA、容量和兼容要求，应先评估再选型。",
      },
    ],
    scene: {
      solutionSlug: "tghci-ai",
      slug: "mixed-workload-modernization",
      eyebrow: "SCENARIO / MIXED WORKLOAD",
      title: "通用业务与 AI 混合负载承载",
      tagline:
        "在统一平台中管理 VM、数据库、容器和 AI 任务，同时守住资源与故障边界。",
      summary:
        "面向已有通用业务并计划引入 AI 的数据中心，评估异构资源、混部隔离、HA、迁移和运维。",
      status: "可开展基础设施评估",
      stakeholders: [
        "CIO / 架构师",
        "数据中心运维",
        "数据库团队",
        "AI 平台团队",
      ],
      outcomes: [
        { title: "统一管理", description: "通用和智能算力进入统一资源视图。" },
        {
          title: "边界明确",
          description: "工作负载、资源、故障域和优先级可设计。",
        },
        { title: "可演进", description: "迁移、扩容、升级和恢复有明确路径。" },
      ],
      challenges: [
        "传统资源孤岛",
        "AI 环境与运维割裂",
        "混部的资源争用和故障风险",
      ],
      journey: [
        {
          title: "工作负载画像",
          description: "记录业务等级、峰值、依赖和保护目标。",
          output: "工作负载清单",
        },
        {
          title: "资源与故障设计",
          description: "设计节点、池、网络、存储和隔离。",
          output: "参考架构",
        },
        {
          title: "兼容与故障测试",
          description: "验证硬件、软件、HA、备份与恢复。",
          output: "测试报告",
        },
        {
          title: "分批迁移",
          description: "从低风险业务到核心工作负载逐步迁移。",
          output: "生产集群",
        },
      ],
      inputs: ["资产清单", "工作负载画像", "业务等级", "容量与 RPO/RTO"],
      integrations: [
        "服务器与加速卡",
        "网络与存储",
        "K8S/AI 框架",
        "监控与备份",
      ],
      governance: ["变更审批", "资源配额", "故障演练", "版本与兼容"],
      boundaries: [
        "混部不等于无隔离",
        "缩容需满足数据与故障域条件",
        "兼容与规模上限以正式版本为准",
      ],
      verificationItems: [
        "硬件与软件矩阵",
        "vGPU/vNPU 范围",
        "HA/RPO/RTO 设计",
        "集群规模与性能报告",
      ],
    },
    contentStatus: "公开方案",
    lastReviewed: "2026-07-14",
  },
] as const;

export const solutionScenes = solutions.map((solution) => solution.scene);

export function findSolution(slug: string) {
  return solutions.find((solution) => solution.slug === slug);
}

export function findSolutionScene(solutionSlug: string, sceneSlug: string) {
  return solutionScenes.find(
    (scene) => scene.solutionSlug === solutionSlug && scene.slug === sceneSlug,
  );
}
