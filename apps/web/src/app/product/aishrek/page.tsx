import type { Metadata } from "next";
import { getStandaloneProduct } from "@/components/product-portal-content";

const product = getStandaloneProduct("aishrek");

export const metadata: Metadata = {
  title: "AISHREK · 华鲲元启",
  description: product?.hero.lead,
};

export default function AishrekPage() {
  return (
    <main>
      <h1>{product?.hero.title}</h1>
    </main>
  );
}
