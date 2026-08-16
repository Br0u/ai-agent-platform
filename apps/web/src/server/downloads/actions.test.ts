import { describe, expect, it, vi } from "vitest";

const wiring = vi.hoisted(() => ({
  createResource: vi.fn(async () => ({})),
  saveDraft: vi.fn(async () => ({})),
  publish: vi.fn(async () => ({})),
  downline: vi.fn(async () => ({})),
  discardDraft: vi.fn(async () => ({})),
  removeDraftFile: vi.fn(async () => ({})),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: wiring.revalidatePath }));
vi.mock("./service", () => ({
  downloadResourceService: {
    createResource: wiring.createResource,
    saveDraft: wiring.saveDraft,
    publish: wiring.publish,
    downline: wiring.downline,
    discardDraft: wiring.discardDraft,
    removeDraftFile: wiring.removeDraftFile,
  },
}));

import {
  createDownloadResourceAction,
  createDownloadResourceActionState,
  publishDownloadResourceAction,
} from "./actions";

describe("download resource actions", () => {
  it("exposes an idle action state", () => {
    expect(createDownloadResourceActionState()).toEqual({ kind: "idle" });
  });

  it("uses the service and invalidates admin and public views", async () => {
    const form = new FormData();
    form.set("key", "vision-intro");
    form.set("adminLabel", "视觉介绍");
    await expect(createDownloadResourceActionState()).toEqual({ kind: "idle" });
    await expect(
      createDownloadResourceAction({ kind: "idle" }, form),
    ).resolves.toEqual({ kind: "success" });
    expect(wiring.createResource).toHaveBeenCalledWith({
      key: "vision-intro",
      adminLabel: "视觉介绍",
    });
    expect(wiring.revalidatePath).toHaveBeenCalledWith("/admin/downloads");
    expect(wiring.revalidatePath).toHaveBeenCalledWith("/downloads", "layout");
  });

  it("rejects noncanonical row versions before calling a mutation", async () => {
    const form = new FormData();
    form.set("id", "11111111-1111-4111-8111-111111111111");
    form.set("expectedRowVersion", "01");
    await expect(
      publishDownloadResourceAction({ kind: "idle" }, form),
    ).resolves.toEqual({
      kind: "validation_error",
      fieldErrors: { expectedRowVersion: ["字段值无效"] },
    });
    expect(wiring.publish).not.toHaveBeenCalled();
  });
});
