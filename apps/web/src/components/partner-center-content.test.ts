import { describe, expect, it } from "vitest";
import {
  partnerContact,
  partnerDirectory,
  partnerHref,
  partnerViewContent,
} from "./partner-center-content";

const expectedDirectory = [
  ["overview", "合作伙伴总览", "overview", "po-hero"],
  ["business", "商业模式", "business", "pb-hero"],
  ["business-modes", "合作模式", "business", "pb-modes"],
  ["business-tiers", "分润政策", "business", "pb-tiers"],
  ["business-benefits", "伙伴权益", "business", "pb-benefits"],
  ["policy", "伙伴政策", "policy", "pp-hero"],
  ["policy-types", "伙伴类型与准入条件", "policy", "pp-types"],
  ["policy-cert", "认证体系", "policy", "pp-cert"],
  ["policy-resources", "支持资源", "policy", "pp-resources"],
  ["training", "伙伴培训", "training", "pt-hero"],
  ["training-system", "培训体系", "training", "pt-system"],
  ["training-courses", "课程体系", "training", "pt-courses"],
  ["training-path", "认证路径", "training", "pt-path"],
  ["training-resources", "学习资源", "training", "pt-resources"],
  ["become", "成为合作伙伴", "become", "pbc-hero"],
] as const;

const flatten = (nodes: typeof partnerDirectory) =>
  nodes.flatMap((node) => [node, ...(node.children ?? [])]);

describe("partner center content", () => {
  it("locks the exact five views, 15 keys, directory order and absolute query/hash hrefs", () => {
    const nodes = flatten(partnerDirectory);

    expect(
      nodes.map(({ key, label, view, anchor }) => [key, label, view, anchor]),
    ).toEqual(expectedDirectory);
    expect([...new Set(nodes.map(({ view }) => view))]).toEqual([
      "overview",
      "business",
      "policy",
      "training",
      "become",
    ]);
    expect(nodes.map((node) => partnerHref(node))).toEqual([
      "/partners?view=overview#po-hero",
      "/partners?view=business#pb-hero",
      "/partners?view=business#pb-modes",
      "/partners?view=business#pb-tiers",
      "/partners?view=business#pb-benefits",
      "/partners?view=policy#pp-hero",
      "/partners?view=policy#pp-types",
      "/partners?view=policy#pp-cert",
      "/partners?view=policy#pp-resources",
      "/partners?view=training#pt-hero",
      "/partners?view=training#pt-system",
      "/partners?view=training#pt-courses",
      "/partners?view=training#pt-path",
      "/partners?view=training#pt-resources",
      "/partners?view=become#pbc-hero",
    ]);
  });

  it("keeps each searchable view tied to its exact prototype fields", () => {
    expect(partnerViewContent.overview.searchText).toContain("商业回报");
    expect(partnerViewContent.business.searchText).toContain("OEM/白标模式");
    expect(partnerViewContent.business.searchText).toContain("战略伙伴");
    expect(partnerViewContent.business.searchText).toContain("商机共享");
    expect(partnerViewContent.policy.searchText).toContain("渠道代理伙伴");
    expect(partnerViewContent.policy.searchText).toContain("销售认证");
    expect(partnerViewContent.policy.searchText).toContain("伙伴门户");
    expect(partnerViewContent.training.searchText).toContain("在线学习平台");
    expect(partnerViewContent.training.searchText).toContain("销售课程");
    expect(partnerViewContent.training.searchText).toContain("专家级");
    expect(partnerViewContent.training.searchText).toContain("定期 Webinar");
    expect(partnerViewContent.become.searchText).toContain("六步入驻流程");
  });

  it("keeps every numeric claim inside a view-level prototype disclaimer boundary", () => {
    expect(partnerViewContent.overview.claims).toEqual([
      "200+ 伙伴",
      "500+ 企业客户",
      "10万+ AI 应用上线",
    ]);
    expect(partnerViewContent.training.claims).toEqual([
      "200+ 课程",
      "200+ 课时",
    ]);

    for (const content of Object.values(partnerViewContent)) {
      expect(content.disclaimer).toContain("示意内容");
      expect(content.disclaimer).toContain("上线后替换");
    }
  });

  it("preserves the unconfirmed phone, email and QR slots", () => {
    expect(partnerContact).toEqual({
      defaultTopic: "生态合作咨询",
      phone: "联系方式素材待确认",
      phoneCopy: "生态合作电话待确认",
      email: "邮箱素材待确认",
      emailCopy: "生态合作邮箱待确认",
      qr: "联系二维码素材槽位",
      privacy: "首期通过人工渠道沟通，不提交或保存用户信息。",
    });
  });

  it("locks every prototype hero and closing CTA in source order", () => {
    expect(partnerViewContent.overview.heroActions).toEqual([
      { label: "成为合作伙伴", href: "/partners?view=become#pbc-hero" },
      { label: "了解商业模式", href: "/partners?view=business#pb-hero" },
      { label: "联系生态负责人", topic: "生态合作咨询" },
    ]);
    expect(partnerViewContent.business.heroActions).toEqual([
      { label: "查看合作模式", href: "/partners?view=business#pb-modes" },
      { label: "成为合作伙伴", href: "/partners?view=become#pbc-hero" },
    ]);
    expect(partnerViewContent.policy.heroActions).toEqual([
      { label: "查看准入条件", href: "/partners?view=policy#pp-types" },
      { label: "成为合作伙伴", href: "/partners?view=become#pbc-hero" },
    ]);
    expect(partnerViewContent.training.heroActions).toEqual([
      { label: "查看课程体系", href: "/partners?view=training#pt-courses" },
      { label: "联系咨询", topic: "伙伴培训报名" },
    ]);
    expect(partnerViewContent.become.heroActions).toEqual([
      { label: "立即申请", topic: "申请成为合作伙伴" },
      { label: "查看准入条件", href: "/partners?view=policy#pp-hero" },
    ]);

    expect(partnerViewContent.overview.closingCta).toEqual({
      anchor: "po-cta",
      title: "选择华鲲元启，选择共赢",
      lead: "立即申请成为华鲲合作伙伴，开启 AI 时代新机遇。",
      actions: [
        { label: "申请成为伙伴", href: "/partners?view=become#pbc-hero" },
        { label: "联系生态负责人", topic: "生态合作咨询" },
        { label: "了解元启平台 →", href: "/product" },
      ],
    });
    expect(partnerViewContent.business.closingCta).toEqual({
      anchor: "pb-cta",
      title: "选择华鲲元启，选择共赢",
      lead: "立即申请成为华鲲合作伙伴，开启 AI 时代新机遇。",
      actions: [
        { label: "申请成为伙伴", href: "/partners?view=become#pbc-hero" },
        { label: "咨询商业模式", topic: "商业模式咨询" },
      ],
    });
    expect(partnerViewContent.policy.closingCta).toEqual({
      anchor: "pp-cta",
      title: "加入华鲲元启伙伴网络",
      lead: "立即申请，开启您的 AI 事业新篇章。",
      actions: [
        { label: "申请成为伙伴", href: "/partners?view=become#pbc-hero" },
        { label: "咨询伙伴政策", topic: "伙伴政策咨询" },
      ],
    });
  });

  it("locks the complete business comparison and policy guidance text", () => {
    expect(partnerViewContent.business.comparison).toEqual([
      ["适合对象", "代理商、系统集成商", "ISV、系统集成商", "大型 ISV"],
      [
        "合作方式",
        "产品转售 + 区域覆盖",
        "产品嵌入 + 联合品牌",
        "品牌定制 + 独立运营",
      ],
      [
        "收益构成",
        "销售分成 + 返点激励",
        "技术分成 + 联合营销",
        "批量授权 + 技术支持",
      ],
      [
        "合作深度",
        "产品销售与服务",
        "方案共建与联合品牌",
        "品牌定制与独立运营",
      ],
      [
        "典型场景",
        "区域市场拓展、客户转售",
        "行业解决方案落地",
        "自有品牌平台运营",
      ],
    ]);
    expect(partnerViewContent.policy.choose).toEqual([
      [
        "拥有客户资源与销售能力",
        "渠道代理伙伴",
        "通过转售与本地服务获取销售分成",
      ],
      ["具备项目实施与集成能力", "交付生态伙伴", "承接项目交付与定制化开发"],
      ["拥有技术产品与研发能力", "技术合作伙伴", "产品集成与联合创新"],
    ]);
    expect(partnerViewContent.policy.certificationValue).toEqual({
      title: "认证的价值",
      lead: "认证不仅是能力证明，更直接关联商机与权益：",
      points: [
        "认证人员计入团队资质",
        "等级晋级前置条件",
        "优先参与联合打单",
        "获得官方背书与宣传露出",
      ],
    });
  });
});
