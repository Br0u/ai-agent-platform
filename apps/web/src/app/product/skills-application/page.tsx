import { PlatformPageDetail } from "@/components/platform-center-detail";
import { getSkillSubpage } from "@/components/skill-subpage-content";
import type { Metadata } from "next";

const page = getSkillSubpage("skills-application")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function SkillsApplicationPage() {
  return <PlatformPageDetail page={page} />;
}
