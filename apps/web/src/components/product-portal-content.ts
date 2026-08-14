export type PortalAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

type ProductImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type StandaloneProduct = {
  slug: "code-agent" | "aippt" | "aishrek";
  name: string;
  hero: {
    title: string;
    lead: string;
    tags: readonly string[];
    actions: readonly PortalAction[];
    image: ProductImage;
  };
  introduction: {
    title: string;
    lead: string;
    items: readonly {
      title: string;
      description: string;
      tags: readonly string[];
    }[];
    useTags: readonly string[];
  };
  capabilities: readonly {
    id: string;
    title: string;
    lead: string;
    steps: readonly {
      title: string;
      description: string;
      tags: readonly string[];
    }[];
    action: PortalAction;
    image: ProductImage;
    contextNote: string;
  }[];
  cta: {
    title: string;
    description: string;
    actions: readonly PortalAction[];
  };
};

export const standaloneCenter = {
  hero: {
    title: "独立产品中心：成熟企业级 AI 产品，独立安装、下载即用",
    lead: "面向明确业务场景的成熟企业级 AI 产品：独立安装、下载即用，无需复杂配置即可获得完整能力；当前覆盖智能编码、演示文稿创作与机械设计，后续将持续扩展。",
    tags: ["码里奥", "AIPPT", "AISHREK"],
    actions: [
      {
        label: "联系我们",
        href: "/contact?topic=独立产品咨询",
        variant: "primary",
      },
    ],
  },
  introduction: {
    title: "独立产品中心：面向明确场景、即装即用的企业级 AI 产品",
    lead: "每个独立产品聚焦一个高频业务场景，输入需求即可获得可交付成果，无需复杂配置与二次开发，快速验证并落地业务价值。",
  },
  values: [
    {
      tag: "独立安装",
      title: "下载即用、开箱即用",
      description:
        "每个产品可独立安装、下载即用，无需依赖其他平台，开箱即可体验完整能力。",
    },
    {
      tag: "场景聚焦",
      title: "输入需求、直接交付",
      description:
        "面向智能编码、演示文稿创作与机械设计等高频场景，输入需求直接产出可交付成果。",
    },
  ],
  products: [
    {
      slug: "code-agent",
      tag: "智能编码",
      title: "码里奥",
      description:
        "以自然语言驱动工程落地，描述需求即可生成、修改与运行代码，支持多智能体与 MCP 生态协同。",
      action: { label: "查看产品详情 →", href: "/product/code-agent" },
    },
    {
      slug: "aippt",
      tag: "演示文稿",
      title: "AIPPT",
      description:
        "输入创作需求或上传参考资料，自动生成结构完整、风格统一的演示文稿，支持在线编辑修改与多格式交付。",
      action: { label: "查看产品详情 →", href: "/product/aippt" },
    },
    {
      slug: "aishrek",
      tag: "机械设计",
      title: "AISHREK",
      description:
        "导入设计文件、自然语言驱动改型，支持通用建模与原生精密双模式，完成装配协作与工程交付。",
      action: { label: "查看产品详情 →", href: "/product/aishrek" },
    },
  ],
  faqs: [
    {
      number: "问题 01",
      title: "为什么即装即用？",
      description: "独立产品面向明确业务场景打磨成熟，无需先建设完整平台。",
      answer: "独立安装、下载即用，开箱即可体验完整能力。",
      tags: ["即装即用", "无需配置"],
    },
    {
      number: "问题 02",
      title: "能否按需采购单个产品？",
      description: "每个产品独立交付，按业务需求单独采购与安装使用。",
      answer: "支持单独采购、独立安装、下载即用，互不依赖。",
      tags: ["单独采购", "独立使用", "互不依赖"],
    },
    {
      number: "问题 03",
      title: "如何快速落地？",
      description: "无需复杂配置与二次开发，输入需求即可获得可交付成果。",
      answer: "开箱即用、快速交付，快速验证并落地业务价值。",
      tags: ["快速交付", "验证价值"],
    },
  ],
  note: "产品功能清单与交付形态以正式产品资料与商务沟通为准，欢迎联系我们获取详情。",
  cta: {
    title: "需要为业务引入成熟 AI 产品？",
    description:
      "如需了解或采购码多多 2.0、AIPPT、AISHREK，欢迎与华鲲团队联系，获取产品详情与选型建议。",
    actions: [
      {
        label: "联系我们",
        href: "/contact?topic=独立产品咨询",
        variant: "primary",
      },
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
    name: "码里奥",
    hero: {
      title: "码里奥：让每一位企业工作者，都有 AI 搭档。",
      lead: "以自然语言描述需求，AI 结合项目上下文与技能工具，完成代码编写、运行与验证，交付可运行的工程成果。",
      tags: ["自然语言驱动", "多智能体协同", "MCP 生态集成", "研发生态协同"],
      actions: [
        {
          label: "联系我们",
          href: "/contact?topic=码多多 2.0 咨询",
          variant: "primary",
        },
      ],
      image: {
        src: "/assets/product/code-agent/main.png",
        alt: "码多多 2.0 主界面：项目与会话、自然语言开发",
        width: 1414,
        height: 760,
      },
    },
    introduction: {
      title: "码里奥：自然语言驱动工程落地的企业级 AI 编程软件",
      lead: "码多多 2.0 现已正式更名为码里奥：独立安装、下载即用，以自然语言驱动工程落地；支持 Skill 技能封装与 MCP 工具集成，多智能体协同扩展开发能力。",
      items: [
        {
          title: "独立产品 · 下载即用",
          description:
            "独立软件提供完整的产品交互入口，统一管理项目、会话与跨项目任务，适合企业级交付；独立安装即可使用，无需依赖其他开发环境。",
          tags: ["独立安装", "下载即用", "开箱即用"],
        },
        {
          title: "端到端智能研发 · 从需求到交付",
          description:
            "深度融合大语言模型与代码语义分析能力，提供从需求规划、代码生成、工程修改、运行验证到问题修复的端到端 AI 编程服务，交付可复用、可追溯的工程代码。",
          tags: ["需求规划", "代码生成", "运行验证", "问题修复"],
        },
      ],
      useTags: ["自然语言驱动", "独立安装即用", "工程级交付", "生态协同扩展"],
    },
    capabilities: [
      {
        id: "mdd2-skill",
        title: "Skill 技能生态：可复用技能，随需调用与编排",
        lead: "将企业流程、工具与知识封装为可复用技能，支持技能调用、导入与自动选择，并与技能中心三类技能贯通复用。",
        steps: [
          {
            title: "STEP 01｜技能调用",
            description:
              "对话中直接调用已配置技能，编码规范、工具接口与业务知识随取随用，无需重复配置即可完成任务。",
            tags: ["技能调用", "随取随用", "无需配置"],
          },
          {
            title: "STEP 02｜技能导入",
            description:
              "导入企业自建或技能中心发布的技能，按需组装进当前会话，快速扩展 AI 可调用的能力边界。",
            tags: ["技能导入", "按需组装", "能力扩展"],
          },
          {
            title: "STEP 03｜自动选技能",
            description:
              "AI 根据对话内容与任务类型自动匹配最合适的技能，复杂任务自动编排多个技能协同完成。",
            tags: ["自动匹配", "任务理解", "协同编排"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=码多多 2.0 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/code-agent/skill.png",
          alt: "Skill 技能与多智能体协同界面",
          width: 864,
          height: 516,
        },
        contextNote:
          "应用示例：视频分析场景中调度视频检索接口识别违规行为，联动知识库生成处置报告。",
      },
      {
        id: "mdd2-mcp",
        title: "MCP 工具集成：打破工具边界，连接企业系统",
        lead: "通过 MCP 标准化调用企业数据库、API 与微服务，将研发系统、制品仓库与配置中心纳入 AI 编程流程。",
        steps: [
          {
            title: "STEP 01｜标准化接入",
            description:
              "通过 MCP 协议标准化接入企业数据库、第三方 API 与自定义微服务，统一调用方式、无需为每个系统单独适配。",
            tags: ["MCP 协议", "标准化接入", "统一调用"],
          },
          {
            title: "STEP 02｜生态互联",
            description:
              "连接研发系统、制品仓库、配置中心等既有工具，让 AI 直接读取代码、制品与配置，融入真实研发链路。",
            tags: ["研发系统", "制品仓库", "配置中心"],
          },
          {
            title: "STEP 03｜能力扩展",
            description:
              "可调用能力随接入工具持续扩展，覆盖更多研发环节，让 AI 编程更贴合企业实际流程。",
            tags: ["能力扩展", "覆盖研发环节"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=码多多 2.0 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/code-agent/mcp.png",
          alt: "MCP 工具集成界面",
          width: 864,
          height: 516,
        },
        contextNote:
          "MCP 生态：连接数据库、API、知识库、制品库与自动化运维工具。",
      },
      {
        id: "mdd2-dev",
        title: "自然语言开发：描述需求，直接生成工程文件",
        lead: "以自然语言描述开发需求，结合工程结构直接生成完整文件，并自动补充依赖与调用示例。",
        steps: [
          {
            title: "STEP 01｜需求理解",
            description:
              "以自然语言描述开发需求，系统理解任务目标与当前工程上下文，明确要新增或修改的文件范围。",
            tags: ["自然语言输入", "任务理解", "工程上下文"],
          },
          {
            title: "STEP 02｜工程生成",
            description:
              "结合工程结构生成完整可运行文件，自动补充依赖配置、接口定义与调用示例，开箱即用。",
            tags: ["完整文件生成", "依赖配置", "调用示例"],
          },
          {
            title: "STEP 03｜多轮完善",
            description:
              "通过多轮对话继续调整需求与代码，修改即时落盘，让生成结果持续贴合工程实际。",
            tags: ["多轮交互", "即时落盘", "持续完善"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=码多多 2.0 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/code-agent/natural-language.png",
          alt: "自然语言开发界面",
          width: 1920,
          height: 1030,
        },
        contextNote:
          "应用示例：输入「为现有服务增加接口鉴权」，系统结合工程结构生成完整实现。",
      },
      {
        id: "mdd2-eco",
        title: "研发生态协同：多模型集成，融入企业研发体系",
        lead: "统一接入本地、云端与企业专有模型，兼容主流模型并融入企业研发体系，构建可扩展的智能开发环境。",
        steps: [
          {
            title: "STEP 01｜统一模型接入",
            description:
              "统一接入本地、云端与企业专有模型，兼容 DeepSeek、Qwen、MiniMax 等主流模型与企业自研模型。",
            tags: ["统一接入", "模型兼容"],
          },
          {
            title: "STEP 02｜按需切换",
            description:
              "按任务类型、模型效果与部署策略灵活选择与切换模型，让不同任务用最合适的模型。",
            tags: ["任务匹配", "灵活切换", "最优选择"],
          },
          {
            title: "STEP 03｜体系协同",
            description:
              "融入企业研发体系，与技能、智能体、知识库等能力协同，形成可扩展的智能开发环境。",
            tags: ["研发体系", "能力协同", "生态扩展"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=码多多 2.0 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/code-agent/model-management.png",
          alt: "研发生态协同：多模型接入与管理",
          width: 1414,
          height: 760,
        },
        contextNote:
          "研发协同：多模型统一接入与切换，与企业研发体系能力协同扩展。",
      },
    ],
    cta: {
      title: "让企业 AI 编程真正落地，持续创造价值",
      description:
        "如需了解或采购码多多 2.0，欢迎与华鲲团队联系，获取企业级使用与部署方案。",
      actions: [
        {
          label: "联系我们",
          href: "/contact?topic=码多多 2.0 咨询",
          variant: "primary",
        },
      ],
    },
  },
  aippt: {
    slug: "aippt",
    name: "AIPPT",
    hero: {
      title: "AIPPT：一站式智能演示文稿创作平台",
      lead: "输入创作需求或上传参考资料，AI 自动完成内容逻辑、页面结构与版式排版；支持在线编辑修改与多格式导出，快速交付可用的演示文稿。",
      tags: [
        "自然语言微调",
        "参考资料驱动",
        "多档渲染",
        "在线编辑",
        "多格式导出",
      ],
      actions: [
        {
          label: "联系我们",
          href: "/contact?topic=AIPPT 咨询",
          variant: "primary",
        },
      ],
      image: {
        src: "/assets/product/aippt/main.png",
        alt: "Aurora 创作台主界面",
        width: 1440,
        height: 900,
      },
    },
    introduction: {
      title: "AIPPT：从内容梳理到版式生成的一站式智能创作",
      lead: "输入创作需求或上传参考资料，自动完成内容逻辑、结构与版式生成；支持在线编辑修改、生成记录管理与多格式交付，成稿即用。",
      items: [
        {
          title: "一站式创作 · 从需求到成稿",
          description:
            "输入创作需求或上传参考资料，AI 自动完成内容逻辑、页面结构与版式排版，全程无需手动整理素材，直接产出可交付的演示文稿。",
          tags: ["自然语言微调", "参考资料驱动", "自动排版"],
        },
        {
          title: "模式可选 · 多格式交付",
          description:
            "简约 / 标准 / 臻制三种渲染模式覆盖不同创作场景，支持生成篇幅长中短设置；成稿可在线修改、保存与多格式导出，在办公环境中继续使用。",
          tags: ["三种渲染模式", "篇幅设置", "多格式导出"],
        },
      ],
      useTags: ["内容逻辑梳理", "页面结构规划", "版式自动匹配", "人机双写"],
    },
    capabilities: [
      {
        id: "aippt-ref",
        title: "参考资料驱动：内容有据可依，贴合原始材料",
        lead: "上传 PDF、Word、PPT、Excel 或图片资料，AI 分析参考来源、提炼内容脉络与页面要点，让生成内容贴合原始材料、有据可依。",
        steps: [
          {
            title: "多格式上传",
            description: "支持 PDF、Word、PPT、Excel、图片等常用资料格式。",
            tags: ["多格式上传", "资料管理"],
          },
          {
            title: "脉络提炼",
            description: "自动梳理资料主线，提炼可讲的页面要点与结构。",
            tags: ["内容脉络", "要点提炼"],
          },
          {
            title: "有据生成",
            description: "基于已选资料生成内容，页面要点贴合原始材料。",
            tags: ["资料驱动", "有据可依"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=AIPPT 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/aippt/reference-materials.png",
          alt: "参考资料驱动",
          width: 1439,
          height: 841,
        },
        contextNote:
          "应用示例：上传行业报告与会议纪要，生成内容自动引用资料要点。",
      },
      {
        id: "aippt-mode",
        title: "三种渲染模式：按需成稿，从简约到臻制",
        lead: "提供简约、标准、臻制三档渲染深度，覆盖从快速成稿到精装演示的创作场景，并支持生成篇幅设置按需匹配。",
        steps: [
          {
            title: "简约模式",
            description:
              "一键快速成稿，版式干净、信息聚焦，适合时间紧、要点明确的内部汇报。",
            tags: ["一键成稿", "信息聚焦", "快速汇报"],
          },
          {
            title: "标准模式",
            description:
              "图文均衡、结构完整，自动匹配版式与图表，适合日常汇报与方案演示。",
            tags: ["图文均衡", "版式匹配", "日常演示"],
          },
          {
            title: "臻制模式",
            description:
              "精装级视觉设计，封面、配色与版式细节考究，适合对外发布与重要场合展示。",
            tags: ["精装设计", "视觉考究", "对外展示"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=AIPPT 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/aippt/rendering-modes.png",
          alt: "三种渲染模式界面",
          width: 1920,
          height: 879,
        },
        contextNote: "渲染模式：简约 / 标准 / 臻制，配合生成篇幅设置按需选择。",
      },
      {
        id: "aippt-gen",
        title: "自然语言微调：对话调整，所见即所得",
        lead: "成稿后通过自然语言对话按需微调内容，AI 精准定位并完成文字、数据与结构调整，无需手动逐页查找。",
        steps: [
          {
            title: "局部改写",
            description:
              "对指定页面的标题、正文、数据或结论提出修改要求，AI 精准改写并即时生效，例如「第 5 页标题改为数据驱动」。",
            tags: ["指定页面", "精准改写", "即时生效"],
          },
          {
            title: "结构重组",
            description:
              "按指令调整页面顺序、合并或拆分章节，目录与导航同步更新，例如「把重点案例章节前移」。",
            tags: ["页面排序", "章节拆分合并", "目录同步"],
          },
          {
            title: "风格统一",
            description:
              "统一全稿措辞口径、标题层级与版式风格，保证前后一致、整体不散。",
            tags: ["措辞统一", "层级一致", "版式统一"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=AIPPT 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/aippt/natural-language-tuning.png",
          alt: "自然语言微调演示内容",
          width: 1414,
          height: 760,
        },
        contextNote:
          "应用示例：输入「标题改为数据驱动、重点章节前移」，AI 完成内容与结构微调。",
      },
      {
        id: "aippt-export",
        title: "人机双写内容：AI 生成初稿，逐字逐图可编辑",
        lead: "AI 自动生成初稿，支持页面级手动编辑，逐字逐图所见即所得，人机协同完成成稿交付。",
        steps: [
          {
            title: "AI 生成初稿",
            description:
              "输入创作需求或参考资料，AI 自动生成结构完整、版式统一的演示文稿初稿。",
            tags: ["需求驱动", "自动成稿", "结构完整"],
          },
          {
            title: "页面级手动编辑",
            description:
              "在编辑器中直接修改文字内容、替换图片、调整图表与版式，逐字逐图所见即所得。",
            tags: ["文字修改", "图片替换", "图表调整", "版式编辑"],
          },
          {
            title: "协同完善交付",
            description:
              "AI 辅助润色与优化建议，人确认内容口径，多格式导出交付使用。",
            tags: ["AI 润色", "人工确认", "多格式交付"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=AIPPT 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/aippt/human-ai-editing.png",
          alt: "人机双写：逐字逐图可编辑",
          width: 1920,
          height: 879,
        },
        contextNote:
          "人机双写：AI 生成初稿 → 页面直接手动编辑文字与图片 → 多格式交付。",
      },
    ],
    cta: {
      title: "开启高效智能的演示文稿创作体验",
      description:
        "如需了解或采购 AIPPT，欢迎与华鲲团队联系，获取企业级演示文稿生成方案。",
      actions: [
        {
          label: "联系我们",
          href: "/contact?topic=AIPPT 咨询",
          variant: "primary",
        },
      ],
    },
  },
  aishrek: {
    slug: "aishrek",
    name: "AISHREK",
    hero: {
      title: "AISHREK：AI 机械设计工作台，导入即解读、文生即改型",
      lead: "导入 STL、STEP 等设计文件，AI 自动解读几何结构；以自然语言描述改型需求，支持通用格式与原生高精度双模式，完成参数调整与模型改型。",
      tags: ["自然语言 CAD", "原生精密联动", "多维仿真 CAE"],
      actions: [
        {
          label: "联系我们",
          href: "/contact?topic=AISHREK 咨询",
          variant: "primary",
        },
      ],
      image: {
        src: "/assets/product/aishrek/main.png",
        alt: "AISHREK 机械设计工作台",
        width: 1414,
        height: 760,
      },
    },
    introduction: {
      title: "AISHREK：自然语言驱动改型的机械设计工作台",
      lead: "以自然语言描述改型需求，AI 直接驱动模型参数修改；支持原生精密联动与多维仿真 CAE，覆盖设计、装配、验证全流程。",
      items: [
        {
          title: "自然语言 CAD · 说需求、改模型",
          description:
            "以自然语言描述设计修改需求，AI 解读并执行参数修改，支持修改前后对比与版本回溯，降低机械设计操作门槛。",
          tags: ["自然语言 CAD", "前后对比", "版本回溯"],
        },
        {
          title: "原生精密联动 · 参数化与装配同步",
          description:
            "面向原生 CAD 模型实现参数化修改、装配体再生与工程图同步，参数变更后装配关系与图纸尺寸自动联动验证。",
          tags: ["参数化修改", "装配联动", "工程图同步"],
        },
      ],
      useTags: ["自然语言 CAD", "原生精密联动", "多维仿真 CAE", "参数改型验证"],
    },
    capabilities: [
      {
        id: "aishrek-import",
        title: "自然语言 CAD：以自然语言描述需求，直接驱动参数改型",
        lead: "以自然语言描述设计修改需求，AI 解析设计意图并直接执行模型参数修改，覆盖改孔距、开槽、新增凸台、倒角等常见改型操作，完成模型改型。",
        steps: [
          {
            title: "需求描述",
            description:
              "输入改孔距、开槽、新增凸台、倒角等修改需求，AI 理解设计意图并解析为可执行指令。",
            tags: ["自然语言", "意图理解", "需求解析"],
          },
          {
            title: "自动改型",
            description:
              "AI 直接修改模型参数并自动完成改型，无需手动操作 CAD 命令，修改精准落位。",
            tags: ["自动改型", "参数修改", "精准落位"],
          },
          {
            title: "对比回溯",
            description:
              "修改前后模型并排对比，改动一目了然；历史版本可随时打开、恢复与下载。",
            tags: ["前后对比", "版本恢复", "下载导出"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=AISHREK 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/aishrek/natural-language-cad.png",
          alt: "自然语言 CAD 界面",
          width: 1920,
          height: 823,
        },
        contextNote:
          "应用示例：输入「将安装孔距调整为 120mm」，AI 完成参数修改并生成新版本。",
      },
      {
        id: "aishrek-chat",
        title: "原生精密联动：原生改参数，精密动装配",
        lead: "原生与精密两级联动：原生直接改参数，精密驱动装配与图纸联动，改动全程可验证。",
        steps: [
          {
            title: "原生参数改型",
            description:
              "读取原生零件参数与尺寸，直接执行特征级参数化修改，改动精准到原始特征。",
            tags: ["参数读取", "特征级修改"],
          },
          {
            title: "精密装配联动",
            description:
              "装配体再生与关系检查、干涉检查与尺寸链校验，零件改动自动传递到装配体。",
            tags: ["装配再生", "干涉检查", "尺寸链校验"],
          },
          {
            title: "工程图联动验证",
            description: "工程图同步再生与尺寸验证，输出领域级变更验证报告。",
            tags: ["工程图再生", "尺寸验证", "验证报告"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=AISHREK 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/aishrek/native-linkage.png",
          alt: "原生精密联动界面",
          width: 1920,
          height: 1760,
        },
        contextNote:
          "原生与精密对比：原生直接改参数，精密联动装配与图纸，改动全程可验证。",
      },
      {
        id: "aishrek-link",
        title: "多维仿真 CAE：结构仿真与动力学分析一体",
        lead: "面向设计模型提供结构仿真与动力学分析：静力、模态、屈曲、疲劳、热等结构分析，以及刚体运动与动力学分析，输出应力、位移、安全系数与运动轨迹。",
        steps: [
          {
            title: "结构仿真",
            description:
              "定义材料、约束、载荷与网格，完成静力、模态、屈曲、疲劳、热等分析。",
            tags: ["静力分析", "模态分析", "疲劳热分析"],
          },
          {
            title: "动力学分析",
            description:
              "定义刚体、连接、约束与驱动，输出位置、速度、加速度、力与扭矩。",
            tags: ["运动学分析", "动力学分析", "碰撞干涉"],
          },
          {
            title: "仿真报告",
            description:
              "输出应力、位移、安全系数与运动曲线，形成可验证的仿真报告。",
            tags: ["结果输出", "仿真报告", "验证标准"],
          },
        ],
        action: {
          label: "联系我们",
          href: "/contact?topic=AISHREK 咨询",
          variant: "primary",
        },
        image: {
          src: "/assets/product/aishrek/cae.png",
          alt: "多维仿真 CAE 界面",
          width: 1920,
          height: 879,
        },
        contextNote:
          "多维仿真：结构仿真（静力 / 模态 / 疲劳 / 热）+ 动力学分析（运动 / 碰撞 / 轨迹）。",
      },
    ],
    cta: {
      title: "开启智能机械设计体验",
      description:
        "如需了解或采购 AISHREK，欢迎与华鲲团队联系，获取机械设计智能化方案。",
      actions: [
        {
          label: "联系我们",
          href: "/contact?topic=AISHREK 咨询",
          variant: "primary",
        },
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
