import { partnerBecomeContent } from "./partner-become-content";
import { partnerBusinessContent } from "./partner-business-content";
import { partnerOverviewContent } from "./partner-overview-content";
import { partnerPolicyContent } from "./partner-policy-content";
import { partnerTrainingContent } from "./partner-training-content";

export type PartnerView =
  | "overview"
  | "business"
  | "policy"
  | "training"
  | "become";

export type PartnerDirectoryNode = {
  key: string;
  label: string;
  view: PartnerView;
  anchor: string;
  children?: readonly PartnerDirectoryNode[];
};

export const partnerDirectory: readonly PartnerDirectoryNode[] = [
  {
    key: "overview",
    label: "合作伙伴总览",
    view: "overview",
    anchor: "po-hero",
  },
  {
    key: "business",
    label: "商业模式",
    view: "business",
    anchor: "pb-hero",
    children: [
      {
        key: "business-modes",
        label: "合作模式",
        view: "business",
        anchor: "pb-modes",
      },
      {
        key: "business-tiers",
        label: "分润政策",
        view: "business",
        anchor: "pb-tiers",
      },
      {
        key: "business-benefits",
        label: "伙伴权益",
        view: "business",
        anchor: "pb-benefits",
      },
    ],
  },
  {
    key: "policy",
    label: "伙伴政策",
    view: "policy",
    anchor: "pp-hero",
    children: [
      {
        key: "policy-types",
        label: "伙伴类型与准入条件",
        view: "policy",
        anchor: "pp-types",
      },
      {
        key: "policy-cert",
        label: "认证体系",
        view: "policy",
        anchor: "pp-cert",
      },
      {
        key: "policy-resources",
        label: "支持资源",
        view: "policy",
        anchor: "pp-resources",
      },
    ],
  },
  {
    key: "training",
    label: "伙伴培训",
    view: "training",
    anchor: "pt-hero",
    children: [
      {
        key: "training-system",
        label: "培训体系",
        view: "training",
        anchor: "pt-system",
      },
      {
        key: "training-courses",
        label: "课程体系",
        view: "training",
        anchor: "pt-courses",
      },
      {
        key: "training-path",
        label: "认证路径",
        view: "training",
        anchor: "pt-path",
      },
      {
        key: "training-resources",
        label: "学习资源",
        view: "training",
        anchor: "pt-resources",
      },
    ],
  },
  {
    key: "become",
    label: "成为合作伙伴",
    view: "become",
    anchor: "pbc-hero",
  },
] as const;

export const partnerHref = (node: PartnerDirectoryNode) =>
  `/partners?view=${node.view}#${node.anchor}`;

export const partnerViewContent = {
  overview: partnerOverviewContent,
  business: partnerBusinessContent,
  policy: partnerPolicyContent,
  training: partnerTrainingContent,
  become: partnerBecomeContent,
} as const;

export const partnerContact = {
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
} as const;

export const allPartnerDirectoryNodes = partnerDirectory.flatMap((node) => [
  node,
  ...(node.children ?? []),
]);

export function partnerNodeForLocation(view: PartnerView, hash: string) {
  const anchor = hash.replace(/^#/, "");
  return (
    allPartnerDirectoryNodes.find(
      (node) => node.view === view && node.anchor === anchor,
    ) ?? allPartnerDirectoryNodes.find((node) => node.view === view)
  );
}
