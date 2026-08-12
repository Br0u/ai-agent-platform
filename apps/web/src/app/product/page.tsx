import type { Metadata } from "next";
import { productOverview } from "@/components/product-portal-content";
import { ProductPortalOverview } from "@/components/product-portal-overview";

export const metadata: Metadata = {
  title: "产品总览 · 华鲲元启",
  description: productOverview.hero.lead,
};

export default function ProductPage() {
  return <ProductPortalOverview />;
}
