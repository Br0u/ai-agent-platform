import type { PlatformPage } from "./platform-page-types";

export const modelSubpageSlugs = [
  "model-optimization",
  "model-task-center",
  "model-assets",
  "model-training",
  "model-evaluation",
  "model-data",
  "model-deploy",
] as const;

const modelSubpages = [
  {
    slug: "model-optimization",
    name: "模型优化",
    hero: {
      eyebrow: "模型中心｜模型优化",
      title: "模型优化：数据、训练、评估，让模型更懂业务",
      lead: "通用模型不懂企业业务。模型优化通过数据准备、模型训练与效果评估，让模型学会企业知识、验证业务效果，形成「数据 → 训练 → 评估」的优化闭环。",
      tags: ["数据准备", "模型训练", "效果评估"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=模型优化咨询" },
      ],
      visual: { title: "模型优化链路主视觉素材槽位（数据 → 训练 → 评估）" },
    },
    sections: [
      {
        id: "mo-position",
        eyebrow: "01｜产品介绍",
        title: "让模型从「通用」走向「懂业务」",
        lead: "模型优化回答一个核心问题：怎么让模型真正学会企业知识、并在业务中见效。",
        body: "通用大模型很强，但不懂企业专属的业务与知识。模型优化把「数据准备 → 模型训练 → 效果评估」串成一条闭环：数据让训练有料、训练让模型懂业务、评估让效果有据，每一步都有明确产出。",
      },
      {
        eyebrow: "02｜三个核心问题",
        title: "围绕模型变强的三个环节组织能力",
        lead: "数据从哪来、模型怎么训练、效果怎么验证——模型优化按这三个环节组织能力。",
        cards: [
          {
            number: "问题 01",
            title: "训练数据从哪来？",
            description: "训练、评测、蒸馏数据集散落各处，质量与口径难以保证。",
            answer: "数据工厂统一管理数据集，创建、上传、校验、发布一条线。",
            actions: [{ label: "了解数据准备 →", href: "/product/model-data" }],
          },
          {
            number: "问题 02",
            title: "模型怎么学会企业知识？",
            description: "通用模型不懂业务，回答泛泛而谈，需要按场景训练定制。",
            answer: "LoRA 轻量验证、全参深度定制、蒸馏轻量落地，按需选择。",
            actions: [
              { label: "了解模型训练 →", href: "/product/model-training" },
            ],
          },
          {
            number: "问题 03",
            title: "训练效果怎么验证？",
            description: "效果好不好不能靠感觉，上线前需要量化结论。",
            answer: "自动评测快速批量、人工评测业务把关，效果可量化可对比。",
            actions: [
              { label: "了解模型评估 →", href: "/product/model-evaluation" },
            ],
          },
        ],
      },
      {
        id: "mo-caps",
        eyebrow: "03｜能力优势",
        title: "三个环节，一条让模型变强的路径",
        lead: "数据备料、训练提能、评估验证，每一步都产出可用的结果，环环相扣。",
        cards: [
          {
            tag: "第一环",
            title: "数据准备",
            description:
              "训练、评测、蒸馏数据集统一管理，为训练与评估提供高质量数据。",
            actions: [{ label: "查看数据工厂 →", href: "/product/model-data" }],
          },
          {
            tag: "第二环",
            title: "模型训练",
            description:
              "LoRA 微调、全参训练、蒸馏训练三种方式，让模型学会企业知识。",
            actions: [
              { label: "查看模型训练 →", href: "/product/model-training" },
            ],
          },
          {
            tag: "第三环",
            title: "模型评估",
            description:
              "自动评测与人工评测双通道，效果可量化、可对比，支撑决策。",
            actions: [
              { label: "查看模型评估 →", href: "/product/model-evaluation" },
            ],
          },
        ],
        flow: ["数据准备", "模型训练", "模型评估", "优化迭代"],
      },
    ],
    business: {
      eyebrow: "04｜业务场景",
      title: "让模型真正懂业务、可验证、能迭代",
      lead: "数据、训练、评估一条链，让模型优化有路径、效果有依据、迭代有闭环。",
      points: [
        { title: "数据有保障", description: "数据集统一管理" },
        { title: "训练有路径", description: "按投入梯度选择" },
        { title: "效果有依据", description: "评测数据支撑决策" },
        { title: "迭代有闭环", description: "评估反馈持续优化" },
      ],
      values: [
        { title: "更快懂业务", description: "训练让模型学会企业知识" },
        { title: "更省成本", description: "轻量路径先验证再投入" },
        { title: "更稳上线", description: "评测把关，效果有据" },
      ],
      visual: "模型优化链路与评测结果截图素材槽位",
      reason: ["数据工厂", "模型训练", "模型评估", "部署迭代"],
      outcomes: [
        { title: "回答更懂业务", description: "模型与企业知识对齐" },
        { title: "效果可验证", description: "每次迭代有数据支撑" },
        { title: "路径更清晰", description: "从备数据到上线有章法" },
      ],
      scenesLead:
        "覆盖企业知识训练、业务场景定制、模型选型与上线前验证等场景。",
      scenes: [
        {
          title: "企业知识训练",
          description: "让模型学会企业术语与规则。",
          actions: [
            { label: "查看模型训练 →", href: "/product/model-training" },
          ],
        },
        {
          title: "业务场景定制",
          description: "按业务方向轻量微调、快速试错。",
          actions: [{ label: "查看数据准备 →", href: "/product/model-data" }],
        },
        {
          title: "上线前验证",
          description: "自动与人工评测把关效果。",
          actions: [
            { label: "查看模型评估 →", href: "/product/model-evaluation" },
          ],
        },
      ],
    },
    cta: {
      title: "需要让模型更懂业务？",
      description: "面向模型训练、数据准备与效果评估需求，与华鲲团队沟通。",
      actions: [
        {
          label: "商务咨询",
          href: "/contact?topic=模型优化咨询",
          variant: "primary",
        },
        { label: "申请体验", href: "/trial" },
      ],
    },
  },
  {
    slug: "model-task-center",
    name: "任务中心",
    hero: {
      eyebrow: "模型中心｜任务中心",
      title: "任务中心：模型任务统一管理",
      lead: "把推理、训练、评估三类模型任务统一管理，让每个任务都调度到匹配的资源上执行，状态随时可查。",
      tags: ["训练任务", "评估任务", "推理任务"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=任务中心咨询" },
      ],
      visual: {
        title: "任务中心界面截图素材槽位",
        description: "任务列表 / 任务状态 / 筛选器",
        note: "后续替换真实产品截图",
      },
    },
    sections: [
      {
        id: "task-position",
        eyebrow: "01｜它是什么",
        title: "任务中心是模型任务的统一管理入口",
        lead: "模型建设过程中，推理、训练、评估任务分散，资源怎么分配、任务跑到哪、结果如何，很难统一掌握。",
        body: "任务中心把推理、训练、评估三类模型任务统一到一个入口：创建任务时选择运行资源，平台把任务调度到匹配的节点或集群执行，并持续展示运行状态。资源按需使用，避免闲置或互相抢占，让模型任务跑得起来、看得见、管得住。",
      },
      {
        eyebrow: "02｜它能做什么",
        title: "任务中心能帮你做什么",
        cards: [
          {
            title: "任务统一创建管理",
            description: "推理、训练、评估任务一个入口搞定。",
          },
          {
            title: "资源按需匹配",
            description: "任务调度到合适的节点或集群，资源不浪费。",
          },
          {
            title: "运行状态看得见",
            description: "排队、运行、完成、失败状态实时可见。",
          },
          {
            title: "任务灵活管理",
            description: "按类型与状态筛选，支持修改与删除。",
          },
        ],
      },
      {
        id: "task-caps",
        eyebrow: "03｜任务主线",
        title: "模型从调优到上线的一条任务链",
        lead: "三类任务不是三个孤立入口，而是模型生命周期的三个环节：先训练调优，再评估验证，最后推理上线。",
        flow: ["训练任务（调优）", "评估任务（验证）", "推理任务（上线）"],
        cards: [
          {
            tag: "环节 01",
            title: "训练任务",
            description:
              "为模型微调调度资源，保障训练稳定执行，训练结果可进入评估与发布。",
            actions: [
              {
                label: "查看训练任务 →",
                href: "/product/model-task-center#task-training",
              },
            ],
          },
          {
            tag: "环节 02",
            title: "评估任务",
            description: "对模型效果进行测评，为选型与上线提供可量化的依据。",
            actions: [
              {
                label: "查看评估任务 →",
                href: "/product/model-task-center#task-evaluation",
              },
            ],
          },
          {
            tag: "环节 03",
            title: "推理任务",
            description: "把模型变成可调用的服务，供智能体与业务应用使用。",
            actions: [
              {
                label: "查看推理任务 →",
                href: "/product/model-task-center#task-inference",
              },
            ],
          },
        ],
      },
      {
        id: "task-training",
        eyebrow: "04｜第一环：训练任务",
        title: "训练任务：为模型微调配好资源",
        lead: "模型要懂业务，先要训练。训练任务把微调任务与运行资源对接起来，让每一次训练都有保障、看得见。",
        body: "训练任务把训练中心需要执行的微调任务与运行资源对接起来。创建任务时选择运行资源，平台调度匹配的节点或集群执行训练，并持续展示运行状态与进度，训练结果可进入评估与发布流程。",
        demo: {
          title: "训练任务 · 进度演示",
          messages: [
            "训练任务 01｜已完成 ✓",
            "训练任务 02｜训练中 · 进度 62%…",
            "训练任务 03｜排队中",
            "训练完成，进入评估 ✓",
          ],
          note: "任务调度 → 训练执行 → 进度跟踪 → 进入评估",
        },
        cards: [
          {
            title: "资源与训练匹配",
            description: "按训练规模选择资源，避免不足或浪费",
          },
          {
            title: "训练稳定执行",
            description: "任务调度到合适资源，减少卡壳与中断",
          },
          { title: "进度实时可查", description: "训练进度与运行状态随时可见" },
          { title: "结果衔接后续", description: "训练结果进入评估与发布流程" },
          {
            title: "用在哪里",
            points: [
              "LoRA、全参与蒸馏训练任务执行",
              "多训练任务并行、资源分配管理",
              "需要跟踪训练过程的模型团队",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "训练更稳：资源与任务精准匹配",
              "过程更透明：训练进度可跟踪",
              "迭代更顺：保障模型持续优化",
            ],
          },
        ],
        flow: [
          "选择运行资源",
          "创建训练任务",
          "执行训练",
          "查看状态与结果",
          "进入评估与发布",
        ],
        note: "官网不展示训练参数与部署路径等后台信息。",
        actions: [
          {
            label: "训练方式怎么选？看模型训练 →",
            href: "/product/model-training",
          },
        ],
      },
      {
        id: "task-evaluation",
        eyebrow: "05｜第二环：评估任务",
        title: "评估任务：让模型效果用数据说话",
        lead: "训练完效果怎么样、该选哪个模型，评估任务把测评变成可执行的流程，输出可量化的结果。",
        body: "评估任务把模型测评变成可执行的流程。选择待评模型与评测数据集、配置运行资源，创建评估任务后由平台执行测评，输出评测结果，为模型选型、优化与上线提供数据支撑，让每一个模型决策都有依据。",
        demo: {
          title: "评估任务 · 评测结果演示",
          messages: [
            "对比两个候选模型的问答准确率",
            "正在执行自动评测……",
            "模型 A｜问答准确率 92%｜推荐上线",
            "模型 B｜问答准确率 87%｜继续优化",
          ],
          note: "评测集：行业问答 1000 条",
          caption: "选择模型与数据集 → 执行测评 → 输出结果 → 支撑决策",
        },
        cards: [
          {
            title: "测评标准化",
            description: "统一评测流程，结果可量化、可对比",
          },
          { title: "资源按需配置", description: "按评测规模选择资源执行测评" },
          { title: "结果随时可查", description: "评测结果与报告随时查看" },
          { title: "支撑模型决策", description: "为选型、优化与上线提供依据" },
          {
            title: "用在哪里",
            points: ["训练后验证模型效果", "多模型对比选型", "上线前最终测评"],
          },
          {
            title: "能获得什么价值",
            points: [
              "评测标准化：结果可量化",
              "决策有据：模型选择有数据支撑",
              "持续优化：支撑模型迭代",
            ],
          },
        ],
        flow: [
          "选择待评模型与数据集",
          "配置运行资源",
          "创建评估任务",
          "执行测评",
          "查看结果并决策",
        ],
        note: "官网不展示测评数据集与后台参数。",
        actions: [
          {
            label: "评测方式怎么选？看模型评估 →",
            href: "/product/model-evaluation",
          },
        ],
      },
      {
        id: "task-inference",
        eyebrow: "06｜第三环：推理任务",
        title: "推理任务：让模型变成随时可用的服务",
        lead: "模型评估通过后，把它投入推理运行，形成稳定的模型服务，供智能体与业务应用随时调用。",
        body: "推理任务把已部署或可调用的模型投入推理运行。根据业务环境选择部署方式，配置运行资源与模型服务，任务创建后即可运行，供推理中心、流程编排、应用广场与外部业务系统调用，让模型从「训练好的文件」变成「随时可用的服务」。",
        demo: {
          title: "推理任务 · 服务化演示",
          messages: [
            "选择部署方式｜专网 / 云端 / 定制",
            "创建推理任务｜配置模型服务",
            "运行模型服务｜状态可查",
            "业务调用｜智能体 / 应用",
            "模型服务已就绪 ✓",
          ],
          note: "部署 → 创建 → 运行 → 调用",
        },
        cards: [
          {
            title: "模型快速服务化",
            description: "训练好的模型快速变成可用服务，缩短上线周期",
          },
          {
            title: "按环境选择部署",
            description: "专网、云端、定制三种方式，适配不同环境",
          },
          { title: "资源按需配置", description: "按任务需求选择运行资源" },
          {
            title: "支撑业务调用",
            description: "智能体与业务应用可直接调用模型服务",
          },
          {
            title: "用在哪里",
            points: [
              "智能体开发需要调用模型能力",
              "业务应用需要接入模型服务",
              "私有化环境需要内网推理部署",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "上线更快：模型快速服务化",
              "部署灵活：适配不同环境",
              "服务稳定：支撑业务持续使用",
            ],
          },
        ],
        flow: [
          "选择部署方式",
          "填写任务信息",
          "选择运行资源",
          "创建并运行",
          "供智能体与业务应用调用",
        ],
        note: "官网不展示服务密钥、端口号与调用参数。",
        actions: [
          { label: "模型给谁用？看智能体中心 →", href: "/product/agents" },
        ],
      },
    ],
    business: {
      eyebrow: "07｜业务场景",
      title: "模型任务统一管理、状态透明",
      lead: "推理、训练、评估三类任务一个入口统一创建与调度，资源按需使用、状态一目了然。",
      points: [
        { title: "三类任务统一", description: "推理/训练/评估一个入口" },
        { title: "资源按需调度", description: "任务与资源精准匹配" },
        { title: "状态实时可见", description: "排队/运行/完成/失败" },
        { title: "任务灵活管理", description: "筛选、修改、删除" },
      ],
      values: [
        { title: "资源利用率更高", description: "按需调度减少闲置" },
        { title: "任务状态透明", description: "运行情况一目了然" },
        { title: "管理更省心", description: "统一入口降低运维" },
      ],
      demo: {
        title: "模型任务中心",
        messages: [
          "推理任务｜已完成 ✓",
          "训练任务｜运行中…",
          "评估任务｜排队中",
          "全部完成 ✓",
        ],
        note: "推理 / 训练 / 评估任务统一调度",
      },
      reason: ["任务创建", "资源调度", "执行监控", "结果查看"],
      workflowLabel: "工作流程",
      workflow: ["创建任务", "调度资源", "执行监控", "查看结果"],
      outcomes: [
        { title: "资源利用率更高", description: "按需调度减少闲置" },
        { title: "任务状态透明", description: "运行情况一目了然" },
        { title: "管理更省心", description: "统一入口降低运维" },
      ],
      scenesLead: "覆盖任务统一管理、多业务共享资源、运行跟踪等场景。",
      scenes: [
        {
          title: "统一管理三类任务",
          description: "推理、训练、评估一个入口",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions#scene-model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
        {
          title: "多业务共享资源",
          description: "资源按需分配不抢占",
          actions: [
            {
              label: "查看模型部署方案 →",
              href: "/solutions#scene-model-deployment",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
        {
          title: "跟踪运行状态",
          description: "任务进度与结果可查",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions#scene-model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
      ],
    },
    cta: {
      title: "需要模型任务统一调度？",
      description:
        "面向推理、训练、评估任务调度与资源管理需求，与华鲲团队沟通。",
      actions: [
        {
          label: "商务咨询",
          href: "/contact?topic=任务中心咨询",
          variant: "primary",
        },
        { label: "申请体验", href: "/trial" },
      ],
    },
  },
  {
    slug: "model-assets",
    name: "模型资产管理",
    hero: {
      eyebrow: "模型中心｜模型资产管理",
      title: "模型资产管理：让企业模型资产一条线管到底",
      lead: "模型花园负责选型、模型纳管负责接入，训练、评估、部署从同一处取用模型——把企业散落的模型资产，收成一条清晰的主线。",
      tags: ["模型花园", "模型纳管", "资产主线"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=模型资产管理咨询" },
      ],
      visual: { title: "模型资产管理架构图素材槽位（选型→接入→使用）" },
    },
    sections: [
      {
        eyebrow: "01｜三个核心问题",
        title: "模型资产管理的三个核心问题",
        lead: "模型数量增长后，企业最关心三件事：有什么、能不能用、怎么落地。",
        cards: [
          {
            number: "问题 01",
            title: "企业有哪些模型？",
            description:
              "模型分散在不同环境与团队里，没人说得清企业到底有哪些模型、在哪里。",
            answer: "模型纳管统一接入，本地模型与模型花园合在一张台账里。",
            actions: [
              {
                label: "了解模型纳管 →",
                href: "/product/model-assets#assets-manage",
              },
            ],
          },
          {
            number: "问题 02",
            title: "模型能不能用、怎么部署？",
            description:
              "模型是否支持纳管、能支持什么框架、部署有什么要求，缺乏依据。",
            answer: "模型花园集中展示模型范围与部署约束，选型有依据。",
            actions: [
              {
                label: "了解模型花园 →",
                href: "/product/model-assets#assets-garden",
              },
            ],
          },
          {
            number: "问题 03",
            title: "模型怎么落地使用？",
            description:
              "选型、接入、使用各自为政，模型很难真正进入训练、评估与部署流程。",
            answer: "选型→接入→使用一条线，训练、评估、部署从同一处取用模型。",
            actions: [
              {
                label: "了解资产主线 →",
                href: "/product/model-assets#assets-position",
              },
            ],
          },
        ],
      },
      {
        id: "assets-position",
        eyebrow: "02｜资产主线",
        title: "一条线：选型 → 接入 → 使用",
        lead: "模型资产管理不是几个功能的拼盘，而是一条完整的主线：模型花园解决「选什么」，模型纳管解决「怎么接入」，训练、评估、部署解决「怎么用起来」。",
        flow: [
          "模型花园（选型）",
          "模型纳管（接入）",
          "统一取用（训练 / 评估 / 部署）",
        ],
        cards: [
          {
            title: "第一环：模型花园",
            description:
              "集中展示可纳管、可部署的模型范围与部署约束，选型有依据。",
            visual: "模型花园模型卡片列表截图素材槽位",
            actions: [
              {
                label: "进入模型花园 →",
                href: "/product/model-assets#assets-garden",
              },
            ],
          },
          {
            title: "第二环：模型纳管",
            description:
              "本地模型云端下载、离线导入，与企业已有模型统一接入管理。",
            visual: "模型纳管台账截图素材槽位",
            actions: [
              {
                label: "进入模型纳管 →",
                href: "/product/model-assets#assets-manage",
              },
            ],
          },
          {
            title: "第三环：统一取用",
            description:
              "纳管后的模型可直接进入训练、评估与部署流程，从同一处找到模型。",
            visual: "任务中心取用模型截图素材槽位",
            actions: [
              { label: "查看任务中心 →", href: "/product/model-task-center" },
            ],
          },
        ],
      },
      {
        id: "assets-garden",
        eyebrow: "03｜第一环：模型花园",
        title: "模型花园：选模型的「货架」",
        lead: "它是资产主线的起点——把平台支持的模型范围摆上货架，分类浏览、信息可查，看中即可一键部署。",
        body: "模型花园集中展示平台可支持纳管与定制部署的模型范围。按模型分类展示模型卡片，点击可查看模型信息（支持框架、入长出长等部署约束）。在花园里选好模型，一键发起部署，跳转任务中心创建推理任务并选择定制部署，让「选模型→部署模型」成为一条顺畅的路径。",
        demo: {
          title: "模型花园 · 一键部署演示",
          messages: [
            "浏览模型花园｜按分类查看模型卡片",
            "查看模型信息｜支持框架 / 入长出长",
            "一键部署｜跳转任务中心",
            "创建推理任务｜选择定制部署",
            "部署任务已创建 ✓",
          ],
          note: "浏览 → 查看 → 一键部署 → 创建推理任务",
        },
        cards: [
          {
            title: "模型集中展示",
            description: "按分类浏览平台支持的模型范围",
          },
          {
            title: "模型信息可查",
            description: "支持框架、入长出长等部署约束一目了然",
          },
          {
            title: "一键部署入口",
            description: "从花园直达推理任务，选择定制部署",
          },
          {
            title: "与模型纳管联动",
            description: "纳管后的模型可进入训练、评估与部署",
          },
        ],
        note: "定制部署要求模型已存在于模型仓库（训练发布或纳管导入）；原型阶段只展示模型卡片结构，不承诺具体模型清单。",
        actions: [
          {
            label: "查看模型纳管（第二环）→",
            href: "/product/model-assets#assets-manage",
          },
          { label: "查看模型部署 →", href: "/product/model-deploy" },
        ],
      },
      {
        id: "assets-manage",
        eyebrow: "04｜第二环：模型纳管",
        title: "模型纳管：资产台账的「统一入口」",
        lead: "它是资产主线的中段——把企业已有模型统一接入平台，有网没网都能纳管，台账清晰、取用方便。",
        body: "模型纳管把企业已有模型统一放到平台里管理。本地模型支持云端下载与离线导入，模型按厂商、类型、来源与状态分类。训练、评估、部署都能从同一个地方找到模型，避免模型分散在各处「找不到、用不了」。",
        demo: {
          title: "模型纳管 · 接入演示",
          messages: [
            "云端下载｜已完成 ✓",
            "离线导入｜已完成 ✓",
            "分类入库｜按厂商 / 类型 / 来源 / 状态…",
            "模型资产台账已就绪 ✓",
          ],
          note: "双通道接入 → 统一台账 → 随时取用",
        },
        cards: [
          {
            title: "有网没网都能接入",
            description: "云端下载适配有网环境，离线导入适配内网环境",
          },
          {
            title: "模型不再分散难找",
            description: "本地模型与模型花园统一管理，分类一目了然",
          },
          {
            title: "选模型有依据",
            description: "模型花园展示模型范围，为选型提供参考",
          },
          {
            title: "从纳管到使用一条路",
            description: "纳管模型直接进入训练、评估与部署流程",
          },
        ],
        flow: [
          "云端下载 / 离线导入",
          "模型入库",
          "分类台账",
          "训练 · 评估 · 部署取用",
        ],
        note: "原型阶段只预留模型卡片结构，不承诺具体模型数量或型号。",
        actions: [
          {
            label: "查看模型花园（第一环）→",
            href: "/product/model-assets#assets-garden",
          },
          { label: "查看任务中心 →", href: "/product/model-task-center" },
        ],
      },
    ],
    business: {
      eyebrow: "05｜业务场景",
      title: "模型资产，从选型到使用一站管到底",
      lead: "把散落的模型收成一条主线：看得见、选得准、接得进、用得上。",
      points: [
        {
          title: "资产集中可见",
          description: "模型花园 + 模型纳管一张台账，不再分散",
        },
        { title: "选型有依据", description: "模型范围与部署约束清晰可查" },
        {
          title: "接入方式灵活",
          description: "云端下载 / 离线导入，适配不同网络环境",
        },
        {
          title: "取用全程顺畅",
          description: "训练、评估、部署从同一处取用模型",
        },
      ],
      values: [
        { title: "资产更清楚", description: "模型集中可见，不再分散难找" },
        { title: "选型更省事", description: "部署约束与支持框架有据可查" },
        {
          title: "落地更顺畅",
          description: "选型到部署一条线，模型真正用起来",
        },
      ],
      demo: {
        title: "模型资产主线演示",
        messages: [
          "模型花园｜选型",
          "模型纳管｜接入",
          "训练 / 评估｜优化",
          "部署服务｜使用",
          "资产主线闭环 ✓",
        ],
        note: "选型 → 接入 → 优化 → 部署，全程同一处取用",
      },
      reason: ["模型台账", "双通道纳管", "统一取用", "训练·评估·部署闭环"],
      workflowLabel: "资产主线",
      workflow: ["花园选型", "纳管接入", "任务取用", "闭环迭代"],
      outcomes: [
        { title: "资产更清楚", description: "模型集中可见，不再分散难找" },
        { title: "接入更灵活", description: "有网没网都能纳管，适配不同环境" },
        {
          title: "落地更顺畅",
          description: "选型到部署一条线，模型真正用起来",
        },
      ],
      scenesLead: "覆盖模型选型、内网接入、训练评估部署取用等需求。",
      scenes: [
        {
          title: "模型选型与框架适配",
          description: "多模型场景下，选型与部署约束有据可查。",
          actions: [
            {
              label: "查看模型部署方案 →",
              href: "/solutions#scene-model-deployment",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
        {
          title: "内网模型统一接入",
          description: "离线导入适配内网环境，模型资产统一管理。",
          actions: [
            {
              label: "查看私有化部署方案 →",
              href: "/solutions#scene-private-yuanqi",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
        {
          title: "训练评估部署取用",
          description: "纳管模型进入训练、评估与部署流程，效果可验证。",
          actions: [
            {
              label: "查看模型评估方案 →",
              href: "/solutions#scene-model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
      ],
    },
    cta: {
      title: "需要统一管理企业模型资产？",
      description: "面向模型选型、纳管、部署与调用需求，与华鲲团队沟通。",
      actions: [
        {
          label: "商务咨询",
          href: "/contact?topic=模型资产管理咨询",
          variant: "primary",
        },
        { label: "申请体验", href: "/trial" },
      ],
    },
  },
  {
    slug: "model-training",
    name: "模型训练",
    hero: {
      eyebrow: "模型中心｜模型训练",
      title: "模型训练：让模型更贴合你的业务",
      lead: "通过数据集准备与三种训练方式，让通用模型学会企业专属知识，回答更准确、更懂业务。",
      tags: ["LoRA 微调", "全参训练", "蒸馏训练", "数据集准备"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=模型训练咨询" },
      ],
      visual: { title: "训练中心 / 数据工厂界面截图素材槽位" },
    },
    sections: [
      {
        id: "train-position",
        eyebrow: "01｜它是什么",
        title: "模型训练是让模型学会企业知识的过程",
        lead: "通用模型什么都懂一点，但不懂你的企业——你的术语、规则、产品和文档。",
        body: "模型训练解决的就是这件事：通过微调，把企业知识「教」给模型，让模型在回答时更贴合业务。训练前先准备数据集（训练、评测、蒸馏三种），然后按业务需求选择训练方式，训练完成后进入评估验证效果。模型训练是模型从「通用」走向「懂业务」的关键一步。",
      },
      {
        eyebrow: "02｜它能做什么",
        title: "模型训练能帮你做什么",
        cards: [
          {
            title: "让模型懂企业知识",
            description: "模型学会企业术语、规则与文档内容，回答不再泛泛而谈。",
          },
          {
            title: "按需选择训练方式",
            description:
              "LoRA 轻量快速、全参深度定制、蒸馏轻量落地，按业务要求选。",
          },
          {
            title: "训练过程看得见",
            description: "进度与 Loss 实时查看，训练结果可评估、可对比。",
          },
          {
            title: "数据集按用途准备",
            description: "训练、评测、蒸馏数据集分开管理，训练与评测更规范。",
          },
        ],
      },
      {
        id: "train-caps",
        eyebrow: "03｜训练方式主线",
        title: "先备数据，再按梯度选训练方式",
        lead: "三种训练方式不是平级选项，而是一条按投入与效果排开的路径：先轻量验证，再深度定制，最后轻量规模化落地。",
        flow: [
          "数据准备",
          "LoRA 微调（快速验证）",
          "全参训练（深度定制）",
          "蒸馏训练（轻量落地）",
        ],
        cards: [
          {
            tag: "前置准备",
            title: "数据准备",
            description:
              "通过数据工厂准备训练、评测与蒸馏数据集，训练效果从数据开始。",
            actions: [{ label: "查看数据准备 →", href: "/product/model-data" }],
          },
          {
            tag: "第一环",
            title: "LoRA 微调",
            description: "轻量高效，快速适配业务，适合快速验证与多方向并行。",
            actions: [
              {
                label: "查看 LoRA 微调 →",
                href: "/product/model-training#train-lora",
              },
            ],
          },
          {
            tag: "第二环",
            title: "全参训练",
            description: "深度定制，模型与业务知识深度融合，适合高要求场景。",
            actions: [
              {
                label: "查看全参训练 →",
                href: "/product/model-training#train-full",
              },
            ],
          },
          {
            tag: "第三环",
            title: "蒸馏训练",
            description: "小模型承接大模型能力，降低部署成本，适合规模化落地。",
            actions: [
              {
                label: "查看蒸馏训练 →",
                href: "/product/model-training#train-distill",
              },
            ],
          },
        ],
        actions: [
          { label: "数据从哪来？看数据准备 →", href: "/product/model-data" },
          {
            label: "查看训练任务 →",
            href: "/product/model-task-center#task-training",
          },
        ],
      },
      {
        id: "train-lora",
        eyebrow: "04｜第一环：LoRA 微调",
        title: "LoRA 微调：轻量高效，让模型快速懂业务",
        lead: "只训练少量参数，用更低的成本让模型快速学会企业知识，适合快速验证与多业务并行适配。",
        body: "LoRA 微调只训练少量适配参数，在通用模型基础上快速建立业务能力。它训练开销小、周期短，非常适合先跑通、再迭代：先用 LoRA 验证某个业务方向行不行，效果达标再决定是否加大投入，是模型迭代中最常用的轻量路径。",
        demo: {
          title: "LoRA 微调 · 多业务并行演示",
          messages: [
            "客服问答微调｜已完成 ✓",
            "文档问答微调｜已完成 ✓",
            "内容生成微调｜训练中 · 进度 58%…",
            "多方向并行微调，互不影响 ✓",
          ],
          note: "一个方向一个 LoRA，快速试错、互不影响",
        },
        cards: [
          {
            title: "快速验证业务方向",
            description: "周期短、成本低，先跑通再决定是否加大投入",
          },
          {
            title: "多业务并行适配",
            description: "多个业务方向分别微调，互不影响，灵活扩展",
          },
          {
            title: "过程看得见",
            description: "训练进度与 Loss 实时查看，随时掌握状态",
          },
          {
            title: "成果可流转",
            description: "微调模型可发布，进入评估与部署流程",
          },
          {
            title: "用在哪里",
            points: [
              "客服问答：快速让模型学会业务话术与知识",
              "文档问答：让模型基于企业文档回答",
              "内容生成：按企业风格生成文本",
              "多业务快速试错：低成本验证多个方向",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "周期短：快速验证，缩短上线时间",
              "成本低：资源开销小，降低微调门槛",
              "可扩展：多业务并行，灵活支撑增长",
              "可迭代：模型随业务持续优化",
            ],
          },
        ],
        flow: [
          "准备训练数据集",
          "选择模型与运行资源",
          "配置微调参数",
          "执行训练并查看进度",
          "发布微调任务",
        ],
        note: "官网不展示训练参数值与后台配置。",
        actions: [
          {
            label: "需要深度定制？看全参训练 →",
            href: "/product/model-training#train-full",
          },
          {
            label: "规模化落地？看蒸馏训练 →",
            href: "/product/model-training#train-distill",
          },
        ],
      },
      {
        id: "train-full",
        eyebrow: "05｜第二环：全参训练",
        title: "全参训练：深度定制，让模型成为企业资产",
        lead: "对模型全量参数训练，让模型能力与业务知识深度融合，适合对效果要求高的核心业务。",
        body: "全参训练对模型全量参数进行训练，模型能力与业务知识深度融合。它投入更大、周期更长，但能形成真正意义上的企业专属模型资产，适合对效果要求高的核心业务场景。",
        demo: {
          title: "全参训练 · 深度定制演示",
          messages: [
            "数据准备｜训练数据集",
            "全量训练｜深度融合",
            "效果评估｜验证达标",
            "沉淀资产｜企业专属模型",
            "企业专属模型已沉淀 ✓",
          ],
          note: "数据 → 全量训练 → 评估验证 → 沉淀资产",
        },
        cards: [
          {
            title: "模型与业务深度融合",
            description: "全量参数训练，模型真正理解企业知识与业务",
          },
          {
            title: "高要求场景更可靠",
            description: "效果优先，适合核心业务与高要求场景",
          },
          {
            title: "过程可控可验证",
            description: "训练过程可管理，结果进入评估验证",
          },
          {
            title: "沉淀专属资产",
            description: "形成企业独有的模型能力，长期复用",
          },
          {
            title: "用在哪里",
            points: [
              "核心业务深度建模：模型与业务知识深度绑定",
              "高要求效果场景：对模型效果要求高的业务",
              "充足资源投入：有充足数据与训练资源的组织",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "深度适配：模型与业务知识深度融合",
              "过程可控：训练可管理、结果可验证",
              "资产专属：形成企业独有的模型能力",
              "长期复用：模型资产持续服务业务",
            ],
          },
        ],
        flow: [
          "准备训练数据集",
          "选择模型与运行资源",
          "配置训练参数",
          "执行训练",
          "发布微调任务",
        ],
        note: "官网不展示训练参数与后台配置。",
        actions: [
          {
            label: "想快速验证？看 LoRA 微调 →",
            href: "/product/model-training#train-lora",
          },
          {
            label: "轻量落地？看蒸馏训练 →",
            href: "/product/model-training#train-distill",
          },
        ],
      },
      {
        id: "train-distill",
        eyebrow: "06｜第三环：蒸馏训练",
        title: "蒸馏训练：用小模型承接大模型能力",
        lead: "把大模型的能力沉淀到轻量模型上，在效果与成本之间取得平衡，让模型更容易规模化落地。",
        body: "蒸馏训练利用教师模型的能力与蒸馏数据集，训练一个更轻量的学生模型。学生模型推理开销小、更容易规模化部署，适合对部署成本敏感、需要大规模运行或在受限环境下运行的场景。",
        demo: {
          title: "蒸馏训练 · 效果与成本演示",
          messages: [
            "蒸馏后的模型效果和成本怎么样？",
            "正在对比教师模型与学生模型……",
            "教师模型｜问答准确率 94%｜推理成本高",
            "学生模型｜问答准确率 90%｜推理成本更低",
          ],
          note: "蒸馏数据集：行业问答 1000 条",
          caption: "大模型（教师）→ 蒸馏 → 小模型（学生）→ 轻量部署",
        },
        cards: [
          {
            title: "把大模型能力变轻",
            description: "学生模型承接教师模型关键能力，效果与资源更平衡",
          },
          {
            title: "降低推理成本",
            description: "轻量模型开销小，规模化部署成本更低",
          },
          {
            title: "适配受限环境",
            description: "轻量模型更容易在边缘或受限环境运行",
          },
          { title: "规模化落地", description: "模型更轻，大规模运行成为可能" },
          {
            title: "用在哪里",
            points: [
              "大规模部署：对推理成本敏感、需要规模化的场景",
              "受限环境：边缘或资源受限环境下的模型运行",
              "能力复用：复用大模型能力但资源有限的组织",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "成本更低：降低推理与部署成本",
              "更易规模化：轻量模型支撑大规模运行",
              "能力保留：保留大模型的关键能力",
              "部署灵活：适配更多运行环境",
            ],
          },
        ],
        flow: [
          "准备蒸馏数据集",
          "选择教师与学生模型",
          "配置推理资源",
          "执行蒸馏训练",
          "发布并部署",
        ],
        note: "官网不展示蒸馏训练资源规格与后台配置，具体以正式产品资料为准。",
        actions: [
          {
            label: "看轻量微调 LoRA →",
            href: "/product/model-training#train-lora",
          },
          {
            label: "需要深度定制？看全参训练 →",
            href: "/product/model-training#train-full",
          },
        ],
      },
    ],
    business: {
      eyebrow: "07｜业务场景",
      title: "数据训练评估闭环，让模型学会企业知识",
      lead: "用企业数据训练模型，LoRA、全参、蒸馏按需选择，训练后评估验证、持续迭代。",
      points: [
        { title: "数据准备", description: "训练/评测/蒸馏数据集" },
        { title: "三种训练方式", description: "LoRA、全参、蒸馏" },
        { title: "进度可视化", description: "训练过程可跟踪" },
        { title: "评估验证", description: "训练后进入评测" },
      ],
      values: [
        { title: "回答更准确", description: "模型与业务知识对齐" },
        { title: "路径灵活", description: "轻量到深度按需选择" },
        { title: "效果可验证", description: "训练后进入评估" },
      ],
      demo: {
        title: "模型训练",
        messages: [
          "数据准备｜选择训练方式",
          "执行训练｜进度跟踪",
          "效果评估｜迭代优化",
          "执行完成 ✓",
        ],
        note: "数据 → 训练 → 评估 → 迭代",
      },
      reason: ["数据准备", "训练执行", "效果评估", "迭代优化"],
      workflowLabel: "工作流程",
      workflow: ["准备数据", "执行训练", "评估效果", "迭代发布"],
      outcomes: [
        { title: "回答更准确", description: "模型与业务知识对齐" },
        { title: "路径灵活", description: "轻量到深度按需选择" },
        { title: "效果可验证", description: "训练后进入评估" },
      ],
      scenesLead: "覆盖企业知识问答、文档审核、内容生成等模型优化场景。",
      scenes: [
        {
          title: "知识问答优化",
          description: "让模型基于企业知识准确回答",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions#scene-model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
        {
          title: "文档审核模型",
          description: "模型学会企业文档自动核对",
          actions: [
            {
              label: "查看模型部署方案 →",
              href: "/solutions#scene-model-deployment",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
        {
          title: "内容生成模型",
          description: "按企业风格生成内容",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions#scene-model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
      ],
    },
    cta: {
      title: "需要让模型更懂业务？",
      description: "面向数据准备、训练方式选择与模型微调需求，与华鲲团队沟通。",
      actions: [
        {
          label: "商务咨询",
          href: "/contact?topic=模型训练咨询",
          variant: "primary",
        },
        { label: "申请体验", href: "/trial" },
      ],
    },
  },
  {
    slug: "model-evaluation",
    name: "模型评估",
    hero: {
      eyebrow: "模型中心｜模型评估",
      title: "模型评估：效果好不好，用数据说话",
      lead: "通过自动评测与人工评测验证模型效果，为模型选型、优化与上线提供依据，让每个模型决策都有数据支撑。",
      tags: ["效果可量化", "选型有依据", "上线有把握"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=模型评估咨询" },
      ],
      visual: { title: "评估中心 / 评测结果界面截图素材槽位" },
    },
    sections: [
      {
        id: "eval-position",
        eyebrow: "01｜它是什么",
        title: "模型评估是验证「模型到底行不行」的环节",
        lead: "训练完的模型，效果好不好、该不该上线，不能靠感觉。",
        body: "模型评估通过自动评测与人工评测两种方式，把模型效果变成可量化、可对比的结论：自动评测快速批量验证、口径统一；人工评测按业务口径人工把关。评估结果直接支撑模型选型、优化与上线决策，避免「模型上线了才发现不好用」。",
      },
      {
        id: "eval-caps",
        eyebrow: "02｜它能做什么",
        title: "模型评估能帮你做什么",
        cards: [
          {
            title: "效果好坏可量化",
            description: "评测报告让模型效果看得见、可对比。",
          },
          {
            title: "选哪个模型有依据",
            description: "多模型对比，选型不再拍脑袋。",
          },
          { title: "上线更有把握", description: "上线前测评，风险提前发现。" },
          {
            title: "优化方向更明确",
            description: "评测结论直接反馈训练与配置，持续改进。",
          },
        ],
      },
      {
        eyebrow: "03｜怎么用",
        title: "两种评测方式，按需选择",
        cards: [
          {
            title: "自动评测",
            description:
              "内置评测方法自动评分，适合批量验证与标准化对比，快速出报告。",
            actions: [
              {
                label: "查看自动评测 →",
                href: "/product/model-evaluation#eval-auto",
              },
            ],
          },
          {
            title: "人工评测",
            description: "人工标注回复准确性，按业务口径把关，适合高要求场景。",
            actions: [
              {
                label: "查看人工评测 →",
                href: "/product/model-evaluation#eval-manual",
              },
            ],
          },
        ],
        flow: [
          "选择评测任务与模型",
          "选择评测数据集",
          "执行自动或人工评测",
          "查看评测结果",
          "指导选型与优化",
        ],
      },
      {
        id: "eval-auto",
        eyebrow: "04｜第一环：自动评测",
        title: "自动评测：效果验证更快、口径更统一",
        lead: "通过内置评测方法自动评分并生成报告，适合批量验证、多模型对比与持续回归。",
        body: "自动评测通过内置 AI 评测方法对模型输出自动评分，速度快、口径统一。模型多了、迭代快了，靠人工逐条评测根本来不及。自动评测让效果验证不再成为迭代瓶颈：训练后批量验证、多模型对比选型、持续回归，都能快速拿到量化结论。",
        demo: {
          title: "自动评测 · 批量对比演示",
          messages: [
            "模型 A 评测｜已完成 ✓",
            "模型 B 评测｜已完成 ✓",
            "评测报告生成｜生成中 · 进度 72%…",
            "同一套口径，选型一目了然 ✓",
          ],
          note: "批量评测 → 报告生成 → 对比选型",
        },
        cards: [
          {
            title: "大批量快速验证",
            description: "自动评分，训练后立即确认效果",
          },
          { title: "多模型统一对比", description: "同一套口径，选型一目了然" },
          {
            title: "效果变化可追踪",
            description: "回归评测，持续观察模型变化",
          },
          {
            title: "评测成本更低",
            description: "减少人工投入，评测不再是瓶颈",
          },
          {
            title: "用在哪里",
            points: [
              "训练后批量验证效果",
              "多模型对比选型",
              "上线前与定期回归评测",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "效率高：大批量快速完成",
              "口径统一：结果可比、可沉淀",
              "成本低：减少人工评测投入",
              "决策有据：选型上线有量化支撑",
            ],
          },
        ],
        flow: [
          "选择评测任务与模型",
          "选择评测数据集",
          "执行自动评测",
          "生成评测报告",
          "指导选型与优化",
        ],
        note: "官网不展示评测方法与参数配置细节。",
        actions: [
          {
            label: "需要人工把关？看人工评测 →",
            href: "/product/model-evaluation#eval-manual",
          },
        ],
      },
      {
        id: "eval-manual",
        eyebrow: "05｜第一环：人工评测",
        title: "人工评测：按业务口径人工把关",
        lead: "通过人工标注模型回复准确性，让评测结果贴合真实业务标准，适合高要求场景。",
        body: "人工评测由业务人员对模型回复逐条标注，结果更贴合真实业务口径。模型好不好，最终要回到业务场景里看。自动评测覆盖不了所有维度，高要求的客服、法务、金融场景，需要人工逐条把关；人工评测与自动评测互补，效率与质量兼顾。",
        demo: {
          title: "人工评测 · 业务把关演示",
          messages: [
            "按客服业务口径标注这批回复的准确性",
            "已生成待标注列表，共 12 条……",
            "已完成标注 12 条，评测结果已生成，可反馈模型优化。",
          ],
          note: "业务口径：客服问答场景",
        },
        cards: [
          { title: "按业务口径把关", description: "评测标准与业务实际对齐" },
          {
            title: "高要求场景更放心",
            description: "人工判断补足自动评测盲区",
          },
          { title: "评测结论可反馈", description: "结果直接反馈训练与配置" },
          { title: "与自动评测互补", description: "效率与质量兼顾" },
          {
            title: "用在哪里",
            points: [
              "客服、法务、金融等高要求业务场景",
              "上线前的最终人工确认",
              "自动评测难以覆盖的主观与业务维度",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "贴合业务：评测标准与业务一致",
              "风险可控：高要求场景有人工把关",
              "自动互补：效率与质量兼顾",
              "持续改进：结论反馈模型优化",
            ],
          },
        ],
        flow: [
          "创建人工评测任务",
          "人工标注回复准确性",
          "生成评测结果",
          "反馈模型优化",
        ],
        actions: [
          {
            label: "想快速验证？看自动评测 →",
            href: "/product/model-evaluation#eval-auto",
          },
        ],
      },
    ],
    business: {
      eyebrow: "06｜业务场景",
      title: "效果好不好，用数据说话",
      lead: "自动评测 + 人工评测双通道，效果可量化、可对比，选型与上线有数据支撑。",
      points: [
        { title: "自动评测", description: "内置方法自动评分" },
        { title: "人工评测", description: "业务口径人工把关" },
        { title: "报告生成", description: "评测结果一键成报告" },
        { title: "对比选型", description: "多模型效果对比" },
      ],
      values: [
        { title: "效果可量化", description: "评测报告一目了然" },
        { title: "决策有据", description: "选型与上线有数据支撑" },
        { title: "风险可控", description: "问题早发现早处理" },
      ],
      demo: {
        title: "模型效果评测",
        messages: [
          "对比两个候选模型的问答准确率",
          "正在执行自动评测……",
          "华东区｜约 1.28 亿元｜同比增长 12%",
        ],
        note: "数据来源：销售数据库",
      },
      reason: ["评测任务", "自动/人工评测", "报告生成", "选型决策"],
      workflowLabel: "工作流程",
      workflow: ["选择模型", "执行评测", "生成报告", "对比决策"],
      outcomes: [
        { title: "效果可量化", description: "评测报告一目了然" },
        { title: "决策有据", description: "选型与上线有数据支撑" },
        { title: "风险可控", description: "问题早发现早处理" },
      ],
      scenesLead: "覆盖训练后验证、多模型选型、上线前测评等场景。",
      scenes: [
        {
          title: "训练后验证",
          description: "训练完成先验证效果",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions#scene-model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
        {
          title: "多模型选型",
          description: "效果对比选出更优模型",
          actions: [
            {
              label: "查看模型适配方案 →",
              href: "/solutions#scene-model-evaluation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
        {
          title: "上线前测评",
          description: "上线前最终把关",
          actions: [
            {
              label: "查看模型部署方案 →",
              href: "/solutions#scene-model-deployment",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions#case-pending-enterprise-knowledge",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "model-data",
    name: "数据准备",
    hero: {
      eyebrow: "模型中心｜数据准备",
      title: "数据准备：训练效果从数据开始",
      lead: "通过数据工厂统一管理训练、评测与蒸馏数据集，支持创建、上传、查看、下载与发布，为模型训练与评估提供高质量数据来源。",
      tags: ["数据集管理", "训练数据", "评测数据", "蒸馏数据"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=数据准备咨询" },
      ],
      visual: { title: "数据工厂数据集管理界面截图素材槽位" },
    },
    sections: [
      {
        eyebrow: "01｜它是什么",
        title: "数据工厂是模型训练与评估的数据来源",
        lead: "模型学得好不好，数据是前提。没有数据，训练与评估都无从谈起。",
        body: "数据准备对应元启平台的数据工厂：在这里创建和管理数据集，按用途分为训练数据集、评测数据集与蒸馏数据集；数据集支持上传、查看、下载与发布，发布后即可被训练任务与评估任务选用，形成「数据 → 训练 → 评估」的标准化流程。",
        visual: "数据工厂功能总览界面截图素材槽位",
      },
      {
        eyebrow: "02｜能力优势",
        title: "数据准备能帮你做什么",
        cards: [
          {
            title: "数据集创建与上传",
            description: "按训练、评测、蒸馏用途创建数据集并上传数据。",
            visual: "创建数据集界面截图素材槽位",
          },
          {
            title: "数据集查看",
            description: "查看数据集内容与结构，确认数据质量。",
            visual: "数据集详情界面截图素材槽位",
          },
          {
            title: "数据集下载",
            description: "支持导出与复用，数据资产可迁移、可备份。",
            visual: "数据集下载界面截图素材槽位",
          },
          {
            title: "数据集发布",
            description:
              "发布后的数据集可被训练、评估任务选用，进入模型建设链路。",
            visual: "数据集发布界面截图素材槽位",
          },
        ],
      },
      {
        eyebrow: "03｜关联能力",
        title: "数据支撑哪些环节",
        cards: [
          {
            title: "模型训练",
            description: "训练数据集支撑 LoRA、全参与蒸馏训练。",
            actions: [
              { label: "查看模型训练 →", href: "/product/model-training" },
            ],
          },
          {
            title: "模型评估",
            description: "评测数据集支撑自动与人工评测。",
            actions: [
              { label: "查看模型评估 →", href: "/product/model-evaluation" },
            ],
          },
        ],
      },
    ],
    business: {
      eyebrow: "04｜业务场景",
      title: "数据备得齐、备得好，模型才训得稳",
      lead: "数据集创建、校验、发布一体化管理，训练、评测数据统一治理，让模型建设有可靠的「数据燃料」。",
      points: [
        { title: "数据集创建", description: "训练 / 评测 / 蒸馏分类管理" },
        { title: "数据校验", description: "质量可控、口径一致" },
        { title: "发布复用", description: "进入训练评估链路" },
        { title: "资产沉淀", description: "知识库 QA 自动生成复用" },
      ],
      values: [
        { title: "支撑训练", description: "LoRA / 全参 / 蒸馏有数可用" },
        { title: "支撑评估", description: "自动与人工评测有据可依" },
      ],
      visual: "数据集管理与校验界面截图素材槽位",
      reason: ["数据集管理", "质量校验", "发布沉淀", "训练评估调用"],
      workflow: ["创建数据集", "上传 / 校验", "发布", "训练 / 评估选用"],
      outcomes: [
        { title: "训练更稳", description: "数据口径统一、质量可控" },
        { title: "评估更准", description: "评测数据有据可依" },
        { title: "资产复用", description: "知识资产沉淀复用" },
      ],
      scenesLead:
        "覆盖模型训练数据准备、评估数据治理与企业知识资产复用等场景。",
      scenes: [
        {
          title: "训练数据准备",
          description: "为微调任务准备高质量数据。",
          actions: [
            { label: "查看模型训练 →", href: "/product/model-training" },
          ],
        },
        {
          title: "评测数据治理",
          description: "为自动与人工评测准备数据。",
          actions: [
            { label: "查看模型评估 →", href: "/product/model-evaluation" },
          ],
        },
        {
          title: "知识资产复用",
          description: "知识库 QA 自动生成数据集。",
          actions: [{ label: "查看知识库 →", href: "/product/knowledge" }],
        },
      ],
    },
    cta: {
      title: "需要数据准备支撑？",
      description:
        "面向数据集建设、训练数据治理与评估数据准备需求，与华鲲团队沟通。",
      actions: [
        {
          label: "商务咨询",
          href: "/contact?topic=数据准备咨询",
          variant: "primary",
        },
        { label: "申请体验", href: "/trial" },
      ],
    },
  },
  {
    slug: "model-deploy",
    name: "模型部署",
    hero: {
      eyebrow: "模型中心｜模型部署",
      title: "模型部署：让模型变成可调用的服务",
      lead: "通过定制、专网、云端三种部署方式，把训练完成的模型或接入的模型服务变成可被智能体与业务应用调用的能力，按需选择部署与运行环境。",
      tags: ["定制部署", "专网部署", "云端部署", "推理服务调用"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=模型部署咨询" },
      ],
      visual: { title: "模型部署流程与三种方式示意图素材槽位" },
    },
    sections: [
      {
        id: "deploy-position",
        eyebrow: "01｜它是什么",
        title: "模型部署解决「模型怎么真正跑起来」的问题",
        lead: "训练完成的模型放在仓库里没有价值，只有部署成可调用的服务，才能被智能体与业务使用。",
        body: "模型部署把模型资源转化为推理服务：按模型来源与环境选择部署方式——训练完成并发布的模型可选择定制部署；企业专网已有模型服务可选择专网部署接入；需要连接外部云厂商模型可选择云端部署。部署后模型即可被后续推理调用，支撑智能体与业务应用。",
        visual: "「模型仓库 → 部署方式选择 → 推理服务调用」流程图素材槽位",
      },
      {
        id: "deploy-caps",
        eyebrow: "02｜三种部署方式",
        title: "按模型来源与环境选择",
        table: {
          columns: ["部署方式", "适用场景", "模型来源", "运行环境"],
          rows: [
            [
              "定制部署",
              "平台内模型服务化",
              "训练中心发布模型 / 模型花园支持定制部署的模型",
              "平台纳管的主机资源，支持多机 / 集群",
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
              "云厂商在线模型（模型名称与密钥保持一致）",
              "云厂商运行环境，通过外网接入",
            ],
          ],
        },
        actions: [
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
        eyebrow: "03｜关联能力",
        title: "部署后如何被使用",
        cards: [
          {
            title: "智能体中心",
            description:
              "部署后的模型可被智能体调用，成为对话、问数与流程能力的底座。",
            actions: [{ label: "查看智能体中心 →", href: "/product/agents" }],
          },
          {
            title: "任务中心",
            description: "推理任务在任务中心统一创建与调度，部署状态全程可查。",
            actions: [
              {
                label: "查看任务中心 →",
                href: "/product/model-task-center#task-inference",
              },
            ],
          },
        ],
      },
      {
        id: "model-deploy-details",
        eyebrow: "部署方式详解",
        title: "三种部署方式，怎么选、怎么配",
        groups: [
          {
            id: "deploy-custom",
            tag: "定制部署",
            title: "平台内模型服务化",
            lead: "把训练完成的模型部署为可调用服务，使用平台纳管的主机资源，支持多机 / 集群。",
            cards: [
              {
                title: "适用场景",
                points: [
                  "训练中心已发布的模型",
                  "模型花园支持定制部署的模型（MindIE / VLLM 等框架）",
                ],
              },
              {
                title: "关键点",
                points: [
                  "资源来自平台已纳管主机",
                  "可配置部署路径、最大入长与出长",
                  "部署完成后可被推理调用",
                ],
              },
            ],
            flow: [
              "模型花园一键部署 / 任务中心创建推理任务",
              "选择定制部署",
              "选择模型与主机资源",
              "配置并创建",
            ],
            visual: "定制部署创建界面截图素材槽位",
          },
          {
            id: "deploy-private",
            tag: "专网部署",
            title: "企业内网模型服务接入",
            lead: "模型在企业专网运行，满足数据不出域要求，由企业自主管理。",
            cards: [
              {
                title: "适用场景",
                points: [
                  "数据不出域、自主运行的私有化环境",
                  "企业专网已有模型服务",
                ],
              },
              {
                title: "关键点",
                points: [
                  "模型名称与专网内模型保持一致",
                  "服务密钥可自定义",
                  "企业自主管理、按需接入",
                ],
              },
            ],
            flow: [
              "任务中心创建推理任务",
              "选择专网部署",
              "填写模型名称与密钥",
              "选择运行环境并创建",
            ],
            visual: "专网部署创建界面截图素材槽位",
          },
          {
            id: "deploy-cloud",
            tag: "云端部署",
            title: "连接云厂商在线模型",
            lead: "通过外网接入云厂商在线模型，快速获得最新模型能力。",
            cards: [
              {
                title: "适用场景",
                points: [
                  "想快速使用云端模型、无需自建环境",
                  "需要弹性扩展与最新模型能力",
                ],
              },
              {
                title: "关键点",
                points: [
                  "模型名称与云厂商保持一致",
                  "服务密钥与云厂商提供的密钥一致",
                  "按需使用云端资源",
                ],
              },
            ],
            flow: [
              "任务中心创建推理任务",
              "选择云端部署",
              "填写云厂商模型名称与密钥",
              "创建并使用",
            ],
            visual: "云端部署创建界面截图素材槽位",
          },
        ],
      },
    ],
    business: {
      eyebrow: "04｜业务场景",
      title: "按环境选部署，模型快速上线",
      lead: "专网、云端、定制三种部署方式适配不同环境，部署即生成推理任务，算力按需调度，状态可视化监控。",
      points: [
        { title: "专网部署", description: "数据不出域，安全合规" },
        { title: "云端部署", description: "弹性扩展，快速用上新模型" },
        { title: "定制部署", description: "贴合个性化场景" },
        { title: "可视化监控", description: "任务状态实时掌握" },
      ],
      values: [
        {
          title: "适配主流框架",
          description: "MindIE / VLLM / Xinference 深度适配",
        },
        { title: "自动生成推理任务", description: "部署方式选定即生成" },
        { title: "算力按需调配", description: "资源灵活选择" },
      ],
      visual: "模型部署与任务监控界面截图素材槽位",
      reason: ["部署方式选型", "推理任务生成", "算力资源调度", "运行状态监控"],
      workflow: ["选择部署方式", "生成推理任务", "算力调度", "上线运行 · 监控"],
      outcomes: [
        { title: "上线更快", description: "部署方式选定即生成任务" },
        { title: "环境适配", description: "专网 / 云端 / 定制按需选择" },
        { title: "运行可控", description: "任务状态实时可视化" },
      ],
      scenesLead: "覆盖私有化合规部署、弹性扩展与个性化环境适配等场景。",
      scenes: [
        {
          title: "高安全行业私有化",
          description: "内网部署，数据不出域。",
          actions: [
            { label: "咨询部署方案 →", href: "/contact?topic=模型部署咨询" },
          ],
        },
        {
          title: "快速上线云端模型",
          description: "弹性扩展，快速获得最新能力。",
          actions: [
            { label: "咨询部署方案 →", href: "/contact?topic=模型部署咨询" },
          ],
        },
        {
          title: "个性化定制部署",
          description: "贴合业务环境的定制化适配。",
          actions: [
            { label: "咨询部署方案 →", href: "/contact?topic=模型部署咨询" },
          ],
        },
      ],
    },
    cta: {
      title: "需要模型上线服务？",
      description: "面向模型部署方式选型与推理服务调用需求，与华鲲团队沟通。",
      actions: [
        {
          label: "商务咨询",
          href: "/contact?topic=模型部署咨询",
          variant: "primary",
        },
        { label: "申请体验", href: "/trial" },
      ],
    },
  },
] as const satisfies readonly PlatformPage[];

export function getModelSubpage(slug: string): PlatformPage | undefined {
  return modelSubpages.find((page) => page.slug === slug);
}
