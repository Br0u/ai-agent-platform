import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PdfViewer } from "@/components/downloads/pdf-viewer";
import { requirePermission } from "@/server/auth/access";
import { mutateDownloadResourceInputSchema } from "@/server/downloads/contracts";
import { downloadResourceService } from "@/server/downloads/service";

type PageProps = { params: Promise<{ resourceId: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "下载资源草稿预览 · AI Agent Platform",
  robots: { index: false, follow: false },
};

export default async function AdminDownloadPreviewPage({ params }: PageProps) {
  await requirePermission("admin:downloads");
  const parsedId = mutateDownloadResourceInputSchema.shape.id.safeParse(
    (await params).resourceId,
  );
  if (!parsedId.success) notFound();

  const resource = await downloadResourceService.getAdminResource(
    parsedId.data,
  );
  const draft = resource?.draftRevision;
  if (!resource || !draft?.pdfObjectKey) notFound();

  return (
    <PdfViewer
      backHref="/admin/downloads"
      sourceUrl={`/api/v1/admin/downloads/${resource.id}/draft/pdf`}
      title={draft.name}
    />
  );
}
