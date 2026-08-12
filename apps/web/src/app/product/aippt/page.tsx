import type { Metadata } from "next";
import { getStandaloneProduct } from "@/components/product-portal-content";
import { StandaloneProductDetail } from "@/components/standalone-product-detail";

const product = getStandaloneProduct("aippt");

export const metadata: Metadata = {
  title: "AIPPT · 华鲲元启",
  description: product?.hero.lead,
};

export default function AIPPTPage() {
  return <StandaloneProductDetail slug="aippt" />;
}
