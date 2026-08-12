import { getAgentSubpage } from "@/components/agent-subpage-content";
import { PlatformPageDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const page = getAgentSubpage("agent-orchestration")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function AgentOrchestrationPage() {
  return <PlatformPageDetail page={page} />;
}
