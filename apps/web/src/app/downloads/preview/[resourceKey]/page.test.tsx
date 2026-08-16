import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), notFound: vi.fn() }));

vi.mock("@/server/downloads/service", () => ({
  downloadResourceService: { listPublicResources: mocks.list },
}));
vi.mock("@/components/downloads/pdf-viewer", () => ({
  PdfViewer: (props: Record<string, string>) => (
    <div data-testid="viewer">{JSON.stringify(props)}</div>
  ),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import DownloadPreviewPage from "./page";

const notFoundError = new Error("NEXT_NOT_FOUND");
const resource = {
  byteSize: 1_000,
  category: "materials",
  coverUrl: "/cover",
  description: "产品彩页",
  downloadPolicy: "public",
  key: "product-guide",
  name: "产品彩页",
  pageCount: 3,
  previewPolicy: "public",
  product: "元启",
  resourceType: "彩页",
  sortOrder: 1,
  updatedAt: "2026-08-16T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([resource]);
  mocks.notFound.mockImplementation(() => {
    throw notFoundError;
  });
});

afterEach(cleanup);

describe("DownloadPreviewPage", () => {
  it("server-checks the published public-preview resource", async () => {
    render(
      await DownloadPreviewPage({
        params: Promise.resolve({ resourceKey: "product-guide" }),
      }),
    );

    expect(mocks.list).toHaveBeenCalledOnce();
    expect(screen.getByTestId("viewer")).toHaveTextContent(
      '"sourceUrl":"/api/v1/downloads/product-guide/preview"',
    );
    expect(screen.getByTestId("viewer")).toHaveTextContent(
      '"backHref":"/downloads"',
    );
    expect(screen.getByTestId("viewer")).toHaveTextContent(
      '"title":"产品彩页"',
    );
  });

  it.each([
    ["missing", [resource]],
    ["product-guide", [{ ...resource, previewPolicy: "contact" }]],
  ])("returns 404 for unavailable preview %s", async (resourceKey, items) => {
    mocks.list.mockResolvedValue(items);
    await expect(
      DownloadPreviewPage({ params: Promise.resolve({ resourceKey }) }),
    ).rejects.toBe(notFoundError);
  });

  it("rejects malformed keys before querying public resources", async () => {
    await expect(
      DownloadPreviewPage({
        params: Promise.resolve({ resourceKey: "../product-guide" }),
      }),
    ).rejects.toBe(notFoundError);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
