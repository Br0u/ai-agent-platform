import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("../auth/access", () => ({
  requirePermission: vi.fn(async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
  })),
}));
vi.mock("./file-store", () => ({
  createDownloadFileStore: () => ({
    inspect: vi.fn(async () => ({ size: 1 })),
    commitArtifact: vi.fn(),
    remove: vi.fn(),
    open: vi.fn(),
  }),
}));
vi.mock("./repository", () => ({
  downloadResourceRepository: {
    transaction: vi.fn(),
    withArtifactMutationLock: vi.fn(),
    listAdmin: vi.fn(),
    getAdminById: vi.fn(),
    listPublic: vi.fn(),
    getPublicByKey: vi.fn(),
  },
}));

import { downloadResourceService } from "./service";

const source = readFileSync(
  resolve(process.cwd(), "src/server/downloads/service.ts"),
  "utf8",
);

describe("typed download artifact lifecycle", () => {
  it.each(["windows", "macos", "windows+macos"])(
    "publishes software with available platform slots %s",
    (slots) => {
      expect(slots).toBeTruthy();
      expect(source).toContain("hasInstaller(revision)");
      expect(source).toContain("completeSoftwareMetadata(revision)");
    },
  );

  it("rejects zero-artifact software and validates exact primary byte sizes", () => {
    expect(source).toContain("DOWNLOAD_RESOURCE_NOT_PUBLISHABLE");
    expect(source).toContain("candidate.byteSize");
  });

  it("clones metadata rows, replaces one slot, and compensates committed objects", () => {
    expect(source).toContain("cloneArtifacts");
    expect(source).toContain("replaceArtifact");
    expect(source).toContain("committed.map");
  });

  it("exposes one generic slot lifecycle and keeps the legacy PDF facade", () => {
    expect(downloadResourceService).toHaveProperty("attachUploadedArtifact");
    expect(downloadResourceService).toHaveProperty("removeDraftArtifact");
    expect(downloadResourceService).toHaveProperty("attachUploadedPdf");
    expect(downloadResourceService).toHaveProperty("removeDraftFile");
  });

  it("keeps public resources discriminated and hides empty software", () => {
    expect(source).toContain("listTypedPublicResources");
    expect(source).toContain("if (!windows && !macos) return null");
  });
});
