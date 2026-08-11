import { describe, expect, it } from "vitest";

import {
  getPlatformCenter,
  platformCenterSlugs,
} from "./platform-center-content";

const expectedFoundationCenters = {
  model: {
    slug: "model",
    name: "模型中心",
    hero: {
      eyebrow: "产品｜模型中心",
      title: "企业模型工程，从资产管理到上线服务",
      lead: "围绕企业最关心的三个问题组织能力：有哪些模型、模型怎么运行、模型怎么变强。模型花园与纳管统一资产管理，三种部署方式覆盖运行环境，数据工厂与训练评估让模型持续优化。",
      tags: [
        "模型资产管理",
        "模型部署与服务",
        "模型优化",
        "任务调度与运行保障",
      ],
      actions: [
        {
          label: "申请体验",
          href: "/trial",
          variant: "primary",
        },
        {
          label: "商务咨询",
          href: "/contact?topic=模型中心咨询",
        },
      ],
      visual: {
        title: "模型生命周期主视觉素材槽位",
        description: "资产管理 → 部署服务 → 持续优化",
        note: "建议 16:10，后续替换真实产品截图",
      },
    },
    sections: [
      {
        eyebrow: "01｜三个核心问题",
        title: "围绕企业最关心的三件事组织模型能力",
        lead: "通用大模型很强，但怎么选、怎么跑、怎么让它更懂业务，才是企业真正要解决的问题。",
        cards: [
          {
            number: "问题 01",
            title: "企业有哪些模型？",
            description: "模型资产分散，不知道有什么、能用哪些、在哪找。",
            answer: "模型资产管理——模型花园选型、模型纳管统一接入。",
            actions: [
              {
                label: "了解模型资产管理 →",
                href: "/product/model-assets#assets-garden",
              },
            ],
          },
          {
            number: "问题 02",
            title: "模型怎么运行？",
            description: "本地、专网、云端环境不同，部署方式怎么选、怎么配。",
            answer: "模型部署与服务——定制、专网、云端三种部署。",
            actions: [
              {
                label: "了解模型部署与服务 →",
                href: "/product/model-deploy",
              },
            ],
          },
          {
            number: "问题 03",
            title: "模型怎么变强？",
            description: "通用模型不懂企业业务，回答泛泛而谈、效果无法验证。",
            answer:
              "模型优化——数据工厂备数据、训练让模型懂业务、评估验证效果。",
            actions: [
              {
                label: "了解模型优化 →",
                href: "/product/model-optimization",
              },
            ],
          },
        ],
      },
      {
        tone: "soft",
        eyebrow: "02｜模型资产管理",
        title: "先回答：企业有哪些模型",
        lead: "模型多了以后，最头疼的是不知道企业里有哪些模型、能用哪些、在哪找。",
        cards: [
          {
            title: "模型花园：可纳管、可部署的模型台账",
            description:
              "集中展示平台支持纳管与定制部署的模型范围，选型有依据；看中模型可一键发起定制部署。",
            visual: "模型花园模型卡片列表截图素材槽位",
            actions: [
              {
                label: "查看模型花园 →",
                href: "/product/model-assets#assets-garden",
              },
            ],
          },
          {
            title: "模型纳管：统一接入与管理模型资产",
            description:
              "本地模型支持云端下载与离线导入，按厂商、类型、来源、状态分类，训练、评估、部署都能从同一处找到模型。",
            visual: "模型纳管列表与分类截图素材槽位",
            actions: [
              {
                label: "查看模型纳管 →",
                href: "/product/model-assets#assets-manage",
              },
            ],
          },
        ],
      },
      {
        eyebrow: "03｜模型部署与服务",
        title: "再回答：模型怎么运行",
        lead: "训练完成的模型只有部署成可调用的服务，才能被智能体与业务系统使用。按模型来源与环境选择部署方式。",
        table: {
          columns: ["部署方式", "适用场景", "模型来源", "运行环境"],
          rows: [
            [
              "定制部署",
              "平台内模型服务化",
              "训练中心发布模型 / 模型花园支持定制部署的模型",
              "平台纳管主机，支持多机 / 集群",
            ],
            [
              "专网部署",
              "企业内网已有模型服务",
              "企业专网内模型，模型名称与专网一致",
              "企业专网运行环境，数据不出域",
            ],
            [
              "云端部署",
              "连接云厂商在线模型",
              "云厂商在线模型（名称与密钥保持一致）",
              "云厂商运行环境，通过外网接入",
            ],
          ],
        },
        actions: [
          {
            label: "查看模型部署与服务 →",
            href: "/product/model-deploy",
          },
          {
            label: "查看定制部署 →",
            href: "/product/model-deploy#deploy-custom",
          },
          {
            label: "查看专网部署 →",
            href: "/product/model-deploy#deploy-private",
          },
          {
            label: "查看云端部署 →",
            href: "/product/model-deploy#deploy-cloud",
          },
        ],
      },
      {
        tone: "soft",
        eyebrow: "04｜模型优化",
        title: "最后回答：模型怎么变强",
        lead: "通用模型通过数据与训练学会企业知识，再用评估验证效果，形成「数据 → 训练 → 评估」的优化闭环。",
        cards: [
          {
            title: "数据工厂：训练效果从数据开始",
            description:
              "统一管理训练、评测与蒸馏数据集，支持创建、上传、查看、下载与发布，为训练与评估提供高质量数据。",
            visual: "数据工厂数据集管理截图素材槽位",
            actions: [
              {
                label: "查看数据工厂 →",
                href: "/product/model-data",
              },
            ],
          },
          {
            title: "模型训练：让模型学会企业知识",
            description:
              "LoRA 微调轻量快速、全参训练深度定制、蒸馏训练降低部署成本，按需选择让模型更懂业务。",
            visual: "模型训练方式与进度截图素材槽位",
            actions: [
              {
                label: "查看模型训练 →",
                href: "/product/model-training",
              },
            ],
          },
          {
            title: "模型评估：效果好不好用数据说话",
            description:
              "自动评测与人工评测双通道，效果可量化、可对比，为选型、优化与上线提供依据。",
            visual: "模型评测结果对比截图素材槽位",
            actions: [
              {
                label: "查看模型评估 →",
                href: "/product/model-evaluation",
              },
            ],
          },
        ],
        actions: [
          {
            label: "进入模型优化 →",
            href: "/product/model-optimization",
          },
        ],
      },
      {
        eyebrow: "05｜任务调度与运行保障",
        title: "底层能力：任务统一调度，运行保障",
        lead: "训练、评估、推理任务由任务中心统一创建与调度，任务状态透明，资源按需使用，运行情况一目了然。",
        flow: [
          "任务中心创建推理 / 训练 / 评估任务",
          "配置运行资源",
          "任务调度执行",
          "查看运行状态",
        ],
        actions: [
          {
            label: "查看任务中心 →",
            href: "/product/model-task-center",
          },
        ],
      },
    ],
    business: {
      eyebrow: "06｜业务场景",
      title: "让模型更懂业务，从资产到服务",
      lead: "模型花园统一选型、纳管与部署，数据训练评估让模型学会企业知识，回答有据、效果可验。",
      points: [
        {
          title: "模型统一管理",
          description: "花园选型、纳管接入",
        },
        {
          title: "训练优化",
          description: "数据训练让模型懂业务",
        },
        {
          title: "效果验证",
          description: "自动与人工评测",
        },
        {
          title: "部署调用",
          description: "模型变成可用服务",
        },
      ],
      values: [
        {
          title: "回答更懂业务",
          description: "模型与业务知识对齐",
        },
        {
          title: "路径清晰",
          description: "从资产管理到上线一站式",
        },
        {
          title: "效果有据",
          description: "评测数据支撑每次决策",
        },
      ],
      demo: {
        title: "模型问答对比",
        messages: [
          "我们公司的报销标准是什么？",
          "很抱歉，我不了解贵公司的报销制度。｜通用模型 · 泛泛而谈",
          "根据《费用报销管理制度》，差旅住宿标准为……｜优化后模型 · 有据可依",
          "那出差补贴呢？",
          "建议咨询相关部门确认。｜通用模型 · 不确定",
          "根据《差旅管理办法》，出差补贴标准为……｜优化后模型 · 有据可依",
        ],
        note: "通用模型 vs 优化后模型：同一问题对比",
      },
      reason: ["模型纳管", "数据准备", "训练优化", "部署调用"],
      workflowLabel: "工作流程",
      workflow: ["模型接入", "数据训练", "效果评估", "部署使用"],
      outcomes: [
        {
          title: "回答更懂业务",
          description: "模型与业务知识对齐",
        },
        {
          title: "路径清晰",
          description: "从资产管理到上线一站式",
        },
        {
          title: "效果有据",
          description: "评测数据支撑每次决策",
        },
      ],
      scenesLead: "覆盖企业知识问答、文档审核、数据分析等模型应用。",
      scenes: [
        {
          title: "企业知识问答",
          description: "让模型基于企业知识回答",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions#scene-model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#cases",
            },
          ],
        },
        {
          title: "文档理解审核",
          description: "模型学会企业文档自动核对",
          actions: [
            {
              label: "查看模型部署方案 →",
              href: "/solutions#scene-model-deployment",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#cases",
            },
          ],
        },
        {
          title: "数据分析洞察",
          description: "模型结合业务数据支撑决策",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions#scene-model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#cases",
            },
          ],
        },
      ],
    },
  },
  knowledge: {
    slug: "knowledge",
    name: "企业知识库",
    hero: {
      eyebrow: "智能体中心｜能力底座 · 企业知识库",
      title: "企业知识库：让企业文档变成 AI 能用的知识",
      lead: "把制度、产品资料、技术文档等企业知识上传、解析、分片，沉淀为可检索、可问答、可溯源的 AI 知识底座，支撑知识智能体与上层应用。",
      tags: ["文档接入", "自动分片", "知识图谱", "QA 补充"],
      actions: [
        {
          label: "申请体验",
          href: "/trial",
          variant: "primary",
        },
        {
          label: "商务咨询",
          href: "/contact?topic=企业知识库咨询",
        },
      ],
      visual: {
        title: "企业知识库知识构建界面截图素材槽位",
      },
    },
    sections: [
      {
        eyebrow: "01｜它是什么",
        title: "通用模型看不懂你的文档，知识库让它「懂」",
        lead: "员工问 AI「报销标准是什么」，如果模型没见过你们的制度，回答就是泛泛而谈。",
        body: "企业知识库解决的就是这件事：把分散在文档里的企业知识，加工成模型能检索、能引用的知识单元。上传文档后自动解析、分片、向量化，配合知识图谱与 QA 补充持续丰富，最终为知识智能体提供「有据可依」的知识底座。",
        visual: "「企业文档 → 知识分片 → 智能体问答」流程示意图素材槽位",
      },
      {
        eyebrow: "02｜能力优势",
        title: "知识库能帮你做什么",
        cards: [
          {
            title: "文档接入与解析",
            description:
              "支持 Word、PDF、Excel、文本等常见格式，上传后自动解析，OCR 识别扫描件。",
            visual: "文档上传界面截图素材槽位",
          },
          {
            title: "自动分片与向量化",
            description:
              "文档自动分片并向量化，形成可检索的知识单元，支持策略调整与重新分片。",
            visual: "分片管理界面截图素材槽位",
          },
          {
            title: "分片精细管理",
            description:
              "查看、编辑、合并、分割、移动与共享分片，知识组织灵活可控。",
            visual: "分片编辑界面截图素材槽位",
          },
          {
            title: "知识图谱",
            description: "梳理知识间的关联关系，支撑图谱类智能体与关联问答。",
            visual: "知识图谱界面截图素材槽位",
          },
          {
            title: "QA 自动生成与补充",
            description:
              "基于分片自动生成问答对，人工补充知识，持续提升问答质量。",
            visual: "QA 生成与补充界面截图素材槽位",
          },
          {
            title: "检索测试与目录管理",
            description:
              "测试知识召回效果，通过目录管理知识资产，让知识越用越准。",
            visual: "检索测试界面截图素材槽位",
          },
        ],
      },
      {
        eyebrow: "03｜支撑对象",
        title: "知识库支撑谁",
        cards: [
          {
            title: "知识智能体",
            description:
              "知识问答、知识加工与知识图谱类智能体都建立在企业知识库之上。",
            actions: [
              {
                label: "查看知识智能体 →",
                href: "/product/agent-knowledge",
              },
            ],
          },
          {
            title: "行业应用",
            description:
              "行业应用中心的写作、审查等应用可调用知识库沉淀的企业知识。",
            actions: [
              {
                label: "查看行业应用中心 →",
                href: "/product/applications",
              },
            ],
          },
        ],
      },
      {
        eyebrow: "04｜价值",
        title: "能带来什么",
        cards: [
          {
            title: "回答有依据",
            points: [
              "知识问答结果可溯源到企业原文",
              "员工像问人一样问 AI，效率提升",
            ],
          },
          {
            title: "资产可沉淀",
            points: [
              "企业知识持续沉淀、复用与进化",
              "知识缺口在使用中不断被发现补齐",
            ],
          },
        ],
        actions: [
          {
            label: "查看企业知识问答方案 →",
            href: "/solutions/knowledge-service#scene-knowledge-service",
          },
        ],
      },
    ],
    cta: {
      title: "需要把企业知识变成 AI 能力？",
      description: "面向企业知识库建设与知识智能体落地需求，与华鲲团队沟通。",
      actions: [
        {
          label: "商务咨询",
          href: "/contact?topic=企业知识库咨询",
          variant: "primary",
        },
        {
          label: "申请体验",
          href: "/trial",
        },
      ],
    },
  },
} as const;

describe("prototype platform center content contract", () => {
  it.each(Object.entries(expectedFoundationCenters))(
    "locks the complete %s center",
    (slug, expected) => {
      expect(getPlatformCenter(slug)).toStrictEqual(expected);
    },
  );

  it("registers exactly the seven platform centers", () => {
    expect(platformCenterSlugs).toStrictEqual([
      "model",
      "knowledge",
      "agents",
      "applications",
      "skills",
      "coding",
      "governance",
    ]);
    expect(getPlatformCenter("unknown")).toBeUndefined();
  });

  it.each([
    ["model", "企业模型工程，从资产管理到上线服务", 4, "模型中心咨询"],
    [
      "knowledge",
      "企业知识库：让企业文档变成 AI 能用的知识",
      4,
      "企业知识库咨询",
    ],
    [
      "agents",
      "让企业拥有懂知识、懂业务、懂流程的 AI 助手",
      4,
      "智能体中心咨询",
    ],
    ["applications", "成熟业务 AI 应用，拿来即用", 4, "行业应用中心咨询"],
    ["skills", "可复用的业务技能，拿来即用", 3, "技能中心咨询"],
    ["coding", "码多多：让智能编程走进企业日常开发", 4, "编程中心咨询"],
    ["governance", "平台用得安全，权限管得清楚", 4, "安全中心咨询"],
  ])("locks the %s hero copy", (slug, title, tagCount, topic) => {
    const center = getPlatformCenter(slug);

    expect(center?.hero.title).toBe(title);
    expect(center?.hero.tags).toHaveLength(tagCount);
    expect(center?.hero.actions.map((action) => action.href)).toStrictEqual([
      "/trial",
      `/contact?topic=${topic}`,
    ]);
    expect(center?.hero.visual).toBeDefined();
  });

  it("keeps the complete model center structure without adding a final CTA", () => {
    const center = getPlatformCenter("model");

    expect(center?.sections).toHaveLength(5);
    expect(center?.sections[0]?.cards).toHaveLength(3);
    expect(center?.sections[2]?.table?.rows).toHaveLength(3);
    expect(center?.sections[3]?.cards).toHaveLength(3);
    expect(center?.sections[4]?.flow).toStrictEqual([
      "任务中心创建推理 / 训练 / 评估任务",
      "配置运行资源",
      "任务调度执行",
      "查看运行状态",
    ]);
    expect(center?.business?.workflow).toStrictEqual([
      "模型接入",
      "数据训练",
      "效果评估",
      "部署使用",
    ]);
    expect(center?.business?.scenes).toHaveLength(3);
    expect(center?.cta).toBeUndefined();
  });

  it("keeps the knowledge center capabilities, consumers and final CTA", () => {
    const center = getPlatformCenter("knowledge");

    expect(center?.sections).toHaveLength(4);
    expect(center?.sections[1]?.cards).toHaveLength(6);
    expect(
      center?.sections[2]?.cards?.map((card) => card.actions?.[0]?.href),
    ).toStrictEqual(["/product/agent-knowledge", "/product/applications"]);
    expect(center?.sections[3]?.cards).toHaveLength(2);
    expect(center?.business).toBeUndefined();
    expect(center?.cta?.actions).toHaveLength(2);
  });

  it("keeps the four agent families and their platform foundations", () => {
    const center = getPlatformCenter("agents");

    expect(center?.sections).toHaveLength(3);
    expect(center?.sections[0]?.cards).toHaveLength(4);
    expect(center?.sections[1]?.cards?.map((card) => card.title)).toStrictEqual(
      [
        "把企业文档、制度、经验，变成随时可问的智能知识库",
        "不用写 SQL，问一句就能拿到数据答案",
        "让视频从「被观看」变成「可理解」",
        "把多步骤、跨系统的复杂业务，变成一条自动流程",
      ],
    );
    expect(center?.sections[2]?.cards).toHaveLength(2);
    expect(
      center?.sections[1]?.cards?.map((card) =>
        card.actions?.map((action) => action.href),
      ),
    ).toStrictEqual([
      ["/product/agent-knowledge", "/product/knowledge"],
      ["/product/data-agent", "/product/knowledge-metrics"],
      ["/product/agent-video"],
      ["/product/agent-orchestration"],
    ]);
    expect(center?.business?.scenes).toHaveLength(3);
    expect(center?.cta?.actions).toHaveLength(2);
  });

  it("keeps the application shelf and its platform support chain", () => {
    const center = getPlatformCenter("applications");

    expect(center?.sections).toHaveLength(3);
    expect(center?.sections[1]?.cards?.map((card) => card.title)).toStrictEqual(
      ["通用文本写作", "投标智能助手", "合同智能审查"],
    );
    expect(center?.sections[2]?.flow).toStrictEqual([
      "模型",
      "知识",
      "智能体",
      "应用",
    ]);
    expect(center?.business?.scenes).toHaveLength(3);
    expect(center?.cta?.actions).toHaveLength(3);
  });

  it("keeps the three skill categories and their product consumers", () => {
    const center = getPlatformCenter("skills");

    expect(center?.sections).toHaveLength(3);
    expect(
      center?.sections[1]?.cards?.map((card) => card.actions?.[0]?.href),
    ).toStrictEqual([
      "/product/skills-programming",
      "/product/skills-application",
      "/product/skills-office",
    ]);
    expect(center?.sections[2]?.cards).toHaveLength(4);
    expect(center?.business?.workflow).toStrictEqual([
      "选用技能",
      "组装调用",
      "完成任务",
      "沉淀复用",
    ]);
    expect(center?.cta?.actions).toHaveLength(2);
  });

  it("keeps the coding questions, core capabilities and workflow", () => {
    const center = getPlatformCenter("coding");

    expect(center?.sections).toHaveLength(3);
    expect(center?.sections[0]?.cards).toHaveLength(3);
    expect(
      center?.sections[2]?.cards?.map((card) => card.actions?.[0]?.href),
    ).toStrictEqual([
      "/product/coding-project",
      "/product/coding-session",
      "/product/coding-mobile",
      "/product/coding-standard",
    ]);
    expect(center?.business?.workflow).toStrictEqual([
      "输入需求",
      "生成方案",
      "落地执行",
      "验证交付",
    ]);
    expect(center?.cta?.actions).toHaveLength(2);
  });

  it("keeps all four governance controls and the source limitation note", () => {
    const center = getPlatformCenter("governance");

    expect(center?.sections).toHaveLength(3);
    expect(center?.sections[1]?.cards).toHaveLength(4);
    expect(center?.sections[2]?.groups?.map((group) => group.id)).toStrictEqual(
      ["gov-users", "gov-roles", "gov-menu", "gov-permission"],
    );
    expect(center?.business?.note).toBe(
      "安全中心是元启平台内部的用户、权限与授权治理能力，不等同于独立网络安全产品或等保产品。",
    );
    expect(center?.cta?.actions).toHaveLength(2);
  });
});
