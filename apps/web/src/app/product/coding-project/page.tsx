import { getCodingSubpage } from "@/components/coding-subpage-content";
import { PlatformPageDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const page = getCodingSubpage("coding-project")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function CodingProjectPage() {
  return <PlatformPageDetail page={page} />;
}
