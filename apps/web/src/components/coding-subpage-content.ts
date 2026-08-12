import type { PlatformPage } from "./platform-page-types";

export const codingSubpageSlugs = [
  "coding-project",
  "coding-session",
  "coding-mobile",
  "coding-standard",
] as const;

const codingSubpages = [
  {
    slug: "coding-project",
    name: "项目管理",
    hero: {
      eyebrow: "编程中心｜项目管理",
      title: "让 AI 持续理解你的开发项目",
      lead: "码多多以项目为单位组织开发：项目代码、历史会话、当前任务与开发环境统一关联，AI 持续理解当前工程，减少重复沟通，让智能编程真正贴合项目实际。",
      tags: ["项目上下文管理", "多项目隔离", "项目级配置"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=项目管理咨询" },
      ],
      visual: {
        title: "项目工作台：项目代码、历史会话、当前任务、开发环境统一关联",
        messages: [
          "项目工作台 · 订单系统",
          "订单系统",
          "数据中台",
          "官网重构",
          "为订单模块增加支付超时自动关单处理",
          "已生成关单逻辑与定时任务代码，并补充单元测试。",
          "引用：订单服务",
          "当前项目文件：order-service / payment / tests",
        ],
        note: "原型演示：切换项目标签，将切换为该项目的会话与文件",
      },
    },
    sections: [
      {
        id: "cp-position",
        eyebrow: "产品介绍",
        title: "让 AI 编程，围绕项目上下文展开",
        lead: "码多多通过项目级管理，把项目代码、历史会话与开发上下文统一关联，让 AI 持续理解每个工程，多项目并行也互不干扰。",
      },
      {
        eyebrow: "01｜三个核心问题",
        title: "项目化 AI 开发的三个核心问题",
        lead: "项目越复杂，AI 越需要上下文——项目管理回答三个核心问题。",
        cards: [
          {
            number: "问题 01",
            title: "AI 怎么记住每个项目？",
            description:
              "多个项目同时开发，需求与代码交叉，切换项目时上下文易混乱。",
            answer: "按项目归集需求、代码与会话，一个项目一套独立上下文。",
            actions: [
              {
                label: "了解项目上下文管理 →",
                href: "/product/coding-project#cp-org",
              },
            ],
          },
          {
            number: "问题 02",
            title: "团队标准怎么统一？",
            description: "编码规范、工具配置因人而异，协作与交接需要反复对齐。",
            answer: "项目级统一配置编码规范与工具权限，团队标准一致。",
            actions: [
              {
                label: "了解多项目隔离 →",
                href: "/product/coding-project#cp-isolate",
              },
            ],
          },
          {
            number: "问题 03",
            title: "项目配置怎么独立？",
            description:
              "模型、工具、规范按项目差异化配置困难，调整一处牵动多处。",
            answer: "规范、工具、模型按项目独立配置，按需调整、互不影响。",
            actions: [
              {
                label: "了解项目级配置 →",
                href: "/product/coding-project#cp-config",
              },
            ],
          },
        ],
      },
      {
        id: "cp-org",
        eyebrow: "02｜项目上下文管理",
        title: "项目上下文管理：让 AI 持续理解当前工程",
        lead: "码多多将项目代码、历史会话、当前任务与开发资料统一关联，形成完整项目上下文，AI 无需重复了解项目背景。",
        body: "项目越复杂，AI 越需要理解工程全貌：工程结构、代码实现、历史决策与当前需求。码多多把这一切围绕项目组织起来，让 AI 在正确的上下文里生成代码。",
        cards: [
          {
            title: "项目代码关联",
            description: "AI 解析工程结构，理解代码实现",
          },
          { title: "历史会话延续", description: "开发决策与上下文跨会话保留" },
          { title: "当前任务聚焦", description: "围绕当前需求生成与修改代码" },
          {
            title: "开发资料引用",
            description: "接入文档与资料，辅助工程理解",
          },
        ],
        demo: {
          title: "项目工作台 · 订单系统",
          messages: [
            "订单系统",
            "数据中台",
            "官网重构",
            "为订单模块增加支付超时自动关单处理",
            "已生成关单逻辑与定时任务代码，并补充单元测试。",
            "引用：订单服务",
            "当前项目文件：order-service / payment / tests",
          ],
        },
        note: "解决：AI 生成代码脱离工程实际、重复介绍项目背景。",
      },
      {
        id: "cp-isolate",
        eyebrow: "03｜多项目隔离",
        title: "多项目隔离：并行开发互不干扰",
        lead: "不同项目拥有独立上下文，切换项目时 AI 自动进入对应开发环境，避免项目间内容混淆。",
        body: "同时负责多个项目时，码多多按项目维护独立上下文：从 A 项目切到 B 项目，A 的会话、代码、方案不会带到 B，多用户协作同样互不干扰。",
        cards: [
          {
            title: "上下文独立",
            description: "各项目代码、会话、需求独立管理",
          },
          { title: "切换即切换", description: "项目切换自动切换上下文与配置" },
          { title: "多人协作隔离", description: "多用户、多项目会话互不混淆" },
          { title: "防止串扰", description: "项目间内容隔离，杜绝串项目" },
        ],
        demo: {
          title:
            "项目切换演示：从「订单系统」切换到「数据中台」，上下文随之切换",
          messages: [
            "项目工作台 · 数据中台",
            "订单系统",
            "数据中台",
            "官网重构",
            "为数据同步任务增加断点续传",
            "已生成断点续传实现与失败重试策略。",
            "引用：数据同步模块",
            "当前项目文件：sync-engine / retry / tests",
          ],
        },
        note: "解决：多项目并行时上下文混淆、代码串项目。",
      },
      {
        id: "cp-config",
        eyebrow: "04｜项目级配置",
        title: "项目级配置：规范、工具、模型按项目适配",
        lead: "不同项目采用不同技术栈与规范，码多多支持按项目独立配置，让 AI 按各项目的规矩生成代码。",
        body: "编码规范、工具权限与模型选择均可按项目独立设置：多团队、多项目各配各的，互不影响，让 AI 生成符合项目环境的代码。",
        cards: [
          {
            title: "编码规范落地",
            description: "按项目设定规范，团队标准一致",
          },
          { title: "工具权限控制", description: "命令、文件操作按项目授权" },
          { title: "模型按需选择", description: "本地 / 云端模型按项目切换" },
          { title: "多团队差异化", description: "多项目差异化配置，互不影响" },
        ],
        demo: {
          title: "项目级配置示意：不同项目使用不同规范、工具与模型",
          messages: [
            "项目 A · 订单系统",
            "编码规范：企业规范 X",
            "工具权限：bash + edit",
            "模型：DeepSeek 代码模型",
            "项目 B · 数据中台",
            "编码规范：团队规范 Y",
            "工具权限：bash + read + write",
            "模型：千问代码模型",
          ],
        },
        note: "解决：技术栈与规范差异导致 AI 生成不符合项目环境。",
      },
      {
        eyebrow: "核心体验",
        title: "建一个项目，AI 就懂一个项目",
        lead: "新建项目、导入工程，AI 即形成项目上下文；此后描述需求即可对话式开发，产出可运行、可回滚、可续接。",
        flow: [
          "创建项目 · 导入工程",
          "AI 形成项目上下文",
          "对话式开发 · 持续沉淀",
        ],
        visual:
          "项目工作台真实产品截图：项目上下文、历史会话与开发任务统一关联",
      },
    ],
    business: {
      eyebrow: "06｜业务场景",
      title: "让每个项目，都有清晰、专注的开发上下文",
      lead: "项目化组织让开发工作边界清晰：上下文专注、协作清晰、配置灵活。",
      points: [
        { title: "项目上下文管理", description: "需求、代码、会话集中呈现" },
        { title: "多项目隔离", description: "多项目并行互不干扰" },
        { title: "项目级配置", description: "规范、工具、模型独立配置" },
        { title: "持续开发理解", description: "历史上下文延续，开发不断线" },
      ],
      values: [
        { title: "上下文专注", description: "按项目归集，开发不串场" },
        { title: "协作更清晰", description: "多项目、多团队边界明确" },
        { title: "管理更灵活", description: "项目级配置按需调整" },
      ],
      demo: {
        title: "项目工作台 · 会话示例",
        messages: [
          {
            role: "user",
            text: "在这个项目里，帮我重构支付模块的错误处理",
          },
          { role: "assistant", text: "正在基于当前项目上下文分析……" },
          {
            role: "assistant",
            text: "已识别支付模块的错误处理模式，生成统一异常处理方案与重构代码。",
            cite: "上下文：订单系统 · 已引用 8 条历史会话",
          },
        ],
        footer: { placeholder: "基于当前项目上下文提问…", action: "发送" },
      },
      reason: ["项目归集", "上下文隔离", "项目级配置", "持续开发理解"],
      workflowLabel: "项目化工作流",
      workflow: ["创建项目", "导入工程", "项目内开发", "多项目切换"],
      outcomes: [
        { title: "上下文专注", description: "按项目归集，开发不串场" },
        { title: "协作更清晰", description: "多项目、多团队边界明确" },
        { title: "管理更灵活", description: "项目级配置按需调整" },
      ],
      scenesLead: "覆盖多项目并行、多团队协作、差异化技术栈等研发组织场景。",
      scenes: [
        {
          title: "多项目并行开发",
          description: "多个项目同时推进，上下文各归各、不干扰。",
          actions: [{ label: "了解码多多更多能力 →", href: "/product/coding" }],
        },
        {
          title: "多团队共用码多多",
          description: "团队各自管理项目，配置与上下文相互独立。",
          actions: [
            { label: "了解团队权限管理 →", href: "/product/governance" },
          ],
        },
        {
          title: "差异化技术栈项目",
          description: "不同项目不同规范、工具与模型，按项目适配。",
          actions: [{ label: "了解模型选择与适配 →", href: "/product/model" }],
        },
      ],
    },
    cta: {
      title: "需要以项目为单位组织智能编程？",
      description: "申请体验码多多智能编程，或与华鲲团队沟通企业级部署方案。",
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=项目管理咨询" },
        { label: "返回编程中心", href: "/product/coding" },
      ],
    },
  },
  {
    slug: "coding-session",
    name: "会话管理",
    hero: {
      eyebrow: "编程中心｜会话管理",
      title: "让开发上下文不断线",
      lead: "码多多以会话为单位维护开发上下文：历史指令、生成的代码与规划方案跨对话保留，复杂任务跨阶段推进，思路不中断。",
      tags: ["上下文延续", "快照回滚", "会话隔离"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=会话管理咨询" },
      ],
      visual: {
        title: "码多多 · 会话示例",
        messages: [
          {
            role: "user",
            text: "为订单模块增加支付超时自动关单处理",
          },
          {
            role: "assistant",
            text: "已生成关单逻辑代码，含定时任务与状态流转。",
          },
          {
            role: "user",
            text: "给上一步生成的关单逻辑补充单元测试",
          },
          {
            role: "assistant",
            text: "正在基于上一轮生成的代码编写测试……",
          },
          {
            role: "assistant",
            text: "已生成单元测试，引用上一步的关单逻辑。",
            cite: "上下文：已引用第 1 轮生成的代码",
          },
        ],
        footer: { placeholder: "继续你的开发对话…", action: "发送" },
        note: "多轮会话演示：AI 记得住前文，跨轮次引用已生成代码",
      },
    },
    sections: [
      {
        id: "cs-position",
        eyebrow: "产品介绍",
        title: "让每一次开发对话，都可续、可回、不乱",
        lead: "会话管理把开发过程中的对话、快照与历史统一沉淀，随时回滚续接，多任务并行不串扰。",
      },
      {
        eyebrow: "01｜三个核心问题",
        title: "会话管理的三个核心问题",
        lead: "复杂开发任务不是一句话能写完的，上下文能否延续是关键。",
        cards: [
          {
            number: "问题 01",
            title: "上下文怎么不丢？",
            description:
              "复杂需求多轮对话后，AI 不记得前文，需重复说明需求与背景。",
            answer: "以会话为单位维护上下文，历史指令跨轮次保留。",
            actions: [
              {
                label: "了解多轮对话延续 →",
                href: "/product/coding-session#cs-flow",
              },
            ],
          },
          {
            number: "问题 02",
            title: "跨阶段怎么衔接？",
            description:
              "方案规划与代码生成跨阶段推进时，上下文衔接困难，容易脱节。",
            answer: "Plan/Build 跨阶段延续，历史方案与代码都在上下文里。",
            actions: [
              {
                label: "了解快照与回滚 →",
                href: "/product/coding-session#cs-snapshot",
              },
            ],
          },
          {
            number: "问题 03",
            title: "多人共用怎么不串？",
            description:
              "多用户、多项目共用服务时，会话相互干扰，上下文易混淆。",
            answer: "多用户、多项目会话相互隔离，上下文独立。",
            actions: [
              {
                label: "了解会话隔离 →",
                href: "/product/coding-session#cs-isolate",
              },
            ],
          },
        ],
      },
      {
        id: "cs-flow",
        eyebrow: "02｜多轮对话延续",
        title: "多轮对话延续：上下文跨阶段衔接",
        lead: "码多多以会话为单位维护上下文，历史指令、生成的代码与规划方案跨对话保留，AI 持续理解开发意图。",
        body: "复杂需求需要多轮细化：先说需求、再确认方案、最后生成与修改代码。码多多让每一轮对话都建立在前一轮之上，AI 记得住你写过什么、定过什么。",
        cards: [
          {
            title: "历史指令保留",
            description: "需求与指令跨轮次保留，不用重复说明",
          },
          {
            title: "代码方案延续",
            description: "已生成代码与方案可被后续对话引用",
          },
          {
            title: "Plan/Build 衔接",
            description: "规划阶段确认的方案，执行阶段接着做",
          },
          {
            title: "上下文持续累积",
            description: "多轮对话上下文不断累积，越聊越懂",
          },
        ],
        demo: {
          title: "码多多 · 多轮对话",
          messages: [
            {
              role: "user",
              text: "为订单模块增加支付超时自动关单处理",
            },
            { role: "assistant", text: "已生成关单逻辑与状态流转方案。" },
            { role: "user", text: "在此基础上，把超时时间改为可配置" },
            { role: "assistant", text: "正在基于上一轮方案调整……" },
            {
              role: "assistant",
              text: "已将超时时间改为配置项，并保留原有逻辑。",
              cite: "上下文：引用第 1 轮的关单方案",
            },
          ],
          footer: { placeholder: "继续对话…", action: "发送" },
          note: "跨轮引用演示：AI 记得并引用前几轮的内容",
        },
        note: "解决：需求重复说明、对话不连贯、复杂任务聊不下去。",
      },
      {
        id: "cs-snapshot",
        eyebrow: "03｜快照与回滚",
        title: "快照与回滚：开发过程可回溯",
        lead: "会话快照保存阶段性状态，需要时回滚到可靠版本——改坏了也不怕，随时回到能用的状态。",
        body: "开发过程中，一个方向走不通、一次修改不满意，都希望回到之前的状态。码多多通过会话快照保存阶段状态，支持随时回滚，让开发过程更稳妥。",
        cards: [
          { title: "会话快照保存", description: "阶段性状态一键保存" },
          { title: "状态可回退", description: "回到可靠版本，开发更稳妥" },
          { title: "多版本留存", description: "多个快照节点可对比、可切换" },
          { title: "上下文完整", description: "回滚后上下文完整恢复，不丢失" },
        ],
        demo: {
          title: "快照时间线：保存节点，可随时回滚",
          messages: [
            "V1",
            "· 关单逻辑完成",
            "已保存",
            "V2",
            "· 增加配置项",
            "当前",
            "回滚 V1",
            "· 恢复可靠状态",
            "可回退",
          ],
        },
        note: "解决：改坏无法回退、开发状态不可恢复。",
      },
      {
        id: "cs-isolate",
        eyebrow: "04｜会话隔离",
        title: "会话隔离：多人共用互不干扰",
        lead: "多用户、多项目会话相互隔离，上下文独立、隐私有保障，团队共用不乱。",
        body: "团队共用码多多时，每个开发者、每个项目拥有独立会话，上下文互不干扰；历史会话按用户与项目隔离，隐私与数据安全有保障。",
        cards: [
          { title: "多用户隔离", description: "每个开发者的会话独立管理" },
          { title: "多项目隔离", description: "不同项目会话互不干扰" },
          { title: "上下文独立", description: "各自上下文互不混淆" },
          { title: "隐私安全", description: "会话数据隔离，隐私有保障" },
        ],
        demo: {
          title: "会话隔离示意：多用户各用各的会话",
          messages: [
            "开发者 A",
            "订单系统 · 会话 3 个",
            "上下文独立",
            "开发者 B",
            "数据平台 · 会话 2 个",
            "上下文独立",
          ],
        },
        note: "解决：多人共用串扰、上下文混淆、隐私风险。",
      },
      {
        eyebrow: "核心体验",
        title: "会话随时可续，思路不断档",
        lead: "每一次开发对话都按项目沉淀，关键节点保存快照，随时回滚、随时续接，接着上一次的思路继续开发。",
        flow: [
          "发起会话 · 多轮协作",
          "关键节点保存快照",
          "随时回滚 · 加载续接",
        ],
        visual: "会话管理真实产品截图：多轮对话、快照与续接界面",
      },
    ],
    business: {
      eyebrow: "06｜业务场景",
      title: "让开发上下文，真正连贯起来",
      lead: "会话让开发像连续剧：记得住前文、可回退、可续接、可隔离。",
      points: [
        { title: "上下文延续", description: "多轮对话记得住前文" },
        { title: "快照回滚", description: "开发过程可回溯" },
        { title: "会话隔离", description: "多人共用互不干扰" },
        { title: "Plan/Build 衔接", description: "跨阶段上下文延续" },
      ],
      values: [
        { title: "思路不中断", description: "上下文跨阶段延续" },
        { title: "过程更稳", description: "快照回滚有保障" },
        { title: "隐私更安全", description: "会话相互隔离" },
      ],
      demo: {
        title: "码多多 · 会话示例",
        messages: [
          {
            role: "user",
            text: "继续昨天的开发任务，先看一下关单逻辑的状态",
          },
          { role: "assistant", text: "正在加载历史会话……" },
          {
            role: "assistant",
            text: "已恢复上下文：关单逻辑已完成，超时时间已配置化；当前可继续开发测试。",
            cite: "会话：订单系统 · 快照 V2",
          },
        ],
        footer: { placeholder: "输入你的开发需求…", action: "发送" },
      },
      reason: ["会话创建", "上下文累积", "快照保存", "会话隔离"],
      workflowLabel: "会话工作流",
      workflow: ["发起会话", "多轮协作", "保存快照", "加载续接"],
      outcomes: [
        { title: "思路不中断", description: "上下文跨阶段延续" },
        { title: "过程更稳", description: "快照回滚有保障" },
        { title: "隐私更安全", description: "会话相互隔离" },
      ],
      scenesLead: "覆盖复杂需求多轮细化、开发中断恢复、多人共用等开发场景。",
      scenes: [
        {
          title: "复杂需求多轮细化",
          description: "需求、方案、代码多轮推进不脱节。",
          actions: [
            { label: "了解双模式开发工作流 →", href: "/product/coding" },
          ],
        },
        {
          title: "开发中断后恢复",
          description: "加载历史会话，上下文完整续接。",
          actions: [
            { label: "了解项目上下文管理 →", href: "/product/coding-project" },
          ],
        },
        {
          title: "多人共用开发服务",
          description: "会话隔离，上下文互不干扰。",
          actions: [
            { label: "了解用户与权限管理 →", href: "/product/governance" },
          ],
        },
      ],
    },
    cta: {
      title: "让开发上下文，不再断线",
      description: "申请体验码多多会话管理能力，或咨询企业级部署方案。",
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=会话管理咨询" },
        { label: "返回编程中心", href: "/product/coding" },
      ],
    },
  },
  {
    slug: "coding-mobile",
    name: "移动接入",
    hero: {
      eyebrow: "编程中心｜移动接入",
      title: "让智能编程，接入你的每一种开发环境",
      lead: "码多多支持 VS Code、命令行、终端 UI 与远程接入，开发者在不同环境都能查看与响应开发任务，私有化部署也能远程使用。",
      tags: ["多端接入", "终端 UI", "远程访问"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=移动接入咨询" },
      ],
      visual: {
        title: "终端 UI 演示：交互菜单、实时日志、生成进度、错误高亮",
        messages: [
          "●",
          "●",
          "●",
          "码多多 · 终端",
          "$ 查看当前任务列表",
          "▸ 任务：为订单模块增加支付超时自动关单处理",
          "[生成代码] 正在生成…… ██████████ 100%",
          "⚠ 提示：检测到 1 处潜在性能风险，已给出优化建议",
          "✔ 代码已生成并通过单元测试",
        ],
        note: "此处预留真实产品截图位置",
      },
    },
    sections: [
      {
        id: "cm-position",
        eyebrow: "产品介绍",
        title: "让 AI 编程能力，随处可用",
        lead: "通过多端接入、终端界面与远程访问，码多多融入团队习惯的开发环境，随时随地继续开发任务。",
      },
      {
        eyebrow: "01｜三个核心问题",
        title: "随处开发的三个核心问题",
        lead: "开发环境不只在 IDE 里，受限环境下的接入与协作是团队常遇到的问题。",
        cards: [
          {
            number: "问题 01",
            title: "无界面环境怎么开发？",
            description:
              "服务器与受限环境缺少图形界面，可视化操作受限，任务进度不可见。",
            answer: "终端 UI 可视化操作，无图形环境也能顺畅使用。",
            actions: [
              {
                label: "了解多端接入 →",
                href: "/product/coding-mobile#cm-multi",
              },
            ],
          },
          {
            number: "问题 02",
            title: "异地协作怎么接入？",
            description: "团队多地协作时，难以随时接入开发环境查看方案与代码。",
            answer: "多端接入与远程访问，随时随地查看与响应。",
            actions: [
              {
                label: "了解远程访问 →",
                href: "/product/coding-mobile#cm-remote",
              },
            ],
          },
          {
            number: "问题 03",
            title: "私有化环境怎么用？",
            description: "私有化部署环境下远程访问不便，开发任务响应慢。",
            answer: "支持私有化环境远程接入，数据不出域、响应及时。",
            actions: [
              {
                label: "了解终端 UI →",
                href: "/product/coding-mobile#cm-tui",
              },
            ],
          },
        ],
      },
      {
        id: "cm-multi",
        eyebrow: "02｜多端接入",
        title: "多端接入：VS Code、命令行、终端统一入口",
        lead: "码多多客户端提供终端交互与多端接入能力，一个账号一套上下文，换端不换思路。",
        body: "开发场景不同，接入方式不同：编辑器里写业务代码、服务器上跑任务、远程机房看进度。码多多让这些环境共用一套能力与上下文。",
        cards: [
          {
            title: "编辑器深度集成",
            description: "VS Code 内直接使用，补全、生成、重构无缝衔接",
          },
          {
            title: "命令行轻量接入",
            description: "终端指令驱动，支持脚本化调用与 CI/CD 集成",
          },
          {
            title: "多端统一上下文",
            description: "切换接入方式，会话与上下文延续不中断",
          },
          {
            title: "按场景自由选择",
            description: "根据环境与习惯，选择最合适的接入方式",
          },
        ],
        demo: {
          title: "接入方式：按场景选择",
          messages: [
            "VS Code 编辑器",
            "日常编码场景",
            "命令行接口",
            "脚本与 CI/CD 场景",
            "终端 UI",
            "无图形环境场景",
            "远程接入",
            "私有化 / 异地场景",
          ],
        },
        note: "解决：开发环境单一、接入方式受限、换端上下文丢失。",
      },
      {
        id: "cm-tui",
        eyebrow: "03｜终端 UI",
        title: "终端 UI：无图形界面也能可视化操作",
        lead: "码多多提供可视化终端界面，在服务器等无图形环境中实现菜单交互、日志查看与进度跟踪。",
        body: "终端 UI 替代图形界面，让开发者在受限环境中也能可视化完成需求输入、方案确认与代码预览，操作过程清晰可见。",
        cards: [
          {
            title: "交互式菜单",
            description: "工具选择、配置项修改通过菜单完成",
          },
          {
            title: "实时日志展示",
            description: "任务运行日志实时呈现，过程可跟踪",
          },
          {
            title: "进度可视化",
            description: "代码生成进度可视化，状态一目了然",
          },
          {
            title: "错误信息高亮",
            description: "异常与提示醒目显示，问题快速定位",
          },
        ],
        demo: {
          title: "终端 UI 示意：菜单 / 日志 / 进度 / 错误高亮",
          messages: [
            "●",
            "●",
            "●",
            "码多多 · 终端",
            "[菜单] 选择工具：1) 文件编辑 2) 命令执行 3) 代码生成",
            "$ /generate 为数据同步任务增加断点续传",
            "▸ 生成中…… ██████████ 100%",
            "⚠ 提示：1 处依赖版本冲突，已建议处理",
            "✔ 生成完成，已写入当前项目",
          ],
        },
        note: "解决：无图形环境下操作不便、开发过程不可见。",
      },
      {
        id: "cm-remote",
        eyebrow: "04｜远程访问",
        title: "远程访问：私有化环境也能随时接入",
        lead: "支持私有化部署环境下的远程访问，工位、机房、远程环境都能查看方案与代码、确认执行。",
        body: "配合私有化部署，码多多支持远程接入开发服务：在本地工作站连接私有化环境中的码多多，随时查看开发任务与生成结果，数据不出域。",
        cards: [
          { title: "远程连接", description: "跨环境接入开发服务，连接稳定" },
          {
            title: "随时查看",
            description: "方案与代码远程可见，进度实时掌握",
          },
          { title: "确认执行", description: "远程确认开发任务，响应及时" },
          { title: "安全可控", description: "私有化环境远程接入，数据不出域" },
        ],
        demo: {
          title: "远程接入示意：本地工作站 ⇄ 私有化开发环境",
          messages: [
            "本地工作站",
            "查看 / 确认",
            "⇄",
            "私有化开发环境",
            "码多多 · 数据不出域",
          ],
        },
        note: "解决：私有化环境访问受限、异地响应慢、无法随时查看。",
      },
      {
        eyebrow: "05｜使用流程",
        title: "从选择接入到确认执行",
        lead: "接入方式灵活，操作路径清晰，开发任务随时响应。",
        cards: [
          {
            number: "STEP 01",
            title: "选择接入方式",
            description:
              "按环境与习惯选择 VS Code、命令行、终端 UI 或远程接入。",
            points: ["产出：", "接入通道就绪。"],
          },
          {
            number: "STEP 02",
            title: "建立连接",
            description: "连接开发服务并完成鉴权，进入统一上下文。",
            points: ["产出：", "会话上下文延续。"],
          },
          {
            number: "STEP 03",
            title: "查看任务与代码",
            description: "在终端或远程界面查看当前任务、方案与生成代码。",
            points: ["产出：", "开发进度可见。"],
          },
          {
            number: "STEP 04",
            title: "确认执行",
            description: "确认开发任务并执行，工具链在真实环境落地。",
            points: ["产出：", "任务执行完成。"],
          },
          {
            number: "STEP 05",
            title: "持续跟踪",
            description: "实时查看日志与结果，异常高亮提醒。",
            points: ["产出：", "过程可跟踪、结果可回溯。"],
          },
        ],
      },
    ],
    business: {
      eyebrow: "06｜业务场景",
      title: "开发环境不受限，开发任务不断线",
      lead: "多端接入、终端 UI、远程访问，让开发者在任何环境都能高效使用码多多。",
      points: [
        { title: "多端接入", description: "编辑器、命令行、终端统一入口" },
        { title: "终端 UI 可视化", description: "无图形环境顺畅操作" },
        { title: "远程随时接入", description: "私有化环境远程查看与确认" },
        { title: "统一上下文", description: "换端不换思路，上下文延续" },
      ],
      values: [
        { title: "环境自由", description: "多端多环境均可接入" },
        { title: "操作直观", description: "终端界面可视化、可跟踪" },
        { title: "响应及时", description: "远程接入，任务随时响应" },
      ],
      demo: {
        title: "远程终端 · 会话示例",
        messages: [
          { role: "user", text: "（远程）查看数据平台当前开发任务" },
          { role: "assistant", text: "正在连接私有化开发环境……" },
          {
            role: "assistant",
            text: "当前任务：开发实时指标看板；最近完成：数据同步断点续传。",
            cite: "远程环境 · 数据不出域",
          },
        ],
        footer: { placeholder: "输入指令或需求…", action: "发送" },
      },
      reason: ["多端接入", "终端 UI", "远程访问", "统一上下文"],
      workflowLabel: "接入工作流",
      workflow: ["选择接入", "建立连接", "查看任务", "确认执行"],
      outcomes: [
        { title: "环境自由", description: "多端多环境均可接入" },
        { title: "操作直观", description: "终端界面可视化、可跟踪" },
        { title: "响应及时", description: "远程接入，任务随时响应" },
      ],
      scenesLead: "覆盖无图形界面服务器、多地协作、私有化部署等开发接入场景。",
      scenes: [
        {
          title: "无图形界面服务器",
          description: "终端 UI 完成开发与跟踪。",
          actions: [
            { label: "了解模型部署方式 →", href: "/product/model-deploy" },
          ],
        },
        {
          title: "多地协作团队",
          description: "远程接入，随时查看与响应。",
          actions: [
            { label: "了解团队协作管理 →", href: "/product/governance" },
          ],
        },
        {
          title: "私有化部署环境",
          description: "数据不出域的远程开发。",
          actions: [
            {
              label: "查看私有化部署方案 →",
              href: "/solutions/private-yuanqi",
            },
          ],
        },
      ],
    },
    cta: {
      title: "让开发环境，不再限制你的效率",
      description: "申请体验码多多多端接入能力，或咨询企业级部署方案。",
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=移动接入咨询" },
        { label: "返回编程中心", href: "/product/coding" },
      ],
    },
  },
  {
    slug: "coding-standard",
    name: "编程规范",
    hero: {
      eyebrow: "编程中心｜编程规范",
      title: "让代码质量，有标准可依",
      lead: "码多多内置代码知识库与预设规则，对代码可读性、性能、安全与可维护性多维度校验，可适配企业编码规范，让团队标准一致、交付可预期。",
      tags: ["质量校验", "规范适配", "规则扩展"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=编程规范咨询" },
      ],
      visual: {
        title: "代码质量校验演示：多维度校验，问题分级标注",
        messages: [
          "代码质量校验结果",
          "1  def process(data):",
          '2      result = data.query("select * from orders")',
          "3      for i in range(len(result)):",
          "性能 · 避免逐行循环",
          "4          print(result[i])",
          "5      conn.close()",
          "安全 · 连接未使用上下文管理",
        ],
        note: "此处预留真实产品截图位置",
      },
    },
    sections: [
      {
        id: "cstd-position",
        eyebrow: "产品介绍",
        title: "让企业编码规范，内建到 AI 生成链路",
        lead: "码多多把企业代码规范与质量规则内建到 AI 编程过程，生成即校验，让合规成为默认。",
      },
      {
        eyebrow: "01｜三个核心问题",
        title: "代码质量保障的三个核心问题",
        lead: "代码质量不能只靠人盯，规范不落地，交付质量就难以保证。",
        cards: [
          {
            number: "问题 01",
            title: "编码风格怎么统一？",
            description: "团队编码风格因人而异，代码可读性与可维护性参差不齐。",
            answer: "内置质量校验，统一标准、多维检查。",
            actions: [
              {
                label: "了解代码质量校验 →",
                href: "/product/coding-standard#cstd-check",
              },
            ],
          },
          {
            number: "问题 02",
            title: "质量校验怎么不漏？",
            description:
              "性能、安全、可维护性问题依赖人工经验，容易遗漏且成本高。",
            answer: "四维自动校验，问题分级标注、建议直达。",
            actions: [
              {
                label: "了解企业规范适配 →",
                href: "/product/coding-standard#cstd-adapt",
              },
            ],
          },
          {
            number: "问题 03",
            title: "企业规范怎么落地？",
            description:
              "企业编码规范停留在文档里，生成代码时难以真正按规范执行。",
            answer: "企业规范适配，AI 按规范生成与校验代码。",
            actions: [
              {
                label: "了解规则与插件 →",
                href: "/product/coding-standard#cstd-ext",
              },
            ],
          },
        ],
      },
      {
        id: "cstd-check",
        eyebrow: "02｜代码质量校验",
        title: "代码质量校验：多维度自动检查",
        lead: "码多多内置代码知识库与预设规则，对代码质量进行多维度校验，并可视化标注问题等级与优化建议。",
        body: "生成代码即校验：可读性、性能、安全、可维护性逐项检查，问题分级标注，优化建议直接给出，开发者聚焦修正，而不是逐行排查。",
        cards: [
          { title: "可读性检查", description: "命名、结构与注释规范性检查" },
          {
            title: "性能优化建议",
            description: "识别低效循环、重复计算等性能点",
          },
          {
            title: "安全漏洞检测",
            description: "发现注入、越权、敏感信息等风险",
          },
          {
            title: "可维护性评估",
            description: "评估耦合度与扩展性，给出改进方向",
          },
        ],
        demo: {
          title: "校验结果示意：问题分级标注 + 优化建议",
          messages: [
            "校验报告",
            "可读性 · 通过",
            "正常",
            "性能 · 逐行循环",
            "建议优化",
            "安全 · 连接未关闭",
            "需修复",
          ],
        },
        note: "解决：质量靠人盯易遗漏、问题定位成本高。",
      },
      {
        id: "cstd-adapt",
        eyebrow: "03｜企业规范适配",
        title: "企业规范适配：团队标准真正落地",
        lead: "码多多可适配企业内部的编码规范，让团队风格统一，AI 生成的代码符合企业标准。",
        body: "结合私有化部署，码多多可实现融合功能定制：适配企业编码规范、集成企业专属工具，让 AI 从生成开始就符合团队标准，交付质量可预期。",
        cards: [
          { title: "编码规范适配", description: "企业规范内建，生成即合规" },
          { title: "团队风格统一", description: "命名、结构、注释按团队标准" },
          { title: "私有化定制", description: "结合私有化部署深度融合定制" },
          {
            title: "多团队差异化",
            description: "不同团队、项目按各自规范执行",
          },
        ],
        demo: {
          title: "规范适配示意：不同团队按各自规范生成与校验",
          messages: [
            "团队 A · 订单系统",
            "规范：企业规范 X",
            "生成代码按 X 校验",
            "团队 B · 数据平台",
            "规范：团队规范 Y",
            "生成代码按 Y 校验",
          ],
        },
        note: "解决：规范停留在文档里、生成代码不按规范。",
      },
      {
        id: "cstd-ext",
        eyebrow: "04｜规则与插件扩展",
        title: "规则与插件扩展：能力按需扩展",
        lead: "码多多采用插件化设计，可自定义规则、集成企业专属工具，快速适配多元开发场景。",
        body: "不同项目、不同语言、不同业务，需要不同的检查规则与工具。码多多通过插件化架构支持自定义规则与工具扩展，让质量检查贴合业务实际。",
        cards: [
          { title: "自定义规则", description: "按业务需求扩展检查规则" },
          {
            title: "插件化架构",
            description: "功能模块高内聚、低耦合，灵活扩展",
          },
          { title: "企业工具集成", description: "接入企业专属工具与能力" },
          {
            title: "多语言多框架",
            description: "适配多元语言与框架的检查需求",
          },
        ],
        demo: {
          title: "规则扩展示意：按项目添加自定义规则",
          messages: [
            "项目 A · 安全规则集",
            "已启用",
            "项目 B · 性能规则集",
            "可扩展",
            "＋ 添加自定义规则",
            "插件化",
          ],
        },
        note: "解决：规则固定不可扩展、工具集成困难。",
      },
      {
        eyebrow: "核心体验",
        title: "规范内建，代码天然合规",
        lead: "企业编码规范与检查规则内建到 AI 生成链路，生成即校验、问题直达、按规范修正，质量管控贯穿开发全程。",
        flow: ["配置企业规范与规则", "生成即自动校验", "问题直达 · 按规范修正"],
        visual: "编程规范真实产品截图：规范配置、校验报告与问题标注界面",
      },
    ],
    business: {
      eyebrow: "06｜业务场景",
      title: "让代码质量，真正管起来",
      lead: "校验内建、规范落地、规则可扩展，交付质量可预期。",
      points: [
        { title: "多维校验", description: "可读性、性能、安全、可维护性" },
        { title: "规范落地", description: "企业规范内建适配" },
        { title: "问题直达", description: "分级标注、建议直接给出" },
        { title: "规则扩展", description: "插件化，按需扩展" },
      ],
      values: [
        { title: "标准统一", description: "企业规范内建适配" },
        { title: "质量可控", description: "多维校验有据可依" },
        { title: "扩展灵活", description: "规则与插件按需扩展" },
      ],
      demo: {
        title: "码多多 · 质量校验",
        messages: [
          { role: "user", text: "检查刚生成的支付接口代码" },
          { role: "assistant", text: "正在按项目规范执行质量校验……" },
          {
            role: "assistant",
            text: "校验完成：发现 1 处安全风险（SQL 拼接）与 1 处性能建议，已给出修正代码。",
            cite: "规范：企业规范 X · 已复检通过",
          },
        ],
        footer: { placeholder: "输入代码或需求…", action: "发送" },
      },
      reason: ["规则内建", "多维校验", "规范适配", "持续沉淀"],
      workflowLabel: "质量工作流",
      workflow: ["设定规范", "生成校验", "标注建议", "修正交付"],
      outcomes: [
        { title: "标准统一", description: "企业规范内建适配" },
        { title: "质量可控", description: "多维校验有据可依" },
        { title: "扩展灵活", description: "规则与插件按需扩展" },
      ],
      scenesLead: "覆盖统一团队标准、性能安全高要求、多团队差异化规则等场景。",
      scenes: [
        {
          title: "统一团队编码标准",
          description: "企业规范落地，风格一致。",
          actions: [{ label: "了解码多多更多能力 →", href: "/product/coding" }],
        },
        {
          title: "性能与安全高要求",
          description: "多维校验，问题提前发现。",
          actions: [
            { label: "了解平台安全管控 →", href: "/product/governance" },
          ],
        },
        {
          title: "多团队差异化规则",
          description: "规则插件按需扩展，各配各的。",
          actions: [{ label: "了解模型与资源适配 →", href: "/product/model" }],
        },
      ],
    },
    cta: {
      title: "让代码质量，有标准可依",
      description: "申请体验码多多编程规范能力，或咨询企业级部署方案。",
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=编程规范咨询" },
        { label: "返回编程中心", href: "/product/coding" },
      ],
    },
  },
] as const satisfies readonly PlatformPage[];

export function getCodingSubpage(slug: string): PlatformPage | undefined {
  return codingSubpages.find((page) => page.slug === slug);
}
