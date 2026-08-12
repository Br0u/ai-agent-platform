import { getCapabilityFoundation } from "@/components/capability-foundation-content";
import { PlatformPageDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const page = getCapabilityFoundation("knowledge-metrics")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function KnowledgeMetricsPage() {
  return <PlatformPageDetail page={page} />;
}
