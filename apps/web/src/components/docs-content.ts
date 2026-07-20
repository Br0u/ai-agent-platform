import "server-only";

import { getDatabase } from "@ai-agent-platform/database";
import {
  safeDocumentBodyV1Schema,
  type SafeDocumentBodyV1,
} from "@ai-agent-platform/document-content";
import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

export type PublicDocument = {
  id: string;
  revision: number;
  slug: string;
  title: string;
  summary: string;
  body: SafeDocumentBodyV1;
  navigation: SafeDocumentBodyV1["navigation"];
};

export type PublicDocumentRoute =
  | { kind: "canonical"; canonicalSlug: string }
  | { kind: "alias"; canonicalSlug: string }
  | { kind: "reserved"; canonicalSlug: string };

export type PublishedDocumentCatalog = {
  documents: PublicDocument[];
  routes: Record<string, PublicDocumentRoute>;
};

type PublicationRow = {
  id: unknown;
  revision: unknown;
  revisionSlug: unknown;
  canonicalSlug: unknown;
  title: unknown;
  summary: unknown;
  body: unknown;
  routeSlug: unknown;
  routeState: unknown;
};

type PublicationDraft = {
  document: PublicDocument;
  routes: Array<{
    slug: string;
    state: "reserved" | "canonical" | "alias";
  }>;
};

export class PublicDocumentsAvailabilityError extends Error {
  readonly code = "PUBLIC_DOCUMENTS_UNAVAILABLE";

  constructor(options?: ErrorOptions) {
    super("Published documents are unavailable", options);
    this.name = "PublicDocumentsAvailabilityError";
  }
}

export function isPublicDocumentsAvailabilityError(
  error: unknown,
): error is PublicDocumentsAvailabilityError {
  return error instanceof PublicDocumentsAvailabilityError;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid publication row: ${field}`);
  }
  return value;
}

function requiredSlug(value: unknown, field: string): string {
  const slug = requiredString(value, field);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new Error(`Invalid publication row: ${field}`);
  }
  return slug;
}

function requiredRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("Invalid publication row: revision");
  }
  return value;
}

function routeState(value: unknown): "reserved" | "canonical" | "alias" {
  if (value !== "reserved" && value !== "canonical" && value !== "alias") {
    throw new Error("Invalid publication row: route state");
  }
  return value;
}

function samePublication(left: PublicDocument, right: PublicDocument): boolean {
  return (
    left.revision === right.revision &&
    left.slug === right.slug &&
    left.title === right.title &&
    left.summary === right.summary &&
    left.body.checksum === right.body.checksum
  );
}

function catalogFromRows(
  rows: readonly PublicationRow[],
): PublishedDocumentCatalog {
  const byId = new Map<string, PublicationDraft>();
  const seenRouteSlugs = new Set<string>();

  for (const row of rows) {
    const id = requiredString(row.id, "id");
    const revision = requiredRevision(row.revision);
    const revisionSlug = requiredSlug(row.revisionSlug, "revision slug");
    const canonicalSlug = requiredSlug(row.canonicalSlug, "canonical slug");
    if (revisionSlug !== canonicalSlug) {
      throw new Error("Published revision does not match its canonical route");
    }
    const title = requiredString(row.title, "title");
    const summary =
      row.summary === null ? "" : requiredString(row.summary, "summary");
    const parsedBody = safeDocumentBodyV1Schema.safeParse(row.body);
    if (!parsedBody.success) {
      throw new Error("Invalid published document body");
    }
    const document: PublicDocument = {
      id,
      revision,
      slug: canonicalSlug,
      title,
      summary,
      body: parsedBody.data,
      navigation: parsedBody.data.navigation,
    };
    const route = {
      slug: requiredSlug(row.routeSlug, "route slug"),
      state: routeState(row.routeState),
    };

    if (seenRouteSlugs.has(route.slug)) {
      throw new Error("Duplicate published document route");
    }
    seenRouteSlugs.add(route.slug);

    const existing = byId.get(id);
    if (existing) {
      if (!samePublication(existing.document, document)) {
        throw new Error("Inconsistent published revision rows");
      }
      existing.routes.push(route);
    } else {
      byId.set(id, { document, routes: [route] });
    }
  }

  const documents: PublicDocument[] = [];
  const routes: Record<string, PublicDocumentRoute> = Object.create(
    null,
  ) as Record<string, PublicDocumentRoute>;

  for (const draft of byId.values()) {
    const canonicalRoutes = draft.routes.filter(
      (route) => route.state === "canonical",
    );
    if (
      canonicalRoutes.length !== 1 ||
      canonicalRoutes[0]?.slug !== draft.document.slug
    ) {
      throw new Error("Invalid canonical publication route");
    }

    const canonicalSlug = canonicalRoutes[0].slug;
    documents.push(draft.document);
    for (const route of draft.routes) {
      routes[route.slug] = { kind: route.state, canonicalSlug };
    }
  }

  documents.sort(
    (left, right) =>
      left.navigation.position - right.navigation.position ||
      (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0),
  );

  return { documents, routes };
}

async function queryPublishedDocumentCatalog(): Promise<PublishedDocumentCatalog> {
  const result = await getDatabase().execute(sql`
    SELECT
      c.id AS "id",
      cr.revision AS "revision",
      cr.slug AS "revisionSlug",
      canonical_route.slug AS "canonicalSlug",
      cr.title AS "title",
      cr.summary AS "summary",
      cr.body AS "body",
      route.slug AS "routeSlug",
      route.state::text AS "routeState"
    FROM content AS c
    INNER JOIN content_revisions AS cr
      ON cr.content_id = c.id
     AND cr.revision = c.published_revision
    LEFT JOIN content_routes AS route
      ON route.content_id = c.id
    LEFT JOIN content_routes AS canonical_route
      ON canonical_route.content_id = c.id
     AND canonical_route.state = 'canonical'
    WHERE c.type = 'document'
      AND c.status = 'published'
      AND c.deleted_at IS NULL
      AND c.published_revision IS NOT NULL
    ORDER BY c.id, route.slug
  `);

  return catalogFromRows(result.rows as PublicationRow[]);
}

const CATALOG_CACHE_SCOPE = "catalog" as const;

const readPublishedDocumentCatalogCached = unstable_cache(
  async (
    scope: typeof CATALOG_CACHE_SCOPE,
  ): Promise<PublishedDocumentCatalog> => {
    if (scope !== CATALOG_CACHE_SCOPE) {
      throw new PublicDocumentsAvailabilityError();
    }
    try {
      return await queryPublishedDocumentCatalog();
    } catch (error) {
      if (isPublicDocumentsAvailabilityError(error)) throw error;
      throw new PublicDocumentsAvailabilityError({ cause: error });
    }
  },
  ["published-document-catalog-v1"],
  { tags: ["documents"] },
);

export function readPublishedDocumentCatalog(): Promise<PublishedDocumentCatalog> {
  return readPublishedDocumentCatalogCached(CATALOG_CACHE_SCOPE);
}
