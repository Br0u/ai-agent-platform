import type { Metadata } from "next";
import { SolutionOverview } from "@/components/solution-overview";
import "./solutions.css";

export const metadata: Metadata = {
  title: "解决方案 · AI Agent Platform",
  description:
    "面向企业实际业务问题，组合算力、模型、知识、数据、智能体与应用能力的 AI 解决方案。",
};

export default function SolutionsPage() {
  return <SolutionOverview />;
}
