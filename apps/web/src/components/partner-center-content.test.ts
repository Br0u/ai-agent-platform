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
      expect(content.disclaimer).toContain("正式上线后替换");
    }
  });

  it("preserves the unconfirmed phone, email and QR slots and contact topics", () => {
    expect(partnerContact).toEqual({
      defaultTopic: "生态合作咨询",
      phone: "联系方式素材待确认",
      phoneCopy: "生态合作电话待确认",
      email: "邮箱素材待确认",
      emailCopy: "生态合作邮箱待确认",
      qr: "联系二维码素材槽位",
      privacy: "首期通过人工渠道沟通，不提交或保存用户信息。",
      topics: [
        "生态合作咨询",
        "渠道分销模式咨询",
        "联合解决方案模式咨询",
        "OEM/白标模式咨询",
        "商业模式咨询",
        "伙伴政策咨询",
        "伙伴培训报名",
        "申请成为合作伙伴",
      ],
    });
  });
});
