import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { computeSafeDocumentChecksum } from "@ai-agent-platform/document-content";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));
  return {
    and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
    eq: vi.fn((left: unknown, right: unknown) => ({ eq: [left, right] })),
    from,
    getDatabase: vi.fn(() => ({ select })),
    innerJoin,
    isNull: vi.fn((value: unknown) => ({ isNull: value })),
    limit,
    notFound: vi.fn(),
    requirePermission: vi.fn(),
    select,
    where,
  };
});

vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  eq: mocks.eq,
  isNull: mocks.isNull,
}));
vi.mock("@ai-agent-platform/database", () => ({
  content: {
    id: "content.id",
    type: "content.type",
    deletedAt: "content.deletedAt",
  },
  contentRevisions: {
    id: "contentRevisions.id",
    contentId: "contentRevisions.contentId",
    slug: "contentRevisions.slug",
    title: "contentRevisions.title",
    revision: "contentRevisions.revision",
    body: "contentRevisions.body",
  },
  getDatabase: mocks.getDatabase,
}));
vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import DocumentRevisionPreviewPage, { metadata } from "./page";

const revisionId = "019f7b47-3040-7000-8000-000000000099";
const notFoundError = new Error("NEXT_NOT_FOUND");

function safeBody() {
  const unsigned = {
    format: "safe-markdown-v1" as const,
    source: "## 预览正文",
    navigation: { label: "预览", code: "PREVIEW", position: 1 },
    renderModel: {
      version: 1 as const,
      root: {
        type: "root" as const,
        children: [
          {
            type: "element" as const,
            tagName: "h2",
            properties: { id: "doc-content-preview" },
            children: [{ type: "text" as const, value: "预览正文" }],
          },
        ],
      },
      toc: [{ id: "doc-content-preview", title: "预览正文", depth: 2 }],
    },
  };
  return { ...unsigned, checksum: computeSafeDocumentChecksum(unsigned) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.limit.mockResolvedValue([]);
  mocks.notFound.mockImplementation(() => {
    throw notFoundError;
  });
});

afterEach(cleanup);

describe("document revision preview page", () => {
  it("authorizes admin:docs before reading any revision", async () => {
    const denied = new Error("denied");
    mocks.requirePermission.mockRejectedValue(denied);

    await expect(
      DocumentRevisionPreviewPage({ params: Promise.resolve({ revisionId }) }),
    ).rejects.toBe(denied);

    expect(mocks.requirePermission).toHaveBeenCalledWith("admin:docs");
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("validates the revision UUID after authorization and returns 404 without a read", async () => {
    await expect(
      DocumentRevisionPreviewPage({
        params: Promise.resolve({ revisionId: "not-a-uuid" }),
      }),
    ).rejects.toBe(notFoundError);

    expect(mocks.requirePermission).toHaveBeenCalledWith("admin:docs");
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it("loads the exact immutable revision id and renders its safe body", async () => {
    mocks.limit.mockResolvedValue([
      {
        id: revisionId,
        slug: "quick-start",
        title: "快速开始（修订 3）",
        revision: 3,
        body: safeBody(),
      },
    ]);

    render(
      await DocumentRevisionPreviewPage({
        params: Promise.resolve({ revisionId }),
      }),
    );

    expect(mocks.eq).toHaveBeenCalledWith("contentRevisions.id", revisionId);
    expect(mocks.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getDatabase.mock.invocationCallOrder[0]!,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "快速开始（修订 3）" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 2, name: "预览正文" }),
    ).toHaveAttribute("id", "doc-content-preview");
    expect(screen.getByText("修订 3 · quick-start")).toBeVisible();
  });

  it("returns 404 when the exact revision is missing or its document is deleted", async () => {
    await expect(
      DocumentRevisionPreviewPage({ params: Promise.resolve({ revisionId }) }),
    ).rejects.toBe(notFoundError);
  });

  it("is noindex, nofollow and queries by revision id with document/deletion guards", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });

    const source = readFileSync(
      join(process.cwd(), "src/app/admin/docs/preview/[revisionId]/page.tsx"),
      "utf8",
    );
    expect(source).toContain("eq(contentRevisions.id, revisionId)");
    expect(source).toContain('eq(content.type, "document")');
    expect(source).toContain("isNull(content.deletedAt)");
    expect(source).toMatch(/innerJoin\(\s*content/u);
    expect(source).not.toContain("documentId+");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).toContain('import "@/app/docs/docs-nextra.css"');
  });
});
