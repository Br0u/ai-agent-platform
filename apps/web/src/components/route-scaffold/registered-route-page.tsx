import { matchRoute } from "@/config/routes";
import { navigationAnchorsForPath } from "@/config/navigation";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeaturePlaceholderPage } from "../feature-placeholder-page";
import { ScaffoldAnchorIndex } from "./scaffold-anchor-index";

export function metadataForRegisteredRoute(pathname: string): Metadata {
  const route = matchRoute(pathname);

  return {
    title: route
      ? `${route.title} · AI Agent Platform`
      : "页面未找到 · AI Agent Platform",
  };
}

export function RegisteredRoutePage({ pathname }: { pathname: string }) {
  const route = matchRoute(pathname);

  if (!route) notFound();

  const anchors = navigationAnchorsForPath(pathname);

  return (
    <main>
      <FeaturePlaceholderPage route={route}>
        {anchors.length ? <ScaffoldAnchorIndex anchors={anchors} /> : null}
      </FeaturePlaceholderPage>
    </main>
  );
}
