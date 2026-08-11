import type {
  PartnerAction,
  PartnerClosingCta,
} from "./partner-center-content";

export const partnerOverviewContent = {
  eyebrow: "合作伙伴｜生态总览",
  title: "共建企业 AI 生态，共享增长机遇",
  lead: "面向渠道、交付与技术伙伴，提供多元合作模式、清晰分润政策与全链路赋能支持，共同开拓企业 AI 市场。",
  tags: ["商业回报", "市场协同", "成长认证"],
  claims: ["200+ 伙伴", "500+ 企业客户", "10万+ AI 应用上线"],
  disclaimer: "示意内容，正式上线后替换为真实生态关系图。",
  heroActions: [
    { label: "成为合作伙伴", href: "/partners?view=become#pbc-hero" },
    { label: "了解商业模式", href: "/partners?view=business#pb-hero" },
    { label: "联系生态负责人", topic: "生态合作咨询" },
  ] satisfies readonly PartnerAction[],
  searchText:
    "商业回报 市场协同 成长认证 收益模式灵活 分润回报逐级提升 全链路赋能支持 认证与成长体系 商业模式 伙伴政策 伙伴培训 合作流程",
  stats: [
    ["200+", "生态伙伴"],
    ["全国", "覆盖主要城市"],
    ["500+", "企业客户"],
    ["10万+", "AI 应用上线"],
  ],
  values: [
    {
      icon: "利",
      title: "收益模式灵活",
      lead: "三种合作模式按能力匹配，分润政策清晰透明，回报路径明确。",
      points: [
        "渠道分销 / 联合方案 / OEM 白标灵活选择",
        "销售分成、技术分成与返点激励多种收益",
      ],
    },
    {
      icon: "升",
      title: "分润回报逐级提升",
      lead: "银牌到战略四级伙伴体系，能力越强、回报越高。",
      points: ["等级越高折扣与返点越优", "战略伙伴享受独家授权与联合研发"],
    },
    {
      icon: "赋",
      title: "全链路赋能支持",
      lead: "市场、技术、培训、商机、产品五维支持，覆盖合作全过程。",
      points: ["营销物料与联合活动支持", "专属技术经理与沙箱环境"],
    },
    {
      icon: "证",
      title: "认证与成长体系",
      lead: "销售、技术、交付三大认证，三级进阶路径清晰可循。",
      points: ["200+ 课时课程与在线学习平台", "认证背书带来商机与信任"],
    },
  ],
  modules: [
    {
      no: "01",
      title: "商业模式",
      desc: "多元合作模式与分润政策，找到适合你的合作方式。",
      points: ["三种合作模式", "四级分润体系", "五项伙伴权益"],
      href: "/partners?view=business#pb-hero",
    },
    {
      no: "02",
      title: "伙伴政策",
      desc: "明确的准入标准与认证体系，为伙伴提供成长路径。",
      points: ["三大伙伴类型", "三大认证方向", "五项支持资源"],
      href: "/partners?view=policy#pp-hero",
    },
    {
      no: "03",
      title: "伙伴培训",
      desc: "系统化课程与认证路径，快速掌握元启平台。",
      points: ["四位一体培训体系", "三大课程方向", "三级认证路径"],
      href: "/partners?view=training#pt-hero",
    },
  ],
  closingCta: {
    anchor: "po-cta",
    title: "选择华鲲元启，选择共赢",
    lead: "立即申请成为华鲲合作伙伴，开启 AI 时代新机遇。",
    actions: [
      { label: "申请成为伙伴", href: "/partners?view=become#pbc-hero" },
      { label: "联系生态负责人", topic: "生态合作咨询" },
      { label: "了解元启平台 →", href: "/product" },
    ],
  } satisfies PartnerClosingCta,
} as const;
