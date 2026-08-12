import type { PlatformPage } from "./platform-page-types";

export const platformCenterSlugs = [
  "model",
  "knowledge",
  "agents",
  "applications",
  "skills",
  "coding",
  "governance",
] as const;

const platformCenters = [
  {
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
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=模型中心咨询" },
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
            actions: [{ label: "查看数据工厂 →", href: "/product/model-data" }],
          },
          {
            title: "模型训练：让模型学会企业知识",
            description:
              "LoRA 微调轻量快速、全参训练深度定制、蒸馏训练降低部署成本，按需选择让模型更懂业务。",
            visual: "模型训练方式与进度截图素材槽位",
            actions: [
              { label: "查看模型训练 →", href: "/product/model-training" },
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
        { title: "模型统一管理", description: "花园选型、纳管接入" },
        { title: "训练优化", description: "数据训练让模型懂业务" },
        { title: "效果验证", description: "自动与人工评测" },
        { title: "部署调用", description: "模型变成可用服务" },
      ],
      values: [
        { title: "回答更懂业务", description: "模型与业务知识对齐" },
        { title: "路径清晰", description: "从资产管理到上线一站式" },
        { title: "效果有据", description: "评测数据支撑每次决策" },
      ],
      demo: {
        title: "模型问答对比",
        messages: [
          { role: "user", text: "我们公司的报销标准是什么？" },
          {
            role: "assistant",
            text: "很抱歉，我不了解贵公司的报销制度。｜通用模型 · 泛泛而谈",
          },
          {
            role: "assistant",
            text: "根据《费用报销管理制度》，差旅住宿标准为……｜优化后模型 · 有据可依",
          },
          { role: "user", text: "那出差补贴呢？" },
          {
            role: "assistant",
            text: "建议咨询相关部门确认。｜通用模型 · 不确定",
          },
          {
            role: "assistant",
            text: "根据《差旅管理办法》，出差补贴标准为……｜优化后模型 · 有据可依",
          },
        ],
        note: "通用模型 vs 优化后模型：同一问题对比",
      },
      reason: ["模型纳管", "数据准备", "训练优化", "部署调用"],
      workflowLabel: "工作流程",
      workflow: ["模型接入", "数据训练", "效果评估", "部署使用"],
      outcomes: [
        { title: "回答更懂业务", description: "模型与业务知识对齐" },
        { title: "路径清晰", description: "从资产管理到上线一站式" },
        { title: "效果有据", description: "评测数据支撑每次决策" },
      ],
      scenesLead: "覆盖企业知识问答、文档审核、数据分析等模型应用。",
      scenes: [
        {
          title: "企业知识问答",
          description: "让模型基于企业知识回答",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions/model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "文档理解审核",
          description: "模型学会企业文档自动核对",
          actions: [
            {
              label: "查看模型部署方案 →",
              href: "/solutions/model-deployment",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "数据分析洞察",
          description: "模型结合业务数据支撑决策",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions/model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "applications",
    name: "行业应用中心",
    hero: {
      eyebrow: "产品｜行业应用中心",
      title: "成熟业务 AI 应用，拿来即用",
      lead: "不用从零搭建模型、知识库和工作流。面向高频业务场景打磨好的 AI 应用，直接上手使用，快速验证价值，再决定要不要深入建设。",
      tags: [
        "通用文本写作",
        "投标智能助手",
        "合同智能审查",
        "应用广场 · 行业精选",
      ],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=行业应用中心咨询" },
      ],
      visual: {
        title: "行业应用中心主视觉素材槽位",
        description: "通用文本写作 · 投标智能助手 · 合同智能审查",
        note: "后续替换原型所示真实产品截图",
      },
    },
    sections: [
      {
        eyebrow: "01｜产品介绍",
        title: "成熟业务 AI 应用，拿来即用",
        lead: "行业应用中心面向高频业务场景，把打磨好的 AI 应用直接给到业务用起来——先用起来、快速验证价值，再按需深入建设底层能力。",
      },
      {
        eyebrow: "02｜应用货架",
        title: "当前可用的业务 AI 应用",
        lead: "围绕高频业务场景沉淀的成熟应用，开箱即用；更多应用按已确认材料持续上架。",
        cards: [
          {
            tag: "通用办公",
            title: "通用文本写作",
            value: "报告、方案、邮件、纪要，从提纲到成稿",
            description:
              "面向撰写、润色与整理的通用文本场景，让高频写作任务更快完成。",
            visual: "通用文本写作界面截图素材槽位",
            actions: [
              {
                label: "查看通用文本写作 →",
                href: "/product/app-writing",
              },
            ],
          },
          {
            tag: "招投标",
            title: "投标智能助手",
            value: "从读标书到封装，投标全流程提效",
            description:
              "面向投标文件编写与标书要点整理的提效场景，让投标更有条理。",
            visual: "投标智能助手界面截图素材槽位",
            actions: [
              {
                label: "查看投标智能助手 →",
                href: "/product/app-bidding",
              },
            ],
          },
          {
            tag: "法务合规",
            title: "合同智能审查",
            value: "条款逐条核对，风险早发现",
            description:
              "面向合同条款审核与规则核对的合规场景，让审查更快、口径更统一。",
            visual: "合同智能审查界面截图素材槽位",
            actions: [
              {
                label: "查看合同智能审查 →",
                href: "/product/app-contract",
              },
            ],
          },
        ],
      },
      {
        tone: "soft",
        eyebrow: "03｜为什么能拿来即用",
        title: "成熟应用背后的能力支撑",
        lead: "每个应用都不是孤立工具，而是建立在平台成熟能力之上，企业无需重复搭建。",
        flow: ["模型", "知识", "智能体", "应用"],
        cards: [
          {
            title: "模型",
            description: "统一管理与调用的模型能力",
            actions: [{ label: "→", href: "/product/model" }],
          },
          {
            title: "知识",
            description: "企业知识库与数据底座",
            actions: [{ label: "→", href: "/product/knowledge" }],
          },
          {
            title: "智能体",
            description: "能力组合与流程编排",
            actions: [{ label: "→", href: "/product/agents" }],
          },
          {
            title: "应用",
            description: "封装为可直接使用的业务应用",
            actions: [{ label: "→", href: "/product/applications" }],
          },
        ],
        note: "所以应用中心的定位是「直接使用」：先用起来，再按需深入建设底层能力。",
      },
    ],
    business: {
      eyebrow: "04｜业务场景",
      title: "拿来即用，先见价值",
      lead: "用成熟应用快速跑通业务，见效后再按需深入建设平台能力，投入可控、价值可见。",
      points: [
        { title: "开箱即用", description: "无需从零搭建，快速上手" },
        { title: "业务就绪", description: "面向高频场景打磨成熟" },
        { title: "能力可扩展", description: "需要深化时底层随时可建" },
      ],
      values: [
        { title: "见效快", description: "快速验证应用价值" },
        { title: "成本低", description: "复用成熟能力，减少重复建设" },
      ],
      visual: "行业应用中心应用使用界面截图素材槽位",
      reason: ["平台能力", "应用封装", "场景打磨", "拿来即用"],
      workflowLabel: "工作方式",
      outcomes: [
        { title: "快速见效", description: "应用开箱即用" },
        { title: "业务提效", description: "高频场景直接受益" },
        { title: "路径清晰", description: "先应用、后建设" },
      ],
      scenesLead: "覆盖公文写作、投标、合同审查等高频办公与业务场景。",
      scenes: [
        {
          title: "公文与办公写作",
          description: "通用文本写作快速成稿。",
          actions: [
            {
              label: "查看通用文本写作 →",
              href: "/product/app-writing",
            },
          ],
        },
        {
          title: "投标提效",
          description: "投标智能助手全流程提效。",
          actions: [
            {
              label: "查看投标智能助手 →",
              href: "/product/app-bidding",
            },
          ],
        },
        {
          title: "合同审查",
          description: "合同智能审查风险早发现。",
          actions: [
            {
              label: "查看合同智能审查 →",
              href: "/product/app-contract",
            },
          ],
        },
      ],
    },
    cta: {
      title: "先试用，再决定怎么用",
      description: "申请体验行业应用，或与华鲲团队沟通部署与集成方案。",
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=行业应用中心咨询" },
        { label: "查看解决方案", href: "/solutions" },
      ],
    },
  },
  {
    slug: "skills",
    name: "技能中心",
    hero: {
      eyebrow: "产品｜技能中心",
      title: "可复用的业务技能，拿来即用",
      lead: "技能中心沉淀面向编程、应用与办公场景的可复用能力——智能体与行业应用按需组装，能力标准化、复用化，减少重复建设。",
      tags: ["编程类技能", "应用类技能", "办公类技能"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=技能中心咨询" },
      ],
      visual: {
        title: "技能中心技能货架主视觉素材槽位（多技能卡片墙）",
      },
    },
    sections: [
      {
        eyebrow: "01｜产品介绍",
        title: "可复用的业务技能，能力标准化",
        lead: "技能中心把编程、应用与办公场景的专业能力封装为标准化技能，开箱即用、可被智能体与行业应用按需组装，减少重复建设。",
      },
      {
        eyebrow: "02｜技能分类",
        title: "三大类技能，覆盖开发、应用与办公",
        lead: "每个技能都是一项可复用的业务能力，开箱即用、可被智能体与行业应用组装。",
        cards: [
          {
            tag: "编程类技能",
            title: "研发与工程提效",
            description:
              "模型评测、工作流生成、AI 系统知识，服务研发与工程团队。",
            actions: [
              {
                label: "查看编程类技能 →",
                href: "/product/skills-programming",
              },
            ],
          },
          {
            tag: "应用类技能",
            title: "业务应用能力",
            description:
              "视频解析布控、Agent 安全防护，为业务应用提供可落地能力。",
            actions: [
              {
                label: "查看应用类技能 →",
                href: "/product/skills-application",
              },
            ],
          },
          {
            tag: "办公类技能",
            title: "日常办公提效",
            description:
              "会议纪要生成、技能包入门，让日常办公与技能运营更顺畅。",
            actions: [
              {
                label: "查看办公类技能 →",
                href: "/product/skills-office",
              },
            ],
          },
        ],
      },
      {
        eyebrow: "03｜技能如何融入产品体系",
        title: '技能是智能体与行业应用的"能力组件"',
        lead: "技能可以被智能体、行业应用按需组装调用，让能力标准化、复用化。",
        cards: [
          {
            tag: "使用方",
            title: "智能体中心",
            description:
              "智能体通过技能中心的能力组件，快速获得标准化业务能力。",
            actions: [
              {
                label: "查看智能体中心 →",
                href: "/product/agents",
              },
            ],
          },
          {
            tag: "使用方",
            title: "行业应用中心",
            description: "行业应用按需组合技能，形成面向场景的成熟应用。",
            actions: [
              {
                label: "查看行业应用中心 →",
                href: "/product/applications",
              },
            ],
          },
          {
            title: "拿来即用",
            description: "技能开箱即用，无需从零开发，快速验证价值。",
          },
          {
            title: "持续沉淀",
            description: "企业流程、工具与知识封装为技能，能力随业务沉淀复用。",
          },
        ],
      },
    ],
    business: {
      eyebrow: "04｜业务场景",
      title: "技能拿来即用，能力随业务沉淀",
      lead: "一个技能一项能力，智能体与行业应用按需组装，避免重复建设。",
      points: [
        { title: "拿来即用", description: "技能开箱即用，快速验证价值" },
        { title: "标准化复用", description: "能力封装成标准技能，多处复用" },
        { title: "快速沉淀", description: "企业流程、工具、知识持续沉淀" },
        { title: "生态连接", description: "与智能体、行业应用无缝组装" },
      ],
      values: [
        { title: "降低重复建设", description: "同类能力不用重复开发" },
        { title: "能力越用越厚", description: "技能随业务持续沉淀" },
      ],
      demo: {
        title: "技能中心 · 组装演示",
        messages: [
          { role: "user", text: "用会议纪要技能，把这段录音转成纪要" },
          { role: "assistant", text: "已调用会议纪要技能，正在转写……" },
          { role: "assistant", text: "已生成结构化纪要与任务清单。" },
          { role: "user", text: "再调用视频布控技能，盯一下南门区域" },
          { role: "assistant", text: "已创建布控任务并开始预警。" },
        ],
        footer: { placeholder: "输入你的需求…", action: "发送" },
      },
      reason: ["能力封装", "技能发布", "智能体组装", "应用落地"],
      workflowLabel: "工作方式",
      workflow: ["选用技能", "组装调用", "完成任务", "沉淀复用"],
      outcomes: [
        { title: "拿来即用", description: "开箱即用，快速验证" },
        { title: "标准化复用", description: "能力一次封装、多处使用" },
        { title: "持续沉淀", description: "技能随业务越用越厚" },
      ],
      scenesLead: "覆盖研发提效、业务自动化与技能平台运营等场景。",
      scenes: [
        {
          title: "研发与工程团队",
          description: "模型评测、工作流生成等编程能力",
          actions: [
            {
              label: "查看编程类技能 →",
              href: "/product/skills-programming",
            },
          ],
        },
        {
          title: "业务部门",
          description: "视频布控、安全防护等应用能力",
          actions: [
            {
              label: "查看应用类技能 →",
              href: "/product/skills-application",
            },
          ],
        },
        {
          title: "办公与运营",
          description: "会议提效、技能入门等办公能力",
          actions: [
            {
              label: "查看办公类技能 →",
              href: "/product/skills-office",
            },
          ],
        },
      ],
    },
    cta: {
      title: "让业务能力，标准化、可复用",
      description: "申请体验技能中心，或与华鲲团队沟通技能沉淀与部署方案。",
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=技能中心咨询" },
      ],
    },
  },
  {
    slug: "knowledge",
    name: "企业知识库",
    hero: {
      eyebrow: "智能体中心｜能力底座 · 企业知识库",
      title: "企业知识库：让企业文档变成 AI 能用的知识",
      lead: "把制度、产品资料、技术文档等企业知识上传、解析、分片，沉淀为可检索、可问答、可溯源的 AI 知识底座，支撑知识智能体与上层应用。",
      tags: ["文档接入", "自动分片", "知识图谱", "QA 补充"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=企业知识库咨询" },
      ],
      visual: { title: "企业知识库知识构建界面截图素材槽位" },
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
            href: "/solutions/knowledge-service",
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
        { label: "申请体验", href: "/trial" },
      ],
    },
  },
  {
    slug: "agents",
    name: "智能体中心",
    hero: {
      eyebrow: "产品｜智能体中心（元启核心）",
      title: "让企业拥有懂知识、懂业务、懂流程的 AI 助手",
      lead: "把模型、知识、数据和流程组合成可对话、可执行、可发布的智能体：企业知识助手回答问题，问数助手解读数据，视频助手看懂画面，自动化引擎跑通复杂流程——让 AI 真正开始帮企业干活。",
      tags: ["企业知识助手", "智能问数助手", "视频理解助手", "流程自动化引擎"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=智能体中心咨询" },
      ],
      visual: {
        title: "智能体中心主视觉素材槽位",
        description: "四类 AI 助手对话场景 / 流程编排画布",
        note: "后续替换真实产品截图",
      },
    },
    sections: [
      {
        eyebrow: "01｜产品介绍",
        title: "智能体，是 AI 能力真正落到业务上的最后一公里",
        lead: "企业有模型、有知识、有数据，但「怎么让它们帮业务干活」往往缺最后一公里。",
        body: "智能体中心把这最后一公里补齐：不用员工对着 API 和模型参数，而是像和助手对话一样，让 AI 帮自己查知识、问数据、看视频、跑流程。业务人员获得的是「能用起来的 AI」，而不是「一堆技术能力」。",
        subheading: "构建一次，处处可用",
        cards: [
          {
            title: "直接对话使用",
            description:
              "在平台内直接与助手对话，即开即用，适合内部体验与日常使用。",
          },
          {
            title: "应用广场发布",
            description:
              "发布到应用广场，供组织内或指定用户按需选用，形成可复用的应用入口。",
          },
          {
            title: "外部调用",
            description:
              "通过标准接口将助手能力接入业务系统，让 AI 融入现有流程。",
          },
          {
            title: "联合智能体",
            description:
              "把多个已发布助手组合成联合智能体，统一界面无感切换，协同完成复杂任务。",
          },
        ],
      },
      {
        eyebrow: "02｜能力优势",
        title: "四类智能体，覆盖知识、数据、视频与流程自动化",
        cards: [
          {
            tag: "企业知识助手",
            title: "把企业文档、制度、经验，变成随时可问的智能知识库",
            lead: "员工问「报销标准是什么」「这个合同流程怎么走」，不再翻文档、问同事，直接问助手。",
            description:
              "核心价值：选好模型、关联知识库，智能体即构建完成，即配即用。",
            points: [
              "典型场景：制度咨询、产品资料查询、技术文档问答、员工助手",
              "能力组合：智能问答 ＋ 知识库 ＋ 知识图谱",
              "使用示例：新员工报销差旅费的标准是什么？",
              "根据《费用报销管理制度》，差旅住宿标准为……（附原文出处）",
            ],
            visual: "真实知识问答界面截图素材槽位",
            actions: [
              {
                label: "进入企业知识助手 →",
                href: "/product/agent-knowledge",
              },
              {
                label: "企业知识库底座 →",
                href: "/product/knowledge",
              },
            ],
          },
          {
            tag: "智能问数助手",
            title: "不用写 SQL，问一句就能拿到数据答案",
            lead: "业务人员想查数据，不再等提数排期、不用写查询语句，像聊天一样获得数据洞察。",
            description:
              "业务人员的价值：不用写 SQL，即可获取数据洞察；指标口径统一，结果可信。",
            points: [
              "「查询去年销售额最高的区域」",
              "自动理解指标 → 查询数据库 → 生成分析结果",
              "去年销售额最高的区域是华东区，约 1.28 亿元，同比增长 12%……",
              "能力组合：智能问数 ＋ 指标开发 ＋ 数据接入",
            ],
            visual: "智能问数对话与分析结果界面截图素材槽位",
            actions: [
              {
                label: "进入智能问数助手 →",
                href: "/product/data-agent",
              },
              {
                label: "数据源与指标底座 →",
                href: "/product/knowledge-metrics",
              },
            ],
          },
          {
            tag: "视频理解与智能视觉助手",
            title: "让视频从「被观看」变成「可理解」",
            lead: "监控与视频资料成堆，靠人盯不过来、靠人翻查不到。视频助手让 AI 看懂画面，按需检索、实时预警。",
            points: [
              "典型场景：安防巡检、视频搜索、实时监控、异常检测",
              "能力组合：即时检索 ＋ 实时布控 ＋ 设备接入",
            ],
            visual: "视频检索与实时预警界面截图素材槽位",
            actions: [
              {
                label: "进入视频理解助手 →",
                href: "/product/agent-video",
              },
            ],
          },
          {
            tag: "企业复杂任务自动化引擎 · 元启差异化能力",
            title: "把多步骤、跨系统的复杂业务，变成一条自动流程",
            lead: "很多业务不是「问一句答一句」，而是需要提取、核对、判断、生成、通知的多步骤流程。自动化引擎把它们串起来自动执行。",
            points: [
              "示例：合同审批自动化",
              "能力组合：文生工作流 ＋ 会话工作流 ＋ 流程工作流",
            ],
            flow: [
              "上传合同",
              "AI 识别条款",
              "风险分析",
              "生成审查报告",
              "通知负责人",
            ],
            visual: "流程编排画布与执行结果截图素材槽位",
            actions: [
              {
                label: "进入自动化引擎 →",
                href: "/product/agent-orchestration",
              },
            ],
          },
        ],
      },
      {
        eyebrow: "03｜能力底座",
        title: "AI 助手「懂业务」的底气：知识与数据底座",
        lead: "助手不是空有模型，它依赖企业自己的知识与数据：知识库让回答有依据，数据源与指标让问数有结果。",
        cards: [
          {
            tag: "知识底座",
            title: "企业知识库",
            description:
              "文档接入、自动分片、知识图谱与 QA 补充，把企业文档沉淀为 AI 可检索、可问答的知识资产，回答可溯源。",
            actions: [
              {
                label: "查看企业知识库 →",
                href: "/product/knowledge",
              },
            ],
          },
          {
            tag: "数据底座",
            title: "数据源与指标",
            description:
              "接入企业数据源、同步原始数据、开发统一指标，让问数助手用自然语言直接查数，口径统一、结果可信。",
            actions: [
              {
                label: "查看数据源与指标 →",
                href: "/product/knowledge-metrics",
              },
            ],
          },
        ],
      },
    ],
    business: {
      eyebrow: "04｜业务场景",
      title: "四类智能体，让 AI 真正开始帮企业干活",
      lead: "知识问答、智能问数、视频理解、流程自动化四类助手，覆盖问答、分析、视觉与流程四大场景。",
      points: [
        { title: "企业知识助手", description: "制度、资料随问随答" },
        { title: "智能问数助手", description: "不懂 SQL 也能查数" },
        { title: "视频理解助手", description: "视频可检索、可预警" },
        { title: "流程自动化引擎", description: "复杂业务自动执行" },
      ],
      values: [
        {
          title: "能力落得下去",
          description: "模型、知识、数据真正服务业务",
        },
        { title: "使用门槛低", description: "像对话一样用 AI" },
        { title: "一次构建处处可用", description: "发布、调用、联合复用" },
      ],
      demo: {
        title: "智能体中心 · 能力演示",
        messages: [
          { role: "user", text: "报销标准是什么？" },
          { role: "assistant", text: "正在检索企业知识……" },
          {
            role: "assistant",
            text: "根据《费用报销管理制度》，差旅住宿标准为……｜引用：企业知识库",
          },
          { role: "user", text: "帮我盯一下南门区域的异常" },
          {
            role: "assistant",
            text: "已创建实时布控，发现异常将立即预警。｜视频智能体",
          },
        ],
        footer: { placeholder: "输入你的需求…", action: "发送" },
      },
      reason: ["模型与知识底座", "智能体构建", "能力组合", "发布复用"],
      workflowLabel: "工作方式",
      workflow: ["选型构建", "关联知识与数据", "调试发布", "处处可用"],
      outcomes: [
        {
          title: "能力落得下去",
          description: "模型、知识、数据真正服务业务",
        },
        {
          title: "业务增效",
          description: "问答、分析、检索、流程都有 AI 帮手",
        },
        { title: "可发布可复用", description: "一次构建、处处使用" },
      ],
      scenesLead:
        "覆盖企业知识问答、智能问数、视频监控与业务流程自动化等场景。",
      scenes: [
        {
          title: "企业知识问答与内部服务",
          description: "制度、资料随问随答。",
          actions: [
            {
              label: "查看企业内部智能助手方案 →",
              href: "/solutions/enterprise-assistant",
            },
          ],
        },
        {
          title: "业务数据问数与经营分析",
          description: "随问随答拿数据。",
          actions: [
            {
              label: "查看相关方案 →",
              href: "/solutions/enterprise-assistant",
            },
          ],
        },
        {
          title: "视频监控与流程自动化",
          description: "实时预警、自动执行。",
          actions: [
            {
              label: "查看多智能体协同方案 →",
              href: "/solutions/enterprise-multi-agent",
            },
            {
              label: "查看相关案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
      ],
    },
    cta: {
      title: "需要建设企业 AI 助手？",
      description:
        "面向知识问答、智能问数、视频理解与流程自动化需求，与华鲲团队沟通。",
      actions: [
        {
          label: "商务咨询",
          href: "/contact?topic=智能体中心咨询",
          variant: "primary",
        },
        { label: "申请体验", href: "/trial" },
      ],
    },
  },
  {
    slug: "coding",
    name: "编程中心（码多多 1.0）",
    hero: {
      eyebrow: "产品｜编程中心（码多多 1.0）",
      title: "码多多：让智能编程走进企业日常开发",
      lead: "基于元启平台的智能编程助手，自然语言驱动开发、Plan/Build 双模式工作流，私有化部署、代码不出域——让团队写得更快、改得更稳、交付更规范。",
      tags: ["自然语言开发", "双模式工作流", "私有化部署", "数据不出域"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=编程中心咨询" },
      ],
      visual: {
        title: "码多多 · 编程助手",
        messages: [
          {
            role: "user",
            text: "用 Python 写一个批量重命名文件的脚本",
          },
          { role: "assistant", text: "正在规划实现方案……" },
          {
            role: "assistant",
            text: "已生成完整代码：支持目录遍历、前缀/后缀规则、预览与回滚。｜Plan 模式 · 方案已确认",
          },
        ],
        footer: {
          placeholder: "用自然语言描述你的开发需求…",
          action: "发送",
        },
      },
    },
    sections: [
      {
        eyebrow: "01｜三个核心问题",
        title: "研发提效的三个核心问题",
        lead: "编码门槛、重复劳动、代码质量与安全，是研发团队提效路上最常问的三件事——码多多都有答案。",
        cards: [
          {
            number: "问题 01",
            title: "编码门槛怎么降？",
            description:
              "语言框架多、语法细节杂，新需求从构思到可运行代码耗时较长。",
            answer: "自然语言描述需求，AI 直接生成可运行代码，降低编码门槛。",
            actions: [
              {
                label: "了解会话式开发 →",
                href: "/product/coding-session",
              },
            ],
          },
          {
            number: "问题 02",
            title: "重复劳动怎么减？",
            description:
              "样板代码、常见工具、调试排查占据大量时间，重复劳动难以避免。",
            answer:
              "双模式工作流 + 内置工具链，在真实环境落地执行，自动化完成开发任务。",
            actions: [
              {
                label: "了解项目管理 →",
                href: "/product/coding-project",
              },
            ],
          },
          {
            number: "问题 03",
            title: "代码质量怎么保？",
            description:
              "团队编码风格不一、质量参差，核心代码数据安全也需严格管控。",
            answer: "内置代码质量校验与企业规范适配，私有化部署、数据不出域。",
            actions: [
              {
                label: "了解编程规范 →",
                href: "/product/coding-standard",
              },
            ],
          },
        ],
      },
      {
        eyebrow: "02｜它是什么",
        title: "码多多：自然语言驱动的智能编程助手",
        lead: "依托元启 AI 开发平台，深度集成 VS Code，覆盖主流开发场景，支持私有化部署与离线运行。",
        cards: [
          {
            title: "自然语言驱动开发",
            description: "说需求、生成代码、改代码、查代码，全程对话式完成。",
            actions: [
              {
                label: "了解会话式开发 →",
                href: "/product/coding-session",
              },
            ],
          },
          {
            title: "Plan / Build 双模式",
            description:
              "先规划方案、再执行落地，复杂任务逻辑完整，简单任务高效直接。",
            actions: [
              {
                label: "了解开发工作流 →",
                href: "/product/coding-standard",
              },
            ],
          },
          {
            title: "私有化安全可控",
            description:
              "支持全链路私有化部署，代码与上下文本地处理，满足高安全场景。",
            actions: [
              {
                label: "了解私有化部署方案 →",
                href: "/solutions/private-yuanqi",
              },
            ],
          },
        ],
        demo: {
          title: "码多多 · 对话式开发",
          messages: [
            {
              role: "user",
              text: "给这个接口补上参数校验和单元测试",
            },
            {
              role: "assistant",
              text: "正在分析代码并生成修改方案……",
            },
            {
              role: "assistant",
              text: "已生成修改后的代码与单元测试，并检查通过。｜Build 模式 · 修改已落地",
            },
          ],
          footer: { placeholder: "输入你的开发需求…", action: "发送" },
          note: "对话式编程：输入需求 → 生成代码 → 落地执行，全程可追溯",
        },
      },
      {
        eyebrow: "03｜四大能力",
        title: "围绕开发全流程的四项核心能力",
        lead: "从项目组织、会话延续到多端接入与规范统一，覆盖开发工作的完整闭环。",
        cards: [
          {
            number: "01",
            title: "项目管理",
            description:
              "以项目为单位组织开发，多项目隔离、上下文专注、配置独立。",
            actions: [
              {
                label: "查看项目管理 →",
                href: "/product/coding-project",
              },
            ],
          },
          {
            number: "02",
            title: "会话管理",
            description: "多轮对话上下文延续，会话快照可回滚，开发任务不断线。",
            actions: [
              {
                label: "查看会话管理 →",
                href: "/product/coding-session",
              },
            ],
          },
          {
            number: "03",
            title: "移动接入",
            description:
              "多端接入、终端 UI 可视化，随时随地查看与响应开发任务。",
            actions: [
              {
                label: "查看移动接入 →",
                href: "/product/coding-mobile",
              },
            ],
          },
          {
            number: "04",
            title: "编程规范",
            description:
              "企业编码规范统一适配，代码质量多维度校验，团队标准一致。",
            actions: [
              {
                label: "查看编程规范 →",
                href: "/product/coding-standard",
              },
            ],
          },
        ],
      },
    ],
    business: {
      eyebrow: "04｜业务场景",
      title: "让开发团队，把精力留给业务",
      lead: "说需求、看方案、出代码、落执行，码多多把重复劳动接过去。",
      points: [
        { title: "自然语言开发", description: "需求直接转代码，降低门槛" },
        {
          title: "先规划后执行",
          description: "Plan/Build 双模式，复杂任务不乱",
        },
        { title: "真实环境落地", description: "内置工具链，代码可执行可验证" },
        { title: "私有化可控", description: "数据不出域，代码资产安全" },
      ],
      values: [
        { title: "开发更快", description: "从需求到代码，缩短开发周期" },
        { title: "质量更稳", description: "规范统一、校验内建" },
        { title: "交付更安全", description: "私有化部署，核心资产可控" },
      ],
      demo: {
        title: "码多多 · 开发助手",
        messages: [
          { role: "user", text: "为订单模块设计一个状态机，并生成代码" },
          { role: "assistant", text: "Plan 模式：正在生成设计方案……" },
          {
            role: "assistant",
            text: "方案已生成：待支付→已支付→已发货→已完成，含异常回退。｜方案确认后进入 Build",
          },
          { role: "user", text: "按方案生成代码并跑通测试" },
          {
            role: "assistant",
            text: "已生成代码与单元测试，执行通过。｜Build 模式 · 工具链落地执行",
          },
        ],
        footer: { placeholder: "输入你的开发需求…", action: "发送" },
        note: "需求 → 规划 → 生成 → 落地执行",
      },
      reason: ["大模型理解", "双模式规划", "工具链执行", "质量校验"],
      workflowLabel: "开发工作流",
      workflow: ["输入需求", "生成方案", "落地执行", "验证交付"],
      outcomes: [
        { title: "开发更快", description: "从需求到代码，缩短开发周期" },
        { title: "质量更稳", description: "规范统一、校验内建" },
        { title: "交付更安全", description: "私有化部署，核心资产可控" },
      ],
      scenesLead: "覆盖研发提效、私有化合规、多语言多框架项目等智能编程场景。",
      scenes: [
        {
          title: "研发团队提效",
          description: "Web、微服务、数据处理等多场景开发加速。",
          actions: [
            {
              label: "查看模型部署方案 →",
              href: "/solutions/model-deployment",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "私有化合规开发",
          description: "金融、政务等高安全场景，代码不出域。",
          actions: [
            {
              label: "查看私有化部署方案 →",
              href: "/solutions/private-yuanqi",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "多语言多框架项目",
          description: "Java、Python、Go、TypeScript 等生态覆盖。",
          actions: [
            {
              label: "查看相关方案 →",
              href: "/solutions/model-deployment",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
      ],
    },
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
    name: "安全中心",
    hero: {
      eyebrow: "产品｜安全中心",
      title: "平台用得安全，权限管得清楚",
      lead: "从「谁在平台上」到「能看什么、能做什么、能碰哪些数据」，一条授权链路让权限边界清晰可控。",
      tags: ["用户管理", "角色管理", "菜单管理", "行级权限"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=安全中心咨询" },
      ],
      visual: { title: "权限体系总览素材槽位（授权链路图）" },
    },
    sections: [
      {
        id: "gov-position",
        eyebrow: "01｜产品介绍",
        title: "让平台权限，边界清晰、管得清楚",
        lead: "安全中心把「谁在平台上、能看什么、能做什么、能碰哪些数据」用一条授权链路管起来，从人到数据逐层收敛，权限边界清晰可控。",
      },
      {
        id: "gov-caps",
        eyebrow: "02｜能力优势",
        title: "权限从人到数据的四道关口",
        lead: "每个用户最终能做什么，由这条链路逐层决定；安全中心把每一层都管清楚。",
        cards: [
          {
            number: "01",
            title: "用户管理",
            description: "谁在平台上：账号创建、批量导入与有效期管理。",
            actions: [
              {
                label: "查看用户管理 →",
                href: "/product/governance#gov-users",
              },
            ],
          },
          {
            number: "02",
            title: "角色管理",
            description: "是什么岗位：按岗位配置操作权限与数据权限。",
            actions: [
              {
                label: "查看角色管理 →",
                href: "/product/governance#gov-roles",
              },
            ],
          },
          {
            number: "03",
            title: "菜单管理",
            description: "能看到什么入口：菜单结构与角色可见范围。",
            actions: [
              {
                label: "查看菜单管理 →",
                href: "/product/governance#gov-menu",
              },
            ],
          },
          {
            number: "04",
            title: "行级权限",
            description: "能碰哪些数据：数据可查看 / 可操作 / 可删除。",
            actions: [
              {
                label: "查看行级权限 →",
                href: "/product/governance#gov-permission",
              },
            ],
          },
        ],
        visual: "授权链路完整示意图素材槽位",
      },
      {
        id: "governance-controls-detail",
        eyebrow: "能力优势 · 管控点详解",
        title: "授权链路的每一层，都能精细管理",
        groups: [
          {
            id: "gov-users",
            tag: "01 用户管理",
            title: "从建号到停用，全程可控",
            lead: "统一管理平台使用人员：创建、批量导入、设置有效期、分配权限，人员进出与权限变化全程可追踪。",
            cards: [
              {
                title: "能做什么",
                points: [
                  "账号创建与批量导入",
                  "有效期与停用管理",
                  "按角色分配权限",
                ],
              },
              {
                title: "解决什么",
                points: ["人员权限随岗位变化及时调整", "离职停用不遗漏"],
              },
            ],
            visual: "用户管理界面截图素材槽位",
          },
          {
            id: "gov-roles",
            tag: "02 角色管理",
            title: "按岗位配权限，一套规则管一类人",
            lead: "根据企业岗位与职责创建角色，通过权限配置赋予角色能力，让不同人员获得差异化的平台使用范围。",
            subheading: "权限配置，分两部分",
            cards: [
              {
                title: "能做什么",
                points: [
                  "按岗位创建角色",
                  "通过权限配置赋予操作与数据权限",
                  "角色随岗位变化及时调整",
                ],
              },
              {
                title: "解决什么",
                points: ["权限按岗位统一管理", "新人入岗快速授权"],
              },
              {
                title: "操作权限",
                description:
                  "控制角色对平台功能能做什么：可查看 / 可操作 / 可删除，按角色统一配置。",
                visual: "操作权限配置界面截图素材槽位",
              },
              {
                title: "数据权限",
                description:
                  "控制角色能接触哪些数据：按组织、部门、项目圈定数据范围，可配合行级权限细化到人。",
                visual: "数据权限配置界面截图素材槽位",
              },
            ],
            visual: "角色与权限配置界面截图素材槽位",
          },
          {
            id: "gov-menu",
            tag: "03 菜单管理",
            title: "入口按需呈现，界面因人而异",
            lead: "维护平台菜单结构与功能入口，让不同角色看到与自己职责匹配的菜单，减少无关功能干扰。",
            cards: [
              {
                title: "能做什么",
                points: [
                  "维护菜单结构与层级",
                  "配置角色可见范围",
                  "控制功能入口呈现",
                ],
              },
              {
                title: "解决什么",
                points: ["千人千面、界面干净", "敏感功能入口收敛"],
              },
            ],
            visual: "菜单管理界面截图素材槽位",
          },
          {
            id: "gov-permission",
            tag: "04 行级权限",
            title: "让每个人只看到该看的",
            lead: "在角色之上进一步控制数据范围：同一角色下的不同人员，也能按组织、部门、项目看到不同数据。",
            cards: [
              {
                title: "能做什么",
                points: [
                  "数据可查看 / 可操作 / 可删除分级",
                  "按组织、部门、项目圈定数据范围",
                ],
              },
              {
                title: "解决什么",
                points: ["数据越权被拦住", "敏感数据按需可见"],
              },
            ],
            visual: "行级权限配置界面截图素材槽位",
          },
        ],
      },
    ],
    business: {
      eyebrow: "03｜业务场景",
      title: "从「谁在平台上」到「能碰哪些数据」，一路管清楚",
      lead: "用户、角色、菜单、行级权限四道关口，操作与数据双权限管控，让平台权限边界清晰可控。",
      points: [
        { title: "用户管理", description: "人员进出全程可控" },
        { title: "角色管理", description: "按岗位配置权限" },
        { title: "菜单管理", description: "入口千人千面" },
        { title: "行级权限", description: "数据按范围可见" },
      ],
      values: [
        { title: "权限清晰", description: "授权链路逐层可见" },
        { title: "数据安全", description: "越权访问被拦住" },
        { title: "合规可查", description: "审计有据可依" },
      ],
      visual:
        "授权链路演示素材槽位（用户 → 角色 → 菜单 / 操作权限 → 数据 / 行级权限）",
      reason: ["用户管理", "角色管理", "菜单与操作权限", "数据与行级权限"],
      workflowLabel: "双权限管控",
      workflow: ["操作权限", "数据权限", "边界清晰可控"],
      outcomes: [
        { title: "权限清晰", description: "按岗位分配、千人千面" },
        { title: "数据安全", description: "越权访问被拦住" },
        { title: "合规可查", description: "授权与使用边界统一管理" },
      ],
      scenesLead: "覆盖平台用户与权限治理、组织协作、私有化部署合规等场景。",
      scenes: [
        {
          title: "企业平台权限治理",
          description: "多部门、多岗位统一授权，权限边界清晰。",
          actions: [
            {
              label: "咨询安全方案 →",
              href: "/contact?topic=安全中心咨询",
            },
          ],
        },
        {
          title: "组织协作与合规",
          description: "操作与数据双权限，满足审计合规要求。",
          actions: [
            {
              label: "咨询安全方案 →",
              href: "/contact?topic=安全中心咨询",
            },
          ],
        },
        {
          title: "私有化部署配套",
          description: "数据不出域环境下的权限管控闭环。",
          actions: [
            {
              label: "咨询安全方案 →",
              href: "/contact?topic=安全中心咨询",
            },
          ],
        },
      ],
      note: "安全中心是元启平台内部的用户、权限与授权治理能力，不等同于独立网络安全产品或等保产品。",
    },
    cta: {
      title: "需要企业级平台安全管控？",
      description: "面向平台权限、组织协作与私有化部署需求，与华鲲团队沟通。",
      actions: [
        {
          label: "商务咨询",
          href: "/contact?topic=安全中心咨询",
          variant: "primary",
        },
        { label: "申请体验", href: "/trial" },
      ],
    },
  },
] as const satisfies readonly PlatformPage[];

export function getPlatformCenter(slug: string): PlatformPage | undefined {
  return platformCenters.find((center) => center.slug === slug);
}
