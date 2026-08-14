import type { PlatformImage, PlatformPage } from "./platform-page-types";

const heroActions = (topic: string) => [
  { label: "申请体验", href: "/trial", variant: "primary" as const },
  { label: "商务咨询", href: `/contact?topic=${topic}` },
];

const capabilityActions = (topic: string) => [
  { label: "申请体验", href: "/trial", variant: "primary" as const },
  { label: "联系我们", href: `/contact?topic=${topic}` },
];

const closingActions = (topic: string) => [
  {
    label: "商务咨询",
    href: `/contact?topic=${topic}`,
    variant: "primary" as const,
  },
  { label: "申请体验", href: "/trial" },
];

const image = (
  src: string,
  alt: string,
  width: number,
  height: number,
): PlatformImage => ({ src, alt, width, height });

export const v2PlatformCenters = [
  {
    slug: "model",
    name: "模型中心",
    hero: {
      title: "模型中心：覆盖模型全生命周期的企业模型工程",
      lead: "模型花园与纳管统一资产管理，数据、训练、评估持续优化，三种部署方式让模型服务上线，任务中心统一调度运行，让模型从「能用」到「更懂业务、更好用」。",
      tags: ["模型资产管理", "模型部署与服务", "模型训练", "模型评估"],
      actions: heroActions("模型中心咨询"),
      visual: {
        title: "模型中心首页",
        images: [
          image(
            "/assets/product/centers/model/hero.png",
            "模型中心首页",
            1869,
            775,
          ),
        ],
      },
    },
    sections: [
      {
        title: "模型中心：覆盖资产、优化、部署与调度的模型工程闭环",
        lead: "模型中心围绕企业最关心的「有哪些模型、模型怎么运行、模型怎么变强」组织能力——统一管理模型资产，按需训练与评估优化，多方式部署上线，并通过任务中心统一调度运行资源，形成完整闭环。",
        cards: [
          {
            title: "资产与运行 · 看得见、用得上",
            description:
              "模型花园集中选型、模型纳管统一接入，训练、评估、部署从同一处取用模型；三种部署方式覆盖平台内、企业专网与云厂商环境，让模型快速成为可调用的服务。",
            tags: ["模型花园", "模型纳管", "定制部署", "专网部署", "云端部署"],
          },
          {
            title: "优化与验证 · 越用越懂业务",
            description:
              "数据工厂备数据、三种训练方式让模型学会企业知识、自动与人工评测验证效果，让模型持续优化、效果有据可依。",
            tags: ["数据工厂", "LoRA 微调", "全参训练", "蒸馏训练", "自动评测"],
          },
        ],
        tags: ["资产统一管理", "部署调度一体", "训练持续优化", "效果量化验证"],
      },
    ],
    capabilities: [
      {
        id: "model-assets",
        title: "模型资产管理：企业模型资产一条线管到底",
        lead: "模型花园负责选型、模型纳管负责接入，训练、评估、部署从同一处取用模型，把企业散落的模型资产收成一条清晰的主线。",
        steps: [
          {
            title: "模型花园",
            description:
              "集中浏览平台支持纳管与定制部署的模型范围，查看支持框架、入长出长等部署约束，选型有依据。",
            tags: ["模型花园", "分类浏览", "部署约束可查"],
          },
          {
            title: "模型纳管",
            description:
              "本地模型支持云端下载与离线导入，按厂商、类型、来源与状态分类，统一纳入资产台账。",
            tags: ["云端下载", "离线导入", "分类管理"],
          },
          {
            title: "训推联动",
            description:
              "纳管后的模型从同一处进入训练与推理流程，资产看得见、选得准、用得上。",
            tags: ["训练取用", "推理取用", "统一调度"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/model/assets.png",
            "模型资产管理界面",
            1889,
            771,
          ),
        ],
        note: "资产主线：模型花园（选型）→ 模型纳管（接入）→ 统一取用（训练 / 评估 / 部署）。",
        actions: capabilityActions("模型资产管理咨询"),
      },
      {
        id: "model-deploy",
        title: "模型部署与服务：任务中心统一调度，模型服务一站上线",
        lead: "按模型来源与运行环境选择部署方式，通过任务中心统一调度算力资源，模型即可被智能体与业务应用调用。",
        steps: [
          {
            title: "多种接入方式",
            description:
              "定制部署面向平台内模型服务化；专网部署满足数据不出域；云端部署连接云厂商在线模型。",
            tags: ["定制部署", "专网部署", "云端部署"],
          },
          {
            title: "统一调度",
            description:
              "通过任务中心创建推理任务，配置运行资源，平台将任务调度到匹配的节点或集群执行，排队、运行、完成状态实时可见。",
            tags: ["推理任务", "算力调度", "状态实时可见"],
          },
          {
            title: "任务监控",
            description:
              "可视化监控推理任务运行状态与算力资源，覆盖 CPU、内存、磁盘、网络与 AI 卡，实时掌握任务进展、及时处置异常。",
            tags: [
              "运行状态",
              "算力资源",
              "CPU / 内存 / 磁盘 / 网络",
              "AI 卡监控",
            ],
          },
        ],
        images: [
          image(
            "/assets/product/centers/model/deploy.png",
            "模型部署与服务界面",
            1920,
            879,
          ),
        ],
        note: "部署链路：选择部署方式 → 任务中心创建推理任务并调度 → 服务上线调用。",
        actions: capabilityActions("模型部署咨询"),
      },
      {
        id: "model-training",
        title: "模型训练：数据集纳管，三种方式灵活调优",
        lead: "数据集统一纳管，按投入与效果选择 LoRA 微调、全参训练或蒸馏训练，让通用模型更懂企业业务。",
        steps: [
          {
            title: "数据集纳管",
            description:
              "通过数据工厂统一管理训练、评测与蒸馏数据集，支持上传、查看、下载与发布，为训练提供高质量数据。",
            tags: ["数据工厂", "训练数据", "评测数据", "蒸馏数据"],
          },
          {
            title: "三种训练方式",
            description:
              "LoRA 微调轻量快速、全参训练深度定制、蒸馏训练轻量落地，按业务要求与投入梯度灵活选择。",
            tags: ["LoRA 微调", "全参训练", "蒸馏训练"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/model/training.png",
            "LoRA 微调训练过程",
            1266,
            700,
          ),
        ],
        note: "训练链路：数据集准备 → 选择训练方式 → 执行训练 → 评估验证 → 发布部署。",
        actions: capabilityActions("模型训练咨询"),
      },
      {
        id: "model-evaluation",
        title: "模型评估：自动与人工双通道，量化模型效果",
        lead: "通过自动评测与人工评测双通道验证模型效果，形成可量化、可对比的结论，为选型、优化与上线提供依据。",
        steps: [
          {
            title: "自动评测",
            description:
              "内置评测方法自动评分，支持批量验证、多模型对比与持续回归，快速生成量化报告，评测口径统一。",
            tags: ["批量评测", "多模型对比", "量化报告", "口径统一"],
          },
          {
            title: "人工评测",
            description:
              "按业务口径人工标注与逐条评估，关注回答质量与业务贴合度，适合高要求场景，评测结论可追溯。",
            tags: ["业务口径", "逐条评估", "质量把关", "结论可追溯"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/model/evaluation.png",
            "自动评测得分详情",
            1267,
            673,
          ),
        ],
        note: "评估链路：选择评测方式 → 创建评测任务 → 输出评测结论。",
        actions: capabilityActions("模型评估咨询"),
      },
    ],
    cta: {
      title: "需要构建企业级模型工程能力？",
      description:
        "面向模型资产管理、训练优化、评估验证与部署调度需求，欢迎与华鲲团队沟通并申请试用。",
      actions: closingActions("模型中心咨询"),
    },
  },
  {
    slug: "agents",
    name: "智能体中心",
    hero: {
      title: "智能体中心：零代码快速搭建，低代码灵活编排",
      lead: "预置知识、数据、视频与流程编排四类智能体，常规场景零代码快速搭建、即配即用，复杂业务低代码流程编排，构建可对话、可发布、可复用的企业 AI 智能体。",
      tags: ["企业知识助手", "智能问数助手", "视频理解助手", "流程自动化引擎"],
      actions: heroActions("智能体中心咨询"),
      visual: {
        title: "智能体中心架构图",
        images: [
          image(
            "/assets/product/centers/agents/hero.png",
            "智能体中心架构图",
            1600,
            900,
          ),
        ],
      },
    },
    sections: [
      {
        title: "智能体中心：零代码快速搭建，低代码灵活编排",
        lead: "面向智能体应用的统一构建与运营入口：常规场景零代码快速搭建、即配即用，复杂业务低代码流程编排，构建可对话、可发布、可复用的 AI 智能体。",
        cards: [
          {
            title: "常规场景 · 零代码快速搭建",
            description:
              "预置知识、数据、视频类智能体零代码构建模板，关联企业知识库、数据源或视频资源，即可完成智能体的创建、调试与发布，快速响应业务需求。",
            tags: ["知识问答", "数据问答", "视频检索"],
          },
          {
            title: "复杂场景 · 低代码流程编排",
            description:
              "提供低代码、拖拉拽式的流程编排：支持 Chatflow 复杂多轮对话工作流、Workflow 单轮自动化任务编排，以及 AI 创建——以自然语言描述需求，自动生成流程编排，降低技术门槛与开发复杂度、缩短交付周期。",
            tags: ["Chatflow", "Workflow", "AI 创建"],
          },
        ],
        tags: [
          "对话直接使用",
          "应用广场发布",
          "外部接口调用",
          "联合智能体协同",
        ],
      },
    ],
    capabilities: [
      {
        id: "agent-knowledge",
        title:
          "知识智能体：将企业文档、制度与经验沉淀为可问答、可溯源的知识服务",
        lead: "面向企业制度、产品资料与技术文档等知识内容，支持自然语言问答，回答结果可溯源至企业知识原文。",
        steps: [
          {
            title: "知识增强",
            description:
              "上传企业文档，自动解析、分片与向量化，结合标注、标签与知识图谱沉淀可检索、可溯源的企业知识资产。",
            tags: ["文档接入", "自动分片", "知识图谱", "标注与标签"],
          },
          {
            title: "快速搭建",
            description:
              "基于零代码模板快速构建知识问答智能体，关联企业知识库即配即用。",
            tags: ["零代码搭建", "知识库关联", "即配即用"],
          },
          {
            title: "多端复用",
            description:
              "支持对话直接使用、应用广场发布与接口调用，一次构建、多处复用。",
            tags: ["对话使用", "应用发布", "接口调用"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/agents/knowledge.jpg",
            "知识智能体问答界面",
            1265,
            704,
          ),
        ],
        note: "应用示例：基于企业知识库回答差旅报销标准等问题，并附制度原文引用。",
        actions: capabilityActions("知识智能体咨询"),
      },
      {
        id: "agent-data",
        title: "数据智能体：以自然语言问数，无需编写 SQL 即可获取数据结果",
        lead: "支持以自然语言提出数据查询需求，系统自动生成数据查询并返回结果；查询范围受数据权限约束，指标口径统一、结果可信。",
        steps: [
          {
            title: "数据增强",
            description:
              "接入企业数据库与数据源，统一业务指标口径，为数据问数提供规范、可信的数据基础。",
            tags: ["数据源接入", "数据同步", "指标口径", "数据权限"],
          },
          {
            title: "智能问数",
            description:
              "以自然语言提出查询需求，自动生成数据查询，结果以表格或图表呈现。",
            tags: ["自然语言问数", "自动查询", "图表呈现"],
          },
          {
            title: "可信可控",
            description: "查询范围受数据权限约束，指标口径统一、结果可追溯。",
            tags: ["数据权限", "口径统一", "结果可追溯"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/agents/data-1.png",
            "数据智能体问数界面 1",
            1920,
            879,
          ),
          image(
            "/assets/product/centers/agents/data-2.png",
            "数据智能体问数界面 2",
            1920,
            879,
          ),
        ],
        note: "应用示例：输入「查询上年度销售额最高的区域」，系统自动生成查询并返回结果及指标口径说明。",
        actions: capabilityActions("数据智能体咨询"),
      },
      {
        id: "agent-video",
        title: "视频智能体：提供视频内容理解、即时检索与实时预警能力",
        lead: "支持离线视频检索与摄像头实时分析，提供视频内容理解、即时检索与异常预警能力。",
        steps: [
          {
            title: "文生算法",
            description:
              "以自然语言描述识别需求，自动匹配视频分析算法，理解视频内容。",
            tags: ["自然语言", "算法匹配", "内容理解"],
          },
          {
            title: "在线检索",
            description: "摄像头实时分析，监控画面即时检索与异常预警。",
            tags: ["实时分析", "即时检索", "异常预警"],
          },
          {
            title: "离线检索",
            description: "历史视频即时检索，快速定位目标内容。",
            tags: ["离线视频", "历史检索", "内容定位"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/agents/video.jpg",
            "视频智能体检索与实时预警界面",
            1267,
            669,
          ),
        ],
        note: "应用示例：离线视频可检索、在线视频可实时分析，异常事件即时预警并形成处置闭环。",
        actions: capabilityActions("视频智能体咨询"),
      },
      {
        id: "agent-orchestration",
        title: "流程编排智能体：低代码灵活编排复杂业务",
        lead: "面向复杂业务场景，低代码、拖拉拽灵活编排，支持 Chatflow、Workflow 与 AI 创建，按需快速落地。",
        steps: [
          {
            title: "可视化编排",
            description:
              "低代码、拖拉拽编排流程节点，支持 Chatflow 多轮对话工作流与 Workflow 自动化任务。",
            tags: ["低代码编排", "拖拉拽", "Chatflow", "Workflow"],
          },
          {
            title: "AI 创建",
            description:
              "以自然语言描述需求，AI 自动生成流程编排，无需手动配置。",
            tags: ["自然语言", "AI 生成", "自动编排"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/agents/orchestration-1.png",
            "流程编排智能体界面 1",
            1918,
            811,
          ),
          image(
            "/assets/product/centers/agents/orchestration-2.png",
            "流程编排智能体界面 2",
            1920,
            825,
          ),
          image(
            "/assets/product/centers/agents/orchestration-3.png",
            "流程编排智能体界面 3",
            1920,
            879,
          ),
        ],
        note: "应用示例：合同审查流程自动执行，覆盖条款识别、风险分析、报告生成与结果通知等环节。",
        actions: capabilityActions("流程编排智能体咨询"),
      },
    ],
    cta: {
      title: "需要建设企业专属智能体？",
      description:
        "面向企业知识问答、数据问数、视频理解与流程自动化等建设需求，欢迎与华鲲团队沟通并申请试用。",
      actions: closingActions("智能体中心咨询"),
    },
  },
  {
    slug: "applications",
    name: "行业应用中心",
    hero: {
      title: "行业应用中心：高频业务场景，成熟应用开箱即用",
      lead: "面向高频业务场景打磨成熟的 AI 应用，无需从零搭建模型、知识库与工作流，直接上手使用、快速验证价值。",
      tags: ["通用文本写作", "投标智能助手", "合同智能审查"],
      actions: heroActions("行业应用中心咨询"),
    },
    sections: [
      {
        title: "行业应用中心：成熟应用开箱即用，底层能力随需扩展",
        lead: "行业应用中心面向高频业务场景，将打磨成熟的 AI 应用直接提供给业务使用：无需从零搭建模型、知识库与工作流，开箱即用、快速验证价值；需要深化建设时，可基于平台底层能力持续扩展。",
        cards: [
          {
            title: "成熟应用 · 开箱即用",
            description:
              "围绕公文写作、投标、合同审查等高频办公与业务场景打磨成熟，直接上手使用、快速验证应用价值；更多应用按已确认材料持续上架。",
            tags: ["通用文本写作", "投标智能助手", "合同智能审查"],
          },
          {
            title: "能力支撑 · 随需扩展",
            description:
              "应用建立在平台模型、知识与智能体等成熟能力之上，无需重复搭建；先通过应用跑通业务，需要深化建设时，底层能力可随时扩展与组合。",
            tags: ["模型", "知识", "智能体"],
          },
        ],
        tags: ["开箱即用", "项目化组织任务", "结果可追溯", "按需深化建设"],
      },
    ],
    capabilities: [
      {
        id: "app-writing",
        title: "智能写作：通用写作与公文写作",
        lead: "面向文案、汇报、方案与公文等写作场景，输入主题即可生成提纲、分步成稿，覆盖撰写、润色与定稿全流程。",
        steps: [
          {
            title: "通用写作",
            description:
              "面向文案、汇报、方案等通用文体，一句话起稿、分步成稿、润色定稿。",
            tags: ["文案", "汇报", "方案", "润色定稿"],
          },
          {
            title: "公文写作",
            description:
              "符合公文格式与行文规范，自动生成规范、正式的公文稿件。",
            tags: ["公文格式", "行文规范", "正式稿件"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/applications/writing.jpg",
            "通用文本写作界面",
            3840,
            2204,
          ),
        ],
        note: "应用示例：输入写作要求，AI 生成提纲与初稿，用户负责把关与定稿。",
        actions: capabilityActions("通用文本写作咨询"),
      },
      {
        id: "app-bidding",
        title: "投标智能助手：从读标书到封装，投标全流程提效",
        lead: "面向投标文件编写与标书要点整理场景，AI 完成标书解读、要点拆解、大纲与全文撰写，让投标团队更专注方案本身。",
        steps: [
          {
            title: "技术标撰写",
            description:
              "对标技术需求与评分点，分章撰写技术方案正文，方向不偏。",
            tags: ["技术方案", "对标评分", "分章撰写"],
          },
          {
            title: "商务标",
            description: "生成商务报价与资质响应材料，符合招标要求。",
            tags: ["商务报价", "资质材料", "商务响应"],
          },
          {
            title: "标书审查",
            description:
              "识别风险、遗漏与得分点，格式校验与查漏核对，成果可交付。",
            tags: ["风险识别", "查漏核对", "格式校验"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/applications/bidding.jpg",
            "投标智能助手界面",
            3840,
            2204,
          ),
        ],
        note: "应用示例：上传一份标书，AI 完成解读、拆点、列纲、成稿与查漏。",
        actions: capabilityActions("投标智能助手咨询"),
      },
      {
        id: "app-contract",
        title: "合同智能审查：预制风险库，条款逐条核对",
        lead: "基于预制审查风险库，对合同条款逐条核对并自动标注风险，审核人聚焦复核定案。",
        steps: [
          {
            title: "预制风险库",
            description: "内置企业审查风险库与审查规则，明确审查口径与立场。",
            tags: ["预制风险库", "审查规则", "审查口径"],
          },
          {
            title: "逐条审查",
            description:
              "按风险库逐条核对条款，自动识别并分级标注风险，条款精准定位。",
            tags: ["逐条核对", "风险分级", "条款定位"],
          },
          {
            title: "风险审阅",
            description:
              "风险分级呈现、逐条审阅，复核闭环，结论可对比、可交付。",
            tags: ["风险审阅", "复核闭环", "结论可交付"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/applications/contract.jpg",
            "合同智能审查界面",
            3840,
            2204,
          ),
        ],
        note: "应用示例：上传合同并指定审查清单与立场，AI 完成条款核对与风险标注，人工复核定案。",
        actions: capabilityActions("合同智能审查咨询"),
      },
    ],
    cta: {
      title: "需要引入业务 AI 应用？",
      description:
        "面向通用文本写作、投标与合同审查等高频业务场景，欢迎与华鲲团队沟通并申请试用。",
      actions: closingActions("行业应用中心咨询"),
    },
  },
  {
    slug: "skills",
    name: "技能中心",
    hero: {
      title: "技能中心：专业能力标准封装，统一管理、随取随用",
      lead: "技能中心面向编程、应用与办公场景，将专业能力沉淀为标准化的可复用技能，通过技能货架统一发布与管理、按需安装与调用，随取随用。",
      tags: ["研发类技能", "应用类技能", "办公类技能"],
      actions: heroActions("技能中心咨询"),
      visual: {
        title: "技能中心首页",
        images: [
          image(
            "/assets/product/centers/skills/hero.png",
            "技能中心首页",
            1725,
            875,
          ),
        ],
      },
    },
    sections: [
      {
        title: "技能中心：能力标准化封装，随取随用",
        lead: "技能中心把编程、应用与办公场景的专业能力封装为标准化的技能包，通过技能货架统一发布与管理、按需安装与调用，能力标准化、随取随用。",
        cards: [
          {
            title: "技能是什么 · 标准化能力组件",
            description:
              "一项技能即一项可复用的业务能力，涵盖模型评测、工作流生成、视频分析、安全防护与会议提效等场景，封装为标准技能包统一管理、随取随用。",
            tags: ["标准封装", "统一管理", "版本可控"],
          },
          {
            title: "技能怎么用 · 获取到落地一条链",
            description:
              "从技能货架搜索并安装所需技能，配置后即可对话式调用；企业流程与经验亦可沉淀为新技能，持续复用。",
            tags: ["技能货架", "一键安装", "对话调用", "组装复用"],
          },
        ],
        tags: ["技能获取", "配置接入", "投入使用", "持续沉淀"],
      },
    ],
    capabilities: [
      {
        id: "skill-programming",
        title: "研发类技能：研发与工程提效",
        lead: "面向研发与工程团队，将模型评测、工作流生成与 AI 系统知识等专业能力封装为可对话调用的技能，让选型有据、搭建提速、知识成体系。",
        steps: [
          {
            title: "研发模型工具调用评测",
            description: "批量评测大模型工具调用能力，输出量化对比与选型建议。",
            tags: ["模型评测", "量化对比", "选型建议"],
          },
          {
            title: "Dify 工作流生成",
            description:
              "以自然语言描述需求，自动生成可导入 Dify 的工作流配置。",
            tags: ["工作流生成", "需求直达", "DSL 生成"],
          },
          {
            title: "AI 研发系统知识解答",
            description: "系统化解答 AI 硬件、框架与部署问题，覆盖选型与排障。",
            tags: ["系统知识", "架构选型", "工程排障"],
          },
        ],
        actions: capabilityActions("研发类技能咨询"),
      },
      {
        id: "skill-application",
        title: "应用类技能：业务应用更自动、更安全",
        lead: "面向业务应用场景，将视频解析布控与智能体安全防护等能力封装为可直接使用的技能，让业务应用更自动、更可靠、更安全。",
        steps: [
          {
            title: "视频解析布控应用",
            description:
              "以自然语言创建视频布控任务，自动匹配算法并输出结构化预警。",
            tags: ["视频布控", "算法匹配", "结构化预警"],
          },
          {
            title: "AI 应用安全防护",
            description:
              "对智能体开展安全体检，危险动作实时拦截、风险全程可审计。",
            tags: ["安全体检", "风险拦截", "全程审计"],
          },
        ],
        actions: capabilityActions("应用类技能咨询"),
      },
      {
        id: "skill-office",
        title: "办公类技能：日常办公与技能运营提效",
        lead: "面向日常办公与技能运营场景，将会议纪要生成、技能包入门等能力封装为开箱即用的技能，让会议提效、让技能上手更顺。",
        steps: [
          {
            title: "办公会议纪要生成",
            description:
              "上传会议录音、录像或文件，自动生成结构化纪要与任务清单。",
            tags: ["纪要生成", "任务清单", "自动转写"],
          },
          {
            title: "技能运营入门示例",
            description: "演示技能包结构、发布与安装流程，快速上手技能运营。",
            tags: ["技能包结构", "发布安装", "快速入门"],
          },
        ],
        actions: capabilityActions("办公类技能咨询"),
      },
    ],
    cta: {
      title: "需要沉淀可复用的业务技能？",
      description:
        "面向编程、应用与办公场景的技能建设与复用需求，欢迎与华鲲团队沟通并申请试用。",
      actions: closingActions("技能中心咨询"),
    },
  },
  {
    slug: "coding",
    name: "编程中心",
    hero: {
      title: "码多多：自然语言驱动开发，双模式执行与工具链落地",
      lead: "以自然语言对话覆盖从需求理解、代码生成到真实环境落地的完整开发链路；深度集成 VS Code，支持命令行与终端 UI 多端接入。",
      tags: ["自然语言开发", "双模式工作流", "内置工具链"],
      actions: heroActions("编程中心咨询"),
      visual: {
        title: "编程中心首页",
        images: [
          image(
            "/assets/product/centers/coding/hero.png",
            "编程中心首页",
            1895,
            794,
          ),
        ],
      },
    },
    sections: [
      {
        title: "编程中心：让 AI 从对话到落地的企业级智能编码助手",
        lead: "码多多以自然语言对话的方式，覆盖从需求理解、代码生成到真实环境落地的完整开发链路：深度集成 VS Code，支持命令行与终端 UI 多端接入。",
        cards: [
          {
            title: "在哪里用 · 深度集成 VS Code",
            description:
              "从元启 AI 开发平台选择模型导出码多多，一键安装后打开 VS Code 即可对话使用；同时支持命令行与终端 UI 多端接入。",
            tags: ["VS Code", "命令行", "终端 UI", "一键安装"],
          },
          {
            title: "怎么用 · 自然语言驱动开发",
            description:
              "以自然语言描述需求即可生成与修改代码；Plan/Build 双模式先规划后执行；内置工具链在真实开发环境自动完成文件读写、命令执行与迭代优化。",
            tags: [
              "自然语言开发",
              "Plan/Build 双模式",
              "内置工具链",
              "真实环境落地",
            ],
          },
        ],
        tags: [
          "多语言支持",
          "多模型适配",
          "MCP 协议扩展",
          "细粒度权限控制",
          "零数据留存",
        ],
      },
    ],
    capabilities: [
      {
        id: "coding-assistant",
        title: "自然语言驱动开发：在 VS Code 里说需求、出代码",
        lead: "深度集成 VS Code，用自然语言描述需求即可生成、修改与理解代码，覆盖 Java、Python、Go、TypeScript 等主流场景。",
        steps: [
          {
            title: "获取安装",
            description:
              "从元启 AI 开发平台选择模型导出并一键安装，打开 VS Code 即可对话使用。",
            tags: ["模型导出", "一键安装", "VS Code 深度集成"],
          },
          {
            title: "对话式开发",
            description:
              "以自然语言生成与修改代码，支持 @ 引用文件、! 执行命令、/ 调用命令，全程对话式完成。",
            tags: [
              "自然语言输入",
              "代码生成与重构",
              "@ 引用文件",
              "! 执行命令",
            ],
          },
          {
            title: "多端接入",
            description:
              "VS Code、命令行、终端 UI 多端接入，一套上下文随端延续，开发思路不中断。",
            tags: ["VS Code", "命令行", "终端 UI"],
          },
        ],
        images: [
          image(
            "/assets/product/centers/coding/natural-language.png",
            "自然语言驱动开发界面",
            1269,
            865,
          ),
        ],
        note: "使用入口：VS Code 对话框输入需求，@ 引用文件、! 执行命令、/ 调用命令。",
        actions: capabilityActions("编程中心咨询"),
      },
      {
        id: "coding-workflow",
        title: "Plan/Build 双模式：先规划后执行",
        lead: "将「规划-执行」拆解为两个阶段：Plan 把需求细化为开发方案，Build 基于方案自动完成代码生成、执行与验证，复杂任务逻辑完整、简单任务高效直接。",
        steps: [
          {
            title: "Plan 规划",
            description:
              "需求复杂或暂不明确时切换至 Plan 模式，AI 细化需求并输出开发计划。",
            tags: ["需求细化", "方案生成", "开发计划"],
          },
          {
            title: "Build 执行",
            description:
              "基于规划方案自动完成代码生成、执行与验证；简单任务直接高效完成。",
            tags: ["代码生成", "自动执行", "结果验证"],
          },
          {
            title: "迭代闭环",
            description:
              "执行结果实时反馈，错误自动修复、持续优化，形成从方案到可运行代码的闭环。",
            tags: ["结果反馈", "错误修复", "持续优化"],
          },
        ],
        actions: capabilityActions("编程中心咨询"),
      },
      {
        id: "coding-tools",
        title: "内置工具链：在真实开发环境落地执行",
        lead: "内置工程化开发工具链，可在真实环境自动完成文件读写、命令执行、代码编辑与迭代优化，让 AI 从对话式辅助升级为可行动的开发助手。",
        steps: [
          {
            title: "工具链完备",
            description:
              "内置命令执行、文件读写、代码编辑、网页获取等工具，覆盖开发全流程。",
            tags: ["命令执行", "文件读写", "代码编辑", "搜索查询"],
          },
          {
            title: "真实环境执行",
            description:
              "AI 在真实环境自动完成代码运行与验证，支持结果反馈与迭代优化。",
            tags: ["真实环境落地", "自动执行", "迭代优化"],
          },
          {
            title: "权限可控",
            description:
              "工具按「自动执行 / 需要确认 / 禁止使用」分级授权，高风险操作需确认。",
            tags: ["allow 自动执行", "ask 需要确认", "deny 禁止使用"],
          },
        ],
        actions: capabilityActions("编程中心咨询"),
      },
    ],
    cta: {
      title: "下一次开发，先让码多多出代码",
      description: "申请体验编程中心，或与华鲲团队沟通企业级部署方案。",
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=编程中心咨询" },
      ],
    },
  },
  {
    slug: "governance",
    name: "权限中心",
    hero: {
      title: "权限中心：用户角色授权统一管理，权限边界清晰可控",
      lead: "从「谁在平台上」到「能看什么、能做什么、能碰哪些数据」，一条授权链路让权限边界清晰可控：用户、角色、菜单与行级权限四道关口逐层收敛，操作与数据双权限管控。",
      tags: ["用户管理", "角色管理", "菜单管理", "行级权限"],
      actions: heroActions("权限中心咨询"),
      visual: {
        title: "授权链路图",
        images: [
          image(
            "/assets/product/centers/governance/hero.png",
            "授权链路图：用户 → 角色 → 操作权限/菜单 → 数据/行级权限",
            1600,
            900,
          ),
        ],
      },
    },
    sections: [
      {
        title: "权限中心：一条授权链路，让权限边界清晰可控",
        lead: "权限中心把「谁在平台上、能看什么、能做什么、能碰哪些数据」用一条授权链路管起来：从用户、角色到菜单与数据逐层收敛，每一层都管清楚、可追踪，是元启平台内部统一的用户、权限与授权治理能力。",
        cards: [
          {
            title: "一条授权链路 · 从人到数据逐层收敛",
            description:
              "用户 → 角色 → 菜单 / 操作权限 → 数据 / 行级权限，每个用户最终能做什么由这条链路逐层决定，边界清晰、层层可控。",
            tags: ["用户管理", "角色管理", "菜单管理", "行级权限"],
          },
          {
            title: "操作 + 数据双权限 · 边界清晰",
            description:
              "操作权限控制对平台功能能做什么，数据权限控制能接触哪些数据；双权限配合，从功能入口到数据范围全程可控、可审计。",
            tags: ["操作权限", "数据权限", "分级授权", "审计合规"],
          },
        ],
        tags: ["按岗位授权", "入口千人千面", "数据按范围可见", "全程可追踪"],
      },
    ],
    capabilities: [
      {
        id: "gov-caps",
        title: "授权链路的每一层，都能精细管理",
        lead: "用户、角色、菜单、行级权限四道关口逐层收敛，每道关口都管清楚、可追踪。",
        steps: [
          {
            id: "gov-users",
            number: "权限 01",
            title: "用户管理",
            description:
              "统一管理平台使用人员：账号创建与批量导入、有效期与停用管理，按角色分配权限，人员进出与权限变化全程可追踪。",
            tags: ["账号创建", "批量导入", "有效期管理", "按角色授权"],
          },
          {
            id: "gov-roles",
            number: "权限 02",
            title: "角色管理",
            description:
              "根据企业岗位与职责创建角色，配置操作权限（可查看 / 可操作 / 可删除）与数据权限（按组织、部门、项目圈定范围），让不同人员获得差异化的平台使用范围，新人入岗快速授权。",
            tags: ["按岗位创建", "操作权限", "数据权限", "动态调整"],
          },
          {
            id: "gov-menu",
            number: "权限 03",
            title: "菜单管理",
            description:
              "维护平台菜单结构与层级，按角色配置菜单可见范围，让不同角色看到与自己职责匹配的功能入口，敏感入口按权限收敛，界面千人千面、干净不干扰。",
            tags: ["菜单结构", "角色可见", "按需呈现", "入口收敛"],
          },
          {
            id: "gov-permission",
            number: "权限 04",
            title: "行级权限",
            description:
              "在角色之上进一步控制数据范围：数据支持可查看 / 可操作 / 可删除分级授权，按组织、部门、项目圈定数据可见范围，越权访问被有效拦截，敏感数据按需可见。",
            tags: [
              "数据分级",
              "组织 / 部门 / 项目",
              "越权拦截",
              "敏感数据保护",
            ],
          },
        ],
        actions: [],
      },
    ],
    cta: {
      title: "需要企业级平台安全管控？",
      description:
        "面向平台权限、组织协作与私有化部署需求，欢迎与华鲲团队沟通并申请试用。",
      actions: closingActions("权限中心咨询"),
    },
  },
] as const satisfies readonly PlatformPage[];
