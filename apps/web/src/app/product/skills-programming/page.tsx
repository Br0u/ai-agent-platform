import { PlatformPageDetail } from "@/components/platform-center-detail";
import { getSkillSubpage } from "@/components/skill-subpage-content";
import type { Metadata } from "next";

const page = getSkillSubpage("skills-programming")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function SkillsProgrammingPage() {
  return <PlatformPageDetail page={page} />;
}
