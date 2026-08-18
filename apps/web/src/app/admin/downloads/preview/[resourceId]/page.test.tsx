import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  notFound: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { getTypedAdminResource: mocks.get },
}));
vi.mock("@/components/downloads/pdf-viewer", () => ({
  PdfViewer: (props: Record<string, string>) => (
    <div data-testid="viewer">{JSON.stringify(props)}</div>
  ),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import AdminDownloadPreviewPage, { dynamic, metadata } from "./page";

const resourceId = "019f7b47-3040-7000-8000-000000000099";
const notFoundError = new Error("NEXT_NOT_FOUND");
const resource = {
  adminLabel: "产品彩页",
  adminStatus: "待发布",
  createdAt: "2026-08-16T00:00:00.000Z",
  kind: "document",
  draftRevision: {
    kind: "document",
    category: "materials",
    createdAt: "2026-08-16T00:00:00.000Z",
    description: "产品彩页",
    downloadPolicy: "contact",
    id: "019f7b47-3040-7000-8000-000000000088",
    name: "待发布产品彩页",
    previewPolicy: "contact",
    product: "元启",
    publishedAt: null,
    resourceType: "彩页",
    artifacts: [
      {
        slot: "document",
        objectKey: "guide.pdf",
        originalFilename: "guide.pdf",
        extension: ".pdf",
        mediaType: "application/pdf",
        byteSize: 1_000,
        sha256: "a".repeat(64),
        pageCount: 3,
        coverObjectKey: "cover.webp",
      },
    ],
    sortOrder: 1,
  },
  id: resourceId,
  key: "product-guide",
  publishedRevision: null,
  rowVersion: 1,
  state: "unpublished",
  updatedAt: "2026-08-16T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.get.mockResolvedValue(resource);
  mocks.notFound.mockImplementation(() => {
    throw notFoundError;
  });
});

afterEach(cleanup);

describe("AdminDownloadPreviewPage", () => {
  it("authorizes first and previews the current draft regardless of public policy", async () => {
    render(
      await AdminDownloadPreviewPage({
        params: Promise.resolve({ resourceId }),
      }),
    );

    expect(mocks.requirePermission).toHaveBeenCalledWith("admin:downloads");
    expect(mocks.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.get.mock.invocationCallOrder[0]!,
    );
    expect(mocks.get).toHaveBeenCalledWith(resourceId);
    expect(screen.getByTestId("viewer")).toHaveTextContent(
      `"sourceUrl":"/api/v1/admin/downloads/${resourceId}/draft/pdf"`,
    );
    expect(screen.getByTestId("viewer")).toHaveTextContent(
      '"backHref":"/admin/downloads"',
    );
    expect(screen.getByTestId("viewer")).toHaveTextContent(
      '"title":"待发布产品彩页"',
    );
  });

  it("does not resolve a resource when permission is denied", async () => {
    const denied = new Error("denied");
    mocks.requirePermission.mockRejectedValue(denied);
    await expect(
      AdminDownloadPreviewPage({ params: Promise.resolve({ resourceId }) }),
    ).rejects.toBe(denied);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("returns 404 for malformed ids and resources without a complete draft", async () => {
    await expect(
      AdminDownloadPreviewPage({
        params: Promise.resolve({ resourceId: "not-a-uuid" }),
      }),
    ).rejects.toBe(notFoundError);
    expect(mocks.get).not.toHaveBeenCalled();

    mocks.get.mockResolvedValue({ ...resource, draftRevision: null });
    await expect(
      AdminDownloadPreviewPage({ params: Promise.resolve({ resourceId }) }),
    ).rejects.toBe(notFoundError);
  });

  it("is dynamic, noindex and nofollow", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
