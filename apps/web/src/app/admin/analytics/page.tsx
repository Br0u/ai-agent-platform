import { FeaturePlaceholderPage } from "@/components/feature-placeholder-page";
import { metadataForRegisteredRoute } from "@/components/route-scaffold/registered-route-page";
import {
  ScaffoldAnchorIndex,
  ScaffoldEmptyState,
} from "@/components/route-scaffold/scaffold-anchor-index";
import { navigationAnchorsForPath } from "@/config/navigation";
import { matchRoute } from "@/config/routes";
import { requirePermission } from "@/server/auth/access";
import { notFound } from "next/navigation";

const pathname = "/admin/analytics";

export const metadata = metadataForRegisteredRoute(pathname);

export default async function AdminAnalyticsPage() {
  await requirePermission("admin:analytics");
  const route = matchRoute(pathname);

  if (!route) notFound();

  const anchors = navigationAnchorsForPath(pathname);

  return (
    <main>
      <FeaturePlaceholderPage route={route}>
        <ScaffoldAnchorIndex anchors={anchors} />
        <ScaffoldEmptyState
          id="analytics-empty"
          title="暂无统计数据"
          description="数据采集接口尚未接入，本页面不会展示示例指标。"
        />
      </FeaturePlaceholderPage>
    </main>
  );
}
