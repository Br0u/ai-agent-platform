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
  title: "从产品资料到部署文档，一站式获取华鲲资源",
  lead: "下载中心集中提供元启、码里奥与行业智能体的已发布资料。可直接获取的资源立即下载，需要进一步沟通的资料可联系华鲲团队申请。",
  tags: downloadSections.map(({ label }) => label),
} as const;

export function permissionHint(
  preview: DownloadResourcePublicDto["previewPolicy"],
  download: DownloadResourcePublicDto["downloadPolicy"],
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
