import type { Metadata } from "next";
import { getStandaloneProduct } from "@/components/product-portal-content";
import { StandaloneProductDetail } from "@/components/standalone-product-detail";

const product = getStandaloneProduct("aishrek");

export const metadata: Metadata = {
  title: "AISHREK · 华鲲元启",
  description: product?.hero.lead,
};

export default function AishrekPage() {
  return <StandaloneProductDetail slug="aishrek" />;
}
