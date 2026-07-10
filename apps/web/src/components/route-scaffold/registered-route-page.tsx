import { matchRoute } from "@/config/routes";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeaturePlaceholderPage } from "../feature-placeholder-page";

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

  return (
    <main>
      <FeaturePlaceholderPage route={route} />
    </main>
  );
}
