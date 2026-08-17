import type { Metadata } from "next";
import { DownloadCenter } from "@/components/download-center";
import { downloadOverview } from "@/components/download-center-content";
import { downloadResourceService } from "@/server/downloads/service";
import "./downloads.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "下载中心 · 华鲲元启",
  description: downloadOverview.lead,
};

export default async function DownloadsPage() {
  const resources = await downloadResourceService.listPublicResources();
  return <DownloadCenter resources={resources} />;
}
