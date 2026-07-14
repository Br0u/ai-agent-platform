import type { Metadata } from "next";
import {
  CustomerValue,
  IndustrySolutions,
  OfficeAgents,
  ProductArchitecture,
  ProductCapabilityRail,
  ProductCTA,
  ProductHero,
  ProductModules,
  SupportedModelsSection,
} from "@/components/product-sections";

export const metadata: Metadata = {
  title: "产品介绍 · AI Agent Platform",
  description:
    "华鲲元启 AI 开发赋能平台（TGDataXAI）——面向企业私有化场景的 AI 全栈开发与运营平台，覆盖智能体开发、知识工程、模型管理与办公智能体应用。",
};

export default function ProductPage() {
  return (
    <main className="product-page">
      {/* S1: 产品定位 Hero */}
      <ProductHero />

      {/* S2: 核心能力指标条 */}
      <ProductCapabilityRail />

      {/* S3: 平台技术架构 */}
      <ProductArchitecture />

      {/* S4: 核心功能模块（深色背景） */}
      <ProductModules />

      {/* S5: 办公智能体应用 */}
      <OfficeAgents />

      {/* S6: 适配模型（深色背景） */}
      <SupportedModelsSection />

      {/* S7: 行业应用场景 */}
      <IndustrySolutions />

      {/* S8: 客户价值 */}
      <CustomerValue />

      {/* S9: CTA 收口（深色背景） */}
      <ProductCTA />
    </main>
  );
}
