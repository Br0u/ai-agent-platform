import { describe, expect, it, vi } from "vitest";

import { createTypedDownloadResourceActions } from "./actions";
import type { TypedDownloadResourceAdminDto } from "./contracts";

const resourceId = "11111111-1111-4111-8111-111111111111";
const createdAt = "2026-08-16T00:00:00.000Z";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  realm: "workforce" as const,
  status: "active" as const,
  displayName: "operator",
  mustChangePassword: false,
  permissions: ["admin:downloads"],
};

const softwareResource: TypedDownloadResourceAdminDto = {
  id: resourceId,
  key: "agent-suite",
  adminLabel: "Agent Suite",
  kind: "software",
  state: "unpublished",
  adminStatus: "空记录",
  rowVersion: 1,
  publishedRevision: null,
  draftRevision: null,
  createdAt,
  updatedAt: createdAt,
};

function typedFixture() {
  const service = {
    createTypedResource: vi.fn(async () => softwareResource),
    saveTypedDraft: vi.fn(async () => ({ dto: softwareResource })),
    publishTyped: vi.fn(async () => ({ dto: softwareResource })),
    downlineTyped: vi.fn(async () => ({ dto: softwareResource })),
    discardTyped: vi.fn(async () => ({ dto: softwareResource })),
    removeDraftArtifact: vi.fn(async () => ({ dto: softwareResource })),
  };
  const access = { requirePermission: vi.fn(async () => actor) };
  const cache = { revalidatePath: vi.fn(), updateTag: vi.fn() };
  const reportInternalError = vi.fn();
  return {
    service,
    access,
    cache,
    actions: createTypedDownloadResourceActions({
      service,
      access,
      cache,
      getContext: () => ({ ipAddress: "203.0.113.7" }),
      reportInternalError,
    }),
  };
}

function typedCreateForm(kind: "document" | "software") {
  const form = new FormData();
  form.set("key", "agent-suite");
  form.set("adminLabel", "Agent Suite");
  form.set("kind", kind);
  return form;
}

function softwareDraftForm(rowVersion = "1") {
  const form = typedCreateForm("software");
  form.delete("key");
  form.delete("adminLabel");
  form.set("id", resourceId);
  form.set("expectedRowVersion", rowVersion);
  form.set("name", "Agent Suite");
  form.set("product", "Platform");
  form.set("category", "software");
  form.set("resourceType", "Installer");
  form.set("description", "Installer package");
  form.set("sortOrder", "0");
  form.set("releaseVersion", "1.2.3");
  return form;
}

describe("download resource actions", () => {
  it("creates a software resource through the typed action and returns its discriminated DTO", async () => {
    const current = typedFixture();
    await expect(
      current.actions.createTypedDownloadResourceAction(
        { kind: "idle" },
        typedCreateForm("software"),
      ),
    ).resolves.toEqual({ kind: "success", resource: softwareResource });
    expect(current.service.createTypedResource).toHaveBeenCalledWith(
      { key: "agent-suite", adminLabel: "Agent Suite", kind: "software" },
      { ipAddress: "203.0.113.7" },
    );
  });

  it("saves software metadata with the current row version and rejects an immutable-kind form before mutation", async () => {
    const current = typedFixture();
    await expect(
      current.actions.saveTypedDownloadDraftAction(
        { kind: "idle" },
        softwareDraftForm(),
      ),
    ).resolves.toEqual({ kind: "success", resource: softwareResource });
    expect(current.service.saveTypedDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: resourceId,
        expectedRowVersion: 1,
        kind: "software",
        releaseVersion: "1.2.3",
      }),
      { ipAddress: "203.0.113.7" },
    );

    const invalid = softwareDraftForm();
    invalid.set("kind", "document");
    await expect(
      current.actions.saveTypedDownloadDraftAction({ kind: "idle" }, invalid),
    ).resolves.toMatchObject({ kind: "validation_error" });
    expect(current.service.saveTypedDraft).toHaveBeenCalledTimes(1);
  });

  it("maps the typed draft CAS conflict without exposing storage details", async () => {
    const current = typedFixture();
    current.service.saveTypedDraft.mockRejectedValueOnce(
      new Error("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT"),
    );
    await expect(
      current.actions.saveTypedDownloadDraftAction(
        { kind: "idle" },
        softwareDraftForm(),
      ),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("removes only the requested typed artifact slot with the current row version", async () => {
    const current = typedFixture();
    const form = new FormData();
    form.set("id", resourceId);
    form.set("expectedRowVersion", "1");
    form.set("slot", "windows");

    await expect(
      current.actions.removeDownloadDraftArtifactAction({ kind: "idle" }, form),
    ).resolves.toEqual({ kind: "success", resource: softwareResource });
    expect(current.service.removeDraftArtifact).toHaveBeenCalledWith(
      { id: resourceId, expectedRowVersion: 1, slot: "windows" },
      { ipAddress: "203.0.113.7" },
    );
  });

  it("preserves publish, downline and discard actions for typed resources", async () => {
    const current = typedFixture();
    const form = new FormData();
    form.set("id", resourceId);
    form.set("expectedRowVersion", "1");

    await expect(
      current.actions.publishTypedDownloadResourceAction(
        { kind: "idle" },
        form,
      ),
    ).resolves.toEqual({ kind: "success", resource: softwareResource });
    await expect(
      current.actions.downlineTypedDownloadResourceAction(
        { kind: "idle" },
        form,
      ),
    ).resolves.toEqual({ kind: "success", resource: softwareResource });
    await expect(
      current.actions.discardTypedDownloadDraftAction({ kind: "idle" }, form),
    ).resolves.toEqual({ kind: "success", resource: softwareResource });
  });
});
