import { solutionListRoutes } from "@/config/prototype-route-map";
import { caseSolutionDetails } from "./solution-case-content";
import { commonSolutionDetails } from "./solution-common-content";
import { industrySolutionDetails } from "./solution-industry-content";

export type SolutionProduct = {
  name: string;
  role: string;
  href: string;
};

export type CommonSolutionDetail = {
  kind: "common";
  category: string;
  title: string;
  summary: string;
  audience: string;
  tags: readonly string[];
  scenarios: readonly string[];
  problems: readonly string[];
  components: readonly string[];
  flow: readonly string[];
  products: readonly SolutionProduct[];
};

export type IndustrySolutionDetail = {
  kind: "industry";
  category: string;
  title: string;
  summary: string;
  audience: string;
  problem: string;
  tags: readonly string[];
  problems: readonly {
    problem: string;
    impact: string;
    goal: string;
  }[];
  components: readonly {
    name: string;
    role: string;
    input: string;
    output: string;
    product: string;
  }[];
  flow: readonly {
    label: string;
    description: string;
    media: string;
  }[];
  products: readonly SolutionProduct[];
};

export type CaseSolutionDetail = {
  kind: "case";
  category: "实践案例";
  title: string;
  summary: string;
  authorizationNotice: string;
  customer: string;
  industry: string;
  scenarios: readonly string[];
  products: readonly string[];
  outcomes: readonly string[];
  profile: readonly (readonly [string, string])[];
  challenges: readonly {
    name: string;
    problem: string;
    impact: string;
    limitation: string;
    measure: string;
  }[];
  architecture: readonly (readonly [string, string])[];
  stages: readonly {
    name: string;
    goal: string;
    work: string;
    huakun: string;
    customer: string;
    output: string;
    media: string;
  }[];
  results: readonly (readonly [string, string])[];
  materials: readonly (readonly [string, string])[];
};

export type SolutionDetail =
  | CommonSolutionDetail
  | IndustrySolutionDetail
  | CaseSolutionDetail;

export const solutionDetailSlugs = [
  "private-yuanqi",
  "cluster-planning",
  "compute-monitoring",
  "model-evaluation",
  "model-deployment",
  "knowledge-service",
  "document-intelligence",
  "data-insight",
  "knowledge-assets",
  "unstructured-data",
  "process-automation",
  "enterprise-assistant",
  "multi-agent",
  "video-intelligence",
  "government-knowledge",
  "government-data",
  "government-document",
  "government-process",
  "finance-knowledge",
  "finance-data",
  "finance-document",
  "finance-assistant",
  "healthcare-knowledge",
  "healthcare-data",
  "healthcare-document",
  "healthcare-process",
  "enterprise-knowledge",
  "enterprise-data",
  "enterprise-document",
  "enterprise-process",
  "enterprise-multi-agent",
  "case-pending-enterprise-knowledge",
] as const;

export type SolutionDetailSlug = (typeof solutionDetailSlugs)[number];

const solutionDetails = {
  ...commonSolutionDetails,
  ...industrySolutionDetails,
  ...caseSolutionDetails,
} satisfies Record<SolutionDetailSlug, SolutionDetail>;

const commonReturnHrefs: Record<string, string> = {
  基础设施与模型工程: solutionListRoutes.scenarios.infrastructure,
  知识与数据智能: solutionListRoutes.scenarios.knowledge,
  智能体与业务应用: solutionListRoutes.scenarios.agents,
};

const industryReturnHrefs: Record<string, string> = {
  政务: solutionListRoutes.industries.government,
  金融: solutionListRoutes.industries.finance,
  医疗: solutionListRoutes.industries.healthcare,
  企业智能化: solutionListRoutes.industries.enterprise,
};

export function getSolutionDetail(slug: string): SolutionDetail | undefined {
  return solutionDetails[slug as SolutionDetailSlug];
}

export function getSolutionReturnHref(
  detail: SolutionDetail,
  query: { mode?: string } = {},
): string {
  if (detail.kind === "common") return commonReturnHrefs[detail.category];
  if (detail.kind === "industry") return industryReturnHrefs[detail.category];
  if (query.mode === "industry") return solutionListRoutes.cases.industry;
  if (query.mode === "scenario") return solutionListRoutes.cases.scenario;
  return solutionListRoutes.cases.all;
}
