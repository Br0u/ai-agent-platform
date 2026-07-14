import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  findSolution,
  findSolutionScene,
  solutionScenes,
} from "@/components/solutions/solution-content";
import { SolutionScenarioPage } from "@/components/solutions/solution-sections";

type PageProps = {
  params: Promise<{ slug: string; scenario: string }>;
};

export function generateStaticParams() {
  return solutionScenes.map((scene) => ({
    slug: scene.solutionSlug,
    scenario: scene.slug,
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, scenario } = await params;
  const scene = findSolutionScene(slug, scenario);
  return scene
    ? {
        title: `${scene.title} · 场景解决方案`,
        description: scene.summary,
      }
    : { title: "场景方案未找到 · AI Agent Platform" };
}

export default async function ScenarioPage({ params }: PageProps) {
  const { slug, scenario } = await params;
  const solution = findSolution(slug);
  const scene = findSolutionScene(slug, scenario);

  if (!solution || !scene) notFound();

  return <SolutionScenarioPage solution={solution} scene={scene} />;
}
