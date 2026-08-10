import { getPlatformCenter } from "@/components/platform-center-content";
import type { Metadata } from "next";

const center = getPlatformCenter("knowledge")!;

export const metadata: Metadata = {
  title: center.hero.title,
  description: center.hero.lead,
};

export default function KnowledgeCenterPage() {
  return (
    <main>
      <h1>{center.hero.title}</h1>
    </main>
  );
}
