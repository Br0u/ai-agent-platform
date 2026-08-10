import { getPlatformCenter } from "@/components/platform-center-content";
import { PlatformCenterDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const center = getPlatformCenter("agents")!;

export const metadata: Metadata = {
  title: center.hero.title,
  description: center.hero.lead,
};

export default function AgentsCenterPage() {
  return <PlatformCenterDetail slug="agents" />;
}
