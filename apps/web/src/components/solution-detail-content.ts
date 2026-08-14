import {
  industryLabels,
  industrySolutionCatalog,
  type SolutionCapability,
  type SolutionCase,
  type SolutionMetric,
  type V2IndustrySolution,
} from "./solution-industry-content";

export type IndustrySolutionDetail = {
  kind: "industry";
  key: string;
  category: string;
  title: string;
  summary: string;
  audience: string;
  problem: string;
  tags: readonly string[];
  capabilities: readonly SolutionCapability[];
  case?: SolutionCase;
  metrics?: readonly SolutionMetric[];
  images: {
    main: string;
    scene: string;
    result?: string;
  };
};

export type SolutionDetail = IndustrySolutionDetail;

export const solutionDetailSlugs = industrySolutionCatalog.map(
  (solution) => solution.key,
);

export type SolutionDetailSlug = (typeof solutionDetailSlugs)[number];

export function getSolutionDetail(slug: string): SolutionDetail | undefined {
  const solution = industrySolutionCatalog.find((item) => item.key === slug) as
    | V2IndustrySolution
    | undefined;
  if (!solution) return undefined;

  const imageBase = `/assets/solutions/${solution.key}`;
  return {
    kind: "industry",
    key: solution.key,
    category: industryLabels[solution.industry],
    title: solution.name,
    summary: solution.value,
    audience: solution.audience,
    problem: solution.problem,
    tags: solution.valueTags,
    capabilities: solution.capabilities,
    case: solution.case,
    metrics: solution.metrics,
    images: {
      main: `${imageBase}/main.png`,
      scene: `${imageBase}/scene.png`,
      result: solution.noResultImg ? undefined : `${imageBase}/result.png`,
    },
  };
}
