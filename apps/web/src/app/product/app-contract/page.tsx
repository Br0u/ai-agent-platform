import { getApplicationSubpage } from "@/components/application-subpage-content";
import { PlatformPageDetail } from "@/components/platform-center-detail";
import type { Metadata } from "next";

const page = getApplicationSubpage("app-contract")!;

export const metadata: Metadata = {
  title: page.hero.title,
  description: page.hero.lead,
};

export default function AppContractPage() {
  return <PlatformPageDetail page={page} />;
}
