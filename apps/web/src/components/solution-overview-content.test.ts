import { describe, expect, it } from "vitest";
import {
  solutionDirectory,
  solutionOverviewContent,
} from "./solution-overview-content";

describe("solution overview prototype content", () => {
  it("locks the hero, problem selector, relationship map and actions verbatim", () => {
    expect(solutionOverviewContent.hero).toEqual({
      eyebrow: "解决方案总览｜从业务问题出发",
      title: "面向企业实际业务问题的 AI 解决方案",
      lead: "围绕企业知识服务、数据分析、文档处理、流程协同和智能应用建设，组合元启平台的算力、模型、知识与智能体能力，帮助企业完成从能力建设到业务应用落地。",
      problemTitle: "您希望解决什么问题？",
      problems: [
        ["企业知识如何高效利用", "overview-scene-knowledge"],
        ["业务数据如何自然语言查询", "overview-scene-data"],
        ["复杂文档如何理解与审核", "overview-scene-document"],
        ["重复业务流程如何自动执行", "overview-scene-process"],
        ["AI 能力如何形成可用业务应用", "overview-scene-assistant"],
      ],
      actions: [
        ["查看通用场景方案", "/solutions#solution-common-scenes"],
        ["查看行业解决方案", "/solutions#solution-industries-overview"],
        ["查看实践案例", "/solutions?view=cases#practice-cases-hero"],
      ],
      map: {
        label: "解决方案关系图素材槽位",
        title: "从业务问题到业务成果",
        columns: [
          [
            "业务问题",
            "知识利用",
            "数据查询",
            "文档处理",
            "流程协同",
            "智能应用建设",
          ],
          [
            "华鲲能力组合",
            "算力与运行环境",
            "模型能力",
            "企业知识与数据",
            "智能体与流程编排",
            "应用发布与系统集成",
          ],
          [
            "业务应用与成果",
            "企业知识服务",
            "数据分析与洞察",
            "文档理解与审核",
            "流程自动化",
            "智能助手与智能体应用",
          ],
        ],
        governance: "平台治理与权限控制贯穿能力建设和应用使用全过程",
        note: "正式视觉可替换为解决方案架构图、业务场景组合图或动画；本图仅解释关系，不承担跳转。",
      },
    });
  });

  it("locks all six common-scene cards verbatim", () => {
    expect(solutionOverviewContent.scenes).toEqual([
      {
        id: "overview-scene-knowledge",
        key: "knowledge-service",
        anchor: "scene-knowledge-service",
        category: "知识与数据智能",
        title: "企业知识问答与知识服务",
        problem: "企业知识分散，查找、理解和复用效率不足。",
        audience: "需要面向员工或业务人员提供统一知识服务的组织。",
        value: "让企业知识形成可检索、可问答、可持续维护的服务能力。",
        visual: "知识问答界面 / 知识检索过程 / 应用效果素材槽位",
        capabilities: ["知识底座", "智能体中心", "行业应用"],
      },
      {
        id: "overview-scene-data",
        key: "data-insight",
        anchor: "scene-data-insight",
        category: "知识与数据智能",
        title: "数据问答、分析与业务洞察",
        problem: "业务数据查询依赖专业人员，数据获取和分析链路较长。",
        audience: "需要通过自然语言查询业务数据并辅助分析的部门。",
        value: "降低业务数据使用门槛，缩短从问题到结果的路径。",
        visual: "自然语言问数 / SQL 查询转换 / 数据结果素材槽位",
        capabilities: ["数据源", "数据智能体", "应用服务"],
      },
      {
        id: "overview-scene-document",
        key: "document-intelligence",
        anchor: "scene-document-intelligence",
        category: "知识与数据智能",
        title: "文档理解、知识检索与智能审核",
        problem: "大量复杂文档需要人工阅读、检索、比对和审核。",
        audience: "对文档处理准确性、效率和可追溯性有要求的业务部门。",
        value: "提升文档信息提取、知识检索和辅助审核效率。",
        visual: "文档解析 / 内容提取 / 审核结果与流程素材槽位",
        capabilities: ["知识库", "知识加工", "流程编排"],
      },
      {
        id: "overview-scene-process",
        key: "process-automation",
        anchor: "scene-process-automation",
        category: "智能体与业务应用",
        title: "业务流程自动化与智能协同",
        problem: "重复业务流程依赖人工衔接，多环节协同效率有限。",
        audience: "希望将模型、知识、数据和工具组合成可执行流程的组织。",
        value: "通过可视化流程编排支撑多步骤任务自动执行与协同。",
        visual: "业务流程图 / Chatflow / Workflow 运行素材槽位",
        capabilities: ["流程编排", "模型能力", "知识与数据"],
      },
      {
        id: "overview-scene-assistant",
        key: "enterprise-assistant",
        anchor: "scene-enterprise-assistant",
        category: "智能体与业务应用",
        title: "企业内部智能助手",
        problem: "企业已有知识、数据和工具难以形成统一智能服务入口。",
        audience: "需要建设内部知识助手、业务助手或岗位助手的企业。",
        value: "将企业专有能力组合成面向员工和业务场景的可用应用。",
        visual: "智能助手应用界面 / 对话过程 / 服务入口素材槽位",
        capabilities: ["推理中心", "知识与数据", "应用广场"],
      },
      {
        id: "overview-scene-multi-agent",
        key: "multi-agent",
        anchor: "scene-multi-agent",
        category: "智能体与业务应用",
        title: "多智能体协同与复杂任务处理",
        problem: "单一智能体难以覆盖跨知识、数据、流程和工具的复杂任务。",
        audience: "需要多项智能能力协同完成复杂业务任务的场景。",
        value: "组合多个智能体能力，形成面向复杂任务的一体化应用服务。",
        visual: "单一智能体 → 联合智能体 → 业务结果素材槽位",
        capabilities: ["联合智能体", "流程编排", "应用服务"],
      },
    ]);
  });

  it("locks the six methodology steps and every detail verbatim", () => {
    expect(solutionOverviewContent.methods).toEqual([
      [
        "problem",
        "01 业务问题识别",
        "明确需要解决的业务问题、服务对象和建设边界。",
        "梳理业务流程、现有问题、使用角色及期望结果。",
        "业务问题清单、优先场景范围和初步建设目标。",
      ],
      [
        "assessment",
        "02 能力与数据评估",
        "确认现有算力环境、模型条件、知识数据基础和系统接口条件。",
        "评估数据可用性、知识质量、模型适配需求、部署环境和集成限制。",
        "能力与数据评估结果、风险清单和建设前提。",
      ],
      [
        "design",
        "03 方案设计",
        "形成覆盖业务、能力、数据、应用和交付边界的总体方案。",
        "设计总体架构、核心模块、业务流程、体验路径和实施范围。",
        "解决方案说明、总体架构图和场景建设清单。",
      ],
      [
        "combination",
        "04 产品能力组合",
        "选择能够支撑当前方案的华鲲产品模块与能力组合。",
        "匹配算力、模型、知识、数据、智能体、应用服务和平台治理能力。",
        "产品能力映射、模块组合关系和能力使用边界。",
      ],
      [
        "integration",
        "05 部署与系统集成",
        "将方案部署到目标环境并连接企业现有业务系统。",
        "完成环境部署、接口联调、权限配置、业务系统集成和场景验证。",
        "可运行环境、集成结果、验证记录和上线准备清单。",
      ],
      [
        "operation",
        "06 应用上线与持续优化",
        "让方案稳定服务实际业务，并根据使用效果持续优化。",
        "开展上线运营、效果观察、知识数据维护、智能体调优和场景扩展。",
        "运营反馈、优化方案、迭代记录和后续扩展计划。",
      ],
    ]);
  });

  it("locks all four industry cards verbatim", () => {
    expect(solutionOverviewContent.industries).toEqual([
      [
        "government",
        "政务",
        "围绕政务知识、公文、业务数据与事项流程形成具体场景方案。",
        "当前预留 4 个可评审的行业场景入口。",
        "正式上线前需由业务侧确认场景和对外口径。",
        "政务行业场景全景图素材槽位",
        "查看政务场景 →",
      ],
      [
        "finance",
        "金融",
        "围绕制度产品知识、文档、经营数据与客户服务形成具体场景方案。",
        "当前预留 4 个可评审的行业场景入口。",
        "正式上线前需由业务侧确认场景和对外口径。",
        "金融行业场景全景图素材槽位",
        "查看金融场景 →",
      ],
      [
        "healthcare",
        "医疗",
        "围绕院内知识、文档信息、运营数据与行政流程形成辅助场景方案。",
        "当前预留 4 个可评审的行业场景入口。",
        "不涉及诊断或治疗，正式上线前确认对外口径。",
        "医疗行业场景全景图素材槽位",
        "查看医疗场景 →",
      ],
      [
        "enterprise",
        "企业智能化",
        "围绕企业知识、经营数据、文档、流程和多智能体形成场景方案。",
        "当前预留 5 个可评审的行业场景入口。",
        "正式上线前需由业务侧确认场景和对外口径。",
        "企业智能化场景全景图素材槽位",
        "查看企业场景 →",
      ],
    ]);
    expect(solutionOverviewContent.industryNote).toBe(
      "行业名称仅用于低保真目录与模板评审，不代表已经获得首期对外发布确认；未确认行业在正式官网不展示可点击空页面。",
    );
  });

  it("locks product support, governance, pending case and CTA verbatim", () => {
    expect(solutionOverviewContent.support).toEqual([
      ["模型与运行支撑", "模型管理、训练、评估、部署和调用", "/product/model"],
      ["模型能力", "模型管理、训练、评估、部署和调用", "/product/model"],
      ["知识增强", "知识库、数据源和企业知识数据利用", "/product/knowledge"],
      ["智能体开发", "推理中心、流程编排、调试与发布", "/product/agents"],
      [
        "应用广场与服务",
        "应用承接、组合、行业推广和外部调用",
        "/product/applications",
      ],
    ]);
    expect(solutionOverviewContent.governance).toEqual([
      "平台治理横向贯穿",
      "用户、角色和菜单管理支撑各能力模块的有序使用",
      "查看安全中心 →",
      "/product/governance",
    ]);
    expect(solutionOverviewContent.case).toEqual({
      title: "案例内容待授权补充",
      label: "首期案例接口预留",
      visual: "客户 Logo / 项目图片 / 应用成果素材槽位\n待获得公开授权后补充",
      fields: [
        ["所属行业：", "待获得公开授权后补充"],
        ["业务问题：", "待获得公开授权后补充"],
        ["使用能力：", "待获得公开授权后补充"],
        ["成果摘要：", "待获得公开授权后补充，不使用虚构比例或数据"],
      ],
      link: [
        "查看案例详情模板 →",
        "/solutions/case-pending-enterprise-knowledge#case-pending-enterprise-knowledge",
      ],
    });
    expect(solutionOverviewContent.cta).toEqual({
      title: "希望围绕实际业务问题规划 AI 解决方案？",
      description:
        "面向场景梳理、方案设计、能力组合、私有化部署和系统集成需求，与华鲲团队进一步沟通。",
      actions: [
        ["商务咨询", "/contact?topic=解决方案咨询"],
        ["申请体验", "/trial"],
      ],
      note: "商务咨询自动带入“解决方案咨询”；从具体方案或行业进入时，后续表单继续带入方案名称与行业来源。申请体验范围以实际开放能力为准。",
    });
  });

  it("locks every directory key and anchor without importing detail content", () => {
    const flatten = (
      nodes: typeof solutionDirectory,
    ): [string, string, string][] =>
      nodes.flatMap((node) => [
        [node.key ?? "", node.anchor ?? "", node.href] as [
          string,
          string,
          string,
        ],
        ...flatten(node.children ?? []),
      ]);

    expect(flatten(solutionDirectory)).toEqual([
      ["overview", "", "/solutions"],
      [
        "common",
        "solution-scenarios-directory",
        "/solutions?view=common#solution-scenarios-directory",
      ],
      [
        "infrastructure",
        "",
        "/solutions?view=common&category=infrastructure#solution-scenarios-directory",
      ],
      [
        "private-yuanqi",
        "scene-private-yuanqi",
        "/solutions/private-yuanqi#scene-private-yuanqi",
      ],
      [
        "cluster-planning",
        "scene-cluster-planning",
        "/solutions/cluster-planning#scene-cluster-planning",
      ],
      [
        "compute-monitoring",
        "scene-compute-monitoring",
        "/solutions/compute-monitoring#scene-compute-monitoring",
      ],
      [
        "model-evaluation",
        "scene-model-evaluation",
        "/solutions/model-evaluation#scene-model-evaluation",
      ],
      [
        "model-deployment",
        "scene-model-deployment",
        "/solutions/model-deployment#scene-model-deployment",
      ],
      [
        "knowledge",
        "",
        "/solutions?view=common&category=knowledge#solution-scenarios-directory",
      ],
      [
        "knowledge-service",
        "scene-knowledge-service",
        "/solutions/knowledge-service#scene-knowledge-service",
      ],
      [
        "document-intelligence",
        "scene-document-intelligence",
        "/solutions/document-intelligence#scene-document-intelligence",
      ],
      [
        "data-insight",
        "scene-data-insight",
        "/solutions/data-insight#scene-data-insight",
      ],
      [
        "unstructured-data",
        "scene-unstructured-data",
        "/solutions/unstructured-data#scene-unstructured-data",
      ],
      [
        "knowledge-assets",
        "scene-knowledge-assets",
        "/solutions/knowledge-assets#scene-knowledge-assets",
      ],
      [
        "agents",
        "",
        "/solutions?view=common&category=agents#solution-scenarios-directory",
      ],
      [
        "process-automation",
        "scene-process-automation",
        "/solutions/process-automation#scene-process-automation",
      ],
      [
        "video-intelligence",
        "scene-video-intelligence",
        "/solutions/video-intelligence#scene-video-intelligence",
      ],
      [
        "enterprise-assistant",
        "scene-enterprise-assistant",
        "/solutions/enterprise-assistant#scene-enterprise-assistant",
      ],
      [
        "multi-agent",
        "scene-multi-agent",
        "/solutions/multi-agent#scene-multi-agent",
      ],
      [
        "industry",
        "industry-solutions-list",
        "/solutions?view=industry#industry-solutions-list",
      ],
      [
        "government",
        "",
        "/solutions?view=industry&category=government#industry-solutions-list",
      ],
      [
        "government-knowledge",
        "industry-government-knowledge",
        "/solutions/government-knowledge#industry-government-knowledge",
      ],
      [
        "government-document",
        "industry-government-document",
        "/solutions/government-document#industry-government-document",
      ],
      [
        "government-data",
        "industry-government-data",
        "/solutions/government-data#industry-government-data",
      ],
      [
        "government-process",
        "industry-government-process",
        "/solutions/government-process#industry-government-process",
      ],
      [
        "finance",
        "",
        "/solutions?view=industry&category=finance#industry-solutions-list",
      ],
      [
        "finance-knowledge",
        "industry-finance-knowledge",
        "/solutions/finance-knowledge#industry-finance-knowledge",
      ],
      [
        "finance-document",
        "industry-finance-document",
        "/solutions/finance-document#industry-finance-document",
      ],
      [
        "finance-data",
        "industry-finance-data",
        "/solutions/finance-data#industry-finance-data",
      ],
      [
        "finance-assistant",
        "industry-finance-assistant",
        "/solutions/finance-assistant#industry-finance-assistant",
      ],
      [
        "healthcare",
        "",
        "/solutions?view=industry&category=healthcare#industry-solutions-list",
      ],
      [
        "healthcare-knowledge",
        "industry-healthcare-knowledge",
        "/solutions/healthcare-knowledge#industry-healthcare-knowledge",
      ],
      [
        "healthcare-document",
        "industry-healthcare-document",
        "/solutions/healthcare-document#industry-healthcare-document",
      ],
      [
        "healthcare-data",
        "industry-healthcare-data",
        "/solutions/healthcare-data#industry-healthcare-data",
      ],
      [
        "healthcare-process",
        "industry-healthcare-process",
        "/solutions/healthcare-process#industry-healthcare-process",
      ],
      [
        "enterprise",
        "",
        "/solutions?view=industry&category=enterprise#industry-solutions-list",
      ],
      [
        "enterprise-knowledge",
        "industry-enterprise-knowledge",
        "/solutions/enterprise-knowledge#industry-enterprise-knowledge",
      ],
      [
        "enterprise-data",
        "industry-enterprise-data",
        "/solutions/enterprise-data#industry-enterprise-data",
      ],
      [
        "enterprise-document",
        "industry-enterprise-document",
        "/solutions/enterprise-document#industry-enterprise-document",
      ],
      [
        "enterprise-process",
        "industry-enterprise-process",
        "/solutions/enterprise-process#industry-enterprise-process",
      ],
      [
        "enterprise-multi-agent",
        "industry-enterprise-multi-agent",
        "/solutions/enterprise-multi-agent#industry-enterprise-multi-agent",
      ],
      [
        "cases",
        "practice-cases-hero",
        "/solutions?view=cases#practice-cases-hero",
      ],
      [
        "case-industry",
        "practice-cases-list",
        "/solutions?view=cases&mode=industry#practice-cases-list",
      ],
      [
        "case-pending-enterprise-knowledge",
        "case-pending-enterprise-knowledge",
        "/solutions/case-pending-enterprise-knowledge#case-pending-enterprise-knowledge",
      ],
      [
        "case-scenario",
        "practice-cases-list",
        "/solutions?view=cases&mode=scenario#practice-cases-list",
      ],
      [
        "case-pending-enterprise-knowledge",
        "case-pending-enterprise-knowledge",
        "/solutions/case-pending-enterprise-knowledge#case-pending-enterprise-knowledge",
      ],
    ]);
  });
});
