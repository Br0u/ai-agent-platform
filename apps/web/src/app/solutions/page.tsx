import type { Metadata } from "next";
import { SolutionOverview } from "@/components/solution-overview";
import {
  commonSolutionFilterKeys,
  industrySolutionFilterKeys,
} from "@/config/prototype-route-map";
import "./solutions.css";

export const metadata: Metadata = {
  title: "解决方案 · AI Agent Platform",
  description:
    "面向企业实际业务问题，组合算力、模型、知识、数据、智能体与应用能力的 AI 解决方案。",
};

type SolutionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SolutionsPage({
  searchParams,
}: SolutionsPageProps) {
  const query = await searchParams;
  const requestedView = first(query.view);
  const view = ["scenarios", "industries", "cases"].includes(
    requestedView ?? "",
  )
    ? (requestedView as "scenarios" | "industries" | "cases")
    : "overview";
  const requestedCategory = first(query.category);
  const category = commonSolutionFilterKeys.find(
    (key) => key === requestedCategory,
  );
  const requestedIndustry = first(query.industry);
  const industry = industrySolutionFilterKeys.find(
    (key) => key === requestedIndustry,
  );
  const requestedMode = first(query.mode);
  const mode = ["industry", "scenario"].includes(requestedMode ?? "")
    ? (requestedMode as "industry" | "scenario")
    : "all";

  return (
    <SolutionOverview
      category={view === "scenarios" ? category : undefined}
      industry={view === "industries" ? industry : undefined}
      mode={view === "cases" ? mode : undefined}
      view={view}
    />
  );
}
