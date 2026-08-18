import { beforeEach, describe, expect, it, vi } from "vitest";

const wiring = vi.hoisted(() => ({
  trust: vi.fn(),
  allow: vi.fn(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
  })),
  read: vi.fn(async () => ({
    stage: {} as never,
    byteSize: 12,
    sha256: "a".repeat(64),
    originalName: "installer.exe",
    extension: ".exe" as const,
    mediaType: "application/vnd.microsoft.portable-executable",
  })),
  take: vi.fn(() => ({
    path: "/tmp/artifact",
    writable: { close: vi.fn(async () => undefined) },
  })),
  derive: vi.fn(),
  attach: vi.fn(async () => ({ resource: { id: "resource" } })),
  cancel: vi.fn(async () => undefined),
}));

vi.mock("@/server/auth/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/access")>()),
  requirePermission: wiring.allow,
}));
vi.mock("@/server/auth/shared-options", () => ({
  resolveTrustedRequestIp: () => undefined,
}));
vi.mock("@/server/http/require-trusted-mutation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/http/require-trusted-mutation")
  >()),
  requireTrustedMultipartMutation: wiring.trust,
}));
vi.mock("@/server/http/cancel-request-body", () => ({
  cancelUnreadRequestBody: wiring.cancel,
}));
vi.mock("@/server/downloads/artifact-upload", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/server/downloads/artifact-upload")
  >()),
  readBoundedArtifactUploadMultipart: wiring.read,
  takeArtifactUploadStage: wiring.take,
}));
vi.mock("@/server/downloads/pdf-tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/downloads/pdf-tools")>()),
  pdfTools: { derive: wiring.derive },
}));
vi.mock("@/server/downloads/service", () => ({
  downloadResourceFileStore: {},
  downloadResourceService: { attachUploadedArtifact: wiring.attach },
}));

import { ArtifactUploadError } from "@/server/downloads/artifact-upload";
import { PdfToolError } from "@/server/downloads/pdf-tools";
import { POST } from "./route";

const params = (slot: string) => ({
  params: Promise.resolve({
    resourceId: "11111111-1111-4111-8111-111111111111",
    slot,
  }),
});

function request() {
  return new Request("https://example.test", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": "multipart/form-data; boundary=abc",
      "if-match": '"2"',
    },
  });
}

describe("slot-aware admin download upload", () => {
  beforeEach(() => {
    wiring.trust.mockClear();
    wiring.allow.mockClear();
    wiring.read.mockClear();
    wiring.take.mockClear();
    wiring.derive.mockReset();
    wiring.attach.mockClear();
    wiring.cancel.mockClear();
  });

  it("passes the explicit Windows slot through the parser and lifecycle", async () => {
    const response = await POST(request(), params("windows"));

    expect(response.status).toBe(200);
    expect(wiring.read).toHaveBeenCalledWith(
      expect.any(Request),
      {},
      "windows",
    );
    expect(wiring.attach).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        expectedRowVersion: 2,
        slot: "windows",
        originalFilename: "installer.exe",
      }),
      {},
      expect.any(AbortSignal),
    );
    expect(wiring.derive).not.toHaveBeenCalled();
  });

  it("uses PDF processing only for the document slot", async () => {
    wiring.read.mockResolvedValueOnce({
      stage: {} as never,
      byteSize: 12,
      sha256: "a".repeat(64),
      originalName: "guide.pdf",
      extension: ".pdf" as never,
      mediaType: "application/pdf",
    });
    wiring.derive.mockResolvedValueOnce({
      pageCount: 1,
      stagedCover: {
        path: "/tmp/cover",
        writable: { close: vi.fn(async () => undefined) },
      },
    });

    expect((await POST(request(), params("document"))).status).toBe(200);
    expect(wiring.derive).toHaveBeenCalledOnce();
    expect(wiring.attach).toHaveBeenCalledWith(
      expect.objectContaining({ slot: "document", pageCount: 1 }),
      {},
      expect.any(AbortSignal),
    );
  });

  it.each([
    ["unknown", 404, "not_found"],
    ["WINDOWS", 404, "not_found"],
  ])("rejects slot %s without reading the body", async (slot, status, code) => {
    const response = await POST(request(), params(slot));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(wiring.read).not.toHaveBeenCalled();
  });

  it.each([
    [new ArtifactUploadError("invalid_multipart"), 400, "invalid_multipart"],
    [new ArtifactUploadError("invalid_file"), 422, "invalid_file"],
    [new ArtifactUploadError("file_too_large"), 413, "file_too_large"],
    [
      Object.assign(new Error("full"), { code: "ENOSPC" }),
      507,
      "insufficient_storage",
    ],
  ])(
    "maps upload failures to the stable HTTP contract",
    async (error, status, code) => {
      wiring.read.mockRejectedValueOnce(error);
      const response = await POST(request(), params("macos"));
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toMatchObject({ error: { code } });
    },
  );

  it("maps recursively wrapped derive and transaction ENOSPC to 507", async () => {
    wiring.read.mockResolvedValueOnce({
      stage: {} as never,
      byteSize: 12,
      sha256: "a".repeat(64),
      originalName: "guide.pdf",
      extension: ".pdf" as never,
      mediaType: "application/pdf",
    });
    wiring.derive.mockRejectedValueOnce(
      new PdfToolError(
        "processing_failed",
        Object.assign(new Error("full"), { code: "ENOSPC" }),
      ),
    );
    expect((await POST(request(), params("document"))).status).toBe(507);

    wiring.attach.mockRejectedValueOnce(
      new AggregateError([
        Object.assign(new Error("full"), { code: "ENOSPC" }),
      ]),
    );
    expect((await POST(request(), params("windows"))).status).toBe(507);
  });
});
