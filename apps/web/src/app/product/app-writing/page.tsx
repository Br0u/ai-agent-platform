import { getApplicationSubpage } from "@/components/application-subpage-content";
import { PlatformPageDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const page = getApplicationSubpage("app-writing")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function AppWritingPage() {
  return <PlatformPageDetail page={page} />;
}
