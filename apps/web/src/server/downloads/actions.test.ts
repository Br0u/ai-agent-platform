import { describe, expect, it, vi } from "vitest";

import { AuthAccessError } from "../auth/access";
import {
  createDownloadResourceActionState,
  createDownloadResourceActions,
} from "./actions";
import type { DownloadResourceAdminDto } from "./contracts";

const resource: DownloadResourceAdminDto = {
  id: "11111111-1111-4111-8111-111111111111",
  key: "vision-intro",
  adminLabel: "视觉介绍",
  state: "unpublished" as const,
  adminStatus: "空记录" as const,
  rowVersion: 1,
  publishedRevision: null,
  draftRevision: null,
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:00:00.000Z",
};

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  realm: "workforce" as const,
  status: "active" as const,
  displayName: "operator",
  mustChangePassword: false,
  permissions: ["admin:downloads"],
};

function fixture() {
  const service = {
    createResource: vi.fn(async () => resource),
    saveDraft: vi.fn(async () => resource),
    publish: vi.fn(async () => resource),
    downline: vi.fn(async () => resource),
    discardDraft: vi.fn(async () => resource),
    removeDraftFile: vi.fn(async () => resource),
  };
  const access = { requirePermission: vi.fn(async () => actor) };
  const cache = { revalidatePath: vi.fn(), updateTag: vi.fn() };
  const reportInternalError = vi.fn();
  return {
    service,
    access,
    cache,
    reportInternalError,
    actions: createDownloadResourceActions({
      service,
      access,
      cache,
      getContext: () => ({
        ipAddress: "203.0.113.7",
        userAgent: "admin-test",
      }),
      reportInternalError,
    }),
  };
}

function createForm() {
  const form = new FormData();
  form.set("key", "vision-intro");
  form.set("adminLabel", "视觉介绍");
  return form;
}

describe("download resource actions", () => {
  it("exposes an idle action state", () => {
    expect(createDownloadResourceActionState()).toEqual({ kind: "idle" });
  });

  it("authorizes, passes bounded context, and invalidates views after creation", async () => {
    const current = fixture();
    await expect(
      current.actions.createDownloadResourceAction(
        createDownloadResourceActionState(),
        createForm(),
      ),
    ).resolves.toEqual({ kind: "success", resource });
    expect(current.access.requirePermission).toHaveBeenCalledWith(
      "admin:downloads",
    );
    expect(current.service.createResource).toHaveBeenCalledWith(
      { key: "vision-intro", adminLabel: "视觉介绍" },
      { ipAddress: "203.0.113.7", userAgent: "admin-test" },
    );
    expect(current.cache.revalidatePath).toHaveBeenCalledWith(
      "/admin/downloads",
    );
    expect(current.cache.updateTag).toHaveBeenCalledWith("downloads");
    expect(current.cache.revalidatePath).toHaveBeenCalledWith(
      "/downloads",
      "layout",
    );
  });

  it("returns the latest lifecycle resource snapshot and fails closed for bad DTOs", async () => {
    const current = fixture();
    const form = new FormData();
    form.set("id", resource.id);
    form.set("expectedRowVersion", "1");
    const latest: DownloadResourceAdminDto = {
      ...resource,
      rowVersion: 2,
      state: "published" as const,
      adminStatus: "已发布" as const,
    };
    current.service.publish.mockResolvedValueOnce(latest);
    await expect(
      current.actions.publishDownloadResourceAction(
        createDownloadResourceActionState(),
        form,
      ),
    ).resolves.toEqual({ kind: "success", resource: latest });
    current.service.createResource.mockResolvedValueOnce({
      key: "unsafe",
    } as never);
    await expect(
      current.actions.createDownloadResourceAction(
        createDownloadResourceActionState(),
        createForm(),
      ),
    ).resolves.toEqual({ kind: "internal_error" });
    expect(current.cache.revalidatePath).toHaveBeenCalledTimes(2);
    expect(current.reportInternalError).toHaveBeenCalled();
  });

  it("returns field errors before authorization for duplicate or invalid input", async () => {
    const current = fixture();
    const form = createForm();
    form.append("key", "second");
    await expect(
      current.actions.createDownloadResourceAction(
        createDownloadResourceActionState(),
        form,
      ),
    ).resolves.toEqual({
      kind: "validation_error",
      fieldErrors: { key: ["字段值无效"] },
    });
    expect(current.access.requirePermission).not.toHaveBeenCalled();
  });

  it("rejects noncanonical row versions before calling a mutation", async () => {
    const current = fixture();
    const form = new FormData();
    form.set("id", "11111111-1111-4111-8111-111111111111");
    form.set("expectedRowVersion", "01");
    await expect(
      current.actions.publishDownloadResourceAction(
        createDownloadResourceActionState(),
        form,
      ),
    ).resolves.toEqual({
      kind: "validation_error",
      fieldErrors: { expectedRowVersion: ["字段值无效"] },
    });
    expect(current.service.publish).not.toHaveBeenCalled();
  });

  it("maps only safe auth, conflict, and internal states", async () => {
    const current = fixture();
    current.access.requirePermission.mockRejectedValueOnce(
      new AuthAccessError("AUTH_SESSION_REQUIRED", 401),
    );
    await expect(
      current.actions.createDownloadResourceAction(
        createDownloadResourceActionState(),
        createForm(),
      ),
    ).resolves.toMatchObject({ kind: "authentication_required" });

    current.service.createResource.mockRejectedValueOnce(
      new Error("DOWNLOAD_RESOURCE_ROW_VERSION_CONFLICT"),
    );
    await expect(
      current.actions.createDownloadResourceAction(
        createDownloadResourceActionState(),
        createForm(),
      ),
    ).resolves.toEqual({ kind: "conflict" });

    current.service.createResource.mockRejectedValueOnce(
      new Error("DOWNLOAD_RESOURCE_NOT_FOUND"),
    );
    await expect(
      current.actions.createDownloadResourceAction(
        createDownloadResourceActionState(),
        createForm(),
      ),
    ).resolves.toEqual({ kind: "domain_error" });

    current.service.createResource.mockRejectedValueOnce(
      new Error(
        "DOWNLOAD_RESOURCE_PRIVATE_DETAIL: /private/downloads/secret.pdf",
      ),
    );
    await expect(
      current.actions.createDownloadResourceAction(
        createDownloadResourceActionState(),
        createForm(),
      ),
    ).resolves.toEqual({ kind: "internal_error" });
    expect(current.reportInternalError).toHaveBeenCalled();
  });

  it("keeps a successful mutation successful when cache invalidation fails", async () => {
    const current = fixture();
    current.cache.updateTag.mockImplementation(() => {
      throw new Error("cache unavailable");
    });
    await expect(
      current.actions.createDownloadResourceAction(
        createDownloadResourceActionState(),
        createForm(),
      ),
    ).resolves.toEqual({ kind: "success", resource });
    expect(current.reportInternalError).toHaveBeenCalled();
  });
});
