export type SolutionProduct = {
  name: string;
  role: string;
  href: string;
};

export type CommonSolutionDetail = {
  kind: "common";
  category: string;
  title: string;
  summary: string;
  audience: string;
  tags: readonly string[];
  scenarios: readonly string[];
  problems: readonly string[];
  components: readonly string[];
  flow: readonly string[];
  products: readonly SolutionProduct[];
};

export type IndustrySolutionDetail = {
  kind: "industry";
  category: string;
  title: string;
  summary: string;
  audience: string;
  problem: string;
  tags: readonly string[];
  problems: readonly {
    problem: string;
    impact: string;
    goal: string;
  }[];
  components: readonly {
    name: string;
    role: string;
    input: string;
    output: string;
    product: string;
  }[];
  flow: readonly {
    label: string;
    description: string;
    media: string;
  }[];
  products: readonly SolutionProduct[];
};

export type SolutionDetail = CommonSolutionDetail | IndustrySolutionDetail;

export const solutionDetailSlugs = [
  "knowledge-service",
  "process-automation",
  "government-knowledge",
  "finance-data",
  "healthcare-knowledge",
  "enterprise-multi-agent",
] as const;

export type SolutionDetailSlug = (typeof solutionDetailSlugs)[number];

const solutionDetails = {
  "knowledge-service": {
    kind: "common",
    category: "知识与数据智能",
    title: "企业知识问答与知识服务",
    summary:
      "将企业文档、制度、产品资料和专业知识转化为可检索、可问答的智能知识服务。",
    audience: "需要建设员工知识助手、客户服务知识入口或专业知识服务的组织。",
    tags: ["企业知识可问", "检索回答准确", "知识持续维护", "多入口知识服务"],
    scenarios: [
      "内部制度与管理知识问答",
      "产品资料与售前知识服务",
      "技术文档与运维知识检索",
      "客服与业务咨询辅助",
      "岗位知识助手",
    ],
    problems: [
      "知识分散且更新频繁，查找路径长",
      "传统关键词检索难以理解自然语言问题",
      "回答质量、知识来源和持续维护缺少闭环",
    ],
    components: [
      "企业知识接入",
      "文档解析与智能分片",
      "知识库构建与质量优化",
      "知识智能体配置与调试",
      "应用发布与业务使用",
      "权限与访问控制",
    ],
    flow: [
      "企业资料接入",
      "知识处理",
      "智能体构建",
      "用户提问",
      "知识检索与模型生成",
      "返回结果",
      "持续标注和优化",
    ],
    products: [
      {
        name: "企业知识库",
        role: "提供文档接入、分片、图谱与知识问答的知识底座。",
        href: "/product/knowledge-base",
      },
      {
        name: "智能体中心",
        role: "提供知识、数据、视频与流程编排四类智能体能力。",
        href: "/product/knowledge-agent",
      },
      {
        name: "行业应用中心",
        role: "提供面向行业场景成熟可用的智能应用。",
        href: "/product/applications",
      },
      {
        name: "安全中心",
        role: "提供用户、角色、菜单与数据权限治理。",
        href: "/product/governance",
      },
    ],
  },
  "process-automation": {
    kind: "common",
    category: "智能体与业务应用",
    title: "业务流程自动化与智能协同",
    summary:
      "通过可视化流程将模型、知识、数据、工具和业务逻辑组合为可执行的智能工作流。",
    audience: "希望减少重复操作、连接多项能力并实现跨步骤协同的组织。",
    tags: ["流程可视编排", "多能力组合", "任务自动执行", "流程持续优化"],
    scenarios: [
      "多步骤业务任务自动执行",
      "文档处理与审批辅助",
      "知识与数据联合处理",
      "跨系统信息流转",
      "Chatflow 多轮业务协同",
    ],
    problems: [
      "多步骤任务依赖人工在系统间反复操作",
      "模型、知识、数据和工具能力彼此割裂",
      "流程调整、调试和运行效果缺少统一管理",
    ],
    components: [
      "业务流程梳理",
      "标准或 AI 创建流程",
      "Chatflow 与 Workflow 设计",
      "节点和工具配置",
      "流程调试与验证",
      "发布与外部调用",
    ],
    flow: [
      "业务任务输入",
      "问题分类与流程路由",
      "模型/知识/数据节点执行",
      "工具或系统调用",
      "结果汇总",
      "人工确认",
      "发布与持续优化",
    ],
    products: [
      {
        name: "模型中心",
        role: "提供模型纳管、训练、评估、部署与任务调度能力。",
        href: "/product/model-engineering",
      },
      {
        name: "企业知识库",
        role: "提供文档接入、分片、图谱与知识问答的知识底座。",
        href: "/product/knowledge-base",
      },
      {
        name: "智能体中心",
        role: "提供知识、数据、视频与流程编排四类智能体能力。",
        href: "/product/workflow",
      },
      {
        name: "行业应用中心",
        role: "提供面向行业场景成熟可用的智能应用。",
        href: "/product/applications",
      },
    ],
  },
  "government-knowledge": {
    kind: "industry",
    category: "政务",
    title: "政务知识问答与政策服务",
    summary:
      "统一沉淀政务知识，为工作人员和服务对象提供可追溯的知识查询与问答。",
    audience: "政务服务部门、业务处室与内部工作人员",
    problem: "政策、制度和办事知识分散，查询与答复依赖人工。",
    tags: [
      "统一政策知识入口",
      "提升查询效率",
      "支持知识持续维护",
      "形成可发布智能服务",
    ],
    problems: [
      {
        problem: "政策、制度和办事知识分散，查询与答复依赖人工。",
        impact:
          "现有方式使该场景较多依赖人工查询、整理或协调，具体行业影响需以正式材料为准。",
        goal: "统一沉淀政务知识，为工作人员和服务对象提供可追溯的知识查询与问答。",
      },
    ],
    components: [
      {
        name: "知识资料接入",
        role: "接入经确认可使用的行业资料。",
        input: "行业文档与制度资料",
        output: "待处理知识资料",
        product: "企业知识库",
      },
      {
        name: "知识处理与优化",
        role: "完成解析、分片、标注、QA 构建和检索测试。",
        input: "待处理知识资料",
        output: "可检索知识库",
        product: "企业知识库",
      },
      {
        name: "知识智能体构建",
        role: "关联模型和知识库，配置回答规则并调试。",
        input: "知识库与业务要求",
        output: "可发布知识智能体",
        product: "智能体中心",
      },
      {
        name: "应用发布与使用",
        role: "将智能体发布为经授权用户可使用的服务。",
        input: "已调试智能体",
        output: "行业知识服务入口",
        product: "行业应用中心",
      },
    ],
    flow: [
      {
        label: "资料接入",
        description: "接入经确认可用于当前场景的行业资料。",
        media: "政务知识问答与政策服务｜资料接入对应界面、流程或效果素材槽位",
      },
      {
        label: "知识处理",
        description: "完成解析、分片、标注、QA 构建和检索测试。",
        media: "政务知识问答与政策服务｜知识处理对应界面、流程或效果素材槽位",
      },
      {
        label: "智能体构建",
        description: "关联模型和知识库，配置提示词与回答边界。",
        media: "政务知识问答与政策服务｜智能体构建对应界面、流程或效果素材槽位",
      },
      {
        label: "发布使用",
        description: "发布为可使用应用，并按授权范围提供服务。",
        media: "政务知识问答与政策服务｜发布使用对应界面、流程或效果素材槽位",
      },
    ],
    products: [
      {
        name: "企业知识库",
        role: "接入、处理和维护当前场景需要的企业知识。",
        href: "/product/knowledge-base",
      },
      {
        name: "智能体中心",
        role: "构建、调试并发布当前场景需要的智能体或流程。",
        href: "/product/knowledge-agent",
      },
      {
        name: "行业应用中心",
        role: "承接行业应用使用与交付服务。",
        href: "/product/applications",
      },
    ],
  },
  "finance-data": {
    kind: "industry",
    category: "金融",
    title: "经营数据问答与业务分析",
    summary: "让授权用户使用自然语言查询业务数据，辅助快速理解经营情况。",
    audience: "经营管理、产品运营与数据分析团队",
    problem: "经营数据查询口径复杂，临时分析依赖取数和报表人员。",
    tags: ["经营数据快查", "自然语言分析", "查询口径可控", "辅助运营判断"],
    problems: [
      {
        problem: "经营数据查询口径复杂，临时分析依赖取数和报表人员。",
        impact:
          "现有方式使该场景较多依赖人工查询、整理或协调，具体行业影响需以正式材料为准。",
        goal: "让授权用户使用自然语言查询业务数据，辅助快速理解经营情况。",
      },
    ],
    components: [
      {
        name: "数据接入",
        role: "连接企业数据源或表多多数据。",
        input: "数据库、表格或文档数据",
        output: "可管理数据源",
        product: "企业知识库",
      },
      {
        name: "数据处理",
        role: "将数据整理为可查询的结构化形态。",
        input: "原始业务数据",
        output: "结构化业务数据",
        product: "企业知识库",
      },
      {
        name: "数据智能体构建",
        role: "配置自然语言问数和查询边界。",
        input: "数据源与业务口径",
        output: "可调试数据智能体",
        product: "智能体中心",
      },
      {
        name: "授权查询与分析",
        role: "在权限范围内返回数据结果和分析辅助。",
        input: "自然语言问题",
        output: "查询结果与分析说明",
        product: "安全中心",
      },
    ],
    flow: [
      {
        label: "数据接入",
        description: "接入当前场景允许使用的数据。",
        media: "经营数据问答与业务分析｜数据接入对应界面、流程或效果素材槽位",
      },
      {
        label: "结构化处理",
        description: "整理表结构、字段与可查询内容。",
        media: "经营数据问答与业务分析｜结构化处理对应界面、流程或效果素材槽位",
      },
      {
        label: "问数配置",
        description: "配置模型、数据源和查询口径。",
        media: "经营数据问答与业务分析｜问数配置对应界面、流程或效果素材槽位",
      },
      {
        label: "查询使用",
        description: "用户提问，平台生成查询并返回结果。",
        media: "经营数据问答与业务分析｜查询使用对应界面、流程或效果素材槽位",
      },
    ],
    products: [
      {
        name: "企业知识库",
        role: "接入、处理和维护当前场景需要的企业知识。",
        href: "/product/knowledge-metrics",
      },
      {
        name: "智能体中心",
        role: "构建、调试并发布当前场景需要的智能体或流程。",
        href: "/product/data-agent",
      },
      {
        name: "安全中心",
        role: "控制当前场景中的人员、菜单和访问范围。",
        href: "/product/governance",
      },
    ],
  },
  "healthcare-knowledge": {
    kind: "industry",
    category: "医疗",
    title: "医院知识与制度问答",
    summary: "统一管理院内制度和服务知识，为工作人员提供知识查询辅助。",
    audience: "医院行政、运营、信息及内部服务部门",
    problem: "院内制度、行政规范和服务知识分散，工作人员查询不便。",
    tags: ["院内制度统一", "知识查询便捷", "维护更新可控", "限定授权范围"],
    problems: [
      {
        problem: "院内制度、行政规范和服务知识分散，工作人员查询不便。",
        impact:
          "现有方式使该场景较多依赖人工查询、整理或协调，具体行业影响需以正式材料为准。",
        goal: "统一管理院内制度和服务知识，为工作人员提供知识查询辅助。",
      },
    ],
    components: [
      {
        name: "知识资料接入",
        role: "接入经确认可使用的行业资料。",
        input: "行业文档与制度资料",
        output: "待处理知识资料",
        product: "企业知识库",
      },
      {
        name: "知识处理与优化",
        role: "完成解析、分片、标注、QA 构建和检索测试。",
        input: "待处理知识资料",
        output: "可检索知识库",
        product: "企业知识库",
      },
      {
        name: "知识智能体构建",
        role: "关联模型和知识库，配置回答规则并调试。",
        input: "知识库与业务要求",
        output: "可发布知识智能体",
        product: "智能体中心",
      },
      {
        name: "应用发布与使用",
        role: "将智能体发布为经授权用户可使用的服务。",
        input: "已调试智能体",
        output: "行业知识服务入口",
        product: "行业应用中心",
      },
    ],
    flow: [
      {
        label: "资料接入",
        description: "接入经确认可用于当前场景的行业资料。",
        media: "医院知识与制度问答｜资料接入对应界面、流程或效果素材槽位",
      },
      {
        label: "知识处理",
        description: "完成解析、分片、标注、QA 构建和检索测试。",
        media: "医院知识与制度问答｜知识处理对应界面、流程或效果素材槽位",
      },
      {
        label: "智能体构建",
        description: "关联模型和知识库，配置提示词与回答边界。",
        media: "医院知识与制度问答｜智能体构建对应界面、流程或效果素材槽位",
      },
      {
        label: "发布使用",
        description: "发布为可使用应用，并按授权范围提供服务。",
        media: "医院知识与制度问答｜发布使用对应界面、流程或效果素材槽位",
      },
    ],
    products: [
      {
        name: "企业知识库",
        role: "接入、处理和维护当前场景需要的企业知识。",
        href: "/product/knowledge-base",
      },
      {
        name: "智能体中心",
        role: "构建、调试并发布当前场景需要的智能体或流程。",
        href: "/product/knowledge-agent",
      },
      {
        name: "安全中心",
        role: "控制当前场景中的人员、菜单和访问范围。",
        href: "/product/governance",
      },
    ],
  },
  "enterprise-multi-agent": {
    kind: "industry",
    category: "企业智能化",
    title: "多智能体复杂任务处理",
    summary: "组合多个智能体与流程能力，分工处理复杂任务并汇总业务结果。",
    audience: "复杂业务运营、项目管理和跨部门协同团队",
    problem: "复杂业务任务需要多个专业能力连续协同，单一智能体难以完整覆盖。",
    tags: ["多智能体分工", "复杂任务协同", "知识数据组合", "统一结果输出"],
    problems: [
      {
        problem:
          "复杂业务任务需要多个专业能力连续协同，单一智能体难以完整覆盖。",
        impact:
          "现有方式使该场景较多依赖人工查询、整理或协调，具体行业影响需以正式材料为准。",
        goal: "组合多个智能体与流程能力，分工处理复杂任务并汇总业务结果。",
      },
    ],
    components: [
      {
        name: "复杂任务拆解",
        role: "将业务目标拆解为可分工的子任务。",
        input: "复杂业务目标",
        output: "任务分工方案",
        product: "智能体中心",
      },
      {
        name: "智能体能力组合",
        role: "为子任务匹配知识、数据、流程和专业智能体。",
        input: "任务分工方案",
        output: "智能体协同结构",
        product: "智能体中心",
      },
      {
        name: "协同流程调试",
        role: "验证任务传递、结果合并和异常处理。",
        input: "协同结构",
        output: "经验证联合智能体",
        product: "智能体中心",
      },
      {
        name: "统一应用交付",
        role: "发布统一入口并返回汇总业务结果。",
        input: "联合智能体",
        output: "复杂任务应用服务",
        product: "行业应用中心",
      },
    ],
    flow: [
      {
        label: "任务拆解",
        description: "将复杂目标拆解为多个可执行子任务。",
        media: "多智能体复杂任务处理｜任务拆解对应界面、流程或效果素材槽位",
      },
      {
        label: "能力分配",
        description: "为每个子任务分配相应智能体。",
        media: "多智能体复杂任务处理｜能力分配对应界面、流程或效果素材槽位",
      },
      {
        label: "协同执行",
        description: "智能体之间传递输入并完成各自任务。",
        media: "多智能体复杂任务处理｜协同执行对应界面、流程或效果素材槽位",
      },
      {
        label: "结果汇总",
        description: "合并各环节结果并提供统一输出。",
        media: "多智能体复杂任务处理｜结果汇总对应界面、流程或效果素材槽位",
      },
    ],
    products: [
      {
        name: "智能体中心",
        role: "构建、调试并发布当前场景需要的智能体或流程。",
        href: "/product/agents",
      },
      {
        name: "行业应用中心",
        role: "承接行业应用使用与交付服务。",
        href: "/product/applications",
      },
      {
        name: "安全中心",
        role: "控制当前场景中的人员、菜单和访问范围。",
        href: "/product/governance",
      },
    ],
  },
} as const satisfies Record<SolutionDetailSlug, SolutionDetail>;

export function getSolutionDetail(slug: string): SolutionDetail | undefined {
  return solutionDetails[slug as SolutionDetailSlug];
}
