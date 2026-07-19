import { describe, expect, it, vi } from "vitest";

import {
  compileSafeDocument,
  DOCUMENT_LIMITS,
} from "@ai-agent-platform/document-content";

import { DocumentError } from "./contracts";
import {
  createDocumentService,
  type DocumentRepository,
  type DocumentTransaction,
  type LockedDocument,
} from "./service";

const actor = { userId: "00000000-0000-4000-8000-000000000001" };
const id = "00000000-0000-4000-8000-000000000010";

function draft(slug = "quick-start") {
  return {
    slug,
    title: `Title ${slug}`,
    summary: `Summary ${slug}`,
    source: `# ${slug}`,
    navigation: { label: slug, code: "START", position: 1 },
  };
}

function initialDocument(
  overrides: Partial<LockedDocument> = {},
): LockedDocument {
  return {
    id,
    slug: "quick-start",
    title: "Quick start",
    summary: "Summary",
    body: compileSafeDocument(draft()),
    status: "draft",
    revision: 1,
    rowVersion: 1,
    publishedRevision: null,
    publishedAt: null,
    archivedAt: null,
    deletedAt: null,
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    ...overrides,
  };
}

function cloneDocument(value: LockedDocument | null): LockedDocument | null {
  return value
    ? {
        ...value,
        body: structuredClone(value.body),
        updatedAt: new Date(value.updatedAt),
        publishedAt: value.publishedAt ? new Date(value.publishedAt) : null,
        archivedAt: value.archivedAt ? new Date(value.archivedAt) : null,
        deletedAt: value.deletedAt ? new Date(value.deletedAt) : null,
      }
    : null;
}

function fixture(document: LockedDocument | null = initialDocument()) {
  const state = {
    document: cloneDocument(document),
    revisions: document ? [structuredClone(document.body)] : [],
    routes: new Map<string, "reserved" | "canonical" | "alias">(
      document ? [[document.slug, "reserved"]] : [],
    ),
    audits: [] as string[],
  };
  const commands: string[] = [];
  let permissionFailure = false;
  let auditFailure = false;

  const repository: DocumentRepository = {
    async transaction(work) {
      const local = {
        document: cloneDocument(state.document),
        revisions: [...state.revisions],
        routes: new Map(state.routes),
        audits: [...state.audits],
      };
      const requireDocument = () => {
        if (!local.document) throw new Error("missing document");
        return local.document;
      };
      const tx: DocumentTransaction = {
        async assertActiveWorkforcePermission(_userId, permission, options) {
          commands.push(
            `permission:${permission}:${options?.requireSuperAdmin === true}`,
          );
          if (permissionFailure)
            throw new DocumentError("AUTH_PERMISSION_DENIED");
        },
        async lockDocument() {
          commands.push("lock");
          return cloneDocument(local.document);
        },
        async insertDocument(input) {
          commands.push("insert");
          if (local.document) throw new Error("already exists");
          local.document = initialDocument({
            id,
            slug: input.slug,
            title: input.title,
            summary: input.summary,
            body: input.body,
          });
          return cloneDocument(local.document)!;
        },
        async reserveSlug(slug) {
          commands.push(`reserve:${slug}`);
          const existing = local.routes.get(slug);
          if (existing === "alias")
            throw new DocumentError("DOCUMENT_SLUG_CONFLICT");
          if (existing === "reserved" || existing === "canonical") return;
          local.routes.set(slug, "reserved");
        },
        async appendRevision(input) {
          commands.push(`revision:${input.revision}`);
          local.revisions.push(input.body);
        },
        async saveDraft(input) {
          commands.push("save");
          local.document = {
            ...requireDocument(),
            slug: input.slug,
            title: input.title,
            summary: input.summary,
            body: input.body,
            revision: input.revision,
            rowVersion: input.rowVersion,
            updatedAt: new Date("2026-07-20T00:01:00.000Z"),
          };
          return cloneDocument(local.document)!;
        },
        async lockRouteState(slug) {
          commands.push(`route:${slug}`);
          return local.routes.get(slug) ?? null;
        },
        async lockCanonicalSlug() {
          commands.push("canonical");
          for (const [slug, status] of local.routes) {
            if (status === "canonical") return slug;
          }
          return null;
        },
        async demoteCanonicalToAlias(slug) {
          commands.push(`alias:${slug}`);
          if (local.routes.get(slug) !== "canonical")
            throw new Error("bad route");
          local.routes.set(slug, "alias");
        },
        async promoteReservedToCanonical(slug) {
          commands.push(`promote:${slug}`);
          if (local.routes.get(slug) !== "reserved")
            throw new DocumentError("DOCUMENT_NOT_PUBLISHABLE");
          local.routes.set(slug, "canonical");
        },
        async publishDocument(input) {
          commands.push("publish");
          local.document = {
            ...requireDocument(),
            status: "published",
            publishedRevision: input.revision,
            publishedAt: new Date("2026-07-20T00:02:00.000Z"),
            archivedAt: null,
            rowVersion: input.rowVersion,
          };
          return cloneDocument(local.document)!;
        },
        async archiveDocument(input) {
          commands.push("archive");
          local.document = {
            ...requireDocument(),
            status: "archived",
            archivedAt: new Date("2026-07-20T00:03:00.000Z"),
            rowVersion: input.rowVersion,
          };
          return cloneDocument(local.document)!;
        },
        async deleteDocument(input) {
          commands.push("delete");
          local.document = {
            ...requireDocument(),
            status: "archived",
            archivedAt: new Date("2026-07-20T00:04:00.000Z"),
            deletedAt: new Date("2026-07-20T00:04:00.000Z"),
            rowVersion: input.rowVersion,
          };
          return cloneDocument(local.document)!;
        },
        async restoreDocument(input) {
          commands.push("restore");
          local.document = {
            ...requireDocument(),
            status: "archived",
            deletedAt: null,
            rowVersion: input.rowVersion,
          };
          return cloneDocument(local.document)!;
        },
        async appendAudit(event) {
          commands.push(`audit:${event.event}`);
          if (auditFailure) throw new Error("audit unavailable");
          local.audits.push(event.event);
        },
      };
      const result = await work(tx);
      state.document = local.document;
      state.revisions = local.revisions;
      state.routes = local.routes;
      state.audits = local.audits;
      return result;
    },
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getById: vi.fn().mockResolvedValue(null),
  };

  return {
    state,
    commands,
    service: createDocumentService(repository),
    failPermission() {
      permissionFailure = true;
    },
    failAudit() {
      auditFailure = true;
    },
    repository,
  };
}

function cas(document: LockedDocument) {
  return {
    id: document.id,
    expectedRevision: document.revision,
    expectedRowVersion: document.rowVersion,
  };
}

describe("document service", () => {
  it("creates one immutable revision, reserves the slug and audits in one transaction", async () => {
    const value = fixture(null);
    const result = await value.service.create(draft(), actor);

    expect(result).toMatchObject({
      revision: 1,
      rowVersion: 1,
      status: "draft",
    });
    expect(value.state.revisions).toHaveLength(1);
    expect(value.state.routes.get("quick-start")).toBe("reserved");
    expect(value.commands).toEqual([
      "permission:admin:docs:false",
      "insert",
      "reserve:quick-start",
      "revision:1",
      "audit:document.created",
    ]);
  });

  it("saves with CAS, appends exactly one revision and preserves published isolation", async () => {
    const current = initialDocument({
      status: "published",
      publishedRevision: 1,
    });
    const value = fixture(current);
    value.state.routes.set(current.slug, "canonical");

    const result = await value.service.save(
      { ...draft("operations"), ...cas(current) },
      actor,
    );

    expect(result).toMatchObject({
      slug: "operations",
      revision: 2,
      rowVersion: 2,
      status: "published",
      publishedRevision: 1,
    });
    expect(value.state.revisions).toHaveLength(2);
    expect(value.state.routes.get("operations")).toBe("reserved");
    expect(value.state.routes.get("quick-start")).toBe("canonical");
  });

  it("publishes a renamed draft and permanently aliases the old canonical route", async () => {
    const current = initialDocument({
      slug: "operations",
      revision: 2,
      rowVersion: 2,
      status: "published",
      publishedRevision: 1,
    });
    const value = fixture(current);
    value.state.routes.clear();
    value.state.routes.set("quick-start", "canonical");
    value.state.routes.set("operations", "reserved");

    const published = await value.service.publish(cas(current), actor);

    expect(published).toMatchObject({
      status: "published",
      publishedRevision: 2,
      revision: 2,
      rowVersion: 3,
    });
    expect(value.state.revisions).toHaveLength(1);
    expect(value.state.routes.get("quick-start")).toBe("alias");
    expect(value.state.routes.get("operations")).toBe("canonical");
    expect(value.commands.slice(0, 2)).toEqual([
      "permission:admin:docs:false",
      "lock",
    ]);
  });

  it("never allows a permanent alias to be reserved or canonical again", async () => {
    const current = initialDocument({
      slug: "operations",
      revision: 2,
      rowVersion: 3,
      status: "published",
      publishedRevision: 2,
    });
    const value = fixture(current);
    value.state.routes.clear();
    value.state.routes.set("quick-start", "alias");
    value.state.routes.set("operations", "canonical");

    await expect(
      value.service.save({ ...draft("quick-start"), ...cas(current) }, actor),
    ).rejects.toMatchObject({ code: "DOCUMENT_SLUG_CONFLICT" });
    expect(value.state.document).toEqual(current);
  });

  it("reuses the current canonical route across published A to draft B to draft A", async () => {
    const current = initialDocument({
      status: "published",
      publishedRevision: 1,
    });
    const value = fixture(current);
    value.state.routes.set("quick-start", "canonical");

    const draftB = await value.service.save(
      { ...draft("operations"), ...cas(current) },
      actor,
    );
    const draftA = await value.service.save(
      {
        ...draft("quick-start"),
        id,
        expectedRevision: draftB.revision,
        expectedRowVersion: draftB.rowVersion,
      },
      actor,
    );
    const publishedA = await value.service.publish(
      {
        id,
        expectedRevision: draftA.revision,
        expectedRowVersion: draftA.rowVersion,
      },
      actor,
    );

    expect(publishedA).toMatchObject({
      slug: "quick-start",
      revision: 3,
      publishedRevision: 3,
      rowVersion: 4,
    });
    expect(value.state.routes.get("quick-start")).toBe("canonical");
    expect(value.state.routes.get("operations")).toBe("reserved");
  });

  it("reuses the same reserved route across pure draft A to B to A", async () => {
    const current = initialDocument();
    const value = fixture(current);

    const draftB = await value.service.save(
      { ...draft("operations"), ...cas(current) },
      actor,
    );
    const draftA = await value.service.save(
      {
        ...draft("quick-start"),
        id,
        expectedRevision: draftB.revision,
        expectedRowVersion: draftB.rowVersion,
      },
      actor,
    );
    const publishedA = await value.service.publish(
      {
        id,
        expectedRevision: draftA.revision,
        expectedRowVersion: draftA.rowVersion,
      },
      actor,
    );

    expect(publishedA).toMatchObject({
      slug: "quick-start",
      revision: 3,
      publishedRevision: 3,
      rowVersion: 4,
    });
    expect(value.state.routes.get("quick-start")).toBe("canonical");
    expect(value.state.routes.get("operations")).toBe("reserved");
  });

  it("rejects stale CAS before any business write or audit", async () => {
    const current = initialDocument();
    const value = fixture(current);

    await expect(
      value.service.archive(
        { ...cas(current), expectedRowVersion: current.rowVersion + 1 },
        actor,
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_REVISION_CONFLICT" });
    expect(value.commands).toEqual(["permission:admin:docs:false", "lock"]);
    expect(value.state.audits).toEqual([]);
  });

  it("enforces exact archive/delete/restore lifecycle and row versions", async () => {
    const current = initialDocument({
      status: "published",
      publishedRevision: 1,
    });
    const value = fixture(current);
    value.state.routes.set(current.slug, "canonical");

    const archived = await value.service.archive(cas(current), actor);
    expect(archived).toMatchObject({ status: "archived", rowVersion: 2 });
    await expect(
      value.service.archive(cas(archived as never), actor),
    ).rejects.toMatchObject({
      code: "DOCUMENT_STATE_CONFLICT",
    });

    const deleted = await value.service.delete(
      {
        id,
        expectedRevision: archived.revision,
        expectedRowVersion: archived.rowVersion,
      },
      actor,
    );
    expect(deleted).toMatchObject({
      status: "archived",
      deleted: true,
      rowVersion: 3,
    });

    const restored = await value.service.restore(
      {
        id,
        expectedRevision: deleted.revision,
        expectedRowVersion: deleted.rowVersion,
      },
      actor,
    );
    expect(restored).toMatchObject({
      status: "archived",
      deleted: false,
      rowVersion: 4,
    });
    expect(value.state.revisions).toHaveLength(1);
    expect(value.commands).toContain("permission:admin:docs:delete:true");
  });

  it("allows an archived same-revision document to be republished once", async () => {
    const current = initialDocument({
      status: "archived",
      publishedRevision: 1,
      rowVersion: 2,
    });
    const value = fixture(current);
    value.state.routes.set(current.slug, "canonical");

    const published = await value.service.publish(cas(current), actor);
    expect(published).toMatchObject({ status: "published", rowVersion: 3 });
    await expect(
      value.service.publish(
        {
          id,
          expectedRevision: published.revision,
          expectedRowVersion: published.rowVersion,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_STATE_CONFLICT" });
  });

  it("rolls back business writes when audit fails", async () => {
    const current = initialDocument();
    const value = fixture(current);
    value.failAudit();

    await expect(
      value.service.save({ ...draft("operations"), ...cas(current) }, actor),
    ).rejects.toThrow("audit unavailable");
    expect(value.state.document).toEqual(current);
    expect(value.state.revisions).toHaveLength(1);
    expect(value.state.routes.has("operations")).toBe(false);
  });

  it("performs permission authorization before any business access", async () => {
    const current = initialDocument();
    const value = fixture(current);
    value.failPermission();

    await expect(
      value.service.save({ ...draft(), ...cas(current) }, actor),
    ).rejects.toMatchObject({
      code: "AUTH_PERMISSION_DENIED",
    });
    expect(value.commands).toEqual(["permission:admin:docs:false"]);
  });

  it("validates unsafe inputs before opening a transaction", async () => {
    const value = fixture();
    await expect(
      value.service.create({ ...draft(), slug: "Unsafe Slug" }, actor),
    ).rejects.toMatchObject({
      code: "DOCUMENT_INPUT_INVALID",
      field: "slug",
    });
    expect(value.commands).toEqual([]);
  });

  it.each([
    ["unsafe URL", "[x](javascript:alert(1))"],
    ["raw HTML", "<script>alert(1)</script>"],
    ["MDX module", "import value from 'unsafe'"],
    ["MDX expression", "# Hello {process.env.SECRET}"],
    ["unknown directive", ":::unknown\ntext\n:::"],
  ])(
    "maps %s compiler failures to one source-safe code",
    async (_name, source) => {
      const value = fixture(null);
      const request = value.service.create({ ...draft(), source }, actor);

      await expect(request).rejects.toMatchObject({
        code: "DOCUMENT_SOURCE_UNSAFE",
        message: "DOCUMENT_SOURCE_UNSAFE",
      });
      await expect(request).rejects.not.toThrow(
        /DOCUMENT_(URL|MARKDOWN|DIRECTIVE)/u,
      );
      expect(value.commands).toEqual([]);
    },
  );

  it("maps oversized source to input-invalid without returning a compiler message", async () => {
    const value = fixture(null);
    const request = value.service.create(
      {
        ...draft(),
        source: "é".repeat(Math.floor(DOCUMENT_LIMITS.sourceBytes / 2) + 1),
      },
      actor,
    );

    await expect(request).rejects.toMatchObject({
      code: "DOCUMENT_INPUT_INVALID",
      message: "DOCUMENT_INPUT_INVALID",
      field: "source",
    });
    expect(value.commands).toEqual([]);
  });

  it("delegates validated pagination, search, status and sort", async () => {
    const value = fixture();
    await value.service.list(
      {
        search: "  gateway  ",
        status: "published",
        sort: "title_desc",
        page: 2,
        pageSize: 10,
      },
      actor,
    );
    expect(value.repository.list).toHaveBeenCalledWith(
      {
        search: "gateway",
        status: "published",
        sort: "title_desc",
        page: 2,
        pageSize: 10,
      },
      actor.userId,
    );
  });
});
