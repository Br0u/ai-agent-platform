import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { DocsDetailLayout } from "@/components/docs-detail-layout";
import { PublicDocsChrome } from "@/components/doc-reader-layout";
import {
  isPublicDocumentsAvailabilityError,
  readPublishedDocumentCatalog,
  type PublishedDocumentCatalog,
  type PublicDocument,
} from "@/components/docs-content";
import { SafeDocumentRenderer } from "@/components/documents/safe-document-renderer";
import { documentDraftSchema } from "@/server/documents/contracts";

type PageProps = {
  params: Promise<{ category: string }>;
};

export const dynamic = "force-dynamic";

function parseCategorySlug(value: string): string {
  const parsed = documentDraftSchema.shape.slug.safeParse(value);
  if (!parsed.success) notFound();
  return parsed.data;
}

function resolvePublishedDocument(
  catalog: PublishedDocumentCatalog,
  slug: string,
): PublicDocument {
  const route = catalog.routes[slug];
  if (!route || route.kind === "reserved") notFound();
  if (route.kind === "alias") {
    permanentRedirect(`/docs/${route.canonicalSlug}`);
  }
  const document = catalog.documents.find(
    (candidate) => candidate.slug === route.canonicalSlug,
  );
  if (!document) notFound();
  return document;
}

async function loadCatalog() {
  try {
    return await readPublishedDocumentCatalog();
  } catch (error) {
    if (isPublicDocumentsAvailabilityError(error)) return null;
    throw error;
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const category = parseCategorySlug((await params).category);
  const catalog = await loadCatalog();
  if (!catalog) {
    return {
      title: "文档暂不可用 · AI Agent Platform",
      robots: { index: false, follow: false },
    };
  }
  const document = resolvePublishedDocument(catalog, category);

  return { title: document.title, description: document.summary };
}

export default async function DocsDocumentPage({ params }: PageProps) {
  const resolvedParams = await params;
  const category = parseCategorySlug(resolvedParams.category);
  const catalog = await loadCatalog();
  if (!catalog) {
    return (
      <PublicDocsChrome documents={[]}>
        <main className="docs-detail__unavailable" role="alert">
          文档暂不可用，请稍后重试。
        </main>
      </PublicDocsChrome>
    );
  }
  const document = resolvePublishedDocument(catalog, category);

  return (
    <DocsDetailLayout
      documents={catalog.documents}
      currentSlug={document.slug}
      title={document.title}
      description={document.summary}
      toc={document.body.renderModel.toc}
    >
      <SafeDocumentRenderer body={document.body} />
    </DocsDetailLayout>
  );
}
