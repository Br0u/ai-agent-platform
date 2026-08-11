import { getAgentSubpage } from "@/components/agent-subpage-content";
import { PlatformPageDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const page = getAgentSubpage("data-agent")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function DataAgentPage() {
  return <PlatformPageDetail page={page} />;
}
