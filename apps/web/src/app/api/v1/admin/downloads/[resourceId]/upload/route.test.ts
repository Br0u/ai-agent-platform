import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

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
  stagePath: "",
  take: vi.fn(() => ({
    path: wiring.stagePath,
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
  cancel: vi.fn(async () => undefined),
  PdfToolError: class PdfToolError extends Error {
    constructor(readonly code: "invalid_pdf" | "processing_failed") {
      super(code);
    }
  },
}));

vi.mock("@/server/auth/access", () => ({
  AuthAccessError: class AuthAccessError extends Error {
    status = 403 as const;
  },
  requirePermission: wiring.allow,
}));
vi.mock("@/server/auth/shared-options", () => ({
  resolveTrustedRequestIp: () => undefined,
}));
vi.mock("@/server/http/require-trusted-mutation", () => ({
  MutationRequestError: class MutationRequestError extends Error {},
  requireTrustedMultipartMutation: wiring.trust,
}));
vi.mock("@/server/http/cancel-request-body", () => ({
  cancelUnreadRequestBody: wiring.cancel,
}));
vi.mock("@/server/downloads/pdf-upload", () => ({
  PdfUploadError: class PdfUploadError extends Error {},
  readBoundedPdfUploadMultipart: wiring.read,
  takePdfUploadStage: wiring.take,
}));
vi.mock("@/server/downloads/pdf-tools", () => ({
  PdfToolError: wiring.PdfToolError,
  getPdfToolErrorCode: (error: unknown) =>
    error instanceof wiring.PdfToolError ? error.code : undefined,
  pdfTools: { derive: wiring.derive },
}));
vi.mock("@/server/downloads/service", () => ({
  downloadResourceFileStore: {},
  downloadResourceService: { attachUploadedPdf: wiring.attach },
}));

import { POST } from "./route";

const params = {
  params: Promise.resolve({
    resourceId: "11111111-1111-4111-8111-111111111111",
  }),
};

function request(ifMatch: string | null) {
  return new Request("https://example.test", {
    method: "POST",
    headers: ifMatch === null ? {} : { "if-match": ifMatch },
  });
}

describe("admin download upload", () => {
  beforeEach(() => {
    wiring.trust.mockClear();
    wiring.allow.mockClear();
    wiring.read.mockClear();
    wiring.take.mockClear();
    wiring.derive.mockReset();
    wiring.derive.mockResolvedValue({
      pageCount: 1,
      stagedCover: {
        path: "/tmp/cover.webp",
        writable: { close: vi.fn(async () => undefined) },
      },
    });
    wiring.attach.mockClear();
    wiring.cancel.mockClear();
  });

  it("exports POST", () => {
    expect(POST).toBeTypeOf("function");
  });

  it("accepts only a quoted positive If-Match version before reading body", async () => {
    const invalid = await POST(request("1"), params);
    expect(invalid.status).toBe(400);
    expect(wiring.read).not.toHaveBeenCalled();
    expect(wiring.cancel).toHaveBeenCalled();

    const response = await POST(request('"2"'), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(wiring.attach).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "11111111-1111-4111-8111-111111111111",
        expectedRowVersion: 2,
        pageCount: 1,
        byteSize: 12,
      }),
      {},
      expect.any(AbortSignal),
    );
  });

  it.each([null, "1", '"0"', '"1,2"', "*", '"9007199254740992"'])(
    "rejects invalid If-Match %s before upload parsing",
    async (ifMatch) => {
      const response = await POST(request(ifMatch), params);
      expect(response.status).toBe(400);
      expect(wiring.read).not.toHaveBeenCalled();
    },
  );

  it("maps typed PDF failures without parsing messages", async () => {
    const tools = await import("@/server/downloads/pdf-tools");
    expect(
      tools.getPdfToolErrorCode(new wiring.PdfToolError("invalid_pdf")),
    ).toBe("invalid_pdf");
    wiring.stagePath = path.join(tmpdir(), `download-upload-${randomUUID()}`);
    await writeFile(wiring.stagePath, "stage");
    wiring.derive.mockRejectedValueOnce(new wiring.PdfToolError("invalid_pdf"));
    try {
      const invalid = await POST(request('"2"'), params);
      expect(wiring.derive).toHaveBeenCalled();
      await expect(invalid.clone().json()).resolves.toMatchObject({
        error: { code: "invalid_pdf" },
      });
      expect(invalid.status).toBe(422);
    } finally {
      await unlink(wiring.stagePath).catch(() => undefined);
    }

    wiring.derive.mockRejectedValueOnce(
      new wiring.PdfToolError("processing_failed"),
    );
    const unavailable = await POST(request('"2"'), params);
    expect(unavailable.status).toBe(500);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: "internal_error" },
    });
  });

  it("returns a sanitized 500 when stage cleanup also fails", async () => {
    wiring.stagePath = path.join(tmpdir(), `download-upload-${randomUUID()}`);
    await writeFile(wiring.stagePath, "stage");
    wiring.take.mockImplementationOnce(() => ({
      path: wiring.stagePath,
      writable: {
        close: vi.fn(async () => {
          throw new Error("private cleanup failure");
        }),
      },
    }));
    wiring.derive.mockRejectedValueOnce(new wiring.PdfToolError("invalid_pdf"));
    try {
      const response = await POST(request('"2"'), params);
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "internal_error" },
      });
    } finally {
      await unlink(wiring.stagePath).catch(() => undefined);
    }
  });
});
