import { getModelSubpage } from "@/components/model-subpage-content";
import { PlatformPageDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const page = getModelSubpage("model-assets")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function ModelAssetsPage() {
  return <PlatformPageDetail page={page} />;
}
