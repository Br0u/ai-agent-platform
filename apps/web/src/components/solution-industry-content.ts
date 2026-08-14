export type SolutionCapability = {
  name: string;
  desc: string;
  tags: readonly string[];
  product: string;
  anchor?: string;
  anchorLabel?: string;
};

export type SolutionCase = {
  client: string;
  problem: string;
  solution: string;
  effect: string;
  closing?: string;
};

export type SolutionMetric = {
  title: string;
  desc: string;
};

export type V2IndustrySolution = {
  key: string;
  industry:
    | "finance"
    | "railway"
    | "electric"
    | "semiconductor"
    | "publicsecurity"
    | "emergency"
    | "enterprise"
    | "government";
  family: string;
  name: string;
  problem: string;
  audience: string;
  value: string;
  valueTags: readonly string[];
  products: readonly string[];
  capabilities: readonly SolutionCapability[];
  case?: SolutionCase;
  metrics?: readonly SolutionMetric[];
  noResultImg?: boolean;
  noHeroImg?: boolean;
};

export const industryLabels = {
  finance: "金融",
  railway: "铁路",
  electric: "电力",
  semiconductor: "半导体",
  publicsecurity: "公安",
  emergency: "应急",
  enterprise: "企业通用",
  government: "政务",
} as const;

export const industrySolutionCatalog = [
  {
    key: "finance-compliance",
    industry: "finance",
    family: "document",
    name: "贷款合规智能审查",
    problem:
      "贷款“三个办法”实施后，贷前材料核验、规则校验与审批留痕要求更严格，人工审核压力大。",
    audience: "银行信贷、风控与审批团队",
    value:
      "自动识别贷款材料、规则校验并生成预审报告，辅助审批统一尺度、全程留痕。",
    valueTags: ["材料智能识别", "规则自动校验", "预审报告", "全程留痕"],
    products: ["knowledge", "agents", "governance"],
    case: {
      client: "某农村商业银行",
      problem: "信审依赖纯人工，审核耗时长、主观判断差异大。",
      solution: "元启AI开发平台+OCR识别、知识库分片、流程编排智能分析。",
      effect: "自动化提升流转效率，降低单笔信审人力成本与周期，审批标准化。",
      closing:
        "本方案帮助银行建立覆盖贷前调查、审批、支付与贷后管理的信贷合规闭环，将监管要求转化为可执行流程，实现审批留痕、口径统一、风险可控。",
    },
    capabilities: [
      {
        name: "材料识别与信息提取",
        desc: "通过 OCR 与文档解析自动识别贷款申请材料，提取关键信息与影像要素，为规则校验与审批提供结构化数据基础。",
        tags: ["OCR识别", "信息提取", "结构化"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "规则匹配与风险核验",
        desc: "匹配贷款审批规则库，通过知识图谱关联与规则引擎自动校验材料完整性与合规性，识别授信、支付、贷后等环节风险点。",
        tags: ["规则库", "知识图谱", "风险核验"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "预审报告与智能分析",
        desc: "基于大语言模型对贷款申请进行智能分析，自动生成结构化预审报告与判断依据，辅助审批人员快速决策。",
        tags: ["大模型分析", "预审报告", "决策支持"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "流程编排与审批留痕",
        desc: "通过流程编排串联材料审核、规则校验与审批环节，自动流转、全程留痕，支撑贷前、贷中、贷后全流程管理。",
        tags: ["流程编排", "自动流转", "全程留痕"],
        product: "agents",
        anchor: "agent-orchestration",
        anchorLabel: "流程编排智能体",
      },
    ],
  },
  {
    key: "finance-aml",
    industry: "finance",
    family: "data",
    name: "交易监测模型智能开发",
    problem:
      "反洗钱法修订后，开户、对公、跨境、支付等环节的客户尽职调查与异常交易监测要求大幅提高。",
    audience: "银行合规、风控与运营团队",
    value:
      "融合内外部数据形成客户画像，辅助异常交易识别、可疑交易报告与风险预警，减少误报。",
    valueTags: ["客户画像", "异常交易监测", "可疑交易报告", "误报降低"],
    products: ["knowledge", "agents", "governance"],
    case: {
      client: "金融机构",
      problem: "客户身份与交易监测要求提高，异常交易识别依赖人工经验、误报高。",
      solution:
        "升级反洗钱模型，融合客户交易、舆情与非结构化文档形成风险洞察。",
      effect: "提高可疑交易识别能力、减少误报，反洗钱责任可量化。",
      closing:
        "本方案帮助金融机构建立覆盖客户识别、交易监测、预警处置的完整反洗钱闭环，将监管要求转化为可执行流程，实现风险早识别、处置可留痕、责任可量化。",
    },
    capabilities: [
      {
        name: "数据接入与融合",
        desc: "接入客户交易流水、开户信息、受益所有人识别数据及外部舆情、非结构化文档等多元数据源，完成清洗、对齐与口径统一，为画像构建与交易监测提供完整可信的数据基础。",
        tags: ["多源数据接入", "数据清洗", "口径统一"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "客户画像构建",
        desc: "基于客户身份、交易、资金与风险特征进行维度建模，自动形成客户经营、交易、价值与风险画像，识别空壳公司、复杂股权结构、异常资金来源等风险信号。",
        tags: ["维度建模", "风险特征识别", "画像报告"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "模型开发与调优",
        desc: "以自然语言驱动开发反洗钱监测模型，通过双模式工作流与内置工具链完成代码编写、运行与验证，模型持续迭代优化，降低误报、提高可疑交易识别能力。",
        tags: ["模型开发", "AI 编程", "迭代调优"],
        product: "coding",
        anchor: "coding-assistant",
        anchorLabel: "自然语言开发",
      },
      {
        name: "预警与报告",
        desc: "自动生成可疑交易预警与报告，辅助合规人员完成甄别、处置与留痕，支撑可疑交易报告报送与监管审计要求，反洗钱责任可量化。",
        tags: ["可疑交易预警", "报告生成", "全程留痕"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
    ],
    metrics: [
      {
        title: "异常交易识别",
        desc: "规则与模型自动甄别异常交易，误报显著降低。",
      },
      {
        title: "可疑交易报告",
        desc: "自动生成可疑交易预警与报告，支撑报送与监管审计。",
      },
      {
        title: "客户画像洞察",
        desc: "多维画像识别风险信号，客户识别更精准。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "finance-operations",
    industry: "finance",
    family: "document",
    name: "合规运营",
    problem:
      "金融机构合规管理办法落地，新产品上线、营销、代销等环节需事前审查与事中监测。",
    audience: "银行合规、运营与产品部门",
    value:
      "将监管要求拆解到部门、岗位与流程，辅助制度、合同与营销材料合规审查。",
    valueTags: ["监管要求拆解", "合规审查", "事前监测", "整改留痕"],
    products: ["knowledge", "agents", "governance"],
    capabilities: [
      {
        name: "监管要求拆解",
        desc: "将监管制度拆解为部门、岗位、流程与系统的合规要求清单，建立可执行的合规审查依据。",
        tags: ["监管拆解", "制度映射", "合规清单"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "制度与合同审查",
        desc: "自动识别新产品、新流程的适用监管要求，辅助制度、合同与业务材料合规审查，统一审查口径。",
        tags: ["合规审查", "规则核对", "口径统一"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "营销与披露审核",
        desc: "对营销材料、信息披露与风险提示进行合规性检测，避免销售误导与披露缺失。",
        tags: ["营销审核", "披露检测", "风险提示"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "整改跟踪与留痕",
        desc: "记录合规整改任务与处理状态，支持合规检查与审计留痕，责任到人、过程可追溯。",
        tags: ["整改跟踪", "留痕审计", "责任到人"],
        product: "governance",
        anchor: "gov-base",
        anchorLabel: "权限管理",
      },
    ],
    metrics: [
      {
        title: "监管覆盖",
        desc: "监管要求逐条拆解到流程与岗位，合规审查有据可依。",
      },
      {
        title: "审查提效",
        desc: "制度、合同与营销材料合规审查自动化，口径统一。",
      },
      {
        title: "留痕审计",
        desc: "整改任务与处理全程留痕，支撑合规检查与审计。",
      },
    ],
    noResultImg: true,
    case: {
      client: "金融机构",
      problem:
        "金融机构合规管理要求提高，新产品上线、营销、代销等环节审查压力大、口径不一。",
      solution:
        "构建合规运营助手，拆解监管要求、自动审查制度合同与营销材料、跟踪整改留痕。",
      effect: "合规审查自动化、口径统一，整改任务闭环管理、全程留痕。",
      closing:
        "本方案帮助金融机构建立覆盖制度、合同、营销与披露的合规审查闭环，将监管要求转化为可执行流程，实现审查留痕、口径统一、责任到人。",
    },
  },
  {
    key: "finance-knowledge",
    industry: "finance",
    family: "knowledge",
    name: "内部制度问答",
    problem: "制度、产品与合规话术更新频繁，内部查询与答复口径难以统一。",
    audience: "产品、运营、客服、合规与内部支持团队",
    value: "统一沉淀制度与产品知识，回答可溯源、口径一致，支撑内部高效查询。",
    valueTags: ["制度知识统一", "回答口径一致", "可溯源引用", "持续更新"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "某农村商业银行",
      problem: "海量内部法规、产品手册与管理制依赖人工检索，效率低。",
      solution: "LLM+RAG 将非结构化文档转为可检索知识资产，高精度检索与溯源。",
      effect: "高精准、100%私有化的知识问答助手，分钟级上线。",
      closing:
        "本方案帮助银行将海量制度知识转化为统一、可溯源的知识服务，实现口径一致、查询提效、知识持续沉淀。",
    },
    capabilities: [
      {
        name: "制度资料接入",
        desc: "接入银行制度、产品手册与合规话术资料，完成解析与向量化入库，建立统一知识底座。",
        tags: ["制度接入", "解析入库", "知识底座"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "知识处理与优化",
        desc: "自动分片、标注与构建问答对，持续维护知识库质量，确保回答口径一致、可溯源。",
        tags: ["知识分片", "QA构建", "持续维护"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "问答智能体构建",
        desc: "关联模型与知识库，配置回答规则与引用溯源，快速构建内部制度问答智能体。",
        tags: ["智能体构建", "回答溯源", "快速搭建"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "发布与权限管控",
        desc: "将智能体发布为员工可用服务，按角色控制访问范围，保障数据安全。",
        tags: ["应用发布", "权限管控", "访问控制"],
        product: "governance",
        anchor: "gov-base",
        anchorLabel: "权限管理",
      },
    ],
    metrics: [
      {
        title: "口径统一",
        desc: "制度与产品知识统一沉淀，回答口径一致、可溯源。",
      },
      {
        title: "查询提效",
        desc: "员工即问即答，制度查询从人工检索转为智能应答。",
      },
      {
        title: "持续维护",
        desc: "知识库自动分片标注，持续更新保障质量。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "finance-assistant",
    industry: "finance",
    family: "assistant",
    name: "智能客服与合规话术",
    problem: "客服压力大、产品口径不统一、合规风险高，资料查阅与话术撰写耗时。",
    audience: "银行客服、客户经理与产品运营团队",
    value: "合规话术生成与内容审查，自动答疑与话术推荐，统一对外口径。",
    valueTags: ["话术自动生成", "合规内容审查", "口径统一", "投诉风险降低"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "金融机构",
      problem: "客户咨询响应慢，产品解释口径不一，话术合规风险高。",
      solution: "构建智能客服与合规话术助手，接入合规话术库，双重内容检测。",
      effect: "服务响应从30分钟降至5分钟内，投诉风险目标降低50%。",
      closing:
        "本方案帮助金融机构统一客服口径、规范话术表达，实现服务提速、投诉下降、合规风险可控。",
    },
    capabilities: [
      {
        name: "知识库接入",
        desc: "接入产品知识、制度与合规话术库，统一业务口径，为话术生成提供知识基础。",
        tags: ["知识库", "口径统一", "话术库"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "话术智能生成",
        desc: "基于客户问题自动生成合规、专业的应答话术，覆盖产品咨询与常见业务解答。",
        tags: ["话术生成", "自动应答", "专业表达"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "合规内容审查",
        desc: "对用户提问与模型回复进行双重合规检测，拦截风险话术，规避违规风险。",
        tags: ["内容审查", "双重检测", "风险拦截"],
        product: "governance",
        anchor: "gov-base",
        anchorLabel: "权限管理",
      },
      {
        name: "权限与数据管控",
        desc: "细化权限分配，保障业务安全与数据合规，支撑客服与客户经理规范使用。",
        tags: ["权限管控", "数据安全", "规范使用"],
        product: "governance",
        anchor: "gov-base",
        anchorLabel: "权限管理",
      },
    ],
    metrics: [
      {
        title: "响应提速",
        desc: "客服响应时间大幅缩短，服务效率显著提升。",
      },
      {
        title: "口径统一",
        desc: "合规话术统一生成，对外解释口径一致。",
      },
      {
        title: "风险降低",
        desc: "话术双重合规检测，投诉与违规风险下降。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "finance-qa",
    industry: "finance",
    family: "knowledge",
    name: "金融知识问答",
    problem: "客户与员工高频业务知识查询依赖人工，信息获取路径长。",
    audience: "银行客服、大堂与业务部门",
    value: "智能问答与引用溯源，快速回答产品、业务与政策类问题。",
    valueTags: ["智能问答", "引用溯源", "知识库", "即问即答"],
    products: ["knowledge", "agents", "applications"],
    capabilities: [
      {
        name: "知识库构建",
        desc: "汇聚产品、业务与政策知识，建立统一金融知识入口，支撑高频问题查询。",
        tags: ["知识汇聚", "知识库", "统一入口"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "智能问答",
        desc: "支持多轮问答与意图理解，快速回答客户与员工的业务、产品与政策类问题。",
        tags: ["智能问答", "多轮对话", "意图理解"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "引用溯源",
        desc: "回答关联原文出处，确保信息可追溯、口径一致，降低解答偏差。",
        tags: ["引用溯源", "口径一致", "可追溯"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "发布与服务",
        desc: "发布为客服、大堂等场景可用的问答服务，支持多渠道接入。",
        tags: ["应用发布", "多渠道", "服务接入"],
        product: "applications",
        anchor: "",
        anchorLabel: "行业应用中心",
      },
    ],
    case: {
      client: "金融机构",
      problem:
        "客户与员工高频业务知识查询依赖人工，信息获取路径长、口径不一致。",
      solution:
        "构建统一金融知识库与智能问答服务，多轮问答、引用溯源、多渠道发布。",
      effect: "高频问题即问即答、回答可溯源，员工与客户服务效率显著提升。",
      closing:
        "本方案帮助金融机构建立统一、可溯源的知识服务闭环，实现口径一致、即问即答、知识持续沉淀。",
    },
  },
  {
    key: "railway-parse",
    industry: "railway",
    family: "knowledge",
    name: "规章制度精准解析",
    problem: "大量带水印、扫描件的 PDF 无法准确解析，规章检索与利用困难。",
    audience: "铁路局机关、站段与业务处室",
    value: "OCR 精准解析水印与扫描件，自动切片与向量化，打破知识孤岛。",
    valueTags: ["精准解析", "扫描件识别", "自动切片", "向量化"],
    products: ["knowledge", "agents", "applications"],
    capabilities: [
      {
        name: "文档精准解析",
        desc: "通过 OCR 精准识别带水印、扫描件的 PDF，解析复杂排版，打破知识孤岛。",
        tags: ["OCR解析", "水印扫描件", "精准解析"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "智能分片与向量化",
        desc: "按语义逻辑自动切片、向量化入库，形成可检索、可用的规章知识。",
        tags: ["智能分片", "向量化", "知识入库"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "多模态内容识别",
        desc: "识别 PDF 内图表、印章与复杂版式，完整提取规章信息。",
        tags: ["多模态", "图表印章", "信息提取"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "知识库构建",
        desc: "沉淀铁路规章知识库，支撑后续检索、问答与业务使用。",
        tags: ["知识库", "检索支撑", "知识沉淀"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
    ],
    metrics: [
      {
        title: "解析精度",
        desc: "水印、扫描件精准解析，知识利用效率大幅提升。",
      },
      {
        title: "入库高效",
        desc: "自动分片向量化，海量规章快速入库。",
      },
      {
        title: "知识可用",
        desc: "沉淀规章知识库，支撑检索、问答与业务使用。",
      },
    ],
    noResultImg: true,
    case: {
      client: "铁路局",
      problem: "大量带水印、扫描件规章无法精准解析，知识利用困难。",
      solution:
        "通过 OCR 精准解析水印与扫描件，智能分片向量化，构建可检索规章知识库。",
      effect: "海量规章快速入库、精准检索，知识利用率大幅提升。",
      closing:
        "本方案帮助铁路局打破规章知识孤岛，构建可检索、可复用的规章知识底座。",
    },
  },
  {
    key: "railway-rag",
    industry: "railway",
    family: "knowledge",
    name: "知识图谱与可信溯源",
    problem: "规章问答易产生幻觉，业务实操需要回答有据可查。",
    audience: "铁路局业务处室与现场作业单位",
    value: "知识图谱 + RAG 结构化关联，回答强制关联原文段落，严谨可信。",
    valueTags: ["知识图谱", "RAG", "可信溯源", "严谨回答"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "铁路局",
      problem: "规章制度检索慢、口径不一，问答易幻觉。",
      solution: "知识图谱+RAG 结构化关联，回复强制引用原文档具体段落。",
      effect: "AI 智能闪答、回答 100% 可信可追溯。",
      closing:
        "本方案帮助铁路局将规章制度转化为可信、可溯源的智能知识服务，业务问答严谨可靠、有据可查。",
    },
    capabilities: [
      {
        name: "知识图谱构建",
        desc: "自动生成规章制度关联图谱，跨文档建立结构化知识关联。",
        tags: ["知识图谱", "关联构建", "结构化"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "检索增强生成",
        desc: "通过 RAG 检索增强生成，引用原文段落，抑制模型幻觉。",
        tags: ["RAG", "精准检索", "抑制幻觉"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "回答可信溯源",
        desc: "回复强制关联原文档具体段落，业务实操有据可查。",
        tags: ["原文溯源", "有据可查", "可信"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "严谨问答",
        desc: "依托结构化图谱限制模型发散，保证规章问答绝对严谨。",
        tags: ["严谨回答", "限制发散", "规范"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
    ],
    metrics: [
      {
        title: "回答溯源",
        desc: "回复强制关联原文段落，业务实操有据可查。",
      },
      {
        title: "严谨可靠",
        desc: "知识图谱限制发散，规章问答绝对严谨。",
      },
      {
        title: "关联图谱",
        desc: "跨文档自动生成知识图谱，结构化检索。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "railway-video",
    industry: "railway",
    family: "video",
    name: "施工安全视觉检索",
    problem: "施工作业“无视频不作业”，人工监控难以及时发现异物侵入与违规行为。",
    audience: "铁路工务、电务、供电与安全监察部门",
    value: "自然语言检索视频目标、实时纠察违规行为，异物与设备状态秒级排查。",
    valueTags: ["自然语言检索", "作业合规", "异物排查", "实时纠察"],
    products: ["knowledge", "agents", "applications"],
    capabilities: [
      {
        name: "视频接入",
        desc: "接入施工现场在线视频与历史录像，建立可分析的视频资源。",
        tags: ["视频接入", "实时视频", "历史录像"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "自然语言检索",
        desc: "用自然语言描述检索异物、违规越线等目标，降低检索门槛。",
        tags: ["自然语言检索", "语义理解", "目标定位"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "实时纠察",
        desc: "持续分析视频流，实时识别违规行为并告警。",
        tags: ["实时分析", "违规纠察", "主动告警"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "设备状态排查",
        desc: "识别异物侵入与设备状态异常，秒级定位、快速响应。",
        tags: ["异物排查", "设备状态", "秒级响应"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "实时纠察",
        desc: "自然语言检索违规行为，实时纠察告警。",
      },
      {
        title: "异物排查",
        desc: "异物侵入与设备状态秒级定位。",
      },
      {
        title: "作业合规",
        desc: "施工“无视频不作业”，安全监管升级。",
      },
    ],
    noResultImg: true,
    case: {
      client: "铁路局",
      problem:
        "施工作业“无视频不作业”，人工监控难以及时发现异物侵入与违规行为。",
      solution: "视觉大模型自然语言检索与实时纠察，异物与设备状态秒级排查。",
      effect: "告别被动录像、实现主动语义追踪，作业安全监管效率大幅提升。",
      closing:
        "本方案帮助铁路局构建施工作业视频智能监管闭环，违规早发现、异物秒排查、作业更安全。",
    },
  },
  {
    key: "railway-exam",
    industry: "railway",
    family: "knowledge",
    name: "党建知识库智能问答",
    problem: "党史文献与学习材料检索慢、利用率低，出题与判卷依赖人工。",
    audience: "铁路局党群部门与各级党组织",
    value: "构建党建知识库，员工即问即答；依托知识图谱自动出题判卷。",
    valueTags: ["党建知识库", "智能问答", "自动出题", "在线考试"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "某铁路局",
      problem: "党史文献检索慢，考试出题判卷费人力。",
      solution: "汇聚 PDF/Word 党建文献构建知识库，智能体编排自动生成考卷。",
      effect: "党建智能化考核监督机制，全天候知识问答与考试服务。",
      closing:
        "本方案帮助铁路局构建党建知识库与智能考试闭环，实现全员随时学、考学一体、考核留痕。",
    },
    capabilities: [
      {
        name: "党建知识库",
        desc: "汇聚党史文献、规章制度与学习材料，建立党建知识库。",
        tags: ["党建知识", "知识库", "学习材料"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "智能问答",
        desc: "员工即问即答，全天候获取党建知识。",
        tags: ["智能问答", "即问即答", "全天候"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "自动出题",
        desc: "依托知识图谱深度理解，自动生成考卷。",
        tags: ["自动出题", "知识图谱", "智能生成"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "在线考试判卷",
        desc: "完成在线考试与自动判卷，实现党建智能化考核。",
        tags: ["在线考试", "自动判卷", "智能考核"],
        product: "applications",
        anchor: "",
        anchorLabel: "行业应用中心",
      },
    ],
    metrics: [
      {
        title: "知识覆盖",
        desc: "党建知识库全量汇聚，员工即问即答。",
      },
      {
        title: "出题提效",
        desc: "依托知识图谱自动出题，判卷全自动化。",
      },
      {
        title: "考核留痕",
        desc: "在线考试与成绩留痕，党建考核智能化。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "electric-ticket",
    industry: "electric",
    family: "process",
    name: "两票作业智能监管",
    problem:
      "两票作业现场监管依赖人工，作业行为违规难以及时发现，跨系统协同困难。",
    audience: "电厂运行、检修与安全管理部门",
    value:
      "结合两票数据与监控视频验证作业行为，作业识别-监控-告警-报告-处置-归档 AI 自闭环。",
    valueTags: ["两票协同", "作业自闭环", "大小模型双层过滤", "自然语言驱动"],
    products: ["agents", "applications", "governance"],
    case: {
      client: "电厂",
      problem: "设备运维以人工巡检与固定阈值报警为主，隐患发现滞后。",
      solution: "打通流程编排与视频检索，结合两票数据与监控视频验证异常行为。",
      effect: "检测准确率大于90%，两票与视频关键信息自动提取准确率不低于95%。",
      closing:
        "本方案帮助电厂实现两票作业识别、监控、告警、处置的监管闭环，作业安全可控、多系统协同。",
    },
    capabilities: [
      {
        name: "两票数据接入",
        desc: "对接两票系统，获取作业计划、许可与执行数据。",
        tags: ["两票对接", "数据接入", "作业数据"],
        product: "agents",
        anchor: "agent-orchestration",
        anchorLabel: "流程编排智能体",
      },
      {
        name: "视频与知识协同",
        desc: "结合监控视频与两票数据验证作业行为，多源协同判断。",
        tags: ["视频协同", "知识解析", "协同判断"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "作业监管闭环",
        desc: "实现作业识别-监控-告警-报告-处置-归档的 AI 自闭环。",
        tags: ["作业闭环", "自动告警", "全流程"],
        product: "agents",
        anchor: "agent-orchestration",
        anchorLabel: "流程编排智能体",
      },
      {
        name: "大小模型双层过滤",
        desc: "小模型实时识别 + 大模型深度理解，降低误报、提升准确率。",
        tags: ["大小模型", "双层过滤", "低误报"],
        product: "model",
        anchor: "model-deploy",
        anchorLabel: "模型部署与服务",
      },
    ],
    metrics: [
      {
        title: "作业闭环",
        desc: "作业识别-监控-告警-处置全程 AI 自闭环。",
      },
      {
        title: "识别准确",
        desc: "检测准确率大于90%，关键信息提取率不低于95%。",
      },
      {
        title: "系统协同",
        desc: "两票、视频、知识多系统协同判断。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "electric-data",
    industry: "electric",
    family: "data",
    name: "经营数据智能问数",
    problem:
      "指标分析与监盘数据靠人工表格汇总报告，周期长、口径不一、数据孤岛多。",
    audience: "电厂经营、生产与统计部门",
    value: "自然语言问数、报表自动生成与数据归因分析，全厂经营指标“一问便知”。",
    valueTags: ["自然语言问数", "报表自动生成", "数据归因", "多源融合"],
    products: ["knowledge", "agents", "governance"],
    case: {
      client: "电厂",
      problem: "人工表格汇总报告周期长，DCS 与业务系统数据孤岛突出。",
      solution:
        "元启智能问数结合运行日报，自然语言生成智能体、问数与报表自动生成。",
      effect: "一句话构建智能体，零门槛掌控经营数据，报表自动生成。",
      closing:
        "本方案帮助电厂打通经营数据链路，实现指标一问便知、报表自动生成、决策有据可依。",
    },
    capabilities: [
      {
        name: "数据接入与整合",
        desc: "接入经营台账、DCS 与业务系统数据，统一指标口径。",
        tags: ["数据接入", "口径统一", "数据整合"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "自然语言问数",
        desc: "用自然语言查询经营指标、监盘数据与报表，零门槛取数。",
        tags: ["自然语言问数", "指标查询", "零门槛"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "报表自动生成",
        desc: "自动生成统计报表与可视化图表，支撑经营分析。",
        tags: ["报表生成", "可视化", "统计分析"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "数据归因分析",
        desc: "多源数据融合诊断、根因定位与处置建议。",
        tags: ["数据归因", "根因分析", "处置建议"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
    ],
    metrics: [
      {
        title: "取数提效",
        desc: "自然语言问数，指标查询零门槛、秒级响应。",
      },
      {
        title: "报表生成",
        desc: "统计报表与可视化自动生成，支撑经营分析。",
      },
      {
        title: "口径统一",
        desc: "多源数据整合统一口径，分析结果可信。",
      },
    ],
    noResultImg: false,
  },
  {
    key: "electric-fault",
    industry: "electric",
    family: "assistant",
    name: "设备故障监测与诊断",
    problem: "DCS 系统数据海量，工况判断依赖个人经验，故障定位慢。",
    audience: "电厂运行、检修与设备管理部门",
    value: "与仿真系统对接实时检测诊断，故障与知识问答，多源数据融合定位根因。",
    valueTags: ["实时监测", "故障诊断", "知识问答", "根因定位"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "电厂",
      problem: "工况动态波动，运行人员依赖个人经验调整，决策质量难保障。",
      solution: "智能体与仿真系统对接，实时检测数据，故障咨询与知识查询。",
      effect: "多样化数据查询与多故障实时监测/诊断知识问答。",
      closing:
        "本方案帮助电厂建立设备数据实时监测与故障诊断闭环，故障早发现、根因可定位、处置有依据。",
    },
    capabilities: [
      {
        name: "仿真数据对接",
        desc: "与仿真系统对接，实时获取设备检测数据。",
        tags: ["仿真对接", "实时数据", "数据获取"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "实时监测诊断",
        desc: "检测设备运行状态，识别异常与故障。",
        tags: ["实时监测", "故障识别", "状态检测"],
        product: "model",
        anchor: "model-deploy",
        anchorLabel: "模型部署与服务",
      },
      {
        name: "故障知识问答",
        desc: "提供故障问题咨询与知识查询。",
        tags: ["故障问答", "知识查询", "智能解答"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "根因定位",
        desc: "多源数据融合定位故障根因，辅助处置决策。",
        tags: ["根因定位", "多源融合", "处置决策"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
    ],
    metrics: [
      {
        title: "实时监测",
        desc: "仿真数据实时对接，故障状态秒级感知。",
      },
      {
        title: "根因定位",
        desc: "多源数据融合定位故障根因，辅助处置。",
      },
      {
        title: "知识问答",
        desc: "故障问题智能解答，知识即时获取。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "electric-video",
    industry: "electric",
    family: "video",
    name: "厂区视觉智能巡检",
    problem:
      "人工定期巡检难以及时捕捉早期、非典型设备异常信号，存在非计划停机风险。",
    audience: "电厂安全、运行与设备管理部门",
    value:
      "自动化巡检与多系统协同，识别未戴安全帽、火灾、积水/漏油等异常并预警。",
    valueTags: ["自动巡检", "多系统协同", "异常识别", "提前预警"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "电厂",
      problem: "设备运维人工巡检，隐患发现严重滞后。",
      solution:
        "电厂视觉智能体，视频解析+知识解析+流程编排+Skills 全流程 AI 自主闭环。",
      effect: "准确识别小模型误识别场景，检测准确率大于90%。",
      closing:
        "本方案帮助电厂实现厂区设备全天候自动巡检，隐患早识别、异常早预警、运行更安全。",
    },
    capabilities: [
      {
        name: "视频接入",
        desc: "接入厂区监控视频流，建立巡检视频资源。",
        tags: ["视频接入", "实时监控", "巡检资源"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "异常识别",
        desc: "识别未戴安全帽、火灾、积水/漏油等异常。",
        tags: ["异常识别", "多场景", "精准检测"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "自动巡检",
        desc: "自动化巡检替代人工巡查，全天候覆盖。",
        tags: ["自动巡检", "7x24", "无人值守"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "多系统协同",
        desc: "与两票、知识库等系统协同判断，形成业务闭环。",
        tags: ["系统协同", "联动判断", "业务闭环"],
        product: "agents",
        anchor: "agent-orchestration",
        anchorLabel: "流程编排智能体",
      },
    ],
    metrics: [
      {
        title: "异常识别",
        desc: "未戴安全帽、火灾、积水漏油等多场景识别。",
      },
      {
        title: "自动巡检",
        desc: "7x24 自动化巡检，替代人工定期巡查。",
      },
      {
        title: "协同预警",
        desc: "多系统协同判断，隐患提前预警。",
      },
    ],
    noResultImg: false,
  },
  {
    key: "semi-ai-scientist",
    industry: "semiconductor",
    family: "model",
    name: "光刻胶研发模型微调",
    problem:
      "通用模型难以理解材料、工艺、性能与实验数据的复杂耦合关系，幻觉与严谨性不足。",
    audience: "半导体材料研发与算法团队",
    value: "基于 Qwen3-32B LoRA 领域微调，让模型理解专业概念并支撑研发决策。",
    valueTags: ["领域微调", "LoRA", "研发决策", "严谨可验证"],
    products: ["model", "agents", "governance"],
    case: {
      client: "某半导体企业",
      problem: "仅靠通用模型+RAG 难进入材料研发决策深水区。",
      solution:
        "数据工程治理训练数据，Qwen3-32B LoRA 微调，自动与人工评估，智能体应用压测。",
      effect:
        "微调模型专业题综合均分22.38，超越通用大模型，打造光刻胶专属AI科学家。",
      closing:
        "本方案帮助半导体企业将研发数据转化为领域模型资产，实现知识沉淀、研发提速、试错成本降低。",
    },
    capabilities: [
      {
        name: "研发数据治理",
        desc: "治理实验报告、专利文献与测试数据，形成高质量领域训练数据集。",
        tags: ["数据治理", "训练数据", "实验数据"],
        product: "model",
        anchor: "model-training",
        anchorLabel: "模型训练",
      },
      {
        name: "领域模型微调",
        desc: "基于 Qwen3-32B LoRA 微调，内化光刻胶材料领域知识，降低幻觉。",
        tags: ["LoRA微调", "领域模型", "知识内化"],
        product: "model",
        anchor: "model-training",
        anchorLabel: "模型训练",
      },
      {
        name: "模型评估验证",
        desc: "自动化与人工评估模型效果，验证专业能力提升。",
        tags: ["模型评估", "效果验证", "自动评测"],
        product: "model",
        anchor: "model-evaluation",
        anchorLabel: "模型评估",
      },
      {
        name: "研发智能体",
        desc: "将领域模型发布为研发问答与决策智能体，辅助方案研判。",
        tags: ["研发智能体", "决策支持", "问答服务"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
    ],
  },
  {
    key: "ps-ghost-rider",
    industry: "publicsecurity",
    family: "video",
    name: "鬼火少年检测",
    problem: "道路特技骑行等危险行为难以及时发现，影响公共安全。",
    audience: "公安治安与交通管理部门",
    value: "多模态检测特技骑行行为，实时预警并快速响应。",
    valueTags: ["多模态检测", "实时预警", "快速响应", "复杂环境适应"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "公安部门",
      problem: "道路特技骑行等危险行为依赖人工筛查。",
      solution:
        "下发策略至天网/雪亮摄像头，文本、图像、视频多模态检测特技骑行。",
      effect: "实时预警快速响应，复杂视觉环境多源互补避免误报。",
      closing:
        "本方案帮助公安部门构建重点区域视频布控闭环，危险行为早发现、实时预警、快速处置。",
    },
    capabilities: [
      {
        name: "视频接入与布控",
        desc: "接入天网/雪亮工程摄像头，下发重点区域布控策略。",
        tags: ["视频接入", "布控策略", "重点区域"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "多模态行为识别",
        desc: "文本、图像、视频多模态检测特技骑行等危险行为。",
        tags: ["多模态", "行为识别", "危险检测"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "实时预警响应",
        desc: "检测到危险行为即时告警，快速响应处置。",
        tags: ["实时预警", "快速响应", "主动告警"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "实时预警",
        desc: "特技骑行等危险行为即时识别告警。",
      },
      {
        title: "行为识别",
        desc: "多模态检测复杂行为，识别准确可靠。",
      },
      {
        title: "快速响应",
        desc: "发现即预警，快速响应处置。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "ps-minor",
    industry: "publicsecurity",
    family: "video",
    name: "未成年人聚集检测",
    problem: "学校周边、公园广场等未成年人易聚集区域，聚集超阈值难以及时预警。",
    audience: "公安治安与社区管理部门",
    value: "筛选未成年人群体并统计数量，聚集超过阈值时自动识别预警。",
    valueTags: ["人群筛选", "数量统计", "超阈值预警", "实时监测"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "公安部门",
      problem: "未成年人聚集超10人难以及时发现。",
      solution: "下发策略至重点区域摄像头，检测并统计未成年人聚集。",
      effect: "聚集超阈值自动预警，复杂环境多源互补。",
      closing:
        "本方案帮助公安部门实现未成年人聚集早发现、超阈值即预警，守护重点场所安全。",
    },
    capabilities: [
      {
        name: "人群识别统计",
        desc: "识别未成年人群体并统计数量，覆盖学校周边、公园广场等区域。",
        tags: ["人群识别", "数量统计", "重点区域"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "超阈值预警",
        desc: "未成年人聚集超过阈值时自动识别预警。",
        tags: ["超阈值", "自动预警", "及时处置"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "多源互补",
        desc: "复杂视觉环境下多源信息互补，降低误报漏报。",
        tags: ["多源互补", "低误报", "复杂环境"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "聚集预警",
        desc: "未成年人聚集超阈值自动预警。",
      },
      {
        title: "数量统计",
        desc: "群体识别与数量统计精准可靠。",
      },
      {
        title: "多源互补",
        desc: "复杂环境多源信息互补，降低误报。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "ps-mental",
    industry: "publicsecurity",
    family: "video",
    name: "精神病人检测",
    problem: "闲散在社会面的精神病人风险难以及时发现与管控。",
    audience: "公安治安与社区管理部门",
    value: "整合肢体动作、面部表情等多模态信息识别闲散精神病人，实时预警。",
    valueTags: ["多模态识别", "实时预警", "精准判断"],
    products: ["knowledge", "agents", "applications"],
    capabilities: [
      {
        name: "多模态特征识别",
        desc: "整合肢体动作、面部表情等多模态信息识别闲散精神病人。",
        tags: ["多模态", "特征识别", "精准判断"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "实时预警",
        desc: "发现风险及时告警，辅助管控。",
        tags: ["实时预警", "风险发现", "及时管控"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "降低误判",
        desc: "整合多维信息，降低单一模态偏差导致的误判。",
        tags: ["低误判", "多维整合", "可靠识别"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "多模态识别",
        desc: "肢体、表情多维识别，判断精准。",
      },
      {
        title: "实时预警",
        desc: "风险人员及时发现并预警。",
      },
      {
        title: "降低误判",
        desc: "多维整合降低单一模态误判。",
      },
    ],
    noResultImg: true,
    case: {
      client: "公安部门",
      problem: "闲散社会面精神病人风险难以及时发现与管控。",
      solution: "视觉大模型多模态识别闲散精神病人，实时预警辅助管控。",
      effect: "风险人员早发现、早预警，社区治安管控更主动。",
      closing:
        "本方案帮助公安部门构建重点区域风险人员识别闭环，多模态识别、实时预警、辅助管控。",
    },
  },
  {
    key: "ps-nitrous",
    industry: "publicsecurity",
    family: "video",
    name: "吸笑气检测",
    problem: "吸食笑气行为难以及时发现，且需要追溯行为轨迹。",
    audience: "公安治安与禁毒部门",
    value: "识别涉及笑气的相关行为，多模态数据追溯相关人员行为轨迹。",
    valueTags: ["行为识别", "轨迹追溯", "实时预警"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "公安部门",
      problem: "吸食笑气行为发现滞后。",
      solution: "下发策略至重点区域，多模态检测吸笑气行为。",
      effect: "即刻精准识别并判定，基于多模态数据追溯行为轨迹。",
      closing:
        "本方案帮助公安部门实现吸食笑气行为早识别、轨迹可追溯、处置有依据。",
    },
    capabilities: [
      {
        name: "行为识别",
        desc: "识别涉及笑气的相关行为，如车内吸食、异常状态。",
        tags: ["行为识别", "多模态", "异常状态"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "轨迹追溯",
        desc: "基于多模态数据追溯相关人员行为轨迹。",
        tags: ["轨迹追溯", "关联分析", "行为链"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "即时判定",
        desc: "检测到吸笑气行为即刻精准识别并判定。",
        tags: ["即时判定", "精准识别", "实时预警"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "行为识别",
        desc: "吸食笑气等行为即时精准识别。",
      },
      {
        title: "轨迹追溯",
        desc: "多模态数据追溯行为轨迹。",
      },
      {
        title: "即时判定",
        desc: "检测即判定，预警快速。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "ps-violence",
    industry: "publicsecurity",
    family: "video",
    name: "暴力扒窃持刀识别",
    problem: "暴力、扒窃、持刀等行为形态多样，传统小模型难以理解复杂行为组合。",
    audience: "公安治安、刑侦与街面巡控部门",
    value: "视觉大模型理解复杂行为，多条件组合识别暴力、扒窃、持刀等场景。",
    valueTags: ["复杂行为识别", "多条件组合", "低误报", "全场景覆盖"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "公安部门",
      problem: "行为形态多样，传统算法难以理解全局行为。",
      solution: "视觉大模型全局语义理解，识别肢体冲突、武器使用、扒窃等行为。",
      effect: "及时发现并预警违法违规行为，保护公民安全。",
      closing:
        "本方案帮助公安部门实现暴力、扒窃、持刀等违法行为识别闭环，主动预警、及时处置、维护秩序。",
    },
    capabilities: [
      {
        name: "复杂行为识别",
        desc: "视觉大模型全局语义理解，识别暴力、扒窃、持刀等复杂行为。",
        tags: ["复杂行为", "全局语义", "行为理解"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "多条件组合",
        desc: "灵活组合识别条件，适配多种违法违规场景。",
        tags: ["多条件", "灵活配置", "场景适配"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "低误报识别",
        desc: "多源信息互补，降低误报漏报，提升识别可靠性。",
        tags: ["低误报", "多源互补", "可靠识别"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "复杂行为",
        desc: "暴力、扒窃、持刀等复杂行为识别。",
      },
      {
        title: "多条件组合",
        desc: "灵活配置识别条件，适配多样场景。",
      },
      {
        title: "低误报",
        desc: "多源互补降低误报漏报。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "ps-trace",
    industry: "publicsecurity",
    family: "video",
    name: "人员特征追踪与检索",
    problem: "传统人脸识别对伪装、多种特征组合定位困难，人工筛查易错漏。",
    audience: "公安刑侦、情报与追逃部门",
    value:
      "人、车、设备全维度结构化，语音文字交互检索，多条件组合实现特征找人。",
    valueTags: ["全维度结构化", "特征组合检索", "语音文字交互", "数图融合"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "公安部门",
      problem: "嫌疑人多种特征素材与伪装时难以精准定位。",
      solution: "万物全维度结构化，自定义维度，语音文字按时间地点行为检索。",
      effect: "实现特征找人、复杂场景算法定制，实时与历史数据查询。",
      closing:
        "本方案帮助公安部门构建人员特征全维检索能力，特征找人更精准、追踪定位更高效。",
    },
    capabilities: [
      {
        name: "全维度结构化",
        desc: "将人、车、设备等万物全维度结构化，覆盖基本特征、行为与环境。",
        tags: ["全维度", "万物结构化", "多维特征"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "特征组合检索",
        desc: "多条件组合实现特征找人，支持伪装、多特征定位。",
        tags: ["特征检索", "组合条件", "特征找人"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "语音文字交互",
        desc: "支持语音、文字方式按时间、地点、行为等维度快速检索。",
        tags: ["语音文字", "快速检索", "多维条件"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "特征检索",
        desc: "多条件组合快速定位目标人员。",
      },
      {
        title: "全维结构化",
        desc: "人、车、设备全维度结构化。",
      },
      {
        title: "快速定位",
        desc: "语音文字交互，检索效率大幅提升。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "em-forest-fire",
    industry: "emergency",
    family: "video",
    name: "森林火灾预警",
    problem: "森林火灾发现滞后，预警与疏散时间不足，损失大。",
    audience: "应急管理与林业部门",
    value: "实时检测森林区域烟雾与明火，提前预警、快速响应。",
    valueTags: ["烟雾识别", "明火检测", "提前预警", "快速响应"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "应急管理部门",
      problem: "森林火灾发现滞后，传统人工监测效率低。",
      solution: "视觉大模型实时监测森林区域，检测烟雾与明火。",
      effect: "预警时间提前数小时甚至数天，减少人员伤亡与财产损失。",
      closing:
        "本方案帮助应急部门实现森林火灾早发现、早预警、早响应，减少人员伤亡与财产损失。",
    },
    capabilities: [
      {
        name: "区域视频监测",
        desc: "接入森林、河流、道路等区域摄像头，全天候监测。",
        tags: ["视频监测", "区域覆盖", "全天候"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "烟雾明火识别",
        desc: "实时检测森林区域烟雾与明火，精准识别火灾迹象。",
        tags: ["烟雾识别", "明火检测", "精准识别"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "提前预警",
        desc: "发现火灾迹象提前数小时至数天预警，为疏散争取时间。",
        tags: ["提前预警", "快速响应", "减少损失"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "提前预警",
        desc: "火灾迹象提前数小时至数天预警。",
      },
      {
        title: "精准识别",
        desc: "烟雾与明火精准识别，减少漏报。",
      },
      {
        title: "快速响应",
        desc: "预警即响应，减少人员伤亡与损失。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "em-collapse",
    industry: "emergency",
    family: "video",
    name: "路面塌陷桥梁坍塌监测",
    problem: "道路、桥梁结构异常难以及时发现，存在重大安全隐患。",
    audience: "应急管理与交通管理部门",
    value: "实时识别路面塌陷、桥梁坍塌与交通事故，及时预警响应。",
    valueTags: ["塌陷识别", "坍塌监测", "实时预警"],
    products: ["knowledge", "agents", "applications"],
    capabilities: [
      {
        name: "结构异常识别",
        desc: "识别路面塌陷、桥梁坍塌与交通事故等异常。",
        tags: ["结构识别", "异常检测", "坍塌识别"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "全天候监测",
        desc: "全天候监测道路、桥梁运行状态。",
        tags: ["全天候", "实时监测", "状态感知"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "及时预警响应",
        desc: "发现结构异常及时预警，辅助应急响应。",
        tags: ["及时预警", "快速响应", "应急联动"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "异常识别",
        desc: "路面塌陷、桥梁坍塌实时识别。",
      },
      {
        title: "全天候监测",
        desc: "道路桥梁状态 7x24 持续监测。",
      },
      {
        title: "及时预警",
        desc: "结构异常及时预警，辅助应急响应。",
      },
    ],
    noResultImg: true,
    case: {
      client: "应急管理部门",
      problem: "道路桥梁结构异常难以及时发现，存在重大安全隐患。",
      solution: "视觉大模型全天候监测路面塌陷、桥梁坍塌，及时预警。",
      effect: "结构异常早发现、早预警，道路桥梁运行更安全。",
      closing:
        "本方案帮助应急部门构建道路桥梁全天候监测预警闭环，异常早识别、风险早预警、处置更及时。",
    },
  },
  {
    key: "em-image-hazard",
    industry: "emergency",
    family: "video",
    name: "图片隐患识别",
    problem: "隐患形态多样，粉尘与烟火易误报，检查依赖人工且缺法规依据。",
    audience: "应急执法与安全生产监管部门",
    value: "拍照上传即分析隐患，输出隐患内容与相关法律依据，多模态精准判断。",
    valueTags: ["图片隐患识别", "法律依据输出", "精准判断", "执法辅助"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "应急执法部门",
      problem: "粉尘与烟火误报多，隐患检查缺法规依据。",
      solution: "配置提示词与法律依据引导，手机拍照上传自动分析隐患。",
      effect: "精准输出隐患信息与法律依据，支撑执法检查。",
      closing:
        "本方案帮助应急执法部门实现隐患图片智能识别，执法有依据、检查更高效。",
    },
    capabilities: [
      {
        name: "图片上传分析",
        desc: "手机拍照上传隐患现场图片，自动进行场景识别与隐患分析。",
        tags: ["拍照上传", "场景识别", "自动分析"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "隐患内容输出",
        desc: "精准输出隐患信息与整改建议。",
        tags: ["隐患识别", "内容输出", "整改建议"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "法律依据支撑",
        desc: "输出相关法律依据，支撑执法检查与整改督办。",
        tags: ["法律依据", "执法支撑", "整改督办"],
        product: "governance",
        anchor: "gov-base",
        anchorLabel: "权限管理",
      },
    ],
    metrics: [
      {
        title: "隐患识别",
        desc: "拍照上传自动识别隐患，精准输出。",
      },
      {
        title: "法律依据",
        desc: "输出相关法律依据，支撑执法。",
      },
      {
        title: "执法提效",
        desc: "检查从人工转为智能辅助，效率提升。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "em-dike",
    industry: "emergency",
    family: "video",
    name: "河道溃堤决口识别",
    problem: "河道溃堤、决口难以及时发现，汛期风险大。",
    audience: "应急管理与水利部门",
    value: "实时监测河道变化，识别溃堤、决口并预警。",
    valueTags: ["河道监测", "溃堤识别", "决口预警"],
    products: ["knowledge", "agents", "applications"],
    capabilities: [
      {
        name: "河道实时监测",
        desc: "实时监测河道水位与堤防状态变化。",
        tags: ["河道监测", "实时感知", "堤防状态"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "溃堤决口识别",
        desc: "识别溃堤、决口等重大险情。",
        tags: ["溃堤识别", "决口检测", "险情发现"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "汛期预警",
        desc: "汛期风险提前预警，辅助防汛调度。",
        tags: ["汛期预警", "风险防范", "防汛调度"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "溃堤识别",
        desc: "溃堤、决口等重大险情实时识别。",
      },
      {
        title: "实时监测",
        desc: "河道堤防状态持续感知。",
      },
      {
        title: "汛期预警",
        desc: "汛期风险提前预警，辅助防汛调度。",
      },
    ],
    noResultImg: true,
    case: {
      client: "应急管理部门",
      problem: "河道溃堤、决口难以及时发现，汛期风险大。",
      solution: "视觉大模型实时监测河道堤防，识别溃堤决口，汛期预警。",
      effect: "险情早发现、汛期早预警，防汛调度更主动。",
      closing:
        "本方案帮助应急部门构建河道堤防实时监测闭环，溃堤早识别、汛期早预警、调度有依据。",
    },
  },
  {
    key: "em-public-risk",
    industry: "emergency",
    family: "video",
    name: "公共区域风险监测",
    problem:
      "机场、车站、广场等公共场所人员密集，异常聚集、打斗等风险难以及时发现。",
    audience: "应急管理、公共安全与场所管理部门",
    value:
      "360 度全时段感知公共区域，识别人员聚集、打斗、异常高温点等风险并传递信息。",
    valueTags: ["全时段感知", "风险识别", "精准预警", "信息传递"],
    products: ["knowledge", "agents", "applications"],
    case: {
      client: "应急管理部门",
      problem: "公共区域监控广、人员复杂，异常难以及时发现。",
      solution:
        "下发策略至天网/雪亮摄像头，检测打斗、聚集、高温点、陌生车辆停留。",
      effect: "全方位实时感知，预警传递风险类型、位置与影响范围。",
      closing:
        "本方案帮助应急部门构建公共区域全天候风险感知闭环，风险早识别、信息早传递、处置更及时。",
    },
    capabilities: [
      {
        name: "全时段感知",
        desc: "360 度全时段感知机场、车站、广场等公共区域。",
        tags: ["全时段", "360度", "全域感知"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "风险识别",
        desc: "识别人员聚集、打架斗殴、异常高温点等风险。",
        tags: ["风险识别", "异常检测", "聚集预警"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "信息传递",
        desc: "预警传递风险类型、位置与影响范围，辅助处置。",
        tags: ["信息传递", "精准预警", "辅助处置"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "全时段感知",
        desc: "公共区域 360 度全时段感知。",
      },
      {
        title: "风险识别",
        desc: "聚集、打斗、高温点等风险精准识别。",
      },
      {
        title: "信息传递",
        desc: "预警传递类型、位置与影响范围。",
      },
    ],
    noResultImg: true,
  },
  {
    key: "em-dust-fire",
    industry: "emergency",
    family: "video",
    name: "粉尘烟火精准判断",
    problem: "粉尘与烟火识别中误报多，安全生产监测可靠性不足。",
    audience: "应急执法与安全生产监管部门",
    value: "多模态精准判断粉尘与烟火，区分生产烟雾与火灾，减少误报。",
    valueTags: ["精准判断", "减少误报", "多模态", "安全生产"],
    products: ["knowledge", "agents", "applications"],
    capabilities: [
      {
        name: "多模态精准判断",
        desc: "区分生产烟雾与火灾烟火，精准判断粉尘与火情。",
        tags: ["多模态", "精准判断", "烟火区分"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "降低误报",
        desc: "识别粉尘与烟火差异，减少误报，提升监测可靠性。",
        tags: ["降低误报", "可靠性", "安全生产"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
      {
        name: "实时安全监测",
        desc: "对生产区域进行实时安全监测与预警。",
        tags: ["实时监测", "安全预警", "生产防护"],
        product: "agents",
        anchor: "agent-video",
        anchorLabel: "视频智能体",
      },
    ],
    metrics: [
      {
        title: "精准判断",
        desc: "区分生产烟雾与火灾烟火，精准判断。",
      },
      {
        title: "降低误报",
        desc: "粉尘与烟火差异识别，误报显著降低。",
      },
      {
        title: "安全监测",
        desc: "生产区域实时监测预警。",
      },
    ],
    noResultImg: true,
    case: {
      client: "应急执法部门",
      problem: "粉尘与烟火识别误报多，安全生产监测可靠性不足。",
      solution: "多模态精准判断粉尘与烟火，区分生产烟雾与火灾。",
      effect: "误报显著降低，安全生产监测更可靠。",
      closing:
        "本方案帮助应急部门提升生产安全监测可靠性，烟火精准判断、误报显著降低、安全更有保障。",
    },
  },
  {
    key: "enterprise-data",
    industry: "enterprise",
    family: "data",
    name: "销售经营数据智能问数",
    problem:
      "销售经营台账分散 Excel，指标汇总与分析依赖人工、口径不一、信息滞后。",
    audience: "销售经营管理人员与企业经营部门",
    value:
      "自然语言查询经营指标、目标达成与订单回款，自动生成分析结论与可视化图表。",
    valueTags: ["自然语言问数", "经营指标分析", "报表自动生成", "数据可视化"],
    products: ["knowledge", "agents", "governance"],
    case: {
      client: "企业销售经营团队",
      problem: "商业市场、PPL 等台账依赖 Excel 汇总，口径不一致。",
      solution: "经管之星智能问数，自然语言提问即得答案并生成可视化图表。",
      effect: "零门槛掌控经营数据，经营指标一问便知。",
      closing:
        "本方案帮助企业打通经营台账数据链路，指标一问便知、分析自动生成、决策有据可依。",
    },
    capabilities: [
      {
        name: "台账数据接入",
        desc: "接入商业市场、PPL 与目标等台账数据，统一数据口径。",
        tags: ["台账接入", "数据整合", "口径统一"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "自然语言问数",
        desc: "自然语言查询经营指标、目标达成与订单回款。",
        tags: ["智能问数", "指标查询", "经营分析"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "分析可视化",
        desc: "自动生成分析结论与可视化图表，辅助经营决策。",
        tags: ["分析结论", "可视化", "决策支持"],
        product: "agents",
        anchor: "agent-data",
        anchorLabel: "数据智能体",
      },
      {
        name: "数据权限管控",
        desc: "按角色控制数据访问范围，保障经营数据安全。",
        tags: ["数据权限", "访问控制", "数据安全"],
        product: "governance",
        anchor: "gov-base",
        anchorLabel: "权限管理",
      },
    ],
    noResultImg: false,
  },
  {
    key: "government-process",
    industry: "government",
    family: "process",
    name: "工商注册智能导办",
    problem: "工商注册等政务服务事项材料多、流程长，人工审核与转办效率低。",
    audience: "政务服务中心与市场监管部门",
    value:
      "通过意图识别自主完成在线注册审批，材料自动核验、结果即时反馈、全程留痕。",
    valueTags: ["意图识别", "材料自动核验", "流程自动化", "全程留痕"],
    products: ["agents", "applications", "governance"],
    case: {
      client: "政务服务中心",
      problem: "个体工商户登记注册材料审核依赖人工，流程长。",
      solution:
        "基于审查规范搭建预审工作流，OCR 识别材料，AI 逻辑判断自动评估。",
      effect: "材料审核自动化，识别准确率95%以上，覆盖多入口。",
      closing:
        "本方案帮助政务服务中心实现登记注册智能导办闭环，材料自动核验、流程自动流转、结果即时反馈。",
    },
    capabilities: [
      {
        name: "材料识别",
        desc: "通过 OCR 识别注册申请材料，提取关键要素。",
        tags: ["OCR识别", "材料解析", "要素提取"],
        product: "agents",
        anchor: "agent-knowledge",
        anchorLabel: "知识智能体",
      },
      {
        name: "意图识别导办",
        desc: "识别办事意图，自动引导办理流程。",
        tags: ["意图识别", "智能导办", "流程引导"],
        product: "agents",
        anchor: "agent-orchestration",
        anchorLabel: "流程编排智能体",
      },
      {
        name: "预审工作流",
        desc: "依据审查规范搭建预审流程，AI 逻辑判断自动核验。",
        tags: ["预审流程", "逻辑判断", "自动核验"],
        product: "agents",
        anchor: "agent-orchestration",
        anchorLabel: "流程编排智能体",
      },
      {
        name: "结果反馈留痕",
        desc: "自动评估结果并反馈，全程留痕可追溯。",
        tags: ["结果反馈", "全程留痕", "可追溯"],
        product: "governance",
        anchor: "gov-base",
        anchorLabel: "权限管理",
      },
    ],
    metrics: [
      {
        title: "材料核验",
        desc: "注册材料 OCR 识别，自动核验。",
      },
      {
        title: "流程自动化",
        desc: "意图识别自主完成在线审批流程。",
      },
      {
        title: "结果反馈",
        desc: "审批结果即时反馈，全程留痕。",
      },
    ],
    noResultImg: false,
  },
] as const satisfies readonly V2IndustrySolution[];
