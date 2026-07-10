import { FeaturePlaceholderPage } from "@/components/feature-placeholder-page";
import { matchRoute } from "@/config/routes";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type PortalPageProps = {
  params: Promise<{ slug: string[] }>;
};

function pathnameFromSegments(segments: string[]) {
  return `/${segments.join("/")}`;
}

export async function generateMetadata({
  params,
}: PortalPageProps): Promise<Metadata> {
  const { slug } = await params;
  const route = matchRoute(pathnameFromSegments(slug));

  return {
    title: route ? `${route.title} · 华鲲元启` : "页面未找到 · 华鲲元启",
  };
}

export default async function PortalPage({ params }: PortalPageProps) {
  const { slug } = await params;
  const route = matchRoute(pathnameFromSegments(slug));

  if (!route) notFound();

  return (
    <main>
      <FeaturePlaceholderPage route={route} />
    </main>
  );
}
