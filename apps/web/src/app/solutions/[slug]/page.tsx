import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  findSolution,
  solutions,
} from "@/components/solutions/solution-content";
import { SolutionDetail } from "@/components/solutions/solution-sections";

type PageProps = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return solutions.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const solution = findSolution((await params).slug);
  return solution
    ? {
        title: `${solution.title} · AI Agent Platform`,
        description: solution.summary,
      }
    : { title: "方案未找到 · AI Agent Platform" };
}
export default async function SolutionPage({ params }: PageProps) {
  const solution = findSolution((await params).slug);
  if (!solution) notFound();
  return <SolutionDetail solution={solution} />;
}
