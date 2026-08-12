import { getCapabilityFoundation } from "@/components/capability-foundation-content";
import { PlatformPageDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const page = getCapabilityFoundation("agent-knowledge-base")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function AgentKnowledgeBasePage() {
  return <PlatformPageDetail page={page} />;
}
