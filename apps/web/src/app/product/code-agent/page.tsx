import type { Metadata } from "next";
import { getStandaloneProduct } from "@/components/product-portal-content";
import { StandaloneProductDetail } from "@/components/standalone-product-detail";

const product = getStandaloneProduct("code-agent");

export const metadata: Metadata = {
  title: "码里奥 · 华鲲元启",
  description: product?.hero.lead,
};

export default function CodeAgentPage() {
  return <StandaloneProductDetail slug="code-agent" />;
}
