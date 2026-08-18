import type { DownloadResourcePublicDto } from "@/server/downloads/contracts";

export const downloadProducts = [
  "元启",
  "码里奥",
  "智能办公",
  "智能导办",
  "视觉检索智能体",
] as const;

export const downloadSections = [
  {
    no: "01",
    label: "产品资料",
    anchor: "dl-materials",
    category: "materials",
  },
  {
    no: "02",
    label: "软件资源下载",
    anchor: "dl-software",
    category: "software",
  },
  {
    no: "03",
    label: "产品部署文档",
    anchor: "dl-deployment",
    category: "deployment",
  },
  {
    no: "04",
    label: "白皮书与技术资料",
    anchor: "dl-whitepapers",
    category: "whitepapers",
  },
] as const satisfies readonly {
  no: string;
  label: string;
  anchor: string;
  category: DownloadResourcePublicDto["category"];
}[];

export const downloadOverview = {
  title: "从产品资料到安装体验，一站式获取华鲲资源",
  lead: "下载中心集中提供元启平台、码里奥与行业应用的产品资料、软件安装包、部署文档与技术白皮书，帮助您了解产品能力、获取资源并进入产品体验。",
  tags: ["产品资料", "软件下载", "部署文档", "白皮书"],
} as const;

export const downloadJourney = [
  {
    title: "了解产品",
    description: "查看元启平台、码里奥与行业应用能力",
    href: "/product",
  },
  {
    title: "获取资料",
    description: "浏览产品资料、白皮书与部署文档",
    href: "/downloads#dl-materials",
  },
  {
    title: "安装体验",
    description: "下载码里奥客户端并部署",
    href: "/downloads#dl-software",
  },
  {
    title: "联系我们",
    description: "联系华鲲团队获取方案与产品支持",
    href: "/contact?topic=下载与资料咨询",
  },
] as const;

export const downloadHeroNote =
  "下载中心是产品推广与客户转化链路的资源入口，资源均与产品价值关联呈现。";

export function permissionHint(
  preview: Extract<
    DownloadResourcePublicDto,
    { kind: "document" }
  >["previewPolicy"],
  download: Extract<
    DownloadResourcePublicDto,
    { kind: "document" }
  >["downloadPolicy"],
) {
  if (preview === "contact") return "仅展示封面 · 联系获取";
  return download === "public"
    ? "可在线预览 · 可直接下载"
    : "可在线预览 · 联系获取下载";
}

export function formatFileSize(bytes: number) {
  const megabytes = bytes / 1024 / 1024;
  return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(megabytes)} MB`;
}

const publishedDate = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Shanghai",
});

export function formatPublishedAt(value: string) {
  return publishedDate.format(new Date(value));
}
