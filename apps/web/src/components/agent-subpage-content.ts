import type { PlatformPage } from "./platform-page-types";

export const agentSubpageSlugs = [
  "agent-knowledge",
  "data-agent",
  "agent-video",
  "agent-orchestration",
] as const;

const agentSubpages = [
  {
    slug: "agent-knowledge",
    name: "企业知识助手",
    hero: {
      eyebrow: "智能体中心｜企业知识助手",
      title: "企业知识助手：把企业文档、制度、经验变成随时可问的智能库",
      lead: "员工像问人一样问 AI：报销标准、产品资料、技术文档随时可查，回答可溯源到企业原文，新员工更快上手、老员工不再重复解答。",
      tags: ["制度咨询", "产品资料查询", "技术文档问答", "员工助手"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=知识智能体咨询" },
      ],
      visual: {
        title: "知识智能体对话界面截图素材槽位",
      },
    },
    sections: [
      {
        id: "agent-knowledge-position",
        eyebrow: "01｜产品介绍",
        title: "企业知识是 AI 回答问题的「底气」",
        lead: "知识库建好了，员工怎么用？不是去后台检索，而是像问人一样问 AI。",
        body: "企业知识助手把企业文档、制度与经验转化为可检索、可问答的知识资产：员工用自然语言提问，助手检索企业知识并生成回答，回答可溯源到原文。制度咨询、产品资料查询、技术文档问答与员工自助，都能获得「有据可依」的答案，让企业知识真正被用起来。",
      },
      {
        id: "agent-knowledge-caps",
        eyebrow: "02｜能力优势",
        title: "智能问答、知识加工、知识库、知识图谱，一套能力覆盖知识全流程",
        lead: "从随问随答到内容加工，从知识沉淀到关联问答，围绕企业知识把能力串成一条线。",
        cards: [
          {
            tag: "智能问答",
            title: "随问随答，回答有据可查",
            description: "基于企业知识库检索并生成回答，标注引用来源。",
            actions: [
              {
                label: "查看智能问答 →",
                href: "/product/agent-knowledge#agent-k-qa",
              },
            ],
          },
          {
            tag: "知识加工",
            title: "原始资料变成可用内容",
            description: "整理、提取、归纳，输出结构化要点与摘要。",
            actions: [
              {
                label: "查看知识加工 →",
                href: "/product/agent-knowledge#agent-k-processing",
              },
            ],
          },
          {
            tag: "知识库 · 能力底座",
            title: "企业知识库",
            description: "文档解析、自动分片、图谱与 QA 补充，沉淀知识资产。",
            actions: [
              {
                label: "查看知识库 →",
                href: "/product/agent-knowledge#agent-k-kb",
              },
            ],
          },
          {
            tag: "知识图谱",
            title: "按知识关系回答「谁关联谁」",
            description: "沿图谱关系检索，回答跨知识的关联问题。",
            actions: [
              {
                label: "查看知识图谱 →",
                href: "/product/agent-knowledge#agent-k-graph",
              },
            ],
          },
        ],
      },
      {
        id: "agent-k-qa",
        eyebrow: "03｜第一环：智能问答",
        title: "智能问答：像问人一样问 AI",
        lead: "基于企业知识库检索专有知识并生成回答，回答可溯源，员工查制度、问产品、看资料不用再翻文档。",
        body: "员工的问题大多是「制度怎么说、产品是什么、资料在哪」，以前靠翻文档、问同事。知识问答智能体把企业知识库与模型能力组合起来：员工用自然语言提问，智能体检索相关知识并生成回答，回答会标注参考依据，点击可查看原文，随问随答、有据可查。",
        demo: {
          title: "使用示例",
          messages: [
            { role: "user", text: "请假三天需要什么流程？" },
            {
              role: "assistant",
              text: "根据《考勤管理制度》，3 天以内请假由部门负责人审批即可。",
            },
            {
              role: "assistant",
              text: "参考依据：《考勤管理制度》第 5 条",
            },
          ],
        },
        cards: [
          {
            title: "自然语言提问",
            description: "不用学检索语法，像问同事一样提问即可",
          },
          {
            title: "回答可溯源",
            description: "标注引用来源，点击查看原文",
          },
          {
            title: "在线验证即用",
            description: "关联知识库即可问答，验证后发布使用",
          },
          {
            title: "用在哪里",
            points: [
              "企业制度与政策问答",
              "产品与解决方案资料问答",
              "技术文档与技术问题查询",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "查询更快：减少人工查找文档时间",
              "回答更稳：基于企业知识，不易跑偏",
              "结果可查：回答附带引用依据",
            ],
          },
        ],
        flow: [
          "选择模型 · 关联企业知识库",
          "在线问答验证效果",
          "发布给员工使用",
        ],
      },
      {
        id: "agent-k-processing",
        eyebrow: "04｜第一环：知识加工",
        title: "知识加工：把原始资料整理成可用内容",
        lead: "面向知识内容的整理、提取、归纳与加工，让原始资料变成智能体可稳定使用的内容。",
        body: "文档、会议纪要、长方案，人工整理耗时，且口径不稳定。知识加工智能体面向知识内容的整理、提取、归纳与标准化输出：给它原始内容，它输出结构化的要点、摘要或标准格式。加工结果既可以直接使用，也可以回填到知识体系，让企业知识从「原始」走向「可用」。",
        demo: {
          title: "使用示例",
          messages: [
            "把这份技术方案整理成 3 条要点",
            "已整理：1. 方案采用知识增强架构；2. 支持私有化部署；3. 与元启平台无缝集成……",
          ],
        },
        cards: [
          {
            title: "内容整理",
            description: "长文档、会议纪要自动整理为要点",
          },
          {
            title: "信息提取",
            description: "关键信息与字段标准化输出",
          },
          {
            title: "归纳摘要",
            description: "长文归纳为摘要，快速把握核心",
          },
          {
            title: "用在哪里",
            points: ["合同要点提取", "会议纪要整理", "长文摘要与规范提炼"],
          },
          {
            title: "能获得什么价值",
            points: [
              "效率提升：人工整理变为智能加工",
              "口径稳定：输出格式与标准统一",
              "知识增值：原始资料变成可用资产",
            ],
          },
        ],
      },
      {
        id: "agent-k-kb",
        eyebrow: "05｜第一环：知识库",
        title: "企业知识库：让企业文档变成 AI 能用的知识",
        lead: "把制度、产品资料、技术文档等企业知识上传、解析、分片，沉淀为可检索、可问答、可溯源的 AI 知识底座。",
        cards: [
          {
            title: "文档接入与解析",
            description:
              "支持 Word、PDF、Excel、文本等常用格式，上传后自动解析分片并向量化，OCR 识别扫描件。",
          },
          {
            title: "图谱与 QA 补充",
            description:
              "知识图谱梳理知识关联，QA 自动生成与人工补充，知识越用越准。",
          },
          {
            title: "检索测试与目录管理",
            description: "测试知识召回效果，通过目录管理知识资产。",
          },
          {
            title: "支撑智能体问答",
            description:
              "智能体关联知识库后，回答自动召回相关分片并溯源到原文。",
          },
        ],
        actions: [
          {
            label: "查看企业知识库（能力底座）→",
            href: "/product/knowledge",
          },
        ],
      },
      {
        id: "agent-k-graph",
        eyebrow: "06｜第一环：知识图谱",
        title: "知识图谱：按知识关系回答「谁关联谁」",
        lead: "基于企业知识图谱回答跨知识的关联问题，支撑需要结构化知识关系的业务场景。",
        body: "单条知识回答不了「谁关联谁」的问题，比如哪些产品适用某场景、某制度覆盖哪些流程。知识图谱智能体基于企业知识图谱回答这类关联问题：图谱把知识资产组织成有关系的网络，智能体沿着关系检索并生成回答。它让知识问答从「单条知识」走向「关联知识」，支撑产品选型、制度梳理等场景。",
        demo: {
          title: "使用示例",
          messages: [
            "哪些产品适用于政务场景？",
            "适用于政务场景的产品包括：知识问答平台、文档审核助手……（基于知识图谱关联关系）",
          ],
        },
        cards: [
          {
            title: "关联知识问答",
            description: "按知识关系回答「谁关联谁」",
          },
          {
            title: "图谱资产衔接",
            description: "回答有图谱依据、可追溯",
          },
          {
            title: "选型与梳理",
            description: "支撑产品选型、制度流程梳理",
          },
          {
            title: "用在哪里",
            points: ["制度流程梳理", "产品选型关联", "跨知识关联问答"],
          },
          {
            title: "能获得什么价值",
            points: [
              "回答更深入：能回答跨知识的关联问题",
              "决策更清晰：选型与梳理有图谱依据",
              "知识价值放大：关系让知识更有价值",
            ],
          },
        ],
      },
    ],
    business: {
      eyebrow: "07｜业务场景",
      title: "把企业文档、制度、经验变成随时可问的智能库",
      lead: "智能问答、知识加工、知识库、知识图谱四类能力，让企业知识可问、可加工、可关联。",
      points: [
        { title: "智能问答", description: "制度、资料随问随答" },
        { title: "知识加工", description: "文档整理为可用内容" },
        { title: "知识图谱", description: "按关系回答关联问题" },
        { title: "回答可溯源", description: "引用来源可查原文" },
      ],
      values: [
        { title: "回答有依据", description: "结果可溯源到企业知识" },
        { title: "知识被用起来", description: "员工像问人一样问 AI" },
        { title: "沉淀更聪明", description: "使用中不断发现知识缺口" },
      ],
      demo: {
        title: "企业知识助手",
        messages: [
          { role: "user", text: "报销标准是什么？" },
          { role: "assistant", text: "正在检索企业知识……" },
          {
            role: "assistant",
            text: "根据《费用报销管理制度》，差旅住宿标准为……",
            cite: "引用：《费用报销管理制度》",
          },
          { role: "user", text: "怎么申请？" },
          {
            role: "assistant",
            text: "在 OA 提交报销申请，附发票与行程单，由部门负责人审批。",
            cite: "引用：报销流程说明",
          },
        ],
        footer: { placeholder: "请输入你的问题…", action: "发送" },
      },
      reason: ["企业知识库", "检索增强", "模型生成", "引用溯源"],
      workflowLabel: "工作流程",
      workflow: ["用户提问", "检索知识", "生成回答", "展示依据"],
      outcomes: [
        { title: "回答有依据", description: "结果可溯源到企业知识" },
        { title: "知识被用起来", description: "员工像问人一样问 AI" },
        { title: "沉淀更聪明", description: "使用中不断发现知识缺口" },
      ],
      scenesLead: "覆盖制度问答、文档整理、知识关联等需求。",
      scenes: [
        {
          title: "制度与产品问答",
          description: "制度、政策随问随答",
          actions: [
            {
              label: "查看知识服务方案 →",
              href: "/solutions/knowledge-service",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "文档整理提取",
          description: "文档内容整理与信息提取",
          actions: [
            {
              label: "查看文档理解方案 →",
              href: "/solutions/knowledge-service",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "知识关联问答",
          description: "按关系回答关联问题",
          actions: [
            {
              label: "查看知识服务方案 →",
              href: "/solutions/knowledge-service",
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
    slug: "data-agent",
    name: "智能问数助手",
    hero: {
      eyebrow: "智能体中心｜智能问数助手",
      title: "智能问数助手：不用写 SQL，问一句就能拿到数据答案",
      lead: "「查询去年销售额最高的区域」——问题直接变成数据答案。业务人员不用写 SQL、不用等报表，在权限范围内随问随答，让数据真正支撑经营决策。",
      tags: ["自然语言问数", "指标口径统一", "权限可控"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=数据智能体咨询" },
      ],
      visual: {
        title: "数据智能体问数界面截图素材槽位",
      },
    },
    sections: [
      {
        id: "agent-data-position",
        eyebrow: "01｜产品介绍",
        title: "让业务人员也能自己查数",
        lead: "业务人员想查数，往往要排队等数据团队取数、写 SQL、出报表。",
        body: "数据智能体把自然语言问题转换为数据查询，直接返回业务数据结果：业务人员用日常语言提问，智能体理解问题、生成查询、返回结果。数据权限范围内随问随答，分析不再依赖「等报表」，让数据真正支撑经营决策。",
        demo: {
          title: "使用示例",
          messages: [
            "本月各区域退货率是多少？",
            "本月各区域退货率：华东 1.8%、华北 2.3%、华南 1.5%……",
          ],
        },
      },
      {
        id: "agent-data-caps",
        eyebrow: "02｜能力优势",
        title: "智能问数、指标开发、数据接入，让数据随问随答",
        lead: "业务人员不用写 SQL、不用等报表，在权限范围内随问随答；指标与数据接入由能力底座统一支撑。",
        cards: [
          {
            tag: "智能问数",
            title: "不用写 SQL，问一句就能拿到答案",
            description:
              "用日常语言提问，问题自动转换为数据查询，返回表格或图表结果，指标口径统一、结果可信。",
            actions: [
              {
                label: "查看智能问数 →",
                href: "/product/data-agent#agent-data-qa",
              },
            ],
          },
          {
            tag: "指标开发 · 能力底座",
            title: "统一指标口径",
            description:
              "定义业务指标与计算口径，沉淀统一的指标资产，支撑问数与经营分析，口径统一、结果可信。",
            actions: [
              {
                label: "查看指标开发 →",
                href: "/product/data-agent#agent-data-metric",
              },
            ],
          },
          {
            tag: "数据接入 · 能力底座",
            title: "企业数据源接入",
            description:
              "直连企业数据源与表多多数据源，同步原始数据，为问数提供看得懂、查得准的数据底座。",
            actions: [
              {
                label: "查看数据接入 →",
                href: "/product/data-agent#agent-data-source",
              },
            ],
          },
        ],
      },
      {
        id: "agent-data-qa",
        eyebrow: "03｜第一环：智能问数",
        title: "智能问数：不用写 SQL，问一句就能拿到答案",
        lead: "业务人员想查数据，不再等提数排期、不用写查询语句，像聊天一样获得数据洞察。",
        body: "「查询去年销售额最高的区域」——问题直接变成数据答案。智能问数把自然语言问题自动转换为数据查询，返回表格或图表结果；指标口径统一、数据权限可控，业务人员随问随答，让数据真正支撑经营决策。",
        cards: [
          {
            title: "自然语言问数",
            description: "用日常语言提问，无需 SQL 与取数技能",
          },
          {
            title: "查询自动生成",
            description: "问题自动转换为数据查询，返回结果",
          },
          {
            title: "结果清晰呈现",
            description: "表格或图表返回，一看就懂",
          },
          {
            title: "权限可控",
            description: "按数据权限范围查询，合规可控",
          },
          {
            title: "用在哪里",
            points: [
              "经营数据随问随答",
              "销售、财务等指标查询",
              "业务自助取数与洞察",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "查数不排队：不依赖提数排期",
              "口径统一：指标一致、结果可信",
              "决策更及时：从等报表到实时问数",
            ],
          },
        ],
        visual: "智能问数对话与分析结果界面截图素材槽位",
      },
      {
        id: "agent-data-metric",
        eyebrow: "04｜第一环：指标开发",
        title: "指标开发：统一口径，问数有据",
        lead: "定义业务指标与计算口径，沉淀统一的指标资产，支撑问数与经营分析，让不同部门对同一指标的理解一致。",
        cards: [
          {
            title: "指标口径定义",
            description: "明确业务指标与计算口径，固化统一标准。",
          },
          {
            title: "指标资产沉淀",
            description: "统一沉淀指标资产，跨部门复用、口径一致。",
          },
          {
            title: "支撑问数分析",
            description: "数据智能体基于指标回答，结果可信、可解释。",
          },
          {
            title: "数据查询可控",
            description: "配合数据权限，查询范围与结果合规。",
          },
        ],
        actions: [
          {
            label: "查看数据源与指标（能力底座）→",
            href: "/product/knowledge-metrics",
          },
        ],
      },
      {
        id: "agent-data-source",
        eyebrow: "05｜第一环：数据接入",
        title: "数据接入：数据源统一接入，数据随查随用",
        lead: "接入企业数据源、同步原始数据，为智能问数提供「看得懂、查得准」的数据底座。",
        cards: [
          {
            title: "数据源接入",
            description:
              "支持数据库、表格、文件等多种数据源接入，统一纳管企业数据资产。",
          },
          {
            title: "数据同步",
            description:
              "通过抽取任务将数据同步到平台，任务状态可监控、数据及时可用。",
          },
        ],
        actions: [
          {
            label: "查看数据源与指标（能力底座）→",
            href: "/product/knowledge-metrics",
          },
        ],
      },
    ],
    business: {
      eyebrow: "06｜业务场景",
      title: "不用写 SQL，一句话拿到数据答案",
      lead: "业务人员用日常语言问数，AI 理解指标、查询数据、返回结果，口径统一、权限可控。",
      points: [
        { title: "自然语言问数", description: "问题直接变成数据答案" },
        { title: "指标自动理解", description: "识别指标与维度" },
        { title: "查询自动生成", description: "无需编写查询语句" },
        { title: "结果清晰呈现", description: "数据以卡片/图表返回" },
      ],
      values: [
        { title: "查数不排队", description: "业务人员随问随答" },
        { title: "分析更及时", description: "从等报表到实时问数" },
        { title: "权限更清晰", description: "数据查询合规可控" },
      ],
      demo: {
        title: "智能问数助手",
        messages: [
          { role: "user", text: "查询去年销售额最高的区域" },
          { role: "assistant", text: "正在理解指标并查询数据……" },
          {
            role: "assistant",
            text: "华东区｜约 1.28 亿元｜同比增长 12%",
          },
        ],
        footer: { placeholder: "请输入你的问题…", action: "发送" },
        note: "数据来源：销售数据库",
      },
      reason: ["指标理解", "数据查询", "结果生成", "权限校验"],
      workflowLabel: "工作流程",
      workflow: ["用户提问", "理解指标", "查询数据", "返回结果"],
      outcomes: [
        { title: "查数不排队", description: "业务人员随问随答" },
        { title: "分析更及时", description: "从等报表到实时问数" },
        { title: "权限更清晰", description: "数据查询合规可控" },
      ],
      scenesLead: "覆盖经营数据查询、指标分析、管理层按需问数等需求。",
      scenes: [
        {
          title: "经营数据查询",
          description: "日常经营指标随问随答",
          actions: [
            {
              label: "查看数据问答方案 →",
              href: "/solutions/finance-data",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "指标异常洞察",
          description: "异常指标及时定位",
          actions: [
            {
              label: "查看数据问答方案 →",
              href: "/solutions/finance-data",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "管理层按需问数",
          description: "不用等报表直接问数据",
          actions: [
            {
              label: "查看数据问答方案 →",
              href: "/solutions/finance-data",
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
    slug: "agent-video",
    name: "视频理解与智能视觉助手",
    hero: {
      eyebrow: "智能体中心｜视频理解与智能视觉助手",
      title: "视频理解与智能视觉助手：让视频从「被观看」变成「可理解」",
      lead: "监控与视频资料成堆，靠人盯不过来、靠人翻查不到。视频助手让 AI 看懂画面：按自然语言检索历史视频，实时分析在线画面并预警异常。",
      tags: ["安防巡检", "视频搜索", "实时监控", "异常检测"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=视频智能体咨询" },
      ],
      visual: {
        title: "视频检索应用界面截图素材槽位",
      },
    },
    sections: [
      {
        id: "agent-video-position",
        eyebrow: "01｜产品介绍",
        title: "解决「视频不好查、内容靠人盯」的问题",
        lead: "监控视频成堆，找人盯不过来；想从视频里查某个事件，只能一帧帧翻。",
        body: "视频智能体把视频内容变成可检索、可分析的能力：上传离线视频或接入在线设备，用对话输入查询，智能体分析画面并返回预警图片与解析结果。安防、生产、仓储等场景都能用自然语言从视频里找到答案。",
        visual: "视频检索与预警返回示意图素材槽位",
      },
      {
        id: "agent-video-caps",
        eyebrow: "02｜能力优势",
        title: "即时检索、实时布控、设备接入，让视频可理解、可预警",
        lead: "监控与视频资料成堆，靠人盯不过来。视频助手让 AI 看懂画面：按需检索、实时预警、设备统一接入。",
        cards: [
          {
            tag: "即时检索",
            title: "离线 / 在线视频检索",
            description:
              "上传本地视频或接入在线设备，用自然语言检索画面，返回预警图片与解析信息。",
            actions: [
              {
                label: "查看即时检索 →",
                href: "/product/agent-video#agent-video-search",
              },
            ],
          },
          {
            tag: "实时布控",
            title: "实时分析，异常即预警",
            description:
              "对在线画面实时分析，命中预设目标即返回预警，支持持续布控与处置。",
            actions: [
              {
                label: "查看实时布控 →",
                href: "/product/agent-video#agent-video-monitor",
              },
            ],
          },
          {
            tag: "设备接入",
            title: "摄像头设备统一接入",
            description:
              "在线摄像头设备接入与管理，按需选择设备进行实时分析与布控。",
            actions: [
              {
                label: "查看设备接入 →",
                href: "/product/agent-video#agent-video-device",
              },
            ],
          },
        ],
      },
      {
        id: "agent-video-search",
        eyebrow: "03｜第一环：即时检索",
        title: "即时检索：离线上传可查，在线实时可搜",
        lead: "上传本地视频或接入在线设备，用自然语言检索画面，返回预警图片与解析信息，让视频资料与实时画面都可查。",
        cards: [
          {
            tag: "离线视频检索",
            title: "上传视频即可查",
            description:
              "上传本地视频或图片，设置采样间隔后输入查询内容，返回预警图片与解析流水，适合已有视频资料的复盘分析，把「翻视频」变成「问视频」。",
            visual: "离线视频检索应用界面截图素材槽位",
          },
          {
            tag: "在线视频检索",
            title: "实时分析设备画面",
            description:
              "接入在线摄像头设备，实时分析画面，输入查询内容返回预警信息，把「人盯屏」变成「AI 看屏、人看结果」，异常实时发现。",
            visual: "在线视频检索应用界面截图素材槽位",
          },
          {
            title: "用在哪里",
            points: [
              "安全事故复盘与责任回溯",
              "园区、厂区实时安全预警",
              "危险区域闯入监测与值守",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "查找提速：从翻视频到问视频",
              "预警及时：异常实时发现、及时处置",
              "证据可溯：预警与解析流水完整",
            ],
          },
        ],
        flow: [
          "接入视频来源（离线上传 / 在线设备）",
          "输入查询内容",
          "返回预警与解析",
          "查看详情与处置",
        ],
      },
      {
        id: "agent-video-monitor",
        eyebrow: "04｜第一环：实时布控",
        title: "实时布控：异常即预警，持续盯防",
        lead: "对在线画面实时分析，命中预设目标即返回预警，让安全防控从「事后查」走向「实时防」。",
        cards: [
          {
            title: "实时内容分析",
            description: "对在线画面持续分析，识别预设异常目标与行为。",
          },
          {
            title: "即时预警返回",
            description: "命中目标立即返回预警图片与时间点，第一时间响应。",
          },
          {
            title: "持续布控任务",
            description: "布控任务持续运行，异常实时推送、不间断盯防。",
          },
          {
            title: "处置记录闭环",
            description: "预警详情、解析流水与处置记录完整留存。",
          },
        ],
      },
      {
        id: "agent-video-device",
        eyebrow: "05｜第一环：设备接入",
        title: "设备接入：摄像头统一接入，按需选用",
        lead: "在线摄像头设备统一接入与管理，按需选择设备进行实时分析与布控，让现有监控资源被 AI 用起来。",
        cards: [
          {
            title: "设备统一接入",
            description: "在线摄像头设备统一接入平台，集中管理、状态可见。",
          },
          {
            title: "按需选择设备",
            description: "检索与布控时按需选择设备，默认可覆盖全部已接入设备。",
          },
        ],
      },
    ],
    business: {
      eyebrow: "06｜业务场景",
      title: "让视频可理解、可检索、可预警",
      lead: "AI 看懂监控与视频画面，按需检索历史、实时分析预警，不用逐帧翻、不用人盯屏。",
      points: [
        { title: "视频内容理解", description: "自动识别画面与事件" },
        { title: "自然语言检索", description: "一句话找到视频内容" },
        { title: "实时分析预警", description: "异常事件早发现" },
        { title: "预警可回溯", description: "时间点与画面可查" },
      ],
      values: [
        { title: "检索高效", description: "对话式找视频，不用逐帧翻" },
        { title: "预警及时", description: "在线视频实时分析，异常早发现" },
        { title: "人力解放", description: "从人盯屏到 AI 检索分析" },
      ],
      demo: {
        title: "视频理解助手",
        messages: [
          { role: "user", text: "昨晚厂区南门 21 点到 22 点有无异常？" },
          { role: "assistant", text: "正在检索视频内容……" },
          {
            role: "assistant",
            text: "检测到 21:35 南门出现人员停留，已返回预警画面与时间点。",
            cite: "预警：21:35 · 厂区南门",
          },
          { role: "user", text: "还有其它时间段异常吗？" },
          {
            role: "assistant",
            text: "22:00 前无其它异常事件，已复核完毕。",
            cite: "检索范围：21:00–22:00",
          },
        ],
        footer: { placeholder: "请输入你的问题…", action: "发送" },
      },
      reason: ["视频解析", "内容理解", "语义检索", "预警返回"],
      workflowLabel: "工作流程",
      workflow: ["用户提问", "视频理解", "语义检索", "返回预警"],
      outcomes: [
        { title: "检索高效", description: "对话式找视频，不用逐帧翻" },
        { title: "预警及时", description: "在线视频实时分析，异常早发现" },
        { title: "人力解放", description: "从人盯屏到 AI 检索分析" },
      ],
      scenesLead: "覆盖安防监控、园区预警、视频资料检索等场景。",
      scenes: [
        {
          title: "安防监控回溯",
          description: "历史事件快速定位",
          actions: [
            {
              label: "查看视频检索方案 →",
              href: "/solutions/video-intelligence",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "园区实时预警",
          description: "重点区域异常告警",
          actions: [
            {
              label: "查看视频检索方案 →",
              href: "/solutions/video-intelligence",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "视频资料检索",
          description: "存量视频可搜索",
          actions: [
            {
              label: "查看视频检索方案 →",
              href: "/solutions/video-intelligence",
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
    slug: "agent-orchestration",
    name: "企业复杂任务自动化引擎",
    hero: {
      eyebrow: "智能体中心｜企业复杂任务自动化引擎",
      title: "企业复杂任务自动化引擎：把多步骤业务变成一条自动流程",
      lead: "合同审批、工单处理、多系统协同……这些多步骤、跨系统的复杂业务，过去靠人一步步协调。自动化引擎把它们编排成可执行、可复用的自动流程。",
      tags: ["多模型调用", "工具调用", "节点编排", "多智能体协作"],
      actions: [
        { label: "申请体验", href: "/trial", variant: "primary" },
        { label: "商务咨询", href: "/contact?topic=编排智能体咨询" },
      ],
      visual: {
        title: "流程编排画布截图素材槽位",
      },
    },
    sections: [
      {
        id: "agent-orchestration-position",
        eyebrow: "01｜产品介绍",
        title: "解决「单步 AI 做不了复杂任务」的问题",
        lead: "很多业务不是「问一句答一句」，而是多步骤的流程：提取、核对、判断、生成、通知。",
        body: "流程编排智能体通过可视化流程编排，把模型、知识、数据、工具与业务逻辑组合成一条可执行的流程。按构建方式与流程形态，主要分为三种工作流：文生工作流用一句话生成流程，会话工作流以对话方式推进业务，流程工作流按固定步骤执行任务。流程编排让复杂业务任务自动化、可复用。",
        cards: [
          {
            title: "示例：合同审批自动化",
            description:
              "多模型、工具调用与节点编排组合执行，完成后自动通知相关人，全程可追踪。",
            flow: [
              "上传合同",
              "AI 识别条款",
              "风险分析",
              "生成审查报告",
              "通知负责人",
            ],
          },
        ],
        visual: "流程编排节点与连线示意图素材槽位",
      },
      {
        id: "agent-orchestration-caps",
        eyebrow: "02｜能力优势",
        title: "文生、会话、流程三种工作流，覆盖不同复杂度场景",
        lead: "从说需求到固定流程，按需选择，覆盖不同复杂度场景。",
        cards: [
          {
            tag: "工作流类型",
            title: "文生工作流",
            description:
              "用自然语言描述需求，大模型直接生成初始工作流，门槛最低、上手最快。",
            actions: [
              {
                label: "查看文生工作流 →",
                href: "/product/agent-orchestration#agent-orch-ai",
              },
            ],
          },
          {
            tag: "工作流类型",
            title: "会话工作流",
            description:
              "面向对话式交互的流程形态，边聊边办，适合多轮确认与引导式业务办理。",
            actions: [
              {
                label: "查看会话工作流 →",
                href: "/product/agent-orchestration#agent-orch-chatflow",
              },
            ],
          },
          {
            tag: "工作流类型",
            title: "流程工作流",
            description:
              "面向任务执行与业务处理的流程形态，固定步骤、确定性输出，适合批量与规则化场景。",
            actions: [
              {
                label: "查看流程工作流 →",
                href: "/product/agent-orchestration#agent-orch-workflow",
              },
            ],
          },
        ],
      },
      {
        id: "agent-orch-ai",
        eyebrow: "03｜第一环：文生工作流",
        title: "文生工作流：说需求，出流程",
        lead: "用自然语言描述场景需求，由大模型生成初始流程，降低流程编排门槛。",
        body: "不会画流程图、不清楚节点怎么配，是很多人用流程编排的障碍。AI 创建流程编排让你用日常语言描述场景需求，大模型自动生成初始流程，再在画布中人工调整优化。它把流程编排的门槛降到「会说需求就行」，适合业务人员快速上手。",
        cards: [
          {
            title: "自然语言建流程",
            description: "描述需求即可生成初始流程",
          },
          {
            title: "初始流程生成",
            description: "大模型理解需求并推荐节点与顺序",
          },
          {
            title: "画布调整优化",
            description: "生成结果进入画布，按需调整节点",
          },
          {
            title: "调试发布",
            description: "调试运行后保存发布",
          },
          {
            title: "用在哪里",
            points: [
              "业务自助搭建流程",
              "快速原型验证",
              "不会画图的团队用自然语言替代",
            ],
          },
          {
            title: "能获得什么价值",
            points: [
              "门槛低：说需求就能建流程",
              "上手快：几分钟生成初始流程",
              "可优化：生成后再精细调整",
            ],
          },
        ],
        visual: "AI 创建流程编排界面截图素材槽位",
      },
      {
        id: "agent-orch-chatflow",
        eyebrow: "04｜第一环：会话工作流",
        title: "会话工作流：边聊边办，对话中完成任务",
        lead: "把流程编排成对话式交互，用户像聊天一样完成复杂任务，适合多轮对话与实时响应的场景。",
        body: "有些业务流程适合对话式完成：一步步确认信息，边聊边办。会话工作流是流程编排智能体的对话式流程形态：用户在对话中完成信息收集、条件确认与任务执行，流程在后台按步骤推进。适合工单办理、申请审批、引导式问答等需要多轮交互的场景。",
        cards: [
          {
            title: "多轮对话引导",
            description: "按流程逐步收集信息，对话中完成任务",
          },
          {
            title: "实时响应执行",
            description: "边聊边执行，结果即时返回",
          },
          {
            title: "模型灵活切换",
            description: "支持多种模型调用与切换",
          },
          {
            title: "对话日志可查",
            description: "对话与执行过程可追溯",
          },
          {
            title: "用在哪里",
            points: ["工单办理", "申请审批", "引导式业务问答"],
          },
          {
            title: "能获得什么价值",
            points: [
              "体验顺畅：像聊天一样办业务",
              "流程清晰：对话引导不遗漏信息",
              "过程可溯：对话与执行有记录",
            ],
          },
        ],
        visual: "Chatflow 对话界面截图素材槽位",
      },
      {
        id: "agent-orch-workflow",
        eyebrow: "05｜第一环：流程工作流",
        title: "流程工作流：固定步骤，确定性输出",
        lead: "把业务流程编排成确定性的任务执行，适合固定步骤、明确输出的业务场景。",
        body: "有些业务不需要对话，只需要按固定步骤跑完并输出结果。流程工作流是流程编排智能体的任务式流程形态：按固定步骤编排节点，流程执行后输出确定性的业务结果。适合文档批量处理、数据定时处理、规则化审核等场景，流程稳定、结果可控。",
        cards: [
          {
            title: "固定步骤编排",
            description: "按业务流程固定编排节点",
          },
          {
            title: "确定性结果输出",
            description: "输出稳定、可预期的业务结果",
          },
          {
            title: "批量任务处理",
            description: "适合文档、数据等批量场景",
          },
          {
            title: "执行可控可查",
            description: "执行过程与结果可回溯",
          },
          {
            title: "用在哪里",
            points: ["文档批量处理", "数据定时汇总", "规则化业务流程"],
          },
          {
            title: "能获得什么价值",
            points: [
              "流程稳定：固定步骤、结果可控",
              "效率提升：批量任务自动执行",
              "过程可溯：执行有记录可回溯",
            ],
          },
        ],
        visual: "Workflow 流程画布截图素材槽位",
      },
    ],
    business: {
      eyebrow: "06｜业务场景",
      title: "复杂业务自动执行，多智能体协同",
      lead: "把多步骤、跨系统的复杂业务编排成自动流程，多模型与工具协作，一键执行。",
      points: [
        { title: "多模型调用", description: "按步骤调用合适模型" },
        { title: "工具调用", description: "对接系统与工具" },
        { title: "节点编排", description: "可视化编排流程" },
        { title: "多智能体协作", description: "多助手协同完成" },
      ],
      values: [
        { title: "复杂任务自动化", description: "多步流程一键执行" },
        { title: "开发门槛低", description: "拖拽或一句话建流程" },
        { title: "可复用可扩展", description: "流程沉淀为业务资产" },
      ],
      demo: {
        title: "企业自动化引擎",
        messages: [
          "上传合同｜AI 识别条款",
          "风险分析｜生成报告",
          "通知负责人｜全程可追踪",
          "执行完成 ✓",
        ],
        note: "多模型 + 工具调用 + 节点编排 → 一键执行",
      },
      reason: ["多模型", "工具调用", "节点编排", "协同执行"],
      workflowLabel: "工作流程",
      workflow: ["任务触发", "编排执行", "工具调用", "结果交付"],
      outcomes: [
        { title: "复杂任务自动化", description: "多步流程一键执行" },
        { title: "开发门槛低", description: "拖拽或一句话建流程" },
        { title: "可复用可扩展", description: "流程沉淀为业务资产" },
      ],
      scenesLead: "覆盖合同审批、工单处理、跨系统协同等复杂业务。",
      scenes: [
        {
          title: "合同审批自动化",
          description: "识别、分析、生成报告、通知",
          actions: [
            {
              label: "查看流程自动化方案 →",
              href: "/solutions/process-automation",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "多智能体协同",
          description: "多助手协作完成复杂任务",
          actions: [
            {
              label: "查看多智能体方案 →",
              href: "/solutions/enterprise-multi-agent",
            },
            {
              label: "查看实践案例 →",
              href: "/solutions?view=cases&mode=all#practice-cases-hero",
            },
          ],
        },
        {
          title: "跨系统业务协同",
          description: "对接外部系统自动流转",
          actions: [
            {
              label: "查看流程自动化方案 →",
              href: "/solutions/process-automation",
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
] as const satisfies readonly PlatformPage[];

export function getAgentSubpage(slug: string): PlatformPage | undefined {
  return agentSubpages.find((page) => page.slug === slug);
}
