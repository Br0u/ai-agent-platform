import Link from "next/link";
import type { PublicDocument } from "./docs-content";

export function DocCategoryCards({
  documents,
}: {
  documents: readonly PublicDocument[];
}) {
  return (
    <div className="doc-cards-grid">
      {documents.map((document) => (
        <Link
          href={`/docs/${document.slug}`}
          key={document.id}
          className="doc-card doc-card--category"
        >
          <span className="doc-card__code">{document.navigation.code}</span>
          <h3 className="doc-card__title">{document.title}</h3>
          <p className="doc-card__desc">{document.summary}</p>
          <span className="doc-card__arrow" aria-hidden="true">
            →
          </span>
        </Link>
      ))}
    </div>
  );
}
