import type { Metadata } from "next";
import { ContactPage } from "@/components/contact/contact-page";
import {
  findSolution,
  findSolutionScene,
} from "@/components/solutions/solution-content";

export const metadata: Metadata = {
  title: "方案评估与商务联系 · AI Agent Platform",
  description:
    "联系华鲲方案团队，围绕业务场景、算力、数据和系统接口开展方案评估。",
};

type PageProps = {
  searchParams: Promise<{ solution?: string; scene?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const solution = params.solution ? findSolution(params.solution) : undefined;
  const scene =
    params.solution && params.scene
      ? findSolutionScene(params.solution, params.scene)
      : undefined;

  return <ContactPage solution={solution} scene={scene} />;
}
