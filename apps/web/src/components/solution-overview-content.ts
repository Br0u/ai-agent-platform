import {
  industryLabels,
  industrySolutionCatalog,
} from "./solution-industry-content";

export type SolutionDirectoryNode = {
  internalId: string;
  type: "page" | "section" | "category";
  label: string;
  href: string;
  children?: readonly SolutionDirectoryNode[];
};

const industryOrder = [
  "finance",
  "railway",
  "electric",
  "semiconductor",
  "publicsecurity",
  "emergency",
  "enterprise",
  "government",
] as const;

function pageNode(
  solution: (typeof industrySolutionCatalog)[number],
): SolutionDirectoryNode {
  return {
    internalId: `solution-${solution.key}`,
    type: "page",
    label: solution.name,
    href: `/solutions/${solution.key}`,
  };
}

export const solutionDirectory: readonly SolutionDirectoryNode[] =
  industryOrder.map((industry) => {
    const solutions = industrySolutionCatalog.filter(
      (solution) => solution.industry === industry,
    );
    const children = solutions.map(pageNode);
    return {
      internalId: `industry-${industry}`,
      type: "section",
      label:
        industry === "enterprise"
          ? "企业通用解决方案"
          : `${industryLabels[industry]}行业解决方案`,
      href: children[0].href,
      children:
        industry === "publicsecurity"
          ? [
              {
                internalId: "industry-publicsecurity-video",
                type: "category",
                label: "视频智能布控与检索",
                href: children[0].href,
                children,
              },
            ]
          : children,
    } satisfies SolutionDirectoryNode;
  });
