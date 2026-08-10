export type PortalAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

export type ProductFeature = {
  title: string;
  description: string;
};

export type StandaloneProduct = {
  slug: "code-agent" | "aippt" | "aishrek";
  name: string;
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    tags: readonly string[];
    actions: readonly PortalAction[];
    demo: {
      note: string;
      title: string;
      messages: readonly string[];
      visual: string;
    };
  };
  introduction: {
    eyebrow: string;
    title: string;
    lead: string;
    items: readonly {
      title: string;
      description: string;
      visual: string;
      action?: PortalAction;
    }[];
  };
  capabilities: {
    eyebrow: string;
    title: string;
    lead: string;
    items: readonly {
      tag: string;
      title: string;
      description: string;
      features: readonly ProductFeature[];
      note?: string;
      visual: string;
    }[];
  };
  security?: {
    title: string;
    description: string;
    action: PortalAction;
    items: readonly ProductFeature[];
  };
  experience: {
    eyebrow: string;
    title: string;
    lead: string;
    flow: readonly string[];
    visual: string;
  };
  business: {
    eyebrow: string;
    title: string;
    lead: string;
    points: readonly ProductFeature[];
    values: readonly ProductFeature[];
    demo: {
      title: string;
      messages: readonly string[];
      note: string;
    };
    reason: readonly string[];
    workflow: readonly string[];
    outcomes: readonly ProductFeature[];
    scenesLead: string;
    scenes: readonly {
      title: string;
      description: string;
      action: PortalAction;
    }[];
  };
  cta: {
    title: string;
    description: string;
    actions: readonly PortalAction[];
  };
};

export const productOverview = {
  hero: {
    eyebrow: "产品｜产品总览",
    title: "让企业 AI 落地，深度建设与快速使用双路径",
    lead: "元启平台以模型、知识、智能体、应用与治理六大中心，帮助企业深度构建专属 AI 能力；独立产品中心提供码多多 2.0、AIPPT、AISHREK 等可独立部署的产品，满足明确的单点 AI 需求。深度建设用元启，快速使用选独立产品。",
    tags: ["深度构建 · 元启平台", "快速使用 · 独立产品", "统一运营 · 平台治理"],
    actions: [
      {
        label: "了解元启平台",
        href: "#products-challenges",
        variant: "primary",
      },
      { label: "查看独立产品", href: "#products-independent" },
      { label: "申请体验", href: "/trial" },
    ],
    paths: [
      {
        label: "深度建设",
        title: "元启 AI 开发赋能平台",
        description: "模型 · 知识 · 智能体 · 应用 · 治理",
      },
      {
        label: "快速使用",
        title: "独立产品中心",
        description: "码多多 2.0 · AIPPT · AISHREK",
      },
    ],
  },
  challenges: {
    eyebrow: "为什么需要元启",
    title: "企业 AI 落地，元启回答三个核心问题",
    lead: "通用大模型解决不了企业专属问题。元启把企业 AI 落地的三大难题，变成一步步可落地的答案。",
    items: [
      {
        number: "问题 01",
        title: "模型怎么落地？",
        problem:
          "模型那么多，不知道选哪个、适不适合自己；部署环境复杂，运行与运维成本难控。",
        answer:
          "模型花园统一选型与纳管，三种部署方式覆盖本地 / 专网 / 云端，让模型真正跑起来。",
        action: { label: "了解模型中心 →", href: "/product/model" },
      },
      {
        number: "问题 02",
        title: "企业知识怎么被 AI 理解？",
        problem:
          "制度、产品资料、技术文档分散各处，文档利用率低，专业知识难以沉淀。",
        answer:
          "企业知识库把文档沉淀为可检索、可问答的知识，配合知识智能体，让员工像问人一样问 AI，回答有据可依。",
        action: { label: "了解智能体中心 →", href: "/product/agents" },
      },
      {
        number: "问题 03",
        title: "AI 应用怎么快速落地？",
        problem: "开发门槛高、场景适配慢、重复建设多，一个需求一套方案。",
        answer:
          "智能体 + 流程编排让业务人员也能构建 AI 助手与自动化流程；行业应用提供开箱即用的成熟应用，缩短上线周期。",
        action: { label: "了解智能体中心 →", href: "/product/agents" },
      },
    ],
  },
  chain: {
    eyebrow: "企业 AI 落地全链路",
    title: "从模型到应用，一条链路走通",
    lead: "传统做法需要企业自己拼装模型、数据、开发等多个工具；元启把整条链路一体化，每个环节既可单独使用，也可组合成完整能力。",
    items: [
      {
        number: "01",
        title: "模型",
        description: "统一管理模型资产，训练、评估、部署一站式",
        action: { label: "了解模型中心 →", href: "/product/model" },
      },
      {
        number: "02",
        title: "知识",
        description: "企业知识库与数据底座，让 AI 懂你的业务",
        action: { label: "了解知识底座 →", href: "/product/knowledge" },
      },
      {
        number: "03",
        title: "智能体",
        description: "把能力组合成能对话、能干活的业务助手",
        action: { label: "了解智能体中心 →", href: "/product/agents" },
      },
      {
        number: "04",
        title: "应用",
        description: "封装为可直接使用的应用，交付给业务与用户",
        action: { label: "了解行业应用中心 →", href: "/product/applications" },
      },
    ],
    note: "模型、知识、智能体、应用各环节由安全中心统一治理，人员、角色、数据权限清晰可控。",
  },
  centers: {
    eyebrow: "七大中心",
    title: "元启平台六大中心，覆盖企业 AI 全生命周期",
    lead: "进入对应中心，了解它解决什么问题、具备哪些能力、大致怎么用。",
    featured: {
      tag: "核心 · 重重点",
      title: "智能体中心",
      position: "让企业拥有懂知识、懂业务、懂流程的 AI 助手。",
      description:
        "将模型、知识、数据、工具与流程组合成可对话、可执行、可发布的智能体：知识助手回答业务问题，问数助手解读数据，视频助手看懂画面，自动化引擎跑通复杂流程。",
      visual: "智能体对话与流程编排界面截图素材槽位",
      action: { label: "进入智能体中心 →", href: "/product/agents" },
    },
    items: [
      {
        title: "模型中心",
        position: "模型资产管理、部署与优化",
        description:
          "统一管理企业模型资产，回答「有哪些模型、怎么运行、怎么变强」。",
        action: { label: "查看模型中心 →", href: "/product/model" },
      },
      {
        title: "行业应用中心",
        position: "开箱即用的业务 AI 应用",
        description: "通用文本写作、投标智能助手、合同智能审查，拿来即用。",
        action: { label: "查看行业应用中心 →", href: "/product/applications" },
      },
      {
        title: "技能中心",
        position: "编程、应用、办公三类技能",
        description:
          "可复用的业务技能，覆盖模型评测、工作流生成、视频分析、安全防护与会议提效，拿来即用。",
        action: { label: "了解技能中心 →", href: "/product/skills" },
      },
      {
        title: "编程中心",
        position: "码多多 1.0 智能编程",
        description:
          "项目管理、会话管理、移动接入、编程规范，让智能编程贴近真实工程化开发。",
        action: { label: "查看编程中心 →", href: "/product/coding" },
      },
      {
        title: "安全中心",
        position: "用户、角色、权限与授权治理",
        description: "横向支撑各中心，让平台用得安全、权限管得清楚。",
        action: { label: "查看安全中心 →", href: "/product/governance" },
      },
    ],
  },
  independent: {
    eyebrow: "快速使用",
    title: "独立产品中心：每个产品，单独可用",
    lead: "无需先建设完整平台，每个独立产品都可单独部署、单独使用，按明确目标直接选用。",
    items: [
      {
        title: "码多多 2.0",
        position: "企业级智能编程平台",
        description:
          "代码补全、生成、解释与重构，帮助研发团队减少重复编码，更快理解和维护代码。",
        visual: "码多多 2.0 主界面截图素材槽位",
        href: "/product/code-agent",
        action: "查看码多多 2.0 →",
      },
      {
        title: "AIPPT",
        position: "智能演示文稿生成",
        description:
          "根据主题或大纲完成结构规划、页面生成与风格匹配，缩短演示文稿制作时间。",
        visual: "AIPPT 生成前后界面截图素材槽位",
        href: "/product/aippt",
        action: "查看 AIPPT →",
      },
      {
        title: "AISHREK",
        position: "AI 机械设计",
        description:
          "多格式导入、自动解读与对话式参数修改，让机械零件设计与改型高效完成。",
        visual: "AISHREK 机械设计工作台界面素材槽位",
        href: "/product/aishrek",
        action: "查看 AISHREK →",
      },
    ],
  },
  business: {
    eyebrow: "业务场景",
    title: "深度建设与快速使用，两条路都值得走",
    lead: "要长期沉淀企业 AI 能力，用元启平台深度建设；要快速解决单点需求，选独立产品直接使用。",
    points: [
      { title: "深度建设", description: "元启六大中心，能力完整可组合" },
      { title: "快速使用", description: "独立产品开箱即用，见效快" },
      { title: "能力可沉淀", description: "模型、知识、智能体随业务积累" },
      { title: "治理可控", description: "权限、数据、算力统一管理" },
    ],
    values: [
      { title: "降低落地门槛", description: "深度与快速按需选择" },
      { title: "缩短上线周期", description: "成熟产品拿来即用" },
      { title: "安全合规可控", description: "平台治理与独立部署兼顾" },
    ],
    demo: {
      title: "元启 · 能力演示",
      messages: [
        "企业想快速上一个合同审查应用，怎么开始？",
        "正在匹配可用的应用与能力……",
        "可直接使用行业应用中心的合同智能审查，开箱即用；后续可在元启平台沉淀为专属能力。快速使用 · 深度建设双路径",
      ],
    },
    reason: ["模型", "知识", "智能体", "应用", "治理"],
    workflow: ["明确需求", "选路径", "落地使用", "沉淀复用"],
    outcomes: [
      { title: "降低门槛", description: "深度与快速按需选择" },
      { title: "提效明显", description: "成熟产品开箱即用" },
      { title: "安全可控", description: "治理与独立部署兼顾" },
    ],
    scenesLead:
      "覆盖企业深度建设、单点快速落地、平台与独立产品组合使用等场景。",
    scenes: [
      {
        title: "企业深度建设 AI 能力",
        description: "需要长期沉淀模型、知识与应用。",
        action: { label: "了解智能体中心 →", href: "/product/agents" },
      },
      {
        title: "单点需求快速落地",
        description: "合同审查、智能写作等拿来即用。",
        action: {
          label: "了解行业应用中心 →",
          href: "/product/applications",
        },
      },
      {
        title: "独立产品单独使用",
        description: "码多多 2.0、AIPPT、AISHREK 独立部署。",
        action: { label: "查看独立产品中心 →", href: "/product/standalone" },
      },
    ],
  },
  cta: {
    title: "从你的目标出发，继续了解",
    description:
      "不确定从哪开始？可以先申请体验，或按业务问题查看解决方案，也可以直接下载产品资料。",
    actions: [
      { label: "申请体验", href: "/trial", variant: "primary" },
      { label: "查看解决方案", href: "/solutions" },
      { label: "查看产品资料", href: "/downloads" },
      { label: "商务咨询", href: "/contact" },
    ],
  },
} as const;

export const standaloneCenter = {
  hero: {
    eyebrow: "产品｜独立产品中心",
    title: "独立产品中心：成熟企业级 AI 产品，开箱即用",
    lead: "独立于元启平台、可单独部署与购买的企业级 AI 产品矩阵。每个产品面向一个明确的业务场景，当前覆盖智能编程、演示文稿与机械设计，后续将持续扩展。",
    tags: ["码多多 2.0", "AIPPT", "AISHREK"],
    actions: [
      { label: "申请体验", href: "/trial", variant: "primary" },
      { label: "商务咨询", href: "/contact?topic=独立产品咨询" },
    ],
  },
  products: [
    {
      slug: "code-agent",
      recommended: "优先推荐",
      tag: "企业级智能编程平台",
      title: "码多多 2.0",
      description:
        "面向研发团队的智能编程平台，提供代码补全、生成、重构与解释等能力，让开发人员把精力留给更有价值的设计与业务。",
      benefits: [
        "智能代码补全与生成",
        "多语言、多 IDE 支持",
        "企业级安全与权限管控",
      ],
      action: { label: "查看码多多 2.0 →", href: "/product/code-agent" },
    },
    {
      slug: "aippt",
      tag: "智能演示文稿",
      title: "AIPPT",
      description:
        "面向办公人群的智能演示文稿生成平台，输入主题或大纲，自动生成结构完整、风格统一的演示文稿。",
      benefits: [
        "一句话生成演示文稿",
        "大纲与版式智能规划",
        "多风格模板与导出",
      ],
      action: { label: "查看 AIPPT →", href: "/product/aippt" },
    },
    {
      slug: "aishrek",
      tag: "AI 机械设计",
      title: "AISHREK",
      description:
        "面向机械设计场景的 AI 建模工作台，多格式导入、对话改参、联动检查与仿真出图，让零件设计与改型高效交付。",
      benefits: [
        "多格式导入与自动解读",
        "对话式参数修改",
        "联动检查与仿真出图",
      ],
      action: { label: "查看 AISHREK →", href: "/product/aishrek" },
    },
  ],
  comparison: {
    eyebrow: "02｜怎么选",
    title: "按你的岗位与目标选择产品",
    columns: ["产品", "给谁用", "解决什么问题", "典型形态"],
    rows: [
      [
        "码多多 2.0",
        "研发团队、程序员",
        "编码效率低、重复代码多、上手新框架成本高",
        "IDE 插件 / 编程平台",
      ],
      [
        "AIPPT",
        "市场、售前、管理者",
        "演示文稿制作耗时、风格不统一、表达不专业",
        "Web 应用 / 插件",
      ],
      [
        "AISHREK",
        "机械设计、工艺与研发团队",
        "设计文件格式多样难解析、参数修改依赖专业软件、验证交付链路割裂",
        "平台 / 服务化接口",
      ],
    ],
    note: "产品详情、功能清单与交付形态以正式产品资料与商务沟通为准；如需了解能力细节或申请试用，可直接商务咨询。",
  },
  relations: {
    eyebrow: "03｜与元启平台的关系",
    title: "既可独立使用，也可与元启平台组合",
    lead: "独立产品是「拿来即用」的成熟能力，元启平台是「按需构建」的开发底座，二者可以灵活组合。",
    items: [
      {
        title: "独立部署、独立使用",
        description:
          "每个产品可单独部署与采购，不依赖元启平台，适合已有系统、希望快速引入单点 AI 能力的组织。",
        visual: "独立产品独立部署架构示意图素材槽位",
      },
      {
        title: "与元启组合、能力互通",
        description:
          "码多多 2.0 可与元启编程中心能力互补；AIPPT、AISHREK 可作为智能体与行业应用的能力组件，共同服务业务。",
        visual: "独立产品与元启平台组合关系图素材槽位",
        action: {
          label: "了解编程中心（码多多 1.0）→",
          href: "/product/coding",
        },
      },
    ],
  },
  cta: {
    title: "想先试用某个独立产品？",
    description: "留下你的使用场景，华鲲团队将为你安排体验与选型沟通。",
    actions: [
      { label: "申请体验", href: "/trial", variant: "primary" },
      { label: "商务咨询", href: "/contact?topic=独立产品选型咨询" },
    ],
  },
} as const;

export const standaloneProductSlugs = [
  "code-agent",
  "aippt",
  "aishrek",
] as const;

const standaloneProducts: Record<
  (typeof standaloneProductSlugs)[number],
  StandaloneProduct
> = {
  "code-agent": {
    slug: "code-agent",
    name: "码多多 2.0",
    hero: {
      eyebrow: "独立产品中心｜码多多 2.0",
      title: "企业级的智能编码产品，代码不出域、说需求就落地",
      lead: "码多多 2.0 面向企业研发、工程交付与高密级代码资产保护场景，以自然语言驱动工程落地——描述需求，AI 理解任务、分析项目上下文、生成方案，并在本地工程中完成代码编写、修改、运行与验证。支持独立软件与 VS Code 插件双形态，私有化部署、代码资产不出域。",
      tags: ["自然语言驱动", "工程级落地", "私有化部署", "代码不出域"],
      actions: [
        { label: "立即体验", href: "/trial", variant: "primary" },
        { label: "咨询方案", href: "/contact?topic=码多多 2.0 咨询" },
      ],
      demo: {
        note: "对话式工程落地演示：说需求 → 分析项目上下文 → 生成代码 → 运行验证",
        title: "码多多 2.0 · 工程落地",
        messages: [
          "为订单模块增加支付超时自动关单处理",
          "正在分析项目上下文并生成技术方案……",
          "已生成关单逻辑与定时任务代码，并在本地工程中运行测试通过。工程：订单系统 · 已落地 3 个文件",
        ],
        visual: "此处预留真实产品截图位置",
      },
    },
    introduction: {
      eyebrow: "产品介绍",
      title: "不是又一个 AI 工具，而是企业级智能编码产品",
      lead: '码多多 2.0 不是"会写代码的聊天工具"，而是可独立部署、可软硬一体交付、可融入企业研发体系的产品。',
      items: [
        {
          title: "双形态覆盖",
          description:
            "独立软件统一管理会话与跨项目任务，适合企业级交付；VS Code 插件在熟悉的 IDE 内无缝编码，按团队习惯选择。",
          visual: "双形态界面示意（独立软件 + VS Code 插件）",
        },
        {
          title: "软硬一体交付",
          description:
            "与华鲲智算服务器、推理框架、元启平台组成一体方案，插电即用、免去复杂适配。",
          visual: "软硬一体化方案示意",
          action: {
            label: "咨询部署方案 →",
            href: "/contact?topic=码多多 2.0 部署咨询",
          },
        },
        {
          title: "融入研发体系",
          description:
            "与元启的模型管理、智能体、技能、知识库、权限与算力统一协同，纳入既有 AI 应用建设体系。",
          visual: "与元启体系关系示意",
        },
      ],
    },
    capabilities: {
      eyebrow: "能力优势",
      title: "它怎么帮企业，把 AI 编程真正落地",
      lead: "四件事，对应企业用 AI 编程最关心的四个问题。",
      items: [
        {
          tag: "能力 01",
          title: "说需求就落地",
          description:
            "描述需求，AI 理解任务目标、分析项目上下文、生成技术方案，并在本地工程中完成代码编写、修改、运行与验证，交付可运行的工程代码。",
          features: [
            {
              title: "需求直达工程",
              description: "自然语言直接转化为工程任务",
            },
            {
              title: "项目上下文理解",
              description: "结合工程结构与已有代码生成",
            },
            { title: "多文件落地", description: "源码、测试、配置同步修改" },
            {
              title: "运行验证闭环",
              description: "生成后运行测试，交付可验证",
            },
          ],
          note: "解决：AI 生成代码与工程脱节、交付不可运行。",
          visual: "演示：说需求 → 生成方案 → 落地并验证",
        },
        {
          tag: "能力 02",
          title: "从规划到执行闭环",
          description:
            "Plan 模式先做决策与规划：需求拆解、依赖检测、技术选型校验；Build 模式再落地执行：代码生成、测试运行、日志定位、补丁应用，复杂任务逻辑不乱。",
          features: [
            { title: "需求拆解", description: "复杂需求拆成可执行任务" },
            { title: "技术选型校验", description: "规划阶段校验方案可行性" },
            { title: "代码生成落地", description: "按规划逐项生成与修改" },
            {
              title: "测试修复闭环",
              description: "运行测试、定位问题、补丁修复",
            },
          ],
          note: "解决：复杂任务直接生成代码导致逻辑碎片化。",
          visual:
            "Plan · 决策与规划：需求拆解 · 依赖检测 · 技术选型校验（只读分析）→ Build · 执行与落地：代码生成 · 文件修改 · 测试运行 · 日志定位 · 补丁应用（读写执行）",
        },
        {
          tag: "能力 03",
          title: "代码资产不出域",
          description:
            "私有化部署 + 零数据留存，敏感代码不离开企业基础设施；高危命令确认、操作日志审计与回滚，代码资产全程可控。",
          features: [
            { title: "本地离线运行", description: "本地模型全流程离线处理" },
            { title: "零数据留存", description: "代码与上下文不离开受控环境" },
            { title: "高危操作确认", description: "敏感命令需用户确认" },
            {
              title: "审计与回滚",
              description: "操作日志留存，可追踪、可回滚",
            },
          ],
          note: "解决：核心代码外泄风险、操作不可追踪。",
          visual: "安全面板示意：权限、审计与零留存",
        },
        {
          tag: "能力 04",
          title: "融进研发生态",
          description:
            "把企业流程、工具接口、编码规范、业务知识封装为可复用技能；多智能体协同完成复杂任务；MCP 标准化调用企业数据库、API；本地、云端与专有模型自选。",
          features: [
            { title: "技能封装", description: "流程、工具、知识封装为技能" },
            { title: "多智能体协同", description: "复杂任务分工协作完成" },
            { title: "MCP 生态", description: "标准化调用企业系统与 API" },
            { title: "多模型自选", description: "本地 / 云端 / 专有模型切换" },
          ],
          note: "解决：孤立工具无法融入企业研发与业务体系。",
          visual: "研发生态示意：技能、多智能体、MCP、多模型",
        },
      ],
    },
    security: {
      title: "安全与部署保障，高密级代码资产也能放心用",
      description:
        "面向金融、政务、医疗等高安全行业，提供全链路私有化部署与代码资产保护。",
      action: {
        label: "咨询部署方案 →",
        href: "/contact?topic=码多多 2.0 部署咨询",
      },
      items: [
        {
          title: "全链路私有化部署",
          description: "内网或离线环境运行，数据始终在企业可控范围",
        },
        {
          title: "零数据留存",
          description: "敏感代码与上下文不离开本地基础设施",
        },
        {
          title: "细粒度权限与审计",
          description: "高危命令确认、操作日志留存可回滚",
        },
        {
          title: "软硬一体交付",
          description: "智算服务器 + 推理框架插电即用",
        },
      ],
    },
    experience: {
      eyebrow: "对话式工程落地演示",
      title: "说需求 → 分析项目上下文 → 生成代码 → 运行验证",
      lead: "描述需求，AI 理解任务目标、分析项目上下文、生成技术方案，并在本地工程中完成代码编写、修改、运行与验证，交付可运行的工程代码。",
      flow: ["说需求", "分析项目上下文", "生成代码", "运行验证"],
      visual: "此处预留真实产品截图位置",
    },
    business: {
      eyebrow: "业务场景",
      title: "让企业 AI 编程，从能用变成好用",
      lead: "说需求就落地、规划执行闭环、代码不出域、融入研发生态——把 AI 编程真正用起来。",
      points: [
        { title: "说需求就落地", description: "自然语言直达工程级代码" },
        {
          title: "规划执行闭环",
          description: "Plan/Build 双模式，复杂任务不乱",
        },
        { title: "代码不出域", description: "私有化部署，资产安全可控" },
        { title: "融入研发生态", description: "技能、多智能体、MCP、多模型" },
      ],
      values: [
        { title: "开发更快", description: "从需求到可运行结果，缩短周期" },
        { title: "交付更稳", description: "工程级落地，代码可运行可验证" },
        { title: "用得更放心", description: "代码不出域，满足合规要求" },
      ],
      demo: {
        title: "码多多 2.0 · 能力演示",
        messages: [
          "为订单模块设计状态机并生成代码",
          "Plan：正在生成设计方案……",
          "方案已生成：待支付→已支付→已发货→已完成，含异常回退。方案确认后进入 Build",
          "按方案生成代码并跑通测试",
          "已生成代码与单元测试，运行通过。Build：已落地 3 个文件",
        ],
        note: "需求 → 规划 → 生成 → 落地验证",
      },
      reason: ["自然语言理解", "项目上下文关联", "工程级执行", "安全可控"],
      workflow: ["描述需求", "生成方案", "落地执行", "验证交付"],
      outcomes: [
        { title: "研发提效", description: "需求到落地，缩短开发交付周期" },
        { title: "质量更稳", description: "工程级生成，代码可运行可验证" },
        { title: "安全合规", description: "代码不出域，满足高密级要求" },
      ],
      scenesLead: "面向企业研发、工程交付与高密级代码资产保护等场景。",
      scenes: [
        {
          title: "企业研发团队",
          description:
            "多业务系统并行开发，需要统一的 AI 编程能力与代码资产管理。",
          action: { label: "了解编程中心 →", href: "/product/coding" },
        },
        {
          title: "工程交付团队",
          description: "多客户项目交付，需要快速理解工程、高质量交付代码。",
          action: {
            label: "了解项目工程能力 →",
            href: "/product/coding-project",
          },
        },
        {
          title: "高密级代码资产企业",
          description: "金融、政务、医疗等对代码安全与合规有严格要求的组织。",
          action: {
            label: "咨询部署方案 →",
            href: "/contact?topic=码多多 2.0 私有化部署咨询",
          },
        },
      ],
    },
    cta: {
      title: "开启企业级 AI 编程体验",
      description: "立即体验码多多 2.0，或与华鲲团队沟通企业级部署方案。",
      actions: [
        { label: "立即体验码多多 2.0", href: "/trial", variant: "primary" },
        { label: "咨询产品方案", href: "/contact?topic=码多多 2.0 咨询" },
        { label: "对比码多多 1.0", href: "/product/coding" },
      ],
    },
  },
  aippt: {
    slug: "aippt",
    name: "AIPPT",
    hero: {
      eyebrow: "独立产品中心｜AIPPT",
      title: "一站式智能演示文稿创作平台，需求直达、分钟级成稿",
      lead: "AIPPT（Aurora）面向办公场景：输入创作需求或上传参考资料，AI 自动梳理内容逻辑、规划页面结构、匹配版式并生成内容，全程无需手动整理素材。让一份「能直接讲」的演示文稿分钟级完成，支持随时自定义修改与多格式导出。",
      tags: ["一句话生成", "参考资料驱动", "三种生成模式", "多格式导出"],
      actions: [
        { label: "立即体验", href: "/trial", variant: "primary" },
        { label: "咨询方案", href: "/contact?topic=AIPPT 咨询" },
      ],
      demo: {
        note: "Aurora 创作台：输入需求 / 上传资料 → 分析整理 → 生成大纲与页面 → 预览导出",
        title: "AIPPT · Aurora 创作台",
        messages: [
          "根据这份资料，生成一份完整的汇报 PPT",
          "正在分析参考来源，提炼内容脉络与页面要点……",
          "已生成 12 页汇报 PPT：背景与目标 → 进展与亮点 → 问题与风险 → 下一步计划。参考来源：3 个资料文件",
        ],
        visual: "此处预留真实产品截图位置",
      },
    },
    introduction: {
      eyebrow: "产品介绍",
      title: "从模板套用到智能创作，覆盖内容、结构与版式的完整链路",
      lead: "AIPPT 完成的不只是「套模板」，而是从内容梳理到版式生成的一整套创作过程。",
      items: [
        {
          title: "一站式创作台",
          description:
            "输入创作需求或上传资料，自动完成内容逻辑、页面结构与版式排版，全程无需手动整理素材。",
          visual: "Aurora 创作台整体界面示意（输入区 + 模式选择 + 生成预览）",
        },
        {
          title: "参考资料驱动",
          description:
            "支持 PDF、Word、PPT、Excel 与图片，基于已选资料生成内容，页面要点有据可依、贴合原始材料。",
          visual: "资料上传与参考来源界面示意",
        },
        {
          title: "三种生成模式",
          description:
            "快速 / 标准 / 深度三种模式，覆盖「快速出结果」到「深入报告」，并支持生成篇幅长中短设置。",
          visual: "生成模式与篇幅设置界面示意",
        },
      ],
    },
    capabilities: {
      eyebrow: "能力优势",
      title: "四大核心能力，覆盖演示文稿创作全链路",
      lead: "四个能力，覆盖从输入到交付的完整创作链路。",
      items: [
        {
          tag: "能力 01",
          title: "一句话生成",
          description:
            "输入主题或创作需求，AI 自动规划演示文稿大纲、组织章节结构并生成完整页面内容。",
          features: [
            {
              title: "需求直达结构",
              description: "一句话需求，直接产出页面大纲与章节顺序",
            },
            {
              title: "内容辅助填充",
              description: "基于主题生成观点、数据表述与总结页",
            },
            {
              title: "页面自动排版",
              description: "内容、要点自动落位，版式统一",
            },
          ],
          visual:
            "主题输入与大纲生成界面示意（对话式输入 → 章节结构 → 页面要点）",
        },
        {
          tag: "能力 02",
          title: "参考资料驱动",
          description:
            "上传 PDF、Word、PPT、Excel 或图片资料，AI 分析参考来源，提炼内容脉络与页面要点，让生成内容贴合原始材料。",
          features: [
            {
              title: "多格式上传",
              description: "支持 PDF、Word、PPT、Excel、图片等常用资料格式",
            },
            {
              title: "内容脉络提炼",
              description: "自动梳理资料主线，生成可讲的内容框架",
            },
            {
              title: "参考来源可见",
              description: "生成内容与所选资料对应，来源清晰可查",
            },
          ],
          visual: "资料上传与参考来源界面示意（上传区 + 已选资料 + 来源标注）",
        },
        {
          tag: "能力 03",
          title: "三种生成模式",
          description:
            "快速 / 标准 / 深度三种模式按场景选择，并支持生成篇幅（长 / 中 / 短）设置，兼顾效率与深度。",
          features: [
            {
              title: "快速模式",
              description: "非常适合快速获得结果，效率优先",
            },
            { title: "标准模式", description: "均衡内容深度与生成速度" },
            { title: "深度模式", description: "获得深入报告与完整内容" },
            {
              title: "篇幅可调",
              description: "长 / 中 / 短篇幅按演示场景设定",
            },
          ],
          visual: "生成模式与篇幅设置界面示意（快速 / 标准 / 深度 + 长中短）",
        },
        {
          tag: "能力 04",
          title: "灵活编辑与多格式交付",
          description:
            "生成后可随时自定义修改、保存生成记录，支持新窗口预览、下载与分享，让成稿在办公环境中继续使用。",
          features: [
            {
              title: "在线自定义修改",
              description: "页面内容、结构与版式按需调整",
            },
            {
              title: "生成记录管理",
              description: "历史生成保存、重命名与复用",
            },
            {
              title: "多格式导出",
              description: "下载与分享，兼容常用办公环境",
            },
          ],
          visual: "生成结果预览与导出界面示意（预览区 + 下载 / 分享 / 记录）",
        },
      ],
    },
    experience: {
      eyebrow: "核心体验",
      title: "从需求到成稿，分钟级完成",
      lead: "输入一句话或上传参考资料，AI 完成内容梳理、结构规划与版式生成，成稿即所得、可预览可导出。",
      flow: ["输入需求 / 上传资料", "生成大纲与页面", "预览调整 · 导出交付"],
      visual: "AIPPT 创作台真实产品截图：需求输入 → 大纲与页面生成 → 预览导出",
    },
    business: {
      eyebrow: "业务场景",
      title: "让演示文稿创作，从耗时繁琐走向高效专业",
      lead: "一句话生成、参考直达、模式可选、多格式交付——把做 PPT 真正交给 AI。",
      points: [
        { title: "一句话生成", description: "输入需求，自动产出大纲与页面" },
        { title: "参考资料直达", description: "上传资料，内容有据可依" },
        { title: "模式场景可选", description: "快速 / 标准 / 深度，按需匹配" },
        { title: "成稿即用", description: "版式统一，可直接演示与导出" },
      ],
      values: [
        { title: "制作更快", description: "从构思到成稿，分钟级完成" },
        { title: "结构更清晰", description: "AI 梳理内容逻辑，页面有层次" },
        { title: "成稿更专业", description: "统一版式风格，对外形象一致" },
      ],
      demo: {
        title: "AIPPT · 能力演示",
        messages: [
          "帮我梳理这份资料的结构，并生成汇报 PPT",
          "正在提炼内容脉络与页面要点……",
          "已生成大纲：背景与目标 → 进展与亮点 → 问题与风险 → 下一步计划。参考来源：3 个文件",
          "按深度模式生成完整幻灯片",
          "已按深度模式生成 12 页演示文稿，含数据图表页与总结页，可直接预览导出。生成篇幅：中",
        ],
        note: "输入需求 / 上传资料 → 分析整理 → 生成大纲与页面 → 预览导出",
      },
      reason: [
        "需求与资料理解",
        "内容逻辑梳理",
        "页面结构规划",
        "版式与内容生成",
        "多格式交付",
      ],
      workflow: ["输入需求", "选择模式", "生成预览", "调整导出"],
      outcomes: [
        { title: "制作更快", description: "从构思到成稿，分钟级完成" },
        { title: "结构更清晰", description: "AI 梳理逻辑，页面有层次" },
        { title: "成稿更专业", description: "统一版式风格，可直接使用" },
      ],
      scenesLead: "覆盖工作汇报、市场方案、培训课件与项目总结等办公演示场景。",
      scenes: [
        {
          title: "工作汇报",
          description:
            "周报、述职、经营分析等周期性汇报，快速产出结构清晰的演示稿。",
          action: { label: "了解独立产品中心 →", href: "/product/standalone" },
        },
        {
          title: "市场与售前材料",
          description: "产品介绍、方案宣讲、投标演示，按参考资料生成专业材料。",
          action: {
            label: "咨询方案 →",
            href: "/contact?topic=AIPPT 方案咨询",
          },
        },
        {
          title: "培训与知识分享",
          description:
            "课件、培训材料、经验分享，把散落资料变成可讲的演示文稿。",
          action: { label: "申请体验 →", href: "/trial" },
        },
      ],
    },
    cta: {
      title: "开启分钟级演示文稿创作体验",
      description: "立即体验 AIPPT，或与华鲲团队沟通企业级演示文稿生成方案。",
      actions: [
        { label: "立即体验 AIPPT", href: "/trial", variant: "primary" },
        { label: "咨询产品方案", href: "/contact?topic=AIPPT 咨询" },
        { label: "查看码多多 2.0", href: "/product/code-agent" },
      ],
    },
  },
  aishrek: {
    slug: "aishrek",
    name: "AISHREK",
    hero: {
      eyebrow: "独立产品中心｜AISHREK",
      title: "AI 机械设计工作台，导入即解读、对话改参数",
      lead: "AISHREK 面向机械设计与工业制图场景：导入 STL、STEP、工程图与图片，AI 自动解读几何与参数；以自然语言描述修改需求，完成参数调整、联动检查、仿真验证与工程图输出，让零件设计与改型全程对话驱动。",
      tags: ["多格式导入", "对话改参", "CAD 联动", "仿真出图"],
      actions: [
        { label: "立即体验", href: "/trial", variant: "primary" },
        { label: "咨询方案", href: "/contact?topic=AISHREK 咨询" },
      ],
      demo: {
        note: "AISHREK 工作台：导入设计文件 → 自动几何分析 → 对话修改参数 → 验证与出图",
        title: "AISHREK · 机械设计工作台",
        messages: [
          "把轴承座四个孔的孔距改为 90mm",
          "正在解析模型几何与尺寸参数……",
          "已完成修改：孔距 80mm → 90mm，装配关系与干涉检查通过。模型：轴承座 · 已生成新版本",
        ],
        visual: "此处预留真实产品截图位置",
      },
    },
    introduction: {
      eyebrow: "产品介绍",
      title: "从 3D 查看器到 AI 建模工作台，覆盖设计修改全流程",
      lead: "AISHREK 完成的不只是模型查看，而是从文件解读到修改验证的完整设计工作。",
      items: [
        {
          title: "对话式建模",
          description:
            "以自然语言描述设计修改需求，AI 解读并执行，支持修改前后对比与版本管理。",
          visual: "对话式参数修改界面示意（修改指令 + 参数前后对照）",
        },
        {
          title: "多格式与原生联动",
          description:
            "支持 STL、STEP、工程图与图片，并可联动 SolidWorks、UG NX、CREO 原生文件。",
          visual: "多格式导入与 CAD 联动界面示意",
        },
        {
          title: "设计到交付闭环",
          description:
            "从几何分析、参数修改到联动检查、仿真验证与工程图输出，一站完成。",
          visual: "设计验证与工程图输出界面示意",
        },
      ],
    },
    capabilities: {
      eyebrow: "能力优势",
      title: "四大核心能力，覆盖设计、联动、仿真与交付全链路",
      lead: "围绕机械设计修改的完整链路，四个能力解决从输入到交付的关键问题。",
      items: [
        {
          tag: "能力 01",
          title: "多格式导入与自动解读",
          description:
            "上传 STL、STEP、PDF、工程图与图片，导入后自动进行几何分析、参数解读与装配结构识别。",
          features: [
            {
              title: "多格式支持",
              description: "STL、STEP、工程图、图片等常用设计文件",
            },
            {
              title: "自动几何分析",
              description: "导入即解读模型几何与尺寸参数",
            },
            {
              title: "装配结构识别",
              description: "识别装配体组成与零件间关系",
            },
          ],
          visual: "文件导入与自动解读界面示意（上传区 + 几何与参数解读结果）",
        },
        {
          tag: "能力 02",
          title: "对话式参数修改",
          description:
            "用自然语言描述修改需求（孔距、槽长、倒角、凸台等），AI 解析并执行，支持修改前后对比与自动版本生成。",
          features: [
            {
              title: "自然语言改参",
              description: "描述需求即可执行，无需专业操作",
            },
            { title: "修改前后对比", description: "原稿与修改结果可视对照" },
            { title: "自动版本生成", description: "每次修改形成独立历史版本" },
          ],
          visual: "对话修改界面示意（修改指令 + 参数前后对照）",
        },
        {
          tag: "能力 03",
          title: "原生 CAD 联动与工程图",
          description:
            "联动 SolidWorks、UG NX、CREO 原生文件，完成参数化修改、装配再生与干涉、尺寸链检查；支持中性格式处理与工程图输出。",
          features: [
            {
              title: "原生 CAD 联动",
              description: "SolidWorks / UG NX / CREO 参数联动",
            },
            {
              title: "干涉与尺寸链检查",
              description: "装配干涉与尺寸链自动校验",
            },
            { title: "工程图输出", description: "SVG / DXF / DWG 等图纸交付" },
          ],
          visual: "CAD 联动与工程图界面示意（联动配置 + 图纸输出）",
        },
        {
          tag: "能力 04",
          title: "仿真与设计验证",
          description:
            "结构仿真与动力学分析，输出应力、位移、运动轨迹等结果与验证报告，让设计修改经过验证再交付。",
          features: [
            { title: "结构仿真", description: "静力、模态、疲劳、热等分析" },
            { title: "动力学分析", description: "运动学与动力学结果输出" },
            { title: "验证报告", description: "设计验证结论与报告交付" },
          ],
          visual: "仿真分析界面示意（工况设置 + 结果云图）",
        },
      ],
    },
    experience: {
      eyebrow: "核心体验",
      title: "导入即解读，对话即改型",
      lead: "导入设计文件即完成几何解读；自然语言提出修改，AI 执行并验证，工程图与仿真报告一体交付。",
      flow: ["导入设计文件", "对话修改参数", "验证与交付"],
      visual: "AISHREK 工作台真实产品截图：文件导入解读 → 对话改参 → 验证出图",
    },
    business: {
      eyebrow: "业务场景",
      title: "让机械设计修改，从繁琐操作走向高效交付",
      lead: "导入即解读、对话改参、联动检查、仿真出图——把设计修改交给 AI。",
      points: [
        { title: "导入即解读", description: "文件上传后自动分析几何与参数" },
        { title: "对话改参数", description: "自然语言描述，AI 执行修改" },
        { title: "联动检查", description: "原生 CAD 联动与干涉检查" },
        { title: "仿真出图", description: "验证与工程图一体化交付" },
      ],
      values: [
        {
          title: "修改更快",
          description: "从操作命令到自然语言，缩短改型周期",
        },
        { title: "结果更准", description: "自动解析与联动检查，减少人为误差" },
        { title: "交付更全", description: "图纸、仿真报告一体化输出" },
      ],
      demo: {
        title: "AISHREK · 能力演示",
        messages: [
          "给凸台增加 2mm 倒角，并检查装配干涉",
          "正在执行参数修改与干涉检查……",
          "已增加 2mm 倒角，干涉检查通过，模型已更新。模型：工作台板 · 新版本 V2",
          "输出工程图与仿真报告",
          "工程图与结构仿真报告已生成，可下载交付。输出：SVG 工程图 · PDF 报告",
        ],
        note: "导入文件 → 自动分析 → 对话改参 → 验证导出",
      },
      reason: [
        "多格式解析",
        "几何与参数理解",
        "对话指令执行",
        "联动验证与出图",
      ],
      workflow: ["导入文件", "自动分析", "对话改参", "验证导出"],
      outcomes: [
        { title: "设计提效", description: "从导入到交付，缩短改型周期" },
        { title: "修改精准", description: "自动解读参数，减少人工误差" },
        { title: "验证闭环", description: "干涉、仿真、图纸一体完成" },
      ],
      scenesLead:
        "覆盖机械零件设计与改型、装配体联动修改、工程图与仿真交付等设计工作场景。",
      scenes: [
        {
          title: "零件设计与改型",
          description: "机械零件的参数化修改与快速出型，缩短改型周期。",
          action: {
            label: "咨询方案 →",
            href: "/contact?topic=AISHREK 方案咨询",
          },
        },
        {
          title: "装配体联动修改",
          description: "多零件装配的参数化修改、再生与干涉检查。",
          action: {
            label: "联系我们 →",
            href: "/contact?topic=AISHREK 装配体联动咨询",
          },
        },
        {
          title: "工程图与仿真交付",
          description: "从模型到工程图、仿真报告的一体化输出。",
          action: { label: "了解独立产品中心 →", href: "/product/standalone" },
        },
      ],
    },
    cta: {
      title: "开启对话式机械设计体验",
      description: "立即体验 AISHREK，或与华鲲团队沟通机械设计智能化方案。",
      actions: [
        { label: "立即体验 AISHREK", href: "/trial", variant: "primary" },
        { label: "咨询产品方案", href: "/contact?topic=AISHREK 咨询" },
        { label: "查看 AIPPT", href: "/product/aippt" },
      ],
    },
  },
};

export function getStandaloneProduct(slug: string) {
  if (!standaloneProductSlugs.includes(slug as StandaloneProduct["slug"])) {
    return undefined;
  }

  return standaloneProducts[slug as StandaloneProduct["slug"]];
}
