import type { Metadata } from "next";
import { SolutionsPageContent } from "@/components/solutions/solution-sections";

export const metadata: Metadata = {
  title: "解决方案 · AI Agent Platform",
  description:
    "从企业业务问题出发，了解华鲲元启 AI 应用开发、智能办公、政务导办、视觉智能、AI 全栈与超融合解决方案。",
};

export default function SolutionsPage() {
  return <SolutionsPageContent />;
}
