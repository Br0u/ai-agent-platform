import { describe, expect, it } from "vitest";

import {
  capabilityFoundationSlugs,
  getCapabilityFoundation,
} from "./capability-foundation-content";

describe("prototype capability foundation content contract", () => {
  it("registers exactly the two capability foundation pages", () => {
    expect(capabilityFoundationSlugs).toStrictEqual([
      "agent-knowledge-base",
      "knowledge-metrics",
    ]);
    expect(getCapabilityFoundation("unknown")).toBeUndefined();
  });

  it("locks the complete capability foundation page", () => {
    expect(getCapabilityFoundation("agent-knowledge-base")).toStrictEqual({
      slug: "agent-knowledge-base",
      name: "能力底座",
      hero: {
        eyebrow: "智能体中心｜能力底座",
        title: "能力底座：让智能体懂知识、懂数据",
        lead: "企业知识库把文档变成可检索的知识，数据源与指标把数据变成可问数的底座——这是智能体「回答有据、问数有果」的底层支撑。",
        tags: ["企业知识库", "数据源与指标"],
        actions: [
          { label: "申请体验", href: "/trial", variant: "primary" },
          { label: "商务咨询", href: "/contact?topic=能力底座咨询" },
        ],
        visual: {
          title: "能力底座架构图素材槽位（知识底座 + 数据底座 → 智能体）",
        },
      },
      sections: [
        {
          eyebrow: "01｜它是什么",
          title: "智能体「懂业务」的底气，来自知识与数据",
          lead: "助手不是空有模型，它依赖企业自己的知识与数据。",
          body: "能力底座由两条线组成：知识线把制度、产品资料、技术文档加工成 AI 可检索、可问答的知识；数据线把企业数据库、表格接入平台并开发成统一指标。知识让回答有依据，数据让问数有结果，共同支撑知识智能体与数据智能体。",
          visual: "知识线 + 数据线 → 智能体 关系示意图素材槽位",
        },
        {
          tone: "soft",
          eyebrow: "02｜两大底座",
          title: "知识底座与数据底座，是智能体「懂业务」的支撑层",
          cards: [
            {
              title: "企业知识库 · 知识底座",
              description:
                "文档接入、自动分片、知识图谱与 QA 补充，把企业文档沉淀为可检索、可问答的知识资产。作为能力底座，支撑知识智能体让回答有据可查。",
              visual: "企业知识库界面截图素材槽位",
              actions: [
                { label: "进入企业知识库 →", href: "/product/knowledge" },
              ],
            },
            {
              title: "数据源与指标 · 数据底座",
              description:
                "接入企业数据源、同步原始数据、开发统一指标。作为能力底座，支撑数据智能体让问数有果、口径一致。",
              visual: "数据源与指标界面截图素材槽位",
              actions: [
                {
                  label: "进入数据源与指标 →",
                  href: "/product/knowledge-metrics",
                },
              ],
            },
          ],
        },
        {
          eyebrow: "03｜与智能体的关系",
          title: "能力底座支撑哪些智能体",
          cards: [
            {
              title: "知识智能体",
              description:
                "知识问答、知识加工与知识图谱类智能体，都建立在企业知识库之上。",
              actions: [
                {
                  label: "查看知识智能体 →",
                  href: "/product/agent-knowledge",
                },
              ],
            },
            {
              title: "数据智能体",
              description: "智能问数直接使用数据源与指标，问得准、答得快。",
              actions: [
                {
                  label: "查看数据智能体 →",
                  href: "/product/data-agent",
                },
              ],
            },
          ],
        },
      ],
      cta: {
        title: "需要给智能体打牢知识与数据底座？",
        description:
          "面向企业知识库建设与数据指标体系建设需求，与华鲲团队沟通。",
        actions: [
          {
            label: "商务咨询",
            href: "/contact?topic=能力底座咨询",
            variant: "primary",
          },
          { label: "申请体验", href: "/trial" },
        ],
      },
    });
  });

  it("locks the complete knowledge metrics page", () => {
    expect(getCapabilityFoundation("knowledge-metrics")).toStrictEqual({
      slug: "knowledge-metrics",
      name: "数据源与指标",
      hero: {
        eyebrow: "智能体中心｜能力底座 · 数据源与指标",
        title: "数据源与指标：让业务数据能被 AI 直接问数",
        lead: "接入企业数据源、同步原始数据、开发统一指标，为数据智能体提供「看得懂、查得准」的数据底座，不懂 SQL 也能随问随答。",
        tags: ["数据源接入", "数据同步", "指标开发", "智能问数"],
        actions: [
          { label: "申请体验", href: "/trial", variant: "primary" },
          {
            label: "商务咨询",
            href: "/contact?topic=数据源与指标咨询",
          },
        ],
        visual: { title: "数据源与指标管理界面截图素材槽位" },
      },
      sections: [
        {
          eyebrow: "01｜它是什么",
          title: "让数据智能体「问得出来、答得准」的前提",
          lead: "业务人员问「本季度回款多少」，数据智能体要能理解指标、找到数据、给出结果。",
          body: "数据源与指标是数据智能体的数据底座：先把企业数据库、表格等数据源接入平台并同步数据，再把业务口径固化为指标，最后让数据智能体基于指标与数据回答自然语言问题。数据接入是基础，指标统一口径，二者共同保证「问数有结果、结果可信赖」。",
          visual:
            "「数据源 → 数据同步 → 指标开发 → 智能问数」链路示意图素材槽位",
        },
        {
          eyebrow: "02｜能力优势",
          title: "数据底座能帮你做什么",
          cards: [
            {
              title: "数据源接入",
              description:
                "支持数据库、表格、文件等多种数据源接入，统一纳管企业数据资产。",
              visual: "数据源管理界面截图素材槽位",
            },
            {
              title: "原始数据纳管",
              description:
                "接入的原始数据集中管理、可查看，为抽取与使用提供基础。",
              visual: "原始数据界面截图素材槽位",
            },
            {
              title: "数据抽取与同步",
              description:
                "通过抽取任务将数据同步到平台，任务状态可监控，数据及时可用。",
              visual: "数据抽取任务界面截图素材槽位",
            },
            {
              title: "指标开发",
              description:
                "定义业务指标与计算口径，沉淀统一的指标资产，支撑问数与分析。",
              visual: "指标开发界面截图素材槽位",
            },
          ],
        },
        {
          eyebrow: "03｜支撑对象",
          title: "数据底座支撑谁",
          cards: [
            {
              title: "数据智能体",
              description:
                "智能问数直接建立在数据源与指标之上，问得准、答得快。",
              actions: [
                {
                  label: "查看数据智能体 →",
                  href: "/product/data-agent",
                },
              ],
            },
            {
              title: "行业应用",
              description:
                "行业应用中心的数据分析与洞察类应用，复用统一的数据与指标底座。",
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
              title: "查数不排队",
              points: [
                "业务人员随问随答，不依赖提数排期",
                "从等报表到实时问数，决策更及时",
              ],
            },
            {
              title: "口径统一可信",
              points: [
                "指标口径固化，跨部门理解一致",
                "数据查询权限可控，合规有保障",
              ],
            },
          ],
          actions: [
            {
              label: "查看数据问答与分析方案 →",
              href: "/solutions/finance-data",
            },
          ],
        },
      ],
      cta: {
        title: "需要让业务数据可问、可分析？",
        description: "面向数据源接入、指标建设与智能问数需求，与华鲲团队沟通。",
        actions: [
          {
            label: "商务咨询",
            href: "/contact?topic=数据源与指标咨询",
            variant: "primary",
          },
          { label: "申请体验", href: "/trial" },
        ],
      },
    });
  });
});
