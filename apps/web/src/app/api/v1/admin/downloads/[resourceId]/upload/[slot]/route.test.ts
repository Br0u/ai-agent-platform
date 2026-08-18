import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { stat, unlink, writeFile } from "node:fs/promises";
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
    originalName: "installer.exe",
    extension: ".exe" as const,
    mediaType: "application/vnd.microsoft.portable-executable",
  })),
  take: vi.fn(() => ({
    path: "/tmp/artifact",
    writable: { close: vi.fn(async () => undefined) },
  })),
  derive: vi.fn(),
  attach: vi.fn(async () => ({ dto: uploadDto })),
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
import { AuthAccessError } from "@/server/auth/access";
import { downloadResourceAdminDtoSchema } from "@/server/downloads/contracts";
import { PdfToolError } from "@/server/downloads/pdf-tools";
import { MutationRequestError } from "@/server/http/require-trusted-mutation";
import { POST } from "./route";

const uploadDto = {
  id: "11111111-1111-4111-8111-111111111111",
  key: "resource",
  adminLabel: "Resource",
  state: "unpublished",
  adminStatus: "待发布",
  rowVersion: 3,
  publishedRevision: null,
  draftRevision: {
    id: "11111111-1111-4111-8111-111111111112",
    name: "Resource",
    product: "Platform",
    category: "materials",
    resourceType: "PDF",
    description: "Download",
    sortOrder: 0,
    previewPolicy: "public",
    downloadPolicy: "contact",
    pdfObjectKey: "objects/private.pdf",
    coverObjectKey: "objects/private.webp",
    pageCount: 1,
    byteSize: 12,
    sha256: "a".repeat(64),
    createdAt: "2026-08-18T00:00:00.000Z",
    publishedAt: null,
  },
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:01.000Z",
};

const params = (slot: string) => ({
  params: Promise.resolve({
    resourceId: "11111111-1111-4111-8111-111111111111",
    slot,
  }),
});

function request(
  ifMatch: string | null = '"2"',
  contentType = "multipart/form-data; boundary=abc",
  signal?: AbortSignal,
) {
  return new Request("https://example.test", {
    method: "POST",
    headers: {
      origin: "https://example.test",
      "content-type": contentType,
      ...(ifMatch === null ? {} : { "if-match": ifMatch }),
    },
    signal,
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
    await expect(response.json()).resolves.toMatchObject({
      resource: uploadDto,
    });
  });

  it("returns the exact legacy manager DTO with its new row version", async () => {
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
    const response = await POST(request(), params("document"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      downloadResourceAdminDtoSchema.safeParse(body.resource),
    ).toMatchObject({
      success: true,
    });
    expect(body).toMatchObject({ resource: { rowVersion: 3 } });
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

  it.each([null, "1", '"abc"', '"0"', '"1,2"', "*", '"9007199254740992"'])(
    "rejects malformed If-Match %s before reading",
    async (ifMatch) => {
      const response = await POST(request(ifMatch), params("windows"));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "invalid_input" },
      });
      expect(wiring.read).not.toHaveBeenCalled();
    },
  );

  it("runs trusted mutation, permission, then parser and maps stable guard/auth/CAS errors", async () => {
    const order: string[] = [];
    wiring.trust.mockImplementationOnce(() => order.push("guard"));
    wiring.allow.mockImplementationOnce(async () => {
      order.push("permission");
      return { userId: "11111111-1111-4111-8111-111111111111" };
    });
    wiring.read.mockImplementationOnce(async () => {
      order.push("parser");
      return {
        stage: {} as never,
        byteSize: 12,
        sha256: "a".repeat(64),
        originalName: "installer.exe",
        extension: ".exe" as const,
        mediaType: "application/vnd.microsoft.portable-executable",
      };
    });
    await POST(request(), params("windows"));
    expect(order).toEqual(["guard", "permission", "parser"]);

    wiring.allow.mockRejectedValueOnce(
      new AuthAccessError("AUTH_SESSION_REQUIRED", 401),
    );
    const unauthenticated = await POST(request(), params("windows"));
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({
      error: { code: "authentication_required" },
    });
    wiring.allow.mockRejectedValueOnce(
      new AuthAccessError("AUTH_PERMISSION_DENIED", 403),
    );
    const denied = await POST(request(), params("windows"));
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({
      error: { code: "permission_denied" },
    });
    wiring.trust.mockImplementationOnce(() => {
      throw new MutationRequestError();
    });
    const rejected = await POST(request(), params("windows"));
    expect(rejected.status).toBe(403);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: "mutation_rejected" },
    });
    wiring.trust.mockImplementationOnce(() => {
      throw new MutationRequestError();
    });
    const unsupported = await POST(
      request('"2"', "text/plain"),
      params("windows"),
    );
    expect(unsupported.status).toBe(415);
    await expect(unsupported.json()).resolves.toMatchObject({
      error: { code: "unsupported_media_type" },
    });
    wiring.attach.mockRejectedValueOnce(
      new Error("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT"),
    );
    const conflict = await POST(request(), params("windows"));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: { code: "state_conflict" },
    });
  });

  it.each(["document", "windows"] as const)(
    "maps a resource-kind mismatch for %s to invalid_file",
    async (slot) => {
      if (slot === "document") {
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
      }
      wiring.attach.mockRejectedValueOnce(
        new Error("DOWNLOAD_RESOURCE_ARTIFACT_SLOT_MISMATCH"),
      );
      const response = await POST(request(), params(slot));
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "invalid_file" },
      });
    },
  );

  it("cleans both stages after PDF derivation abort and conceals cleanup failure", async () => {
    const controller = new AbortController();
    const pdfPath = path.join(tmpdir(), `upload-${randomUUID()}`);
    const coverPath = path.join(tmpdir(), `cover-${randomUUID()}`);
    await Promise.all([
      writeFile(pdfPath, "pdf"),
      writeFile(coverPath, "cover"),
    ]);
    wiring.take.mockImplementationOnce(() => ({
      path: pdfPath,
      writable: { close: vi.fn(async () => undefined) },
    }));
    wiring.read.mockResolvedValueOnce({
      stage: {} as never,
      byteSize: 12,
      sha256: "a".repeat(64),
      originalName: "guide.pdf",
      extension: ".pdf" as never,
      mediaType: "application/pdf",
    });
    wiring.derive.mockImplementationOnce(async () => {
      controller.abort();
      return {
        pageCount: 1,
        stagedCover: {
          path: coverPath,
          writable: { close: vi.fn(async () => undefined) },
        },
      };
    });
    try {
      const response = await POST(
        request('"2"', "multipart/form-data; boundary=abc", controller.signal),
        params("document"),
      );
      expect(response.status).toBe(500);
      expect(wiring.attach).not.toHaveBeenCalled();
      await expect(stat(pdfPath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(coverPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await Promise.all([
        unlink(pdfPath).catch(() => undefined),
        unlink(coverPath).catch(() => undefined),
      ]);
    }

    wiring.take.mockImplementationOnce(() => ({
      path: "/tmp/missing-stage",
      writable: {
        close: vi.fn(async () => {
          throw new Error("private");
        }),
      },
    }));
    wiring.attach.mockRejectedValueOnce(
      new ArtifactUploadError("invalid_file"),
    );
    const cleanup = await POST(request(), params("windows"));
    expect(cleanup.status).toBe(500);
    await expect(cleanup.json()).resolves.toMatchObject({
      error: { code: "internal_error" },
    });
  });
});
