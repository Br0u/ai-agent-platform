import type { Metadata } from "next";
import { getStandaloneProduct } from "@/components/product-portal-content";

const product = getStandaloneProduct("aippt");

export const metadata: Metadata = {
  title: "AIPPT · 华鲲元启",
  description: product?.hero.lead,
};

export default function AIPPTPage() {
  return (
    <main>
      <h1>{product?.hero.title}</h1>
    </main>
  );
}
