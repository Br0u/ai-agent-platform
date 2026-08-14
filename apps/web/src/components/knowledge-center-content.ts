import type { PlatformPage } from "./platform-page-types";

export const knowledgeCenter = {
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
            { label: "查看知识智能体 →", href: "/product/agent-knowledge" },
          ],
        },
        {
          title: "行业应用",
          description:
            "行业应用中心的写作、审查等应用可调用知识库沉淀的企业知识。",
          actions: [
            { label: "查看行业应用中心 →", href: "/product/applications" },
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
          href: "/solutions/railway-rag",
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
} as const satisfies PlatformPage;
