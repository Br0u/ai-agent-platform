import type { Metadata } from "next";

import { PricingCalculator } from "@/features/pricing/pricing-calculator";

export const metadata: Metadata = {
  title: "产品定价",
  description: "配置华鲲元启 AI 开发赋能平台需求并联系商务获取正式报价。",
};

export default function PricingPage() {
  return (
    <main className="pricing-page" aria-label="产品定价">
      <header className="pricing-page__header">
        <p>企业方案配置</p>
        <h1>按企业需求配置方案</h1>
        <p>选择部署、规模、功能模块与服务周期，生成清晰的商务沟通需求。</p>
      </header>
      <PricingCalculator />
    </main>
  );
}
