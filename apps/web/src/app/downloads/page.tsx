import type { Metadata } from "next";
import { DownloadCenter } from "@/components/download-center";
import { downloadOverview } from "@/components/download-center-content";
import "./downloads.css";

export const metadata: Metadata = {
  title: "下载中心 · 华鲲元启",
  description: downloadOverview.lead,
};

export default function DownloadsPage() {
  return <DownloadCenter />;
}
