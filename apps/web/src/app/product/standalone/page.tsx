import type { Metadata } from "next";
import { standaloneCenter } from "@/components/product-portal-content";
import { StandaloneProductCenter } from "@/components/standalone-product-center";

export const metadata: Metadata = {
  title: "独立产品中心 · 华鲲元启",
  description: standaloneCenter.hero.lead,
};

export default function StandaloneProductCenterPage() {
  return <StandaloneProductCenter />;
}
