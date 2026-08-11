import { describe, expect, it } from "vitest";

import * as solutionDetailContent from "./solution-detail-content";

const { getSolutionDetail, solutionDetailSlugs } = solutionDetailContent;

const commonExpected = [
  [
    "private-yuanqi",
    "基础设施与模型工程",
    "元启私有化部署方案",
    "面向企业目标环境完成元启平台、基础资源、访问治理与业务系统衔接的整体部署。",
    "需要内网部署、数据不出域或自主运行企业 AI 平台的组织。",
    2,
    3,
    4,
    6,
  ],
  [
    "cluster-planning",
    "基础设施与模型工程",
    "单机与集群算力规划方案",
    "根据模型任务和业务规模规划单机或集群资源组织与运行方式。",
    "需要确定算力规模、节点组织和模型任务资源配置的组织。",
    2,
    3,
    4,
    6,
  ],
  [
    "compute-monitoring",
    "基础设施与模型工程",
    "算力监控与运行保障方案",
    "对 CPU、内存、磁盘、网络和 AI 卡等资源状态进行统一观察和运行保障。",
    "需要掌握算力使用状态、性能趋势和异常排查依据的运维与平台团队。",
    2,
    3,
    4,
    6,
  ],
  [
    "model-evaluation",
    "基础设施与模型工程",
    "模型适配、训练与效果验证",
    "围绕实际业务任务完成模型选择、数据准备、训练评估和持续优化。",
    "需要验证模型是否适配业务并形成上线决策依据的算法与业务团队。",
    3,
    3,
    5,
    6,
  ],
  [
    "model-deployment",
    "基础设施与模型工程",
    "企业模型部署与调用",
    "将已准备、训练或评估的模型部署为可管理、可调用的企业模型服务。",
    "需要为智能体、应用或现有系统提供稳定模型调用能力的组织。",
    3,
    3,
    5,
    6,
  ],
  [
    "knowledge-service",
    "知识与数据智能",
    "企业知识问答与知识服务",
    "将企业文档、制度、产品资料和专业知识转化为可检索、可问答的智能知识服务。",
    "需要建设员工知识助手、客户服务知识入口或专业知识服务的组织。",
    5,
    3,
    6,
    7,
  ],
  [
    "document-intelligence",
    "知识与数据智能",
    "文档理解、知识检索与智能审核",
    "组合文档解析、知识检索、智能体和流程能力，辅助完成复杂文档处理与审核。",
    "合同、报告、制度、申报材料或专业文档处理量较大的业务部门。",
    5,
    3,
    5,
    7,
  ],
  [
    "data-insight",
    "知识与数据智能",
    "数据问答、分析与业务洞察",
    "连接企业业务数据，通过自然语言问题生成查询并返回可理解的数据结果与分析线索。",
    "希望降低数据查询门槛、提高业务分析效率的管理与业务部门。",
    5,
    3,
    5,
    7,
  ],
  [
    "knowledge-assets",
    "知识与数据智能",
    "企业知识库建设与持续运营",
    "围绕文档、分片、QA、术语、知识图谱和质量测试形成持续运营的企业知识资产。",
    "需要长期建设和维护企业知识体系、知识标准与复用机制的组织。",
    5,
    3,
    6,
    7,
  ],
  [
    "unstructured-data",
    "知识与数据智能",
    "非结构化数据处理与业务利用",
    "将文档等非结构化内容解析为结构化数据，衔接查询、分析、数据问答和业务流程。",
    "拥有大量文档资料但需要按字段管理、查询和分析的组织。",
    5,
    3,
    5,
    7,
  ],
  [
    "process-automation",
    "智能体与业务应用",
    "业务流程自动化与智能协同",
    "通过可视化流程将模型、知识、数据、工具和业务逻辑组合为可执行的智能工作流。",
    "希望减少重复操作、连接多项能力并实现跨步骤协同的组织。",
    5,
    3,
    6,
    7,
  ],
  [
    "enterprise-assistant",
    "智能体与业务应用",
    "企业内部智能助手",
    "组合企业知识、业务数据、模型和工具，为员工或岗位提供统一智能服务入口。",
    "计划建设员工助手、岗位助手、管理助手或内部业务服务入口的企业。",
    5,
    3,
    6,
    7,
  ],
  [
    "multi-agent",
    "智能体与业务应用",
    "多智能体协同与复杂任务处理",
    "组合多个专业智能体及流程能力，协同完成单一智能体难以覆盖的复杂任务。",
    "需要跨知识、数据、工具或业务角色完成复杂任务的组织。",
    5,
    3,
    6,
    7,
  ],
  [
    "video-intelligence",
    "智能体与业务应用",
    "视频内容检索与智能分析",
    "围绕视频内容建立可检索、可定位、可问答和可衔接业务应用的智能分析能力。",
    "拥有大量视频资料并需要快速查找目标内容或开展辅助分析的组织。",
    4,
    3,
    5,
    7,
  ],
] as const;

const commonVisibleExpected = [
  [
    "private-yuanqi",
    ["环境自主可控", "数据不出域", "平台自主运行", "业务系统衔接"],
    ["企业内网 AI 平台建设", "现有业务系统中的元启能力接入"],
    [
      "目标环境、网络和资源条件需要统一评估",
      "平台模块部署范围与访问边界需要明确",
      "上线后的运行保障与扩展方式需要规划",
    ],
    [
      "部署环境与资源评估",
      "元启平台模块部署",
      "用户角色与访问配置",
      "业务系统及接口联调",
    ],
    [
      "环境调研",
      "部署方案确认",
      "资源和网络准备",
      "平台部署",
      "能力验证",
      "上线交付",
    ],
  ],
  [
    "cluster-planning",
    ["单机集群匹配", "任务资源规划", "资源统一管理", "扩容路径清晰"],
    ["单机模型验证与起步建设", "多节点集群与多任务运行规划"],
    [
      "单机与集群选择缺少业务和任务依据",
      "不同模型任务的资源需求需要匹配",
      "后续扩容与统一管理方式需要预留",
    ],
    [
      "业务与任务规模评估",
      "单机资源规划",
      "集群节点与资源组织",
      "扩容和调度边界设计",
    ],
    ["任务梳理", "资源测算", "架构选择", "节点规划", "任务验证", "扩展建议"],
  ],
  [
    "compute-monitoring",
    ["资源状态可视", "多指标监控", "运行趋势掌握", "异常排查支撑"],
    ["日常算力运行监控", "模型任务异常辅助排查"],
    [
      "资源运行状态缺少统一视图",
      "性能变化与模型任务之间难以关联",
      "异常发生后缺少排查信息和运行趋势依据",
    ],
    ["资源监控概览", "关键指标观察", "运行趋势分析", "异常排查与保障支持"],
    ["监控接入", "指标采集", "状态观察", "趋势识别", "异常定位", "运行优化"],
  ],
  [
    "model-evaluation",
    ["模型业务适配", "训练评估闭环", "效果对比验证", "优化决策有据"],
    [
      "业务模型选择与基线评估",
      "企业数据驱动的模型训练或微调",
      "训练前后效果对比与上线判断",
    ],
    [
      "可选模型较多但缺少统一比较依据",
      "训练和评估数据需要规范准备",
      "模型效果与业务目标之间需要持续验证",
    ],
    [
      "模型与任务选择",
      "训练评估数据准备",
      "模型训练与优化",
      "模型评估与结果对比",
      "部署决策与版本沉淀",
    ],
    [
      "任务定义",
      "模型选择",
      "数据准备",
      "训练执行",
      "效果评估",
      "优化与部署决策",
    ],
  ],
  [
    "model-deployment",
    ["模型统一部署", "推理服务可用", "调用接口衔接", "智能体能力支撑"],
    ["企业大模型服务部署", "智能体底层模型调用", "已有业务系统模型 API 接入"],
    [
      "模型文件和运行环境需要统一管理",
      "推理服务的资源和可用状态需要保障",
      "调用入口与后续应用集成方式需要明确",
    ],
    [
      "模型来源与版本管理",
      "部署环境和资源准备",
      "模型服务部署",
      "推理调用验证",
      "接口与应用衔接",
    ],
    ["模型确认", "环境准备", "服务部署", "调用测试", "智能体接入", "运行维护"],
  ],
  [
    "knowledge-service",
    ["企业知识可问", "检索回答准确", "知识持续维护", "多入口知识服务"],
    [
      "内部制度与管理知识问答",
      "产品资料与售前知识服务",
      "技术文档与运维知识检索",
      "客服与业务咨询辅助",
      "岗位知识助手",
    ],
    [
      "知识分散且更新频繁，查找路径长",
      "传统关键词检索难以理解自然语言问题",
      "回答质量、知识来源和持续维护缺少闭环",
    ],
    [
      "企业知识接入",
      "文档解析与智能分片",
      "知识库构建与质量优化",
      "知识智能体配置与调试",
      "应用发布与业务使用",
      "权限与访问控制",
    ],
    [
      "企业资料接入",
      "知识处理",
      "智能体构建",
      "用户提问",
      "知识检索与模型生成",
      "返回结果",
      "持续标注和优化",
    ],
  ],
  [
    "document-intelligence",
    ["文档自动解析", "关键信息提取", "知识快速检索", "审核流程提效"],
    [
      "复杂文档内容提取",
      "文档知识检索与定位",
      "多文档信息比对",
      "规则辅助审核",
      "审核结果整理与流转",
    ],
    [
      "文档格式多样且信息分布复杂",
      "人工检索和比对耗时且容易遗漏",
      "审核规则、知识依据和处理流程难以统一",
    ],
    [
      "文档接入与解析",
      "内容分片和结构化提取",
      "知识检索与信息定位",
      "审核规则与流程编排",
      "结果生成与人工复核",
    ],
    [
      "文档提交",
      "解析与提取",
      "知识或规则匹配",
      "内容检索与比对",
      "审核结果生成",
      "人工复核",
      "结果归档",
    ],
  ],
  [
    "data-insight",
    ["自然语言问数", "数据查询降门槛", "分析结果直达", "业务决策辅助"],
    [
      "经营数据自然语言查询",
      "业务指标快速获取",
      "多表数据关联分析",
      "异常数据辅助发现",
      "管理决策数据支持",
    ],
    [
      "数据分散在数据库、表格或业务系统中",
      "业务人员依赖技术人员编写查询",
      "查询结果与业务理解之间仍需人工转换",
    ],
    [
      "企业直连或表多多接入",
      "数据结构与业务口径配置",
      "自然语言问题理解",
      "SQL 等查询生成与执行",
      "结果展示与分析反馈",
    ],
    [
      "数据源接入",
      "表结构与口径确认",
      "用户自然语言提问",
      "查询语句生成",
      "数据检索",
      "结果返回",
      "反馈与优化",
    ],
  ],
  [
    "knowledge-assets",
    ["知识统一沉淀", "分片 QA 维护", "质量持续优化", "知识跨库复用"],
    [
      "企业知识库统一建设",
      "文档分片与知识整理",
      "QA 与业务术语沉淀",
      "知识质量测试与优化",
      "跨知识库知识复用",
    ],
    [
      "知识资料缺少统一归集和维护机制",
      "分片、QA 与术语质量直接影响检索效果",
      "知识更新、复用和质量验证缺少持续流程",
    ],
    [
      "知识资料接入",
      "智能分片与标注",
      "QA 和术语构建",
      "搜索测试与质量优化",
      "知识图谱关联",
      "知识权限与维护",
    ],
    [
      "资料归集",
      "文档解析与分片",
      "标注及QA补充",
      "检索测试",
      "质量优化",
      "发布使用",
      "持续维护",
    ],
  ],
  [
    "unstructured-data",
    ["多格式内容接入", "内容结构化处理", "统一数据管理", "数据业务复用"],
    [
      "业务文档字段提取",
      "历史资料结构化整理",
      "多格式内容统一入库",
      "结构化结果查询分析",
      "数据问答与业务流程调用",
    ],
    [
      "非结构化资料无法直接参与表格和数据库查询",
      "人工录入结构化字段效率低且标准不统一",
      "处理结果需要继续进入数据管理和业务使用",
    ],
    [
      "非结构化资料接入",
      "文档解析与字段识别",
      "数据清洗与结构化转换",
      "结构化存储与管理",
      "查询分析与应用调用",
    ],
    [
      "资料上传或接入",
      "内容解析",
      "字段提取",
      "结构化校验",
      "数据存储",
      "查询与分析",
      "业务应用调用",
    ],
  ],
  [
    "process-automation",
    ["流程可视编排", "多能力组合", "任务自动执行", "流程持续优化"],
    [
      "多步骤业务任务自动执行",
      "文档处理与审批辅助",
      "知识与数据联合处理",
      "跨系统信息流转",
      "Chatflow 多轮业务协同",
    ],
    [
      "多步骤任务依赖人工在系统间反复操作",
      "模型、知识、数据和工具能力彼此割裂",
      "流程调整、调试和运行效果缺少统一管理",
    ],
    [
      "业务流程梳理",
      "标准或 AI 创建流程",
      "Chatflow 与 Workflow 设计",
      "节点和工具配置",
      "流程调试与验证",
      "发布与外部调用",
    ],
    [
      "业务任务输入",
      "问题分类与流程路由",
      "模型/知识/数据节点执行",
      "工具或系统调用",
      "结果汇总",
      "人工确认",
      "发布与持续优化",
    ],
  ],
  [
    "enterprise-assistant",
    ["统一智能入口", "知识数据协同", "岗位工作辅助", "权限可控使用"],
    [
      "员工制度与知识助手",
      "销售与售前业务助手",
      "运营数据查询助手",
      "技术支持与运维助手",
      "管理决策信息助手",
    ],
    [
      "员工需要在多个系统和资料中查找信息",
      "不同岗位使用的知识、数据和工具相互分散",
      "通用助手缺少企业专有知识和业务能力",
    ],
    [
      "助手场景与角色设计",
      "模型和提示词配置",
      "知识库与数据源关联",
      "工具及流程接入",
      "在线调试和标注优化",
      "应用发布与权限控制",
    ],
    [
      "用户进入助手",
      "问题与意图识别",
      "知识/数据/工具调用",
      "模型生成与业务处理",
      "结果返回",
      "反馈标注",
      "持续优化",
    ],
  ],
  [
    "multi-agent",
    ["多智能体协同", "复杂任务拆解", "能力统一编排", "结果一体交付"],
    [
      "复杂问题分工处理",
      "知识与数据联合分析",
      "多角色业务协同",
      "跨流程任务编排",
      "综合业务结果生成",
    ],
    [
      "复杂任务包含多个专业步骤和不同能力要求",
      "单一智能体上下文、工具和职责范围有限",
      "多项结果需要统一协调、汇总和验证",
    ],
    [
      "复杂任务拆解",
      "专业智能体设计",
      "协同关系与路由",
      "知识数据和工具挂接",
      "联合调试与结果汇总",
      "应用发布与运行管理",
    ],
    [
      "复杂任务输入",
      "任务识别与拆分",
      "智能体选择与分发",
      "各智能体执行",
      "结果协调与校验",
      "统一结果生成",
      "反馈与优化",
    ],
  ],
  [
    "video-intelligence",
    ["视频内容检索", "目标快速定位", "视频智能分析", "结果业务复用"],
    [
      "视频内容快速检索",
      "目标片段定位",
      "视频事件辅助分析",
      "视频资料知识化利用",
    ],
    [
      "视频内容需要逐段人工查看",
      "目标信息难以通过文本条件快速定位",
      "视频分析结果难以衔接知识与业务流程",
    ],
    [
      "视频资源接入",
      "视频内容理解与索引",
      "视频智能体配置",
      "检索与定位交互",
      "结果展示与业务衔接",
    ],
    [
      "视频接入",
      "内容处理",
      "索引构建",
      "用户检索",
      "目标片段定位",
      "结果分析",
      "应用调用",
    ],
  ],
] as const;

const industryExpected = [
  [
    "government-knowledge",
    "政务",
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
  ],
  [
    "government-data",
    "政务",
    "政务数据问答与分析",
    "业务数据分散在不同表格或系统，查询分析依赖专业人员。",
    "业务管理、统计分析与决策支持部门",
    "通过自然语言查询经授权的政务业务数据，辅助形成分析结果。",
    ["自然语言问数", "统一数据查询", "辅助业务分析", "权限范围可控"],
  ],
  [
    "government-document",
    "政务",
    "政策公文理解与辅助审核",
    "政策和公文材料内容较长，人工提取要点与检查规范耗时。",
    "政策研究、公文管理、业务审核相关部门",
    "辅助完成内容提取、知识检索和规则核对，提升材料处理的一致性。",
    ["政策要点提取", "规范辅助核对", "关联知识检索", "保留人工确认"],
  ],
  [
    "government-process",
    "政务",
    "政务事项流程自动化与协同",
    "跨环节事项存在重复录入、人工流转和进度跟踪困难。",
    "政务事项办理、综合管理与协同部门",
    "组合知识、数据与流程节点，辅助执行多步骤事项并记录处理状态。",
    ["多步骤流程编排", "减少重复操作", "协同状态可见", "支持人工节点"],
  ],
  [
    "finance-knowledge",
    "金融",
    "金融制度与产品知识服务",
    "制度、产品和业务规则更新频繁，内部查询口径难以统一。",
    "产品、运营、客服、合规与内部支持团队",
    "构建统一制度与产品知识入口，辅助员工准确查找经确认的信息。",
    ["制度知识统一", "产品信息快查", "回答口径一致", "持续更新维护"],
  ],
  [
    "finance-data",
    "金融",
    "经营数据问答与业务分析",
    "经营数据查询口径复杂，临时分析依赖取数和报表人员。",
    "经营管理、产品运营与数据分析团队",
    "让授权用户使用自然语言查询业务数据，辅助快速理解经营情况。",
    ["经营数据快查", "自然语言分析", "查询口径可控", "辅助运营判断"],
  ],
  [
    "finance-document",
    "金融",
    "金融文档理解与合规辅助审核",
    "业务材料和制度文档数量多，人工提取信息及规则核对压力较大。",
    "运营、风控、合规及文档处理团队",
    "辅助提取文档关键信息并关联规则知识，结果由业务人员复核。",
    ["关键信息提取", "规则知识关联", "辅助合规检查", "人工复核闭环"],
  ],
  [
    "finance-assistant",
    "金融",
    "金融客户服务智能助手",
    "服务人员需要在多类制度、产品和客户问题之间快速查找信息。",
    "客户服务、运营支持与产品服务团队",
    "组合产品知识、业务规则和流程能力，为服务人员提供智能辅助。",
    ["产品知识辅助", "服务响应提速", "业务规则关联", "复杂问题转人工"],
  ],
  [
    "healthcare-knowledge",
    "医疗",
    "医院知识与制度问答",
    "院内制度、行政规范和服务知识分散，工作人员查询不便。",
    "医院行政、运营、信息及内部服务部门",
    "统一管理院内制度和服务知识，为工作人员提供知识查询辅助。",
    ["院内制度统一", "知识查询便捷", "维护更新可控", "限定授权范围"],
  ],
  [
    "healthcare-data",
    "医疗",
    "医院运营数据问答与分析",
    "运营数据分散，管理人员获取指标和形成分析需要多轮沟通。",
    "医院运营、行政管理和经授权的数据分析人员",
    "在权限范围内查询运营数据并辅助分析，不用于临床诊断决策。",
    ["运营数据问答", "指标查询提速", "权限边界明确", "不用于临床决策"],
  ],
  [
    "healthcare-document",
    "医疗",
    "医疗文档信息提取与辅助审核",
    "医疗及运营文档信息密集，人工整理和形式核对耗时。",
    "医院运营、行政和经授权的文档处理人员",
    "辅助提取文档信息和检查材料完整性，不用于诊断、治疗或自动决策。",
    ["文档信息提取", "材料完整性辅助", "人工审核保留", "不替代诊疗判断"],
  ],
  [
    "healthcare-process",
    "医疗",
    "医院行政流程自动化与协同",
    "院内行政流程跨部门、步骤多，人工提醒和材料流转效率较低。",
    "医院行政、运营和综合管理部门",
    "通过流程编排辅助行政任务流转、提醒和状态记录。",
    ["行政流程编排", "跨部门协同", "任务状态记录", "关键节点人工确认"],
  ],
  [
    "enterprise-knowledge",
    "企业智能化",
    "企业内部知识助手",
    "制度、产品、项目和经验知识分散，员工获取信息成本较高。",
    "企业员工、职能部门和业务团队",
    "建立统一的企业知识助手，为内部人员提供知识查询和工作辅助。",
    ["统一知识入口", "员工自助查询", "知识持续沉淀", "多部门可复用"],
  ],
  [
    "enterprise-data",
    "企业智能化",
    "企业经营数据分析与洞察",
    "业务数据跨系统和表格分散，临时查询与分析响应慢。",
    "企业管理者、运营和数据分析团队",
    "通过自然语言查询授权业务数据，辅助形成经营分析和业务洞察。",
    ["自然语言问数", "经营指标快查", "数据分析辅助", "访问权限可控"],
  ],
  [
    "enterprise-document",
    "企业智能化",
    "企业文档理解与智能审核",
    "合同、制度、报告等文档处理量大，信息提取和规则核对重复。",
    "法务、运营、行政、采购及文档处理团队",
    "辅助提取关键信息、检索相关知识并执行可配置的审核检查。",
    ["文档要素提取", "关联知识检索", "规则辅助审核", "结果支持复核"],
  ],
  [
    "enterprise-process",
    "企业智能化",
    "企业流程自动化与智能协同",
    "重复业务流程依赖人工操作，跨系统和跨岗位协同困难。",
    "运营、行政、人力、财务及业务流程负责人",
    "通过可视化流程组合模型、知识、数据和工具，辅助执行多步骤任务。",
    ["流程可视化编排", "重复任务自动化", "跨能力组合", "支持人工介入"],
  ],
  [
    "enterprise-multi-agent",
    "企业智能化",
    "多智能体复杂任务处理",
    "复杂业务任务需要多个专业能力连续协同，单一智能体难以完整覆盖。",
    "复杂业务运营、项目管理和跨部门协同团队",
    "组合多个智能体与流程能力，分工处理复杂任务并汇总业务结果。",
    ["多智能体分工", "复杂任务协同", "知识数据组合", "统一结果输出"],
  ],
] as const;

const industryBlueprintExpected = [
  {
    slug: "government-knowledge",
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
  },
  {
    slug: "government-document",
    components: [
      {
        name: "文档接入",
        role: "接入当前场景需要处理的文档。",
        input: "经授权行业文档",
        output: "待处理文档",
        product: "企业知识库",
      },
      {
        name: "内容解析与提取",
        role: "解析文档并提取关键内容。",
        input: "待处理文档",
        output: "结构化内容与知识片段",
        product: "企业知识库",
      },
      {
        name: "规则与知识关联",
        role: "关联知识库、业务术语和经确认的检查规则。",
        input: "文档内容与规则知识",
        output: "辅助检查结果",
        product: "智能体中心",
      },
      {
        name: "人工复核与使用",
        role: "由业务人员确认结果后进入后续流程。",
        input: "辅助结果",
        output: "经确认的处理结果",
        product: "安全中心",
      },
    ],
    flow: [
      {
        label: "文档接入",
        description: "接入经授权的当前场景文档。",
        media: "政策公文理解与辅助审核｜文档接入对应界面、流程或效果素材槽位",
      },
      {
        label: "解析提取",
        description: "解析内容并提取关键字段与片段。",
        media: "政策公文理解与辅助审核｜解析提取对应界面、流程或效果素材槽位",
      },
      {
        label: "知识与规则关联",
        description: "调用知识和规则形成辅助结果。",
        media:
          "政策公文理解与辅助审核｜知识与规则关联对应界面、流程或效果素材槽位",
      },
      {
        label: "人工复核",
        description: "保留业务人员确认和修正环节。",
        media: "政策公文理解与辅助审核｜人工复核对应界面、流程或效果素材槽位",
      },
    ],
  },
  {
    slug: "government-data",
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
        media: "政务数据问答与分析｜数据接入对应界面、流程或效果素材槽位",
      },
      {
        label: "结构化处理",
        description: "整理表结构、字段与可查询内容。",
        media: "政务数据问答与分析｜结构化处理对应界面、流程或效果素材槽位",
      },
      {
        label: "问数配置",
        description: "配置模型、数据源和查询口径。",
        media: "政务数据问答与分析｜问数配置对应界面、流程或效果素材槽位",
      },
      {
        label: "查询使用",
        description: "用户提问，平台生成查询并返回结果。",
        media: "政务数据问答与分析｜查询使用对应界面、流程或效果素材槽位",
      },
    ],
  },
  {
    slug: "government-process",
    components: [
      {
        name: "流程需求梳理",
        role: "明确步骤、参与角色和人工确认点。",
        input: "业务流程与规则",
        output: "流程设计输入",
        product: "智能体中心",
      },
      {
        name: "节点与能力组合",
        role: "组合模型、知识、数据、工具和判断节点。",
        input: "流程设计输入",
        output: "可执行流程",
        product: "智能体中心",
      },
      {
        name: "调试与异常处理",
        role: "验证分支、输入输出和人工介入方式。",
        input: "可执行流程",
        output: "经验证流程",
        product: "智能体中心",
      },
      {
        name: "发布与协同",
        role: "发布流程并按角色提供使用入口。",
        input: "经验证流程",
        output: "业务协同服务",
        product: "行业应用中心",
      },
    ],
    flow: [
      {
        label: "流程梳理",
        description: "明确业务步骤、角色、规则和边界。",
        media: "政务事项流程自动化与协同｜流程梳理对应界面、流程或效果素材槽位",
      },
      {
        label: "流程编排",
        description: "拖拽或由 AI 生成初始流程并配置节点。",
        media: "政务事项流程自动化与协同｜流程编排对应界面、流程或效果素材槽位",
      },
      {
        label: "调试验证",
        description: "验证分支、结果与人工确认节点。",
        media: "政务事项流程自动化与协同｜调试验证对应界面、流程或效果素材槽位",
      },
      {
        label: "发布协同",
        description: "发布使用并记录任务运行状态。",
        media: "政务事项流程自动化与协同｜发布协同对应界面、流程或效果素材槽位",
      },
    ],
  },
  {
    slug: "finance-assistant",
    components: [
      {
        name: "服务范围定义",
        role: "明确助手服务对象、知识范围和边界。",
        input: "业务需求与服务口径",
        output: "助手能力范围",
        product: "智能体中心",
      },
      {
        name: "知识与数据挂接",
        role: "关联当前场景需要的知识库或数据源。",
        input: "知识、数据与模型",
        output: "助手上下文能力",
        product: "企业知识库",
      },
      {
        name: "助手配置与调试",
        role: "配置提示词、工具和异常转人工规则。",
        input: "助手上下文能力",
        output: "经验证智能助手",
        product: "智能体中心",
      },
      {
        name: "应用发布",
        role: "发布为内部或经确认渠道可使用的应用。",
        input: "经验证智能助手",
        output: "智能助手应用",
        product: "行业应用中心",
      },
    ],
    flow: [
      {
        label: "需求定义",
        description: "明确用户、问题范围和服务边界。",
        media: "金融客户服务智能助手｜需求定义对应界面、流程或效果素材槽位",
      },
      {
        label: "能力挂接",
        description: "关联模型、知识、数据与工具。",
        media: "金融客户服务智能助手｜能力挂接对应界面、流程或效果素材槽位",
      },
      {
        label: "调试优化",
        description: "验证回答、工具调用和转人工规则。",
        media: "金融客户服务智能助手｜调试优化对应界面、流程或效果素材槽位",
      },
      {
        label: "发布使用",
        description: "发布应用并按角色提供访问。",
        media: "金融客户服务智能助手｜发布使用对应界面、流程或效果素材槽位",
      },
    ],
  },
  {
    slug: "enterprise-multi-agent",
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
  },
] as const;

describe("solution detail content", () => {
  it("registers the exact 14 common, 17 industry and one pending-case slugs", () => {
    expect(solutionDetailSlugs).toStrictEqual([
      "private-yuanqi",
      "cluster-planning",
      "compute-monitoring",
      "model-evaluation",
      "model-deployment",
      "knowledge-service",
      "document-intelligence",
      "data-insight",
      "knowledge-assets",
      "unstructured-data",
      "process-automation",
      "enterprise-assistant",
      "multi-agent",
      "video-intelligence",
      "government-knowledge",
      "government-data",
      "government-document",
      "government-process",
      "finance-knowledge",
      "finance-data",
      "finance-document",
      "finance-assistant",
      "healthcare-knowledge",
      "healthcare-data",
      "healthcare-document",
      "healthcare-process",
      "enterprise-knowledge",
      "enterprise-data",
      "enterprise-document",
      "enterprise-process",
      "enterprise-multi-agent",
      "case-pending-enterprise-knowledge",
    ]);
  });

  it.each(commonExpected)(
    "locks the exact common catalog and complete shape for %s",
    (
      slug,
      category,
      title,
      summary,
      audience,
      scenarioCount,
      problemCount,
      componentCount,
      flowCount,
    ) => {
      expect(getSolutionDetail(slug)).toMatchObject({
        kind: "common",
        category,
        title,
        summary,
        audience,
        tags: expect.arrayContaining([expect.any(String)]),
      });
      const detail = getSolutionDetail(slug);
      expect(detail?.kind).toBe("common");
      if (detail?.kind !== "common") return;
      expect(detail.scenarios).toHaveLength(scenarioCount);
      expect(detail.problems).toHaveLength(problemCount);
      expect(detail.components).toHaveLength(componentCount);
      expect(detail.flow).toHaveLength(flowCount);
      expect(detail.tags).toHaveLength(4);
      expect(detail.products.length).toBeGreaterThan(0);
    },
  );

  it.each(commonVisibleExpected)(
    "locks every prototype-visible common content array for %s",
    (slug, tags, scenarios, problems, components, flow) => {
      const detail = getSolutionDetail(slug);
      expect(detail?.kind).toBe("common");
      if (detail?.kind !== "common") return;
      expect({
        tags: detail.tags,
        scenarios: detail.scenarios,
        problems: detail.problems,
        components: detail.components,
        flow: detail.flow,
      }).toStrictEqual({ tags, scenarios, problems, components, flow });
    },
  );

  it.each(industryExpected)(
    "locks the exact industry catalog and generated blueprint for %s",
    (slug, category, title, problem, audience, summary, tags) => {
      expect(getSolutionDetail(slug)).toMatchObject({
        kind: "industry",
        category,
        title,
        problem,
        audience,
        summary,
      });
      const detail = getSolutionDetail(slug);
      expect(detail?.kind).toBe("industry");
      if (detail?.kind !== "industry") return;
      expect(detail.tags).toStrictEqual(tags);
      expect(detail.problems).toStrictEqual([
        {
          problem,
          impact:
            "现有方式使该场景较多依赖人工查询、整理或协调，具体行业影响需以正式材料为准。",
          goal: summary,
        },
      ]);
      expect(detail.components).toHaveLength(4);
      expect(detail.flow).toHaveLength(4);
      expect(detail.products).toHaveLength(3);
    },
  );

  it.each(industryBlueprintExpected)(
    "locks the exact independent industry family blueprint for $slug",
    ({ slug, components, flow }) => {
      const detail = getSolutionDetail(slug);
      expect(detail?.kind).toBe("industry");
      if (detail?.kind !== "industry") return;
      expect(detail.components).toStrictEqual(components);
      expect(detail.flow).toStrictEqual(flow);
    },
  );

  it("locks the pending case as an explicitly unauthorized structure-only page", () => {
    expect(
      getSolutionDetail("case-pending-enterprise-knowledge"),
    ).toMatchObject({
      kind: "case",
      category: "实践案例",
      title: "案例详情结构占位（待授权案例）",
      summary:
        "以下内容仅用于评审案例详情的信息结构、素材位置与交互，不代表真实公开项目。",
      authorizationNotice:
        "当前案例未获公开授权，不代表真实公开项目；客户、建设内容与成果均须在获得授权后替换。",
      customer: "某企业客户（脱敏占位）",
      industry: "企业智能化",
      scenarios: ["企业知识问答与知识服务"],
      products: ["企业知识库", "智能体中心", "行业应用中心", "安全中心"],
      outcomes: [
        "企业知识服务能力结构占位",
        "智能体应用建设成果占位",
        "实际业务成果待授权补充",
      ],
      profile: [
        ["所属行业", "企业智能化"],
        ["业务领域", "企业内部知识服务"],
        ["项目类型", "知识智能体应用建设"],
        ["部署方式", "实际部署方式待授权补充"],
        ["主要使用对象", "企业员工与业务部门（占位）"],
      ],
      challenges: [
        {
          name: "知识分散",
          problem: "制度、产品与业务资料分散在不同位置。",
          measure: "统一接入并建设可检索知识库。",
        },
        {
          name: "查询依赖人工",
          problem: "员工查询专业知识时依赖熟悉资料的人员。",
          measure: "构建知识智能体并保留人工确认边界。",
        },
        {
          name: "知识维护困难",
          problem: "资料更新后需要同步维护多个使用入口。",
          measure: "建立知识质量测试、标注和持续更新机制。",
        },
      ],
      stages: [
        { name: "需求调研" },
        { name: "业务与数据梳理" },
        { name: "方案设计" },
        { name: "环境及产品部署" },
        { name: "场景开发与配置" },
        { name: "测试与效果验证" },
        { name: "上线交付" },
        { name: "运营与持续优化" },
      ],
      results: [
        [
          "能力建设成果",
          "实际建设的平台、知识库、智能体和应用能力待授权确认。",
        ],
        ["业务使用价值", "定性业务价值需根据公开授权材料补充。"],
        ["量化成果", "没有统计口径和授权前不展示百分比、金额或排名。"],
      ],
    });
  });

  it("returns each detail to its exact filtered query and landing hash", () => {
    const getSolutionReturnHref = (
      solutionDetailContent as typeof solutionDetailContent & {
        getSolutionReturnHref: (
          detail: NonNullable<ReturnType<typeof getSolutionDetail>>,
          query?: { mode?: string },
        ) => string;
      }
    ).getSolutionReturnHref;
    expect(getSolutionReturnHref(getSolutionDetail("knowledge-service")!)).toBe(
      "/solutions?view=scenarios&category=knowledge#solution-scenarios-directory",
    );
    expect(getSolutionReturnHref(getSolutionDetail("finance-data")!)).toBe(
      "/solutions?view=industries&industry=finance#industry-solutions-list",
    );
    const pending = getSolutionDetail("case-pending-enterprise-knowledge")!;
    expect(getSolutionReturnHref(pending, { mode: "industry" })).toBe(
      "/solutions?view=cases&mode=industry#practice-cases-list",
    );
    expect(getSolutionReturnHref(pending, { mode: "scenario" })).toBe(
      "/solutions?view=cases&mode=scenario#practice-cases-list",
    );
    expect(getSolutionReturnHref(pending, { mode: "invalid" })).toBe(
      "/solutions?view=cases&mode=all#practice-cases-hero",
    );
  });

  it("does not fall back for unknown solution slugs", () => {
    expect(getSolutionDetail("unknown-solution")).toBeUndefined();
  });
});
