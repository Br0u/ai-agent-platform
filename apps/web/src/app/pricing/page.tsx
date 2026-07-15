import type { Metadata } from "next";

import { PricingCalculator } from "@/components/portal/pricing/pricing-calculator";

export const metadata: Metadata = {
  title: "价格计算",
  description: "配置华鲲元启 AI 开发赋能平台需求并联系商务获取正式报价。",
};

export default function PricingPage() {
  return (
    <main className="pricing-page" aria-label="价格计算">
      <header className="pricing-page__header">
        <h1>价格计算</h1>
        <p>配置部署方式、使用规模、功能模块与服务周期，获取正式报价。</p>
      </header>
      <PricingCalculator />
    </main>
  );
}
