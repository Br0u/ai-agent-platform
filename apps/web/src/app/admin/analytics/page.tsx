import { FeaturePlaceholderPage } from "@/components/feature-placeholder-page";
import { metadataForRegisteredRoute } from "@/components/route-scaffold/registered-route-page";
import { matchRoute } from "@/config/routes";
import { notFound } from "next/navigation";

const pathname = "/admin/analytics";

export const metadata = metadataForRegisteredRoute(pathname);

export default function AdminAnalyticsPage() {
  const route = matchRoute(pathname);

  if (!route) notFound();

  return (
    <main>
      <FeaturePlaceholderPage route={route} />
      <section aria-labelledby="analytics-empty-title">
        <h2 id="analytics-empty-title">暂无统计数据</h2>
        <p>数据采集接口尚未接入，本页面不会展示示例指标。</p>
      </section>
    </main>
  );
}
