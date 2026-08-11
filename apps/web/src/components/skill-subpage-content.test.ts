import { describe, expect, it } from "vitest";

import { getSkillSubpage, skillSubpageSlugs } from "./skill-subpage-content";

describe("prototype skill subpage content contract", () => {
  it("registers exactly the three skill subpages in source order", () => {
    expect(skillSubpageSlugs).toStrictEqual([
      "skills-programming",
      "skills-application",
      "skills-office",
    ]);
    expect(getSkillSubpage("unknown")).toBeUndefined();
  });

  it("locks the complete programming skill page", () => {
    expect(getSkillSubpage("skills-programming")).toStrictEqual({
      slug: "skills-programming",
      name: "编程类技能",
      hero: {
        eyebrow: "技能中心｜编程类技能",
        title: "编程类技能：让研发与工程更省心",
        lead: "覆盖模型评测、工作流生成与 AI 系统知识，服务研发与工程团队。",
        tags: ["模型评测", "工作流生成", "系统知识"],
        actions: [
          {
            label: "申请体验",
            href: "/trial",
            variant: "primary",
          },
          {
            label: "商务咨询",
            href: "/contact?topic=编程类技能咨询",
          },
        ],
        visual: {
          title: "技能列表界面截图素材槽位",
        },
      },
      sections: [
        {
          id: "skills-programming-position",
          eyebrow: "01｜它是什么",
          title: "把研发与工程能力，封装成随取随用的技能",
          lead: "编程类技能面向研发与工程团队，把模型评测、工作流生成、AI 系统知识等专业能力封装为可对话调用的技能——选型有据、搭建提速、知识成体系。",
        },
        {
          id: "skills-programming-caps",
          eyebrow: "02｜能力优势",
          title: "三类技能，解决研发与工程的高频问题",
          lead: "从「选对模型」到「搭好流程」再到「问透系统」，每个技能都对应一类具体场景。",
        },
        {
          id: "sk-eval",
          eyebrow: "编程类 · 评测",
          title: "LLM 工具调用评测",
          lead: "选模型不再凭感觉——用数据说话。",
          body: "这个技能把大模型在智能体场景下的工具调用能力量化评测，帮你选出真正能落地的模型，而不是靠口碑和宣传。",
          cards: [
            {
              title: "选型有据",
              description: "69 个真实场景量化评分，结果一目了然",
            },
            {
              title: "一次跑完",
              description: "多个候选模型批量测试，对比成本大幅降低",
            },
            {
              title: "结果可对比",
              description: "pass / partial / fail 分级，强弱立判",
            },
            {
              title: "直接给建议",
              description: "评测完输出生产选型建议，拿来就能决策",
            },
          ],
          note: "它解决：模型选型靠经验、Agent 能力无据可查。",
          demo: {
            title: "评测结果与模型对比报告示意",
            messages: ["评测结果 / 模型对比报告界面截图素材槽位"],
            note: "此处预留真实界面截图位置",
          },
        },
        {
          id: "sk-dify",
          eyebrow: "编程类 · 工作流",
          title: "Dify 工作流生成",
          lead: "说需求，工作流自动生成——流程搭建不再靠拖拽。",
          body: "把业务需求讲给 AI，它帮你拆解成完整的工作流并生成可导入 Dify 的文件，复杂编排也能一次生成。",
          cards: [
            {
              title: "需求直达流程",
              description: "业务需求自动拆解为工作流节点",
            },
            {
              title: "复杂编排也能做",
              description: "并行、分支、迭代一次生成",
            },
            {
              title: "拿来就能用",
              description: "生成可导入 Dify 的 DSL 文件",
            },
            {
              title: "少踩配置坑",
              description: "内置自检清单，降低出错率",
            },
          ],
          note: "它解决：工作流搭建门槛高、配置易出错。",
          demo: {
            title: "工作流节点拓扑示意",
            messages: ["Dify 工作流 DSL / 节点拓扑界面截图素材槽位"],
            note: "此处预留真实界面截图位置",
          },
        },
        {
          id: "sk-aiknow",
          eyebrow: "编程类 · 知识",
          title: "AI 系统知识解答",
          lead: "从系统视角看懂 AI——硬件、编译器、框架、部署一次讲清。",
          body: "遇到 AI 系统问题不再到处搜：从 CPU 到 NPU、从编译器到计算图、从硬件到软件栈，这个技能都能系统化解答。",
          cards: [
            {
              title: "知识成体系",
              description: "18 个专题，概念到排障全覆盖",
            },
            {
              title: "讲得透",
              description: "概念、机制、系统位置、取舍分层讲清",
            },
            {
              title: "对比一目了然",
              description: "框架、硬件、优化方法用表格对比",
            },
            {
              title: "排障照着查",
              description: "选型与性能问题给检查清单",
            },
          ],
          note: "它解决：AI 系统知识分散、学习与排障成本高。",
          demo: {
            title: "AI 系统知识地图与问答示意",
            messages: ["知识地图 / 问答界面截图素材槽位"],
            note: "此处预留真实界面截图位置",
          },
        },
      ],
      business: {
        eyebrow: "03｜业务场景",
        title: "让研发与工程决策，有据、有速、有体系",
        lead: "评测有数据、流程能自动、知识成体系——编程类技能直击研发提效。",
        points: [
          {
            title: "选型有据",
            description: "模型评测量化对比，决策不靠感觉",
          },
          {
            title: "流程自动化",
            description: "工作流描述即生成，搭建提速",
          },
          {
            title: "知识体系化",
            description: "AI 系统知识一次讲清",
          },
          {
            title: "拿来即用",
            description: "技能开箱即用，快速落地",
          },
        ],
        values: [
          {
            title: "缩短决策周期",
            description: "评测对比一次跑完",
          },
          {
            title: "降低搭建门槛",
            description: "需求直达工作流",
          },
        ],
        demo: {
          title: "编程类技能 · 能力演示",
          messages: [
            { role: "user", text: "帮我评测一下这几个模型的工具调用能力" },
            { role: "assistant", text: "正在批量评测……" },
            { role: "assistant", text: "已生成对比报告，给出选型建议。" },
            {
              role: "user",
              text: "再帮我生成一个 Dify 数据汇总工作流",
            },
            { role: "assistant", text: "已生成工作流 DSL，可直接导入。" },
          ],
          footer: { placeholder: "输入你的需求…", action: "发送" },
        },
        reason: ["能力评测", "工作流生成", "知识解答", "决策落地"],
        workflowLabel: "工作方式",
        workflow: ["提出问题", "调用技能", "拿到结果", "落地使用"],
        outcomes: [
          {
            title: "决策更快",
            description: "评测有数据支撑",
          },
          {
            title: "搭建更省",
            description: "工作流自动生成",
          },
          {
            title: "上手更顺",
            description: "知识随时可问",
          },
        ],
        scenesLead: "覆盖模型选型、工作流搭建与 AI 技术问答等场景。",
        scenes: [
          {
            title: "模型选型评估",
            description: "多模型横向对比，选型有据",
            actions: [
              {
                label: "了解模型选择 →",
                href: "/product/model-assets",
              },
            ],
          },
          {
            title: "工作流搭建",
            description: "业务需求直达 Dify 工作流",
            actions: [
              {
                label: "了解流程编排 →",
                href: "/product/agent-orchestration",
              },
            ],
          },
          {
            title: "AI 技术问答",
            description: "系统知识解答与排障",
            actions: [
              {
                label: "返回技能中心 →",
                href: "/product/skills",
              },
            ],
          },
        ],
      },
      cta: {
        title: "让这类技能，为你的业务所用",
        description: "申请体验技能中心，或与华鲲团队沟通技能沉淀方案。",
        actions: [
          {
            label: "申请体验",
            href: "/trial",
            variant: "primary",
          },
          {
            label: "商务咨询",
            href: "/contact?topic=编程类技能咨询",
          },
          {
            label: "返回技能中心",
            href: "/product/skills",
          },
        ],
      },
    });
  });

  it("locks the complete application skill page", () => {
    expect(getSkillSubpage("skills-application")).toStrictEqual({
      slug: "skills-application",
      name: "应用类技能",
      hero: {
        eyebrow: "技能中心｜应用类技能",
        title: "应用类技能：让业务应用更可靠",
        lead: "覆盖视频分析与安全防护，为业务应用提供可落地能力。",
        tags: ["视频分析", "安全防护"],
        actions: [
          {
            label: "申请体验",
            href: "/trial",
            variant: "primary",
          },
          {
            label: "商务咨询",
            href: "/contact?topic=应用类技能咨询",
          },
        ],
        visual: {
          title: "技能列表界面截图素材槽位",
        },
      },
      sections: [
        {
          id: "skills-application-position",
          eyebrow: "01｜它是什么",
          title: "把业务应用能力，封装成可落地的技能",
          lead: "应用类技能面向业务应用场景，把视频解析布控、智能体安全防护等能力封装为可直接使用的技能，让业务应用更可靠、更安全。",
        },
        {
          id: "skills-application-caps",
          eyebrow: "02｜能力优势",
          title: "两类技能，支撑业务应用的可靠落地",
          lead: "从看懂视频到守住安全，每个技能都解决一类应用侧的实在问题。",
        },
        {
          id: "sk-video",
          eyebrow: "应用类 · 视频分析",
          title: "视频解析 · 持续布控",
          lead: "一句话，视频布控任务自动跑起来。",
          body: "把「要盯着什么」讲给 AI，它自动转成布控任务、匹配对算法、提交执行，最后给你一份结构化预警总结。",
          cards: [
            {
              title: "说需求就布控",
              description: "自然语言直接转成布控任务",
            },
            {
              title: "算法自动匹配",
              description: "选对算法才执行，不乱来",
            },
            {
              title: "全流程自动",
              description: "上传媒体、提交任务、轮询状态",
            },
            {
              title: "预警拿来就用",
              description: "结果结构化输出，直接跟进",
            },
          ],
          note: "它解决：视频监控靠人盯、布控任务配置繁琐。",
          demo: {
            title: "离线布控任务与预警结果示意",
            messages: ["布控任务 / 预警结果界面截图素材槽位"],
            note: "此处预留真实界面截图位置",
          },
        },
        {
          id: "sk-agentguard",
          eyebrow: "应用类 · 安全",
          title: "AI Agent 安全防护",
          lead: "给 AI Agent 做安全体检，用得更放心。",
          body: "你的 Agent 有没有被注入的风险、凭据有没有泄露、权限是不是过大？这个技能一次扫描清楚，危险动作自动拦截。",
          cards: [
            {
              title: "全维度扫描",
              description: "技能、凭据、权限、网络一次查清",
            },
            {
              title: "动作实时把关",
              description: "危险操作自动拦截、需确认才执行",
            },
            {
              title: "信任可管理",
              description: "技能按能力分级授权",
            },
            {
              title: "每天自动巡检",
              description: "安全事件全程留痕、可审计",
            },
          ],
          note: "它解决：Agent 被注入、数据泄露风险不可控。",
          demo: {
            title: "安全健康报告示意",
            messages: ["Agent 安全报告界面截图素材槽位"],
            note: "此处预留真实界面截图位置",
          },
        },
      ],
      business: {
        eyebrow: "03｜业务场景",
        title: "让业务应用，更自动、更安全",
        lead: "视频布控一句话就绪，Agent 安全一次体检——应用类技能让业务更可靠。",
        points: [
          {
            title: "布控自动化",
            description: "自然语言直达布控任务",
          },
          {
            title: "算法不乱选",
            description: "匹配对算法才执行",
          },
          {
            title: "安全可控",
            description: "Agent 危险动作自动拦截",
          },
          {
            title: "结果即用",
            description: "预警与报告结构化输出",
          },
        ],
        values: [
          {
            title: "少人盯",
            description: "视频布控自动执行",
          },
          {
            title: "更放心",
            description: "Agent 安全实时把关",
          },
        ],
        demo: {
          title: "应用类技能 · 能力演示",
          messages: [
            { role: "user", text: "创建离线布控任务，盯住厂区北门" },
            { role: "assistant", text: "正在匹配算法并创建任务……" },
            { role: "assistant", text: "已创建布控任务，开始轮询预警。" },
            { role: "user", text: "给现有 Agent 做一次安全体检" },
            { role: "assistant", text: "已扫描完成，生成安全健康报告。" },
          ],
          footer: { placeholder: "输入你的需求…", action: "发送" },
        },
        reason: ["需求理解", "任务创建", "自动执行", "结果交付"],
        workflowLabel: "工作方式",
        workflow: ["描述需求", "调用技能", "自动执行", "拿到结果"],
        outcomes: [
          {
            title: "布控更省心",
            description: "一句话创建任务",
          },
          {
            title: "安全更可控",
            description: "风险实时拦截",
          },
          {
            title: "结果更直观",
            description: "报告结构化",
          },
        ],
        scenesLead: "覆盖安防布控、Agent 安全评估等业务场景。",
        scenes: [
          {
            title: "安防与园区",
            description: "视频布控、异常预警",
            actions: [
              {
                label: "了解视频智能体 →",
                href: "/product/agent-video",
              },
            ],
          },
          {
            title: "Agent 安全",
            description: "安全体检与日常巡检",
            actions: [
              {
                label: "了解安全管控 →",
                href: "/product/governance",
              },
            ],
          },
          {
            title: "业务自动化",
            description: "视频与安全能力组装",
            actions: [
              {
                label: "返回技能中心 →",
                href: "/product/skills",
              },
            ],
          },
        ],
      },
      cta: {
        title: "让这类技能，为你的业务所用",
        description: "申请体验技能中心，或与华鲲团队沟通技能沉淀方案。",
        actions: [
          {
            label: "申请体验",
            href: "/trial",
            variant: "primary",
          },
          {
            label: "商务咨询",
            href: "/contact?topic=应用类技能咨询",
          },
          {
            label: "返回技能中心",
            href: "/product/skills",
          },
        ],
      },
    });
  });

  it("locks the complete office skill page", () => {
    expect(getSkillSubpage("skills-office")).toStrictEqual({
      slug: "skills-office",
      name: "办公类技能",
      hero: {
        eyebrow: "技能中心｜办公类技能",
        title: "办公类技能：让日常工作更高效",
        lead: "覆盖会议提效与技能入门，让日常办公与技能运营更顺畅。",
        tags: ["会议提效", "入门示例"],
        actions: [
          {
            label: "申请体验",
            href: "/trial",
            variant: "primary",
          },
          {
            label: "商务咨询",
            href: "/contact?topic=办公类技能咨询",
          },
        ],
        visual: {
          title: "技能列表界面截图素材槽位",
        },
      },
      sections: [
        {
          id: "skills-office-position",
          eyebrow: "01｜它是什么",
          title: "把办公场景能力，封装成提效的技能",
          lead: "办公类技能面向日常办公与技能运营，把会议纪要生成、技能包入门等能力封装为开箱即用的技能，让会议提效、让技能上手更顺。",
        },
        {
          id: "skills-office-caps",
          eyebrow: "02｜能力优势",
          title: "两类技能，覆盖办公提效与技能运营",
          lead: "从一场会到一套技能包，每个技能都解决一个办公场景的具体问题。",
        },
        {
          id: "sk-meeting",
          eyebrow: "办公类 · 会议提效",
          title: "会议纪要生成",
          lead: "会议结束，纪要同步——录音直接变纪要。",
          body: "会议录音、录像或文件交给它，自动转成结构化纪要和任务清单，会后不用再花时间整理。",
          cards: [
            {
              title: "自动转写",
              description: "录音 / 录像 / 文本直接出逐字稿",
            },
            {
              title: "纪要自动生成",
              description: "结构化 Markdown 纪要，不用手写",
            },
            {
              title: "任务不遗漏",
              description: "任务清单自动生成，跟进有据",
            },
            {
              title: "越用越快",
              description: "历史缓存复用，避免重复转写",
            },
          ],
          note: "它解决：会议记录耗时、任务跟进易遗漏。",
          demo: {
            title: "会议纪要生成流程示意",
            messages: ["会议纪要 / 任务清单界面截图素材槽位"],
            note: "此处预留真实界面截图位置",
          },
        },
        {
          id: "sk-hello",
          eyebrow: "办公类 · 入门示例",
          title: "技能包入门示例",
          lead: "几分钟了解技能怎么发布、怎么用。",
          body: "如果你刚接触技能平台，这个示例技能带你走一遍技能包结构、发布和安装流程，快速上手。",
          cards: [
            {
              title: "结构一看就懂",
              description: "标准技能包模板，字段说明清楚",
            },
            {
              title: "流程走一遍",
              description: "发布、审核、搜索、安装全流程",
            },
            {
              title: "照着就能做",
              description: "CLI 命令示例，复制即用",
            },
            {
              title: "版本管理",
              description: "改版重新发布，流程一目了然",
            },
          ],
          note: "它解决：技能开发与发布入门门槛。",
          demo: {
            title: "技能包结构与发布流程示意",
            messages: ["技能包结构 / 发布流程界面截图素材槽位"],
            note: "此处预留真实界面截图位置",
          },
        },
      ],
      business: {
        eyebrow: "03｜业务场景",
        title: "让日常工作，更省时、更顺手",
        lead: "会议结束纪要同步、技能入门几步走完——办公类技能让效率看得见。",
        points: [
          {
            title: "纪要同步",
            description: "录音直接变结构化纪要",
          },
          {
            title: "任务不遗漏",
            description: "任务清单自动生成",
          },
          {
            title: "入门顺",
            description: "技能发布安装几步走完",
          },
          {
            title: "越用越快",
            description: "历史缓存复用",
          },
        ],
        values: [
          {
            title: "省时",
            description: "会议整理交给技能",
          },
          {
            title: "顺手上手",
            description: "技能运营快速入门",
          },
        ],
        demo: {
          title: "办公类技能 · 能力演示",
          messages: [
            { role: "user", text: "把今天的产品会录音转成纪要" },
            { role: "assistant", text: "正在转写并生成纪要……" },
            { role: "assistant", text: "已生成纪要与 5 条任务清单。" },
            { role: "user", text: "演示一下技能怎么发布" },
            {
              role: "assistant",
              text: "已按示例完成技能包结构与发布流程演示。",
            },
          ],
          footer: { placeholder: "输入你的需求…", action: "发送" },
        },
        reason: ["内容转写", "纪要生成", "任务清单", "技能沉淀"],
        workflowLabel: "工作方式",
        workflow: ["提供素材", "调用技能", "生成结果", "持续复用"],
        outcomes: [
          {
            title: "省时省力",
            description: "会议整理自动化",
          },
          {
            title: "跟进有据",
            description: "任务清单不遗漏",
          },
          {
            title: "上手简单",
            description: "技能流程一看就懂",
          },
        ],
        scenesLead: "覆盖会议记录、任务跟进与技能运营入门等场景。",
        scenes: [
          {
            title: "会议记录",
            description: "录音录像转纪要，任务跟进",
            actions: [
              {
                label: "了解办公写作应用 →",
                href: "/product/app-writing",
              },
            ],
          },
          {
            title: "任务跟进",
            description: "纪要任务清单自动生成",
            actions: [
              {
                label: "返回技能中心 →",
                href: "/product/skills",
              },
            ],
          },
          {
            title: "技能运营",
            description: "发布、审核、安装流程演示",
            actions: [
              {
                label: "了解技能中心 →",
                href: "/product/skills",
              },
            ],
          },
        ],
      },
      cta: {
        title: "让这类技能，为你的业务所用",
        description: "申请体验技能中心，或与华鲲团队沟通技能沉淀方案。",
        actions: [
          {
            label: "申请体验",
            href: "/trial",
            variant: "primary",
          },
          {
            label: "商务咨询",
            href: "/contact?topic=办公类技能咨询",
          },
          {
            label: "返回技能中心",
            href: "/product/skills",
          },
        ],
      },
    });
  });
});
