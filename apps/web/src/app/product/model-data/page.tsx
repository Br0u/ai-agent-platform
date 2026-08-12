import { getModelSubpage } from "@/components/model-subpage-content";
import { PlatformPageDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const page = getModelSubpage("model-data")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function ModelDataPage() {
  return <PlatformPageDetail page={page} />;
}
