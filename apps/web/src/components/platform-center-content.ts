import { knowledgeCenter } from "./knowledge-center-content";
import { v2PlatformCenters } from "./platform-center-v2-content";
import type { PlatformPage } from "./platform-page-types";

export const platformCenterSlugs = [
  "model",
  "knowledge",
  "agents",
  "applications",
  "skills",
  "coding",
  "governance",
] as const;

const platformCenters = [
  ...v2PlatformCenters,
  knowledgeCenter,
] as const satisfies readonly PlatformPage[];

export function getPlatformCenter(slug: string): PlatformPage | undefined {
  return platformCenters.find((center) => center.slug === slug);
}
