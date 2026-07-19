import { describe, expect, it } from "vitest";

import { compileSafeDocument } from "@ai-agent-platform/document-content";

import {
  adminDocumentQuerySchema,
  createDocumentInputSchema,
  DOCUMENT_ERROR_CODES,
  documentDtoSchema,
  mutateDocumentInputSchema,
  parseAdminDocumentQuery,
  selectedDocumentDtoSchema,
} from "./contracts";

describe("document contracts", () => {
  it("exports only the reviewed stable domain and authorization codes", () => {
    expect(DOCUMENT_ERROR_CODES).toEqual([
      "DOCUMENT_INPUT_INVALID",
      "DOCUMENT_SOURCE_UNSAFE",
      "DOCUMENT_NOT_FOUND",
      "DOCUMENT_SLUG_CONFLICT",
      "DOCUMENT_REVISION_CONFLICT",
      "DOCUMENT_NOT_PUBLISHABLE",
      "DOCUMENT_STATE_CONFLICT",
      "AUTH_PERMISSION_DENIED",
    ]);
  });

  it("applies bounded deterministic admin query defaults", () => {
    expect(parseAdminDocumentQuery({})).toEqual({
      search: "",
      sort: "updated_desc",
      page: 1,
      pageSize: 20,
    });
    expect(
      adminDocumentQuerySchema.parse({
        search: "  gateway  ",
        status: "published",
        sort: "title_asc",
        page: "2",
        pageSize: 50,
      }),
    ).toEqual({
      search: "gateway",
      status: "published",
      sort: "title_asc",
      page: 2,
      pageSize: 50,
    });
  });

  it.each([
    { search: "x".repeat(121) },
    { status: "deleted" },
    { sort: "random" },
    { page: 0 },
    { page: 10_001 },
    { pageSize: 100 },
    { unexpected: true },
  ])("rejects unsafe admin query %#", (input) => {
    expect(adminDocumentQuerySchema.safeParse(input).success).toBe(false);
  });

  it("accepts a bounded safe document draft", () => {
    expect(
      createDocumentInputSchema.parse({
        slug: "quick-start",
        title: " Quick start ",
        summary: " Summary ",
        source: "# Quick start",
        navigation: { label: "Quick start", code: "START", position: 1 },
      }),
    ).toMatchObject({ title: "Quick start", summary: "Summary" });
  });

  it.each([
    { slug: "Bad Slug" },
    { title: "" },
    { summary: "" },
    { source: "" },
    { navigation: { label: "x", code: "bad", position: 1 } },
  ])("rejects unsafe draft field %#", (replacement) => {
    const draft = {
      slug: "quick-start",
      title: "Quick start",
      summary: "Summary",
      source: "# Quick start",
      navigation: { label: "Quick start", code: "START", position: 1 },
      ...replacement,
    };
    expect(createDocumentInputSchema.safeParse(draft).success).toBe(false);
  });

  it("requires positive CAS values and a UUID", () => {
    expect(
      mutateDocumentInputSchema.safeParse({
        id: "not-a-uuid",
        expectedRevision: 0,
        expectedRowVersion: -1,
      }).success,
    ).toBe(false);
  });

  it("validates complete DTOs and rejects corrupt render bodies or extra fields", () => {
    const body = compileSafeDocument({
      slug: "quick-start",
      title: "Quick start",
      summary: "Summary",
      source: "# Quick start",
      navigation: { label: "Quick start", code: "START", position: 1 },
    });
    const dto = {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "quick-start",
      title: "Quick start",
      summary: "Summary",
      status: "draft",
      revision: 1,
      rowVersion: 1,
      publishedRevision: null,
      deleted: false,
      updatedAt: "2026-07-20T00:00:00.000Z",
      body,
      publishedAt: null,
      archivedAt: null,
      deletedAt: null,
    };
    expect(documentDtoSchema.safeParse(dto).success).toBe(true);
    expect(
      selectedDocumentDtoSchema.safeParse({
        ...dto,
        revisionId: "00000000-0000-4000-8000-000000000099",
      }).success,
    ).toBe(true);
    expect(selectedDocumentDtoSchema.safeParse(dto).success).toBe(false);
    expect(
      selectedDocumentDtoSchema.safeParse({
        ...dto,
        revisionId: "derived-or-guessed",
      }).success,
    ).toBe(false);
    expect(
      documentDtoSchema.safeParse({
        ...dto,
        body: { ...body, checksum: "0".repeat(64) },
      }).success,
    ).toBe(false);
    expect(
      documentDtoSchema.safeParse({ ...dto, rawError: "secret" }).success,
    ).toBe(false);
  });
});
