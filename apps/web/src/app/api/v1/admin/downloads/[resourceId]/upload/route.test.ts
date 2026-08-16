import { describe, expect, it, vi } from "vitest";

const wiring = vi.hoisted(() => ({
  trust: vi.fn(),
  allow: vi.fn(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
  })),
  read: vi.fn(async () => ({
    stage: {} as never,
    byteSize: 12,
    sha256: "a".repeat(64),
  })),
  take: vi.fn(() => ({
    path: "/tmp/upload.pdf",
    writable: { close: vi.fn(async () => undefined) },
  })),
  derive: vi.fn(async () => ({
    pageCount: 1,
    stagedCover: {
      path: "/tmp/cover.webp",
      writable: { close: vi.fn(async () => undefined) },
    },
  })),
  attach: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })),
}));

vi.mock("@/server/auth/access", () => ({
  AuthAccessError: class AuthAccessError extends Error {
    status = 403 as const;
  },
  requirePermission: wiring.allow,
}));
vi.mock("@/server/http/require-trusted-mutation", () => ({
  MutationRequestError: class MutationRequestError extends Error {},
  requireTrustedMultipartMutation: wiring.trust,
}));
vi.mock("@/server/downloads/pdf-upload", () => ({
  PdfUploadError: class PdfUploadError extends Error {},
  readBoundedPdfUploadMultipart: wiring.read,
  takePdfUploadStage: wiring.take,
}));
vi.mock("@/server/downloads/pdf-tools", () => ({
  pdfTools: { derive: wiring.derive },
}));
vi.mock("@/server/downloads/service", () => ({
  downloadResourceFileStore: {},
  downloadResourceService: { attachUploadedPdf: wiring.attach },
}));

import { POST } from "./route";

describe("admin download upload", () => {
  it("exports POST", () => {
    expect(POST).toBeTypeOf("function");
  });

  it("accepts only a quoted positive If-Match version before reading body", async () => {
    const context = {
      params: Promise.resolve({
        resourceId: "11111111-1111-4111-8111-111111111111",
      }),
    };
    const invalid = await POST(
      new Request("https://example.test", {
        method: "POST",
        headers: { "if-match": "1" },
      }),
      context,
    );
    expect(invalid.status).toBe(400);
    expect(wiring.read).not.toHaveBeenCalled();
    const response = await POST(
      new Request("https://example.test", {
        method: "POST",
        headers: { "if-match": '"2"' },
      }),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(wiring.attach).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        expectedRowVersion: 2,
        pageCount: 1,
        byteSize: 12,
      }),
    );
  });
});
