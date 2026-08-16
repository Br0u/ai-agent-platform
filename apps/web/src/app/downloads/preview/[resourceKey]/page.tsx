import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PdfViewer } from "@/components/downloads/pdf-viewer";
import { downloadResourceService } from "@/server/downloads/service";

type PageProps = { params: Promise<{ resourceKey: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "下载资源预览 · AI Agent Platform",
  robots: { index: false, follow: false },
};

export default async function DownloadPreviewPage({ params }: PageProps) {
  const { resourceKey } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(resourceKey)) notFound();

  const resource = (await downloadResourceService.listPublicResources()).find(
    (item) => item.key === resourceKey && item.previewPolicy === "public",
  );
  if (!resource) notFound();

  return (
    <PdfViewer
      backHref="/downloads"
      sourceUrl={`/api/v1/downloads/${resource.key}/preview`}
      title={resource.name}
    />
  );
}
