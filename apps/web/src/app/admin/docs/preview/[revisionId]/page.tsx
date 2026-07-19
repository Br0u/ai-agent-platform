import { and, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  content,
  contentRevisions,
  getDatabase,
} from "@ai-agent-platform/database";
import { SafeDocumentRenderer } from "@/components/documents/safe-document-renderer";
import { requirePermission } from "@/server/auth/access";
import { documentIdSchema } from "@/server/documents/contracts";
import "@/app/docs/docs-nextra.css";

type PageProps = {
  params: Promise<{ revisionId: string }>;
};

type PreviewRevision = {
  id: string;
  slug: string;
  title: string;
  revision: number;
  body: unknown;
};

type PreviewDependencies = {
  authorize(permission: "admin:docs"): Promise<unknown>;
  findRevision(revisionId: string): Promise<PreviewRevision | null>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "文档修订预览",
  robots: { index: false, follow: false },
};

async function findDocumentRevision(
  revisionId: string,
): Promise<PreviewRevision | null> {
  const rows = await getDatabase()
    .select({
      id: contentRevisions.id,
      slug: contentRevisions.slug,
      title: contentRevisions.title,
      revision: contentRevisions.revision,
      body: contentRevisions.body,
    })
    .from(contentRevisions)
    .innerJoin(content, eq(contentRevisions.contentId, content.id))
    .where(
      and(
        eq(contentRevisions.id, revisionId),
        eq(content.type, "document"),
        isNull(content.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

const defaultDependencies: PreviewDependencies = {
  authorize: requirePermission,
  findRevision: findDocumentRevision,
};

function createDocumentRevisionPreviewPage(
  dependencies: PreviewDependencies = defaultDependencies,
) {
  return async function DocumentRevisionPreviewPage({ params }: PageProps) {
    await dependencies.authorize("admin:docs");

    const parsedRevisionId = documentIdSchema.safeParse(
      (await params).revisionId,
    );
    if (!parsedRevisionId.success) notFound();

    const revision = await dependencies.findRevision(parsedRevisionId.data);
    if (!revision) notFound();

    return (
      <main className="admin-document-preview">
        <header className="admin-document-preview__header">
          <span>受控修订预览</span>
          <h1>{revision.title}</h1>
          <p>
            修订 {revision.revision} · {revision.slug}
          </p>
        </header>
        <article className="docs-detail__body admin-document-preview__body">
          <SafeDocumentRenderer body={revision.body} />
        </article>
      </main>
    );
  };
}

export default createDocumentRevisionPreviewPage();
