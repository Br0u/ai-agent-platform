import type {
  IndustrySolutionDetail,
  SolutionProduct,
} from "./solution-detail-content";

type IndustryKey = "government" | "finance" | "healthcare" | "enterprise";
type FamilyKey =
  | "knowledge"
  | "document"
  | "data"
  | "process"
  | "assistant"
  | "multiAgent";
type ProductKey = "knowledge" | "agents" | "applications" | "governance";

const industryNames: Record<IndustryKey, string> = {
  government: "政务",
  finance: "金融",
  healthcare: "医疗",
  enterprise: "企业智能化",
};

const products: Record<ProductKey, SolutionProduct> = {
  knowledge: {
    name: "企业知识库",
    role: "接入、处理和维护当前场景需要的企业知识。",
    href: "/product/knowledge",
  },
  agents: {
    name: "智能体中心",
    role: "构建、调试并发布当前场景需要的智能体或流程。",
    href: "/product/agents",
  },
  applications: {
    name: "行业应用中心",
    role: "承接行业应用使用与交付服务。",
    href: "/product/applications",
  },
  governance: {
    name: "安全中心",
    role: "控制当前场景中的人员、菜单和访问范围。",
    href: "/product/governance",
  },
};

const familyProductHrefs: Record<
  FamilyKey,
  Partial<Record<ProductKey, string>>
> = {
  knowledge: { agents: "/product/agent-knowledge" },
  document: {
    agents: "/product/agent-knowledge",
    applications: "/product/app-contract",
  },
  data: {
    knowledge: "/product/knowledge-metrics",
    agents: "/product/data-agent",
  },
  process: { agents: "/product/agent-orchestration" },
  assistant: { agents: "/product/agent-knowledge" },
  multiAgent: {},
};

const blueprints = {
  knowledge: {
    components: [
      [
        "知识资料接入",
        "接入经确认可使用的行业资料。",
        "行业文档与制度资料",
        "待处理知识资料",
        "knowledge",
      ],
      [
        "知识处理与优化",
        "完成解析、分片、标注、QA 构建和检索测试。",
        "待处理知识资料",
        "可检索知识库",
        "knowledge",
      ],
      [
        "知识智能体构建",
        "关联模型和知识库，配置回答规则并调试。",
        "知识库与业务要求",
        "可发布知识智能体",
        "agents",
      ],
      [
        "应用发布与使用",
        "将智能体发布为经授权用户可使用的服务。",
        "已调试智能体",
        "行业知识服务入口",
        "applications",
      ],
    ],
    flow: [
      ["资料接入", "接入经确认可用于当前场景的行业资料。"],
      ["知识处理", "完成解析、分片、标注、QA 构建和检索测试。"],
      ["智能体构建", "关联模型和知识库，配置提示词与回答边界。"],
      ["发布使用", "发布为可使用应用，并按授权范围提供服务。"],
    ],
  },
  document: {
    components: [
      [
        "文档接入",
        "接入当前场景需要处理的文档。",
        "经授权行业文档",
        "待处理文档",
        "knowledge",
      ],
      [
        "内容解析与提取",
        "解析文档并提取关键内容。",
        "待处理文档",
        "结构化内容与知识片段",
        "knowledge",
      ],
      [
        "规则与知识关联",
        "关联知识库、业务术语和经确认的检查规则。",
        "文档内容与规则知识",
        "辅助检查结果",
        "agents",
      ],
      [
        "人工复核与使用",
        "由业务人员确认结果后进入后续流程。",
        "辅助结果",
        "经确认的处理结果",
        "governance",
      ],
    ],
    flow: [
      ["文档接入", "接入经授权的当前场景文档。"],
      ["解析提取", "解析内容并提取关键字段与片段。"],
      ["知识与规则关联", "调用知识和规则形成辅助结果。"],
      ["人工复核", "保留业务人员确认和修正环节。"],
    ],
  },
  data: {
    components: [
      [
        "数据接入",
        "连接企业数据源或表多多数据。",
        "数据库、表格或文档数据",
        "可管理数据源",
        "knowledge",
      ],
      [
        "数据处理",
        "将数据整理为可查询的结构化形态。",
        "原始业务数据",
        "结构化业务数据",
        "knowledge",
      ],
      [
        "数据智能体构建",
        "配置自然语言问数和查询边界。",
        "数据源与业务口径",
        "可调试数据智能体",
        "agents",
      ],
      [
        "授权查询与分析",
        "在权限范围内返回数据结果和分析辅助。",
        "自然语言问题",
        "查询结果与分析说明",
        "governance",
      ],
    ],
    flow: [
      ["数据接入", "接入当前场景允许使用的数据。"],
      ["结构化处理", "整理表结构、字段与可查询内容。"],
      ["问数配置", "配置模型、数据源和查询口径。"],
      ["查询使用", "用户提问，平台生成查询并返回结果。"],
    ],
  },
  process: {
    components: [
      [
        "流程需求梳理",
        "明确步骤、参与角色和人工确认点。",
        "业务流程与规则",
        "流程设计输入",
        "agents",
      ],
      [
        "节点与能力组合",
        "组合模型、知识、数据、工具和判断节点。",
        "流程设计输入",
        "可执行流程",
        "agents",
      ],
      [
        "调试与异常处理",
        "验证分支、输入输出和人工介入方式。",
        "可执行流程",
        "经验证流程",
        "agents",
      ],
      [
        "发布与协同",
        "发布流程并按角色提供使用入口。",
        "经验证流程",
        "业务协同服务",
        "applications",
      ],
    ],
    flow: [
      ["流程梳理", "明确业务步骤、角色、规则和边界。"],
      ["流程编排", "拖拽或由 AI 生成初始流程并配置节点。"],
      ["调试验证", "验证分支、结果与人工确认节点。"],
      ["发布协同", "发布使用并记录任务运行状态。"],
    ],
  },
  assistant: {
    components: [
      [
        "服务范围定义",
        "明确助手服务对象、知识范围和边界。",
        "业务需求与服务口径",
        "助手能力范围",
        "agents",
      ],
      [
        "知识与数据挂接",
        "关联当前场景需要的知识库或数据源。",
        "知识、数据与模型",
        "助手上下文能力",
        "knowledge",
      ],
      [
        "助手配置与调试",
        "配置提示词、工具和异常转人工规则。",
        "助手上下文能力",
        "经验证智能助手",
        "agents",
      ],
      [
        "应用发布",
        "发布为内部或经确认渠道可使用的应用。",
        "经验证智能助手",
        "智能助手应用",
        "applications",
      ],
    ],
    flow: [
      ["需求定义", "明确用户、问题范围和服务边界。"],
      ["能力挂接", "关联模型、知识、数据与工具。"],
      ["调试优化", "验证回答、工具调用和转人工规则。"],
      ["发布使用", "发布应用并按角色提供访问。"],
    ],
  },
  multiAgent: {
    components: [
      [
        "复杂任务拆解",
        "将业务目标拆解为可分工的子任务。",
        "复杂业务目标",
        "任务分工方案",
        "agents",
      ],
      [
        "智能体能力组合",
        "为子任务匹配知识、数据、流程和专业智能体。",
        "任务分工方案",
        "智能体协同结构",
        "agents",
      ],
      [
        "协同流程调试",
        "验证任务传递、结果合并和异常处理。",
        "协同结构",
        "经验证联合智能体",
        "agents",
      ],
      [
        "统一应用交付",
        "发布统一入口并返回汇总业务结果。",
        "联合智能体",
        "复杂任务应用服务",
        "applications",
      ],
    ],
    flow: [
      ["任务拆解", "将复杂目标拆解为多个可执行子任务。"],
      ["能力分配", "为每个子任务分配相应智能体。"],
      ["协同执行", "智能体之间传递输入并完成各自任务。"],
      ["结果汇总", "合并各环节结果并提供统一输出。"],
    ],
  },
} as const;

const catalog = [
  [
    "government-knowledge",
    "government",
    "knowledge",
    "政务知识问答与政策服务",
    "政策、制度和办事知识分散，查询与答复依赖人工。",
    "政务服务部门、业务处室与内部工作人员",
    "统一沉淀政务知识，为工作人员和服务对象提供可追溯的知识查询与问答。",
    [
      "统一政策知识入口",
      "提升查询效率",
      "支持知识持续维护",
      "形成可发布智能服务",
    ],
    ["knowledge", "agents", "applications"],
  ],
  [
    "government-data",
    "government",
    "data",
    "政务数据问答与分析",
    "业务数据分散在不同表格或系统，查询分析依赖专业人员。",
    "业务管理、统计分析与决策支持部门",
    "通过自然语言查询经授权的政务业务数据，辅助形成分析结果。",
    ["自然语言问数", "统一数据查询", "辅助业务分析", "权限范围可控"],
    ["knowledge", "agents", "governance"],
  ],
  [
    "government-document",
    "government",
    "document",
    "政策公文理解与辅助审核",
    "政策和公文材料内容较长，人工提取要点与检查规范耗时。",
    "政策研究、公文管理、业务审核相关部门",
    "辅助完成内容提取、知识检索和规则核对，提升材料处理的一致性。",
    ["政策要点提取", "规范辅助核对", "关联知识检索", "保留人工确认"],
    ["knowledge", "agents", "applications"],
  ],
  [
    "government-process",
    "government",
    "process",
    "政务事项流程自动化与协同",
    "跨环节事项存在重复录入、人工流转和进度跟踪困难。",
    "政务事项办理、综合管理与协同部门",
    "组合知识、数据与流程节点，辅助执行多步骤事项并记录处理状态。",
    ["多步骤流程编排", "减少重复操作", "协同状态可见", "支持人工节点"],
    ["agents", "applications", "governance"],
  ],
  [
    "finance-knowledge",
    "finance",
    "knowledge",
    "金融制度与产品知识服务",
    "制度、产品和业务规则更新频繁，内部查询口径难以统一。",
    "产品、运营、客服、合规与内部支持团队",
    "构建统一制度与产品知识入口，辅助员工准确查找经确认的信息。",
    ["制度知识统一", "产品信息快查", "回答口径一致", "持续更新维护"],
    ["knowledge", "agents", "governance"],
  ],
  [
    "finance-data",
    "finance",
    "data",
    "经营数据问答与业务分析",
    "经营数据查询口径复杂，临时分析依赖取数和报表人员。",
    "经营管理、产品运营与数据分析团队",
    "让授权用户使用自然语言查询业务数据，辅助快速理解经营情况。",
    ["经营数据快查", "自然语言分析", "查询口径可控", "辅助运营判断"],
    ["knowledge", "agents", "governance"],
  ],
  [
    "finance-document",
    "finance",
    "document",
    "金融文档理解与合规辅助审核",
    "业务材料和制度文档数量多，人工提取信息及规则核对压力较大。",
    "运营、风控、合规及文档处理团队",
    "辅助提取文档关键信息并关联规则知识，结果由业务人员复核。",
    ["关键信息提取", "规则知识关联", "辅助合规检查", "人工复核闭环"],
    ["knowledge", "agents", "governance"],
  ],
  [
    "finance-assistant",
    "finance",
    "assistant",
    "金融客户服务智能助手",
    "服务人员需要在多类制度、产品和客户问题之间快速查找信息。",
    "客户服务、运营支持与产品服务团队",
    "组合产品知识、业务规则和流程能力，为服务人员提供智能辅助。",
    ["产品知识辅助", "服务响应提速", "业务规则关联", "复杂问题转人工"],
    ["knowledge", "agents", "applications"],
  ],
  [
    "healthcare-knowledge",
    "healthcare",
    "knowledge",
    "医院知识与制度问答",
    "院内制度、行政规范和服务知识分散，工作人员查询不便。",
    "医院行政、运营、信息及内部服务部门",
    "统一管理院内制度和服务知识，为工作人员提供知识查询辅助。",
    ["院内制度统一", "知识查询便捷", "维护更新可控", "限定授权范围"],
    ["knowledge", "agents", "governance"],
  ],
  [
    "healthcare-data",
    "healthcare",
    "data",
    "医院运营数据问答与分析",
    "运营数据分散，管理人员获取指标和形成分析需要多轮沟通。",
    "医院运营、行政管理和经授权的数据分析人员",
    "在权限范围内查询运营数据并辅助分析，不用于临床诊断决策。",
    ["运营数据问答", "指标查询提速", "权限边界明确", "不用于临床决策"],
    ["knowledge", "agents", "governance"],
  ],
  [
    "healthcare-document",
    "healthcare",
    "document",
    "医疗文档信息提取与辅助审核",
    "医疗及运营文档信息密集，人工整理和形式核对耗时。",
    "医院运营、行政和经授权的文档处理人员",
    "辅助提取文档信息和检查材料完整性，不用于诊断、治疗或自动决策。",
    ["文档信息提取", "材料完整性辅助", "人工审核保留", "不替代诊疗判断"],
    ["knowledge", "agents", "governance"],
  ],
  [
    "healthcare-process",
    "healthcare",
    "process",
    "医院行政流程自动化与协同",
    "院内行政流程跨部门、步骤多，人工提醒和材料流转效率较低。",
    "医院行政、运营和综合管理部门",
    "通过流程编排辅助行政任务流转、提醒和状态记录。",
    ["行政流程编排", "跨部门协同", "任务状态记录", "关键节点人工确认"],
    ["agents", "applications", "governance"],
  ],
  [
    "enterprise-knowledge",
    "enterprise",
    "assistant",
    "企业内部知识助手",
    "制度、产品、项目和经验知识分散，员工获取信息成本较高。",
    "企业员工、职能部门和业务团队",
    "建立统一的企业知识助手，为内部人员提供知识查询和工作辅助。",
    ["统一知识入口", "员工自助查询", "知识持续沉淀", "多部门可复用"],
    ["knowledge", "agents", "applications"],
  ],
  [
    "enterprise-data",
    "enterprise",
    "data",
    "企业经营数据分析与洞察",
    "业务数据跨系统和表格分散，临时查询与分析响应慢。",
    "企业管理者、运营和数据分析团队",
    "通过自然语言查询授权业务数据，辅助形成经营分析和业务洞察。",
    ["自然语言问数", "经营指标快查", "数据分析辅助", "访问权限可控"],
    ["knowledge", "agents", "governance"],
  ],
  [
    "enterprise-document",
    "enterprise",
    "document",
    "企业文档理解与智能审核",
    "合同、制度、报告等文档处理量大，信息提取和规则核对重复。",
    "法务、运营、行政、采购及文档处理团队",
    "辅助提取关键信息、检索相关知识并执行可配置的审核检查。",
    ["文档要素提取", "关联知识检索", "规则辅助审核", "结果支持复核"],
    ["knowledge", "agents", "applications"],
  ],
  [
    "enterprise-process",
    "enterprise",
    "process",
    "企业流程自动化与智能协同",
    "重复业务流程依赖人工操作，跨系统和跨岗位协同困难。",
    "运营、行政、人力、财务及业务流程负责人",
    "通过可视化流程组合模型、知识、数据和工具，辅助执行多步骤任务。",
    ["流程可视化编排", "重复任务自动化", "跨能力组合", "支持人工介入"],
    ["agents", "applications", "governance"],
  ],
  [
    "enterprise-multi-agent",
    "enterprise",
    "multiAgent",
    "多智能体复杂任务处理",
    "复杂业务任务需要多个专业能力连续协同，单一智能体难以完整覆盖。",
    "复杂业务运营、项目管理和跨部门协同团队",
    "组合多个智能体与流程能力，分工处理复杂任务并汇总业务结果。",
    ["多智能体分工", "复杂任务协同", "知识数据组合", "统一结果输出"],
    ["agents", "applications", "governance"],
  ],
] as const satisfies readonly (readonly [
  string,
  IndustryKey,
  FamilyKey,
  string,
  string,
  string,
  string,
  readonly string[],
  readonly ProductKey[],
])[];

type IndustrySolutionSlug = (typeof catalog)[number][0];

export const industrySolutionDetails = Object.fromEntries(
  catalog.map(
    ([
      slug,
      industry,
      family,
      title,
      problem,
      audience,
      summary,
      tags,
      productKeys,
    ]) => {
      const blueprint = blueprints[family];
      return [
        slug,
        {
          kind: "industry",
          category: industryNames[industry],
          title,
          summary,
          audience,
          problem,
          tags,
          problems: [
            {
              problem,
              impact:
                "现有方式使该场景较多依赖人工查询、整理或协调，具体行业影响需以正式材料为准。",
              goal: summary,
            },
          ],
          components: blueprint.components.map(
            ([name, role, input, output, product]) => ({
              name,
              role,
              input,
              output,
              product: products[product].name,
            }),
          ),
          flow: blueprint.flow.map(([label, description]) => ({
            label,
            description,
            media: `${title}｜${label}对应界面、流程或效果素材槽位`,
          })),
          products: productKeys.map((key) => ({
            ...products[key],
            href: familyProductHrefs[family][key] ?? products[key].href,
          })),
        },
      ];
    },
  ),
) as unknown as Record<IndustrySolutionSlug, IndustrySolutionDetail>;
