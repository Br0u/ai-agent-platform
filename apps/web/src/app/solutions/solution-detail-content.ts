export type SolutionMetric = {
  value: string;
  label: string;
  note: string;
};

export type SolutionDetail = {
  slug: string;
  code: string;
  category: "场景方案" | "平台方案";
  name: string;
  title: string;
  summary: string;
  scope: string;
  overview: {
    title: string;
    description: string;
    points: readonly string[];
  };
  media: {
    src: string;
    alt: string;
    caption: string;
    position: string;
  };
  visualLabel: string;
  visualNodes: readonly string[];
  metrics: readonly SolutionMetric[];
  challenges: readonly {
    title: string;
    description: string;
  }[];
  features: readonly {
    code: string;
    title: string;
    description: string;
  }[];
  stages: readonly {
    title: string;
    description: string;
    items: readonly string[];
  }[];
  layers: readonly {
    code: string;
    title: string;
    description: string;
    items: readonly string[];
  }[];
  scenarios: readonly {
    label: string;
    title: string;
    description: string;
    tags: readonly string[];
  }[];
  reference: {
    eyebrow: string;
    title: string;
    description: string;
    results: readonly SolutionMetric[];
  };
  cases?: readonly {
    label: string;
    title: string;
    description: string;
    results: readonly string[];
  }[];
  faqs?: readonly {
    question: string;
    answer: string;
  }[];
  relatedProducts: readonly {
    label: string;
    title: string;
    description: string;
    href: string;
  }[];
};

export const solutionDetails = {
  "smart-office": {
    slug: "smart-office",
    code: "S01",
    category: "场景方案",
    name: "智能办公",
    title: "让高频办公任务进入可控的智能流程",
    summary:
      "围绕智能写作、合同审核、投标辅助和智能会议，把企业资料、审核规则与交付模板连接到统一智能体工作流中。",
    scope:
      "适合希望从高频、边界清晰的办公任务开始验证 AI 价值，并要求数据留在企业边界内的组织。",
    overview: {
      title: "一套围绕成果交付组织的办公智能体组合",
      description:
        "方案不是单一的聊天入口，而是把企业资料、写作模板、审核规则和人工确认节点组织成可复用流程，让每类办公任务都有明确输入、处理过程和最终成果。",
      points: [
        "写作、合同、投标与会议共享统一知识和权限边界",
        "模型输出进入可修改、可审核、可追溯的交付流程",
        "支持在企业本地环境部署，减少敏感资料外传风险",
      ],
    },
    media: {
      src: "/solutions/reference/smart-office-source.jpeg",
      alt: "华鲲智能办公一体化解决方案应用套件资料图",
      caption: "资料中的智能办公应用套件，覆盖写作、合同、投标与会议四类助手",
      position: "50% 25%",
    },
    visualLabel: "办公智能体中枢",
    visualNodes: ["企业资料", "任务理解", "智能生成", "人工审核"],
    metrics: [
      { value: "4 类", label: "核心办公场景", note: "覆盖常见成果交付" },
      { value: "私有化", label: "数据部署边界", note: "资料与模型本地运行" },
      {
        value: "全流程",
        label: "任务管理方式",
        note: "输入、生成、审核、交付",
      },
    ],
    challenges: [
      {
        title: "资料分散且复用困难",
        description:
          "制度、模板、历史材料分布在不同位置，工作人员需要反复搜索、摘录和重新组织。",
      },
      {
        title: "成果质量依赖个人经验",
        description:
          "写作、合同与投标材料的规范要求多，缺少统一规则时容易产生遗漏和重复核验。",
      },
      {
        title: "会议信息难以形成闭环",
        description:
          "录音、转写、纪要与待办彼此割裂，会后整理时间长，任务跟踪也容易中断。",
      },
    ],
    features: [
      {
        code: "F01",
        title: "企业模板与知识驱动",
        description:
          "结合组织已有制度、模板和历史材料生成内容，减少从空白文档开始的重复工作。",
      },
      {
        code: "F02",
        title: "规则与模型双重校验",
        description:
          "自定义词库负责专项规则，大模型负责文字、逻辑与表达检查，形成互补的审核机制。",
      },
      {
        code: "F03",
        title: "多类成果统一交付",
        description:
          "写作初稿、合同风险、投标章节、会议纪要和待办都能进入可编辑、可导出的成果流程。",
      },
      {
        code: "F04",
        title: "本地私有化运行",
        description:
          "文稿、合同、标书、录音和企业词库在本地服务器处理，适配政务、国企等敏感办公场景。",
      },
    ],
    stages: [
      {
        title: "连接企业知识",
        description: "接入制度、模板、合同条款、招投标资料与会议文件。",
        items: ["文档归集与分片", "模板和规则整理", "权限范围确认"],
      },
      {
        title: "理解办公任务",
        description: "识别任务类型、交付格式、审核重点和需要引用的企业资料。",
        items: ["任务意图识别", "关键信息提取", "交付结构生成"],
      },
      {
        title: "生成并辅助审核",
        description: "形成可编辑成果，并对风险、差异和缺失信息进行结构化提示。",
        items: ["内容生成与改写", "条款对比与提示", "引用来源回溯"],
      },
      {
        title: "沉淀可复用成果",
        description: "经人工确认后交付，并将模板、规则和高质量结果持续沉淀。",
        items: ["人工复核确认", "多格式成果导出", "知识与模板更新"],
      },
    ],
    layers: [
      {
        code: "L4",
        title: "办公应用层",
        description: "直接承接不同岗位的日常办公任务",
        items: ["写作助手", "合同审核", "投标助手", "会议助手"],
      },
      {
        code: "L3",
        title: "智能体编排层",
        description: "将检索、生成、校验与人工审核组织为连续流程",
        items: ["工作流", "提示词", "规则校验", "人工节点"],
      },
      {
        code: "L2",
        title: "企业知识层",
        description: "让输出基于组织已有资料与规范",
        items: ["制度库", "模板库", "合同库", "项目资料"],
      },
      {
        code: "L1",
        title: "私有运行层",
        description: "统一承载模型、存储、权限与运行资源",
        items: ["大语言模型", "数据权限", "算力资源", "审计记录"],
      },
    ],
    scenarios: [
      {
        label: "DOCUMENT",
        title: "智能写作",
        description:
          "根据主题、提纲和企业资料生成初稿，支持续写、改写与格式调整。",
        tags: ["公文材料", "汇报总结", "内容改写"],
      },
      {
        label: "REVIEW",
        title: "合同与投标辅助",
        description: "对合同条款和招标文件进行信息提取、差异比对与风险提示。",
        tags: ["条款审查", "响应检查", "风险提示"],
      },
      {
        label: "MEETING",
        title: "智能会议",
        description: "连接会议录制、语音转写、纪要生成与待办提取。",
        tags: ["实时转写", "会议纪要", "待办整理"],
      },
    ],
    reference: {
      eyebrow: "REFERENCE CONFIGURATION",
      title: "从办公套件或会议场景开始部署",
      description:
        "资料提供的典型配置中，办公智能体套件可支持 8 个用户同时使用；智能会议方案单机可接入 100 路，并发录制 10 个会议。最终并发和硬件规格以项目评估为准。",
      results: [
        { value: "8 个", label: "办公套件并发用户", note: "典型配置口径" },
        { value: "100 路", label: "会议单机接入", note: "典型配置口径" },
        { value: "10 个", label: "并发录制会议", note: "典型配置口径" },
      ],
    },
    faqs: [
      {
        question: "涉密或敏感办公资料会上传到外网吗",
        answer:
          "方案支持本地私有化模型运行，文稿、词库和企业资料可在本地服务器内处理与存储，实际数据边界会在部署评估阶段确认。",
      },
      {
        question: "单位自己的审核词库和写作规则能否持续维护",
        answer:
          "可以。资料中的内容校审支持新增、修改、删除和检索自定义词条，保存后可用于后续文稿校验。",
      },
      {
        question: "AI 生成的成果是否可以人工修改和复核",
        answer:
          "可以。写作、合同、投标和会议成果都以人机协同为原则，生成结果进入编辑与复核流程，确认后再保存或导出。",
      },
    ],
    relatedProducts: [
      {
        label: "RELATED PRODUCT 01",
        title: "办公智能体",
        description: "查看写作、合同、投标和会议应用套件及典型配置。",
        href: "/product/office-agent",
      },
      {
        label: "RELATED PRODUCT 02",
        title: "元启 AI 开发平台",
        description: "查看模型、知识库、工作流与智能体发布能力。",
        href: "/product/tgdataxai",
      },
    ],
  },
  "intelligent-guidance": {
    slug: "intelligent-guidance",
    code: "S02",
    category: "场景方案",
    name: "智能导办",
    title: "让办事流程主动适应群众需求",
    summary:
      "把事项判断、材料引导、信息提取、智能填表与辅助预审连接为连续服务，构建全天候政务导办入口。",
    scope:
      "适合事项规则明确、材料要求复杂、群众咨询量大，并希望提升一次性办结率的政务和代办机构。",
    overview: {
      title: "把咨询、填表与预审连接成一件事一次办",
      description:
        "方案围绕群众真实办事过程构建，从自然语言诉求开始，逐步完成情形判断、材料固化、信息提取、表单填写和辅助预审，减少群众在不同入口之间反复切换。",
      points: [
        "以最小办事情形组织政策、材料和审核规则",
        "OCR 与大模型协同完成材料识别和字段提取",
        "开放接口可对接综窗、办件系统、小程序与自助终端",
      ],
    },
    media: {
      src: "/solutions/reference/intelligent-guidance-source.jpeg",
      alt: "智能导办、智能填表与智能审核资料图",
      caption: "资料中的导办、填表和审核连续流程示意",
      position: "50% 21%",
    },
    visualLabel: "智能导办中枢",
    visualNodes: ["办事诉求", "场景判定", "材料处理", "辅助预审"],
    metrics: [
      { value: "27 个", label: "最小办事情形", note: "个体工商户业务口径" },
      { value: "最多 4 问", label: "意图定位", note: "引导式问答" },
      { value: "1–2 分钟", label: "最快辅助审核", note: "资料给定口径" },
    ],
    challenges: [
      {
        title: "办事事项难以准确定位",
        description:
          "同一业务包含登记、变更、注销等多种情形，群众难以快速判断自己应进入哪个流程。",
      },
      {
        title: "材料错误造成反复跑动",
        description:
          "材料格式、经营范围、身份和地址信息容易出现不一致，问题通常到受理环节才被发现。",
      },
      {
        title: "人工咨询与预审压力集中",
        description:
          "高频问题重复出现，窗口人员需要在政策解释、材料检查和业务审核间频繁切换。",
      },
    ],
    features: [
      {
        code: "F01",
        title: "最小办事情形覆盖",
        description:
          "将个体工商户相关业务拆分为 27 个最小颗粒度情形，减少事项理解歧义。",
      },
      {
        code: "F02",
        title: "四问内定位办事意图",
        description:
          "通过引导式多轮问答识别申请主体、办理类型和具体情形，快速匹配事项。",
      },
      {
        code: "F03",
        title: "材料识别与智能填表",
        description:
          "利用 OCR 和大模型提取证照、材料中的关键信息，并自动填写对应申请字段。",
      },
      {
        code: "F04",
        title: "规则驱动的辅助预审",
        description:
          "围绕名称、地址、经营范围和禁限词等规范进行校验，提前反馈材料问题。",
      },
    ],
    stages: [
      {
        title: "问答定位事项",
        description: "通过少量引导问题识别申请主体、办理类型和具体情形。",
        items: ["自然语言咨询", "多轮意图判断", "事项精准匹配"],
      },
      {
        title: "按情形引导材料",
        description: "依据事项规则固化材料清单，并提供上传说明与示意。",
        items: ["材料清单生成", "上传说明", "缺失材料提醒"],
      },
      {
        title: "识别并自动填表",
        description: "利用 OCR 和大模型提取材料信息，自动回填申请表。",
        items: ["材料内容识别", "字段提取", "表单自动填写"],
      },
      {
        title: "规则校验与预审",
        description: "围绕名称、地址、经营范围和禁限词进行校验并反馈问题。",
        items: ["规范性校验", "AI 辅助审核", "问题即时反馈"],
      },
    ],
    layers: [
      {
        code: "L4",
        title: "服务入口层",
        description: "为群众和窗口人员提供统一服务界面",
        items: ["智能问答", "材料上传", "智能填表", "结果反馈"],
      },
      {
        code: "L3",
        title: "业务流程层",
        description: "把事项定位到审核组织为连续办理过程",
        items: ["场景判定", "材料固化", "规则校验", "辅助预审"],
      },
      {
        code: "L2",
        title: "政策知识层",
        description: "承载事项规则、政策依据和审核规范",
        items: ["事项库", "材料库", "政策库", "审核规则"],
      },
      {
        code: "L1",
        title: "平台与算力层",
        description: "提供 OCR、大模型、权限与私有运行环境",
        items: ["OCR", "大语言模型", "知识工程", "本地算力"],
      },
    ],
    scenarios: [
      {
        label: "GUIDANCE",
        title: "事项咨询与导办",
        description: "理解群众的自然语言诉求，用少量问题完成具体办事情形定位。",
        tags: ["政策问答", "意图识别", "事项推荐"],
      },
      {
        label: "MATERIAL",
        title: "材料处理与填表",
        description: "明确材料清单，识别证照和文档内容，并自动回填申请信息。",
        tags: ["OCR", "字段提取", "智能填表"],
      },
      {
        label: "REVIEW",
        title: "规则校验与辅助审核",
        description: "在正式受理前发现名称、地址、经营范围等规范性问题。",
        tags: ["名称查重", "地址校验", "问题反馈"],
      },
    ],
    reference: {
      eyebrow: "REFERENCE CASE",
      title: "成都市郫都区个体工商户登记智能导办试点",
      description:
        "围绕个体工商户登记注册，将事项定位、材料上传、信息提取、表单填写与辅助预审串联为统一办事流程。",
      results: [
        { value: "40%+", label: "平均办理时间缩短", note: "案例资料口径" },
        { value: "95%+", label: "一次性办结率", note: "案例资料口径" },
        { value: "24 小时", label: "在线导办服务", note: "连续服务入口" },
      ],
    },
    cases: [
      {
        label: "政务服务 / 个体工商户登记",
        title: "成都市郫都区行政审批局智能导办试点",
        description:
          "将事项定位、材料上传、信息提取、表单填写与辅助预审串联为统一办理流程，形成 24 小时在线的导办入口。",
        results: [
          "平均办理时间缩短 40%+",
          "一次性办结率 95%+",
          "24 小时在线服务",
        ],
      },
    ],
    faqs: [
      {
        question: "智能导办如何判断群众具体要办什么事项",
        answer:
          "系统通过引导式问答识别申请主体、经营方式和办理类型。资料中的个体工商户场景最多通过 4 个问题即可定位具体办事情形。",
      },
      {
        question: "能否对接现有综窗或办件系统",
        answer:
          "可以。方案提供开放 API，可结合现有综窗、办件系统、微信小程序和办事大厅自助终端设计接入方式。",
      },
      {
        question: "材料识别之后还需要重新手工填表吗",
        answer:
          "系统可利用 OCR 与大模型提取材料中的姓名、地址等关键信息并自动回填，工作人员或申请人对结果确认后再提交。",
      },
    ],
    relatedProducts: [
      {
        label: "RELATED PRODUCT 01",
        title: "智能导办一体机",
        description: "查看导办产品功能、流程与一体机典型配置。",
        href: "/product/knowledge-agent",
      },
      {
        label: "RELATED PRODUCT 02",
        title: "元启 AI 开发平台",
        description: "查看政务知识库、工作流和智能体开发底座。",
        href: "/product/tgdataxai",
      },
    ],
  },
  "visual-search": {
    slug: "visual-search",
    code: "S03",
    category: "场景方案",
    name: "视觉检索",
    title: "让视频从事后回看走向主动发现",
    summary:
      "依托视觉大模型和自然语言交互，让存量摄像头与离线视频具备即时检索、持续布控和预警管理能力。",
    scope:
      "适合视频数据量大、长尾场景多、传统算法定制周期长，并希望利旧现有摄像头的行业客户。",
    overview: {
      title: "用自然语言把存量视频转化为可检索的业务线索",
      description:
        "方案以视觉大模型理解人物、物体、行为和整体场景，业务人员可以直接描述目标或规则，不必为每个长尾场景重新准备样本和训练专用算法。",
      points: [
        "同时支持离线视频即时检索与摄像头实时布控",
        "正向、反向、深度和串行条件可组合复杂规则",
        "检索结果、预警记录和任务状态进入统一管理闭环",
      ],
    },
    media: {
      src: "/solutions/reference/visual-search-source.jpeg",
      alt: "视觉检索解决方案适用行业资料图",
      caption:
        "资料列举的公共安全、交通、城市治理、应急、安全生产等视觉应用方向",
      position: "50% 20%",
    },
    visualLabel: "视觉智能中枢",
    visualNodes: ["视频接入", "语义解析", "规则布控", "事件处置"],
    metrics: [
      { value: "2000+", label: "图像解析维度", note: "资料给定能力口径" },
      { value: "分钟级", label: "场景创建", note: "自然语言配置" },
      { value: "零样本", label: "规则上线方式", note: "无需等待训练周期" },
    ],
    challenges: [
      {
        title: "监控数据主要用于事后回看",
        description:
          "海量视频依赖人工逐段筛查，定位人员、物体和行为线索需要投入大量时间。",
      },
      {
        title: "长尾算法定制周期较长",
        description:
          "传统小模型需要准备样本、训练和部署，场景变化后往往还要重新定制。",
      },
      {
        title: "告警与业务处置彼此割裂",
        description:
          "发现事件后缺少统一的规则、通知和反馈链路，难以形成持续优化闭环。",
      },
    ],
    features: [
      {
        code: "F01",
        title: "自然语言即时检索",
        description:
          "直接描述人员、物体、行为和环境特征，快速定位在线视频或离线录像中的相关片段。",
      },
      {
        code: "F02",
        title: "零样本分钟级布控",
        description:
          "通过自然语言配置规则，无需等待传统样本训练周期，适合突发和长尾事件。",
      },
      {
        code: "F03",
        title: "2000+ 维度全局解析",
        description:
          "从局部特征扩展到全局语义理解，覆盖人、事、物、行为和场景组合。",
      },
      {
        code: "F04",
        title: "持续布控与预警管理",
        description:
          "持续分析视频流和历史录像，自动汇总命中目标、告警记录与任务状态。",
      },
    ],
    stages: [
      {
        title: "接入视频资源",
        description: "接入离线文件或摄像头实时视频流，复用已有视频基础设施。",
        items: ["离线视频上传", "实时视频流", "摄像头利旧"],
      },
      {
        title: "自然语言描述目标",
        description: "用自然语言描述人物、物体、行为和场景组合。",
        items: ["目标描述", "多条件组合", "语义规则生成"],
      },
      {
        title: "即时检索或持续布控",
        description: "按需查找历史线索，或将规则配置为持续运行的布控任务。",
        items: ["即时查找", "实时布控", "多场景叠加"],
      },
      {
        title: "预警进入处置闭环",
        description: "汇总命中片段、时间和来源，支持业务人员复核与反馈。",
        items: ["结果聚合", "告警推送", "人工复核"],
      },
    ],
    layers: [
      {
        code: "L4",
        title: "行业应用层",
        description: "面向不同行业的检索、布控和事件管理任务",
        items: ["公共安全", "城市治理", "应急管理", "安全生产"],
      },
      {
        code: "L3",
        title: "视觉智能体层",
        description: "组织自然语言规则、任务执行与预警反馈",
        items: ["即时检索", "持续布控", "告警管理", "结果复核"],
      },
      {
        code: "L2",
        title: "多模态模型层",
        description: "理解视频中的人物、物体、行为与整体场景",
        items: ["视觉大模型", "语义检索", "零样本规则", "向量索引"],
      },
      {
        code: "L1",
        title: "视频与算力层",
        description: "承载视频接入、解析存储与本地推理任务",
        items: ["摄像头", "离线视频", "NPU 算力", "超融合底座"],
      },
    ],
    scenarios: [
      {
        label: "PUBLIC SAFETY",
        title: "公共安全布控",
        description: "针对分布零散、人工巡查覆盖有限的场所配置长尾事件规则。",
        tags: ["异常行为", "火情识别", "重点场所"],
      },
      {
        label: "CITY GOVERNANCE",
        title: "城市治理发现",
        description: "识别垃圾满溢、占道经营、设施损坏等城市治理事件。",
        tags: ["垃圾满溢", "占道经营", "设施损坏"],
      },
      {
        label: "INDUSTRY",
        title: "行业泛化场景",
        description: "面向交通、应急、环保水利、消防和安全生产快速扩展规则。",
        tags: ["道路交通", "应急管理", "环保水利"],
      },
    ],
    reference: {
      eyebrow: "REFERENCE CASES",
      title: "从九小场所和城市治理长尾场景开始",
      description:
        "现有资料包含某地公安局九小场所智能布控和某地城市治理智能布控案例，分别覆盖异常行为、火情、垃圾满溢、占道经营与设施损坏等场景。",
      results: [
        { value: "2 类", label: "资料内参考案例", note: "公共安全与城市治理" },
        { value: "8 项", label: "已列举场景", note: "跨人物、行为与事件" },
        { value: "可利旧", label: "现有摄像头", note: "减少前端更换" },
      ],
    },
    cases: [
      {
        label: "公共安全 / 九小场所",
        title: "某地公安局九小场所智能布控",
        description:
          "针对场所分布零散、人工巡查覆盖有限的问题，将监控从事后回看转向主动发现。",
        results: ["未成年人出入", "打架斗殴", "火情识别", "异常行为预警"],
      },
      {
        label: "城市治理 / 长尾事件",
        title: "某地城市治理智能布控",
        description:
          "通过自然语言快速配置城市治理规则，提升视频数据处理和告警处置效率。",
        results: ["垃圾满溢", "占道经营", "指导员在岗", "设施损坏"],
      },
    ],
    faqs: [
      {
        question: "使用视觉检索是否必须更换现有摄像头",
        answer:
          "不一定。资料说明方案可利旧现有摄像头，通过接入视频流或离线视频文件完成解析，最终兼容范围需结合编码、网络和接入协议评估。",
      },
      {
        question: "即时检索和持续布控有什么区别",
        answer:
          "即时检索用于按当前问题快速查找历史或在线视频线索；持续布控会保存规则并持续分析视频流，命中后形成预警记录。",
      },
      {
        question: "新增场景是否都需要重新训练模型",
        answer:
          "视觉大模型支持通过自然语言配置零样本规则，许多长尾场景可直接分钟级创建；特殊高精度场景仍需在项目中验证效果。",
      },
    ],
    relatedProducts: [
      {
        label: "RELATED PRODUCT 01",
        title: "视觉检索一体机",
        description: "查看视觉检索功能、应用领域和典型硬件配置。",
        href: "/product/video-agent",
      },
      {
        label: "RELATED PRODUCT 02",
        title: "TGHCI 超融合",
        description: "查看视频模型与业务系统所需的统一算力底座。",
        href: "/product/hci",
      },
    ],
  },
  "agent-development": {
    slug: "agent-development",
    code: "P01",
    category: "平台方案",
    name: "企业智能体开发",
    title: "把模型、知识与流程组合为业务智能体",
    summary:
      "以 LLMOps 技术体系连接模型仓库、知识工程、流程编排、训练、推理与评估，支撑企业智能体从构建到运营。",
    scope:
      "适合需要统一开发工具、复用企业知识、接入现有系统，并对权限、数据和算力进行集中管理的团队。",
    overview: {
      title: "从算力和模型供给一直连接到智能体交付",
      description:
        "方案以元启 AI 开发平台为核心，将模型部署、知识工程、低代码编排、训练评估、权限管理和专家服务组合为完整工具链，减少企业在不同开源组件之间重复集成。",
      points: [
        "模型、知识库、知识图谱和工作流在同一平台组织",
        "低代码与图形化训练降低非算法团队的使用门槛",
        "细粒度操作、数据和算力权限支撑企业级管理",
      ],
    },
    media: {
      src: "/solutions/reference/agent-development-source.jpeg",
      alt: "华鲲元启核心能力与模型训练资料图",
      caption: "资料中的元启核心能力矩阵、图形化模型训练与行业应用方向",
      position: "50% 18%",
    },
    visualLabel: "智能体开发平台",
    visualNodes: ["选择模型", "连接知识", "编排流程", "发布运营"],
    metrics: [
      { value: "3 步", label: "基础构建路径", note: "模型、知识、发布" },
      { value: "6 类", label: "智能体类型", note: "覆盖知识、数据与图像" },
      { value: "全周期", label: "模型管理", note: "训练、推理与评估" },
    ],
    challenges: [
      {
        title: "模型能力与业务流程脱节",
        description:
          "单一模型接口难以直接承接业务，仍需连接知识、工具、规则和人工环节。",
      },
      {
        title: "开发工具与资源分散",
        description:
          "模型、数据、训练、推理和应用发布使用不同工具，重复建设也增加运维成本。",
      },
      {
        title: "企业级管控能力不足",
        description:
          "缺少细粒度的数据、操作和算力权限时，智能体难以安全地进入核心流程。",
      },
    ],
    features: [
      {
        code: "F01",
        title: "企业级知识工程",
        description:
          "支持多模态文档、自动分片、数据库接入和知识图谱，让企业资料成为智能体可调用的知识。",
      },
      {
        code: "F02",
        title: "高准度问答",
        description:
          "通过上下文工程、Embedding 与 Rerank 优化降低模型幻觉，并保留知识引用与核验路径。",
      },
      {
        code: "F03",
        title: "零代码与低代码构建",
        description:
          "使用预置模板和可视化工作流组合模型、知识、MCP 工具与业务系统接口。",
      },
      {
        code: "F04",
        title: "图形化训练与评估",
        description:
          "通过界面完成训练任务配置、过程观察和训练后评估，降低微调操作门槛。",
      },
      {
        code: "F05",
        title: "模型全生命周期管理",
        description:
          "统一管理模型仓库、部署、训练、推理、评估和调用状态，支持多种芯片与模型框架。",
      },
      {
        code: "F06",
        title: "原子级权限管控",
        description:
          "细化用户、操作、数据和算力权限，控制不同团队可使用的知识库、智能体与资源。",
      },
    ],
    stages: [
      {
        title: "选择并部署模型",
        description: "统一管理本地与外部模型，按任务选择部署和推理方式。",
        items: ["模型仓库", "多种部署方式", "推理服务"],
      },
      {
        title: "构建企业知识",
        description: "接入文档与数据源，通过分片、检索和知识图谱形成知识底座。",
        items: ["多模态文档", "自动分片", "知识图谱"],
      },
      {
        title: "编排智能流程",
        description: "通过可视化方式组合模型、知识、MCP 工具和业务节点。",
        items: ["低代码工作流", "MCP 接入", "业务系统连接"],
      },
      {
        title: "评估发布与运营",
        description: "完成效果评估、应用发布、调用统计和持续调优。",
        items: ["模型评估", "应用发布", "运行监控"],
      },
    ],
    layers: [
      {
        code: "L4",
        title: "智能体应用层",
        description: "面向具体岗位和业务流程交付应用",
        items: ["知识问答", "知识加工", "图像处理", "流程编排"],
      },
      {
        code: "L3",
        title: "开发与运营层",
        description: "提供低代码编排、评估、发布和运行管理",
        items: ["流程编排", "评估中心", "任务中心", "调用统计"],
      },
      {
        code: "L2",
        title: "模型与知识层",
        description: "统一组织模型、数据源和企业知识工程",
        items: ["模型仓库", "知识库", "知识图谱", "数据工厂"],
      },
      {
        code: "L1",
        title: "企业管控层",
        description: "把权限、数据与异构算力纳入同一边界",
        items: ["角色权限", "数据权限", "算力分配", "私有部署"],
      },
    ],
    scenarios: [
      {
        label: "KNOWLEDGE",
        title: "企业知识智能体",
        description: "让制度、手册、项目资料和行业知识成为可追溯的工作入口。",
        tags: ["知识问答", "知识加工", "知识图谱"],
      },
      {
        label: "WORKFLOW",
        title: "流程自动化智能体",
        description: "将模型判断、系统接口、规则校验和人工节点编排为业务流程。",
        tags: ["低代码", "MCP", "系统集成"],
      },
      {
        label: "MODEL OPS",
        title: "模型训练与运营",
        description: "统一管理训练、微调、推理、评估以及资源使用状态。",
        tags: ["模型微调", "推理服务", "效果评估"],
      },
    ],
    reference: {
      eyebrow: "INDUSTRY COVERAGE",
      title: "用统一平台支撑跨行业智能应用",
      description:
        "现有资料覆盖政务、医疗、大企业和教育等应用方向，平台提供标准化模型、知识与流程能力，具体场景按客户数据和系统边界配置。",
      results: [
        {
          value: "4 类",
          label: "资料内行业方向",
          note: "政务、医疗、企业、教育",
        },
        { value: "6 模块", label: "核心平台能力", note: "覆盖开发与模型运营" },
        { value: "统一", label: "权限与算力管控", note: "企业级运行边界" },
      ],
    },
    cases: [
      {
        label: "科研制造 / AI 开发平台",
        title: "某钢研院多个行业智能体快速构建",
        description:
          "以元启平台、知识图谱和不同规模模型组合，支撑金相分析检测、矿料物流输送等智能体开发与验证。",
        results: [
          "AI 开发平台对外发布",
          "行业知识图谱建设",
          "多类智能体开发验证",
        ],
      },
      {
        label: "半导体 / 工艺研发",
        title: "某半导体公司一个月上线 20+ 智能体",
        description:
          "围绕工艺配方、未知化合物探索、专利分析、小语种资料和外部知识库更新构建智能应用。",
        results: ["20+ 智能体", "工艺配方大模型", "知识库按月自动刷新"],
      },
      {
        label: "教育 / 知识与出题",
        title: "某教育考试机构体验版场景验证",
        description:
          "通过学科知识库、公式识别、知识图谱和智能出题验证平台能力，再逐步扩大部署范围。",
        results: ["学科知识库", "公式识别", "智能出题"],
      },
    ],
    faqs: [
      {
        question: "华鲲元启、TGHCI 与 AI 全栈方案是什么关系",
        answer:
          "华鲲元启负责模型、知识和智能体开发；TGHCI 负责超融合资源与算力管理；两者共同组成从基础设施到应用开发的 AI 全栈能力。",
      },
      {
        question: "元启平台是否必须配置单独的管理节点",
        answer:
          "平台采用精简架构，可结合超融合底座提高资源利用率。是否需要独立管理节点取决于集群规模、可用性和隔离要求，需要在部署设计阶段确认。",
      },
      {
        question: "知识库支持哪些常见文档类型",
        answer:
          "现有资料列出了 WPS、Word、PDF、Excel、PPT 和纯文本等格式，并支持批量上传、自动分片和重新分片。",
      },
    ],
    relatedProducts: [
      {
        label: "RELATED PRODUCT 01",
        title: "元启 AI 开发平台",
        description: "查看平台架构、功能模块、版本规格与应用案例。",
        href: "/product/tgdataxai",
      },
      {
        label: "RELATED PRODUCT 02",
        title: "TGHCI 超融合",
        description: "查看模型训练、推理和企业业务统一承载底座。",
        href: "/product/hci",
      },
    ],
  },
  "ai-infrastructure": {
    slug: "ai-infrastructure",
    code: "P02",
    category: "平台方案",
    name: "AI 超融合与私有部署",
    title: "在企业边界内构建统一 AI 底座",
    summary:
      "以 TGHCI 为基础统一承载计算、存储、网络、安全和异构 AI 算力，为模型、数据平台与核心业务提供可扩展环境。",
    scope:
      "适合需要整合存量 X86 与 ARM 服务器、统一 GPU 与 NPU 资源，并满足本地数据安全和持续扩展要求的组织。",
    overview: {
      title: "用一套资源池同时承载通用业务与智能算力",
      description:
        "方案通过软件定义方式融合服务器虚拟化、分布式存储、网络、安全和 AI 加速资源，在统一管理平台内承载核心业务、数据平台、模型训练与推理任务。",
      points: [
        "X86、ARM、CPU、GPU 与 NPU 进入统一资源管理边界",
        "按节点双向扩展，资源配置随业务负载动态调整",
        "容器编排与预置框架缩短 AI 平台环境部署周期",
      ],
    },
    media: {
      src: "/solutions/reference/ai-infrastructure-official.png",
      alt: "华鲲振宇 TGHCI AI 超融合方案资料图",
      caption: "华鲲振宇官网中的 TGHCI 统一管理、异构基础设施与方案亮点示意",
      position: "50% 52%",
    },
    visualLabel: "AI 超融合资源池",
    visualNodes: ["业务应用", "模型平台", "统一调度", "异构算力"],
    metrics: [
      { value: "CPU / GPU / NPU", label: "异构算力统管", note: "统一资源池" },
      { value: "Scale-in / out", label: "双向扩展", note: "按业务负载调整" },
      { value: "95%+", label: "代码自主率", note: "资料给定口径" },
    ],
    challenges: [
      {
        title: "基础设施烟囱化",
        description:
          "计算、存储、网络与 AI 加速资源分别建设，配置和扩展需要跨多套系统操作。",
      },
      {
        title: "异构算力利用不均",
        description:
          "CPU、GPU、NPU 与不同服务器架构缺少统一调度，局部资源闲置与拥塞并存。",
      },
      {
        title: "AI 与核心业务相互割裂",
        description:
          "模型平台、数据平台和企业核心系统独立运行，难以共享资源和统一保障。",
      },
    ],
    features: [
      {
        code: "F01",
        title: "异构算力统管和调度",
        description:
          "统一管理 CPU、GPU、NPU 和不同服务器架构，通过混合调度动态平衡资源负载。",
      },
      {
        code: "F02",
        title: "架构轻量与灵活扩展",
        description:
          "采用扁平化、插件化设计，并支持 Scale-in 与 Scale-out 双向扩展和节点级调整。",
      },
      {
        code: "F03",
        title: "原生 AI 深度融合",
        description:
          "预置模型任务管理、AI 算力调度、模型仓库以及训练和推理框架，简化 AI 环境准备。",
      },
      {
        code: "F04",
        title: "统一运维与可视化监控",
        description:
          "集中管理性能、告警、日志、巡检和资源健康状态，并通过数字孪生大屏展示关键指标。",
      },
    ],
    stages: [
      {
        title: "盘点现有基础设施",
        description: "梳理服务器、存储、网络、AI 加速卡与现行业务负载。",
        items: ["资源清单", "负载画像", "兼容性评估"],
      },
      {
        title: "构建统一资源池",
        description: "通过软件定义方式融合计算、存储、网络、安全与异构算力。",
        items: ["计算虚拟化", "存储虚拟化", "网络与安全虚拟化"],
      },
      {
        title: "部署 AI 平台与模型",
        description: "自动化准备平台环境，按业务需要部署训练和推理任务。",
        items: ["容器编排", "模型部署", "算力调度"],
      },
      {
        title: "统一运维与弹性扩展",
        description: "集中监控资源、告警和运行状态，随负载进行扩缩容。",
        items: ["性能监控", "健康巡检", "节点级扩缩容"],
      },
    ],
    layers: [
      {
        code: "L4",
        title: "业务与 AI 应用层",
        description: "统一承载企业系统、数据平台与智能应用",
        items: ["核心业务", "数据平台", "训练任务", "推理服务"],
      },
      {
        code: "L3",
        title: "平台服务层",
        description: "为模型和应用提供容器、框架与自动部署能力",
        items: ["K8S", "计算框架", "模型仓库", "自动部署"],
      },
      {
        code: "L2",
        title: "软件定义资源层",
        description: "融合计算、存储、网络、安全和智能运维",
        items: ["计算虚拟化", "分布式存储", "网络虚拟化", "统一运维"],
      },
      {
        code: "L1",
        title: "异构基础设施层",
        description: "兼容多架构服务器和多种 AI 加速资源",
        items: ["X86", "ARM", "GPU", "NPU"],
      },
    ],
    scenarios: [
      {
        label: "INFERENCE",
        title: "企业模型推理",
        description: "为大语言模型和多模态模型提供私有、弹性的推理资源。",
        tags: ["大模型推理", "弹性算力", "本地数据"],
      },
      {
        label: "TRAINING",
        title: "训练与微调",
        description: "统一调度异构算力，承载数据处理、训练、微调和评估任务。",
        tags: ["GPU / NPU", "任务调度", "资源监控"],
      },
      {
        label: "CONVERGENCE",
        title: "融合业务承载",
        description: "在同一资源池中承载 AI、数据平台与企业核心业务。",
        tags: ["混合负载", "高可用", "统一运维"],
      },
    ],
    reference: {
      eyebrow: "DEPLOYMENT REFERENCE",
      title: "从存量环境评估到节点级扩展",
      description:
        "方案支持以单节点为最小步长进行扩展，并兼容 CPU、GPU、NPU 等异构资源。最终节点数量、磁盘、网络与加速卡配置需根据模型规模、并发和业务负载确认。",
      results: [
        { value: "单节点", label: "最小扩容步长", note: "资料给定能力口径" },
        { value: "统一", label: "计算存储网络管理", note: "软件定义资源池" },
        { value: "本地", label: "数据与模型边界", note: "私有化部署" },
      ],
    },
    faqs: [
      {
        question: "TGHCI 可以统一管理哪些类型的算力",
        answer:
          "方案面向 CPU、GPU、NPU 等异构算力，并支持 X86 与 ARM 等不同服务器架构。具体卡型与驱动兼容性需要结合兼容矩阵确认。",
      },
      {
        question: "后续扩容是否必须一次增加多个节点",
        answer:
          "资料说明方案支持以单节点为最小扩容步长，并具备 Scale-in 与 Scale-out 双向调整能力，实际扩缩容仍需满足数据保护和高可用要求。",
      },
      {
        question: "同一资源池能否同时运行核心业务和 AI 任务",
        answer:
          "可以。方案面向模型训推、数据平台和企业核心系统的融合承载，通过资源池化、隔离和动态分配平衡稳定性与算力弹性。",
      },
    ],
    relatedProducts: [
      {
        label: "RELATED PRODUCT 01",
        title: "TGHCI 超融合",
        description: "查看软件功能、架构特性与典型硬件配置。",
        href: "/product/hci",
      },
      {
        label: "RELATED PRODUCT 02",
        title: "元启 AI 开发平台",
        description: "查看运行在统一底座之上的模型与智能体开发能力。",
        href: "/product/tgdataxai",
      },
    ],
  },
} as const satisfies Record<string, SolutionDetail>;

export type SolutionSlug = keyof typeof solutionDetails;

export const solutionSlugs = Object.keys(solutionDetails) as SolutionSlug[];

export function getSolutionDetail(slug: string): SolutionDetail | undefined {
  if (!(slug in solutionDetails)) return undefined;
  return solutionDetails[slug as SolutionSlug];
}
