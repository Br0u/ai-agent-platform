import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  downline: vi.fn(),
  discard: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/server/downloads/server-actions", () => ({
  createTypedDownloadResourceAction: actions.create,
  saveTypedDownloadDraftAction: actions.save,
  publishTypedDownloadResourceAction: actions.publish,
  downlineTypedDownloadResourceAction: actions.downline,
  discardTypedDownloadDraftAction: actions.discard,
  removeDownloadDraftArtifactAction: actions.remove,
}));

import type { TypedDownloadResourceAdminDto } from "@/server/downloads/contracts";
import { DownloadResourceManager } from "./download-resource-manager";

const software: TypedDownloadResourceAdminDto = {
  id: "11111111-1111-4111-8111-111111111111",
  key: "mdd2-client",
  adminLabel: "码里奥桌面客户端",
  kind: "software",
  state: "unpublished",
  adminStatus: "待发布",
  rowVersion: 2,
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
  publishedRevision: null,
  draftRevision: {
    id: "11111111-1111-4111-8111-111111111112",
    kind: "software",
    name: "码里奥桌面客户端",
    product: "码里奥",
    category: "software",
    resourceType: "桌面客户端",
    description: "客户端",
    sortOrder: 1,
    releaseVersion: "v2.0.0",
    artifacts: [
      {
        slot: "windows",
        objectKey: "private/mario.exe",
        originalFilename: "mario.exe",
        extension: ".exe",
        mediaType: "application/vnd.microsoft.portable-executable",
        byteSize: 12,
        sha256: "a".repeat(64),
      },
    ],
    createdAt: "2026-08-18T00:00:00.000Z",
    publishedAt: null,
  },
};
const documentResource: TypedDownloadResourceAdminDto = {
  ...software,
  id: "11111111-1111-4111-8111-111111111113",
  key: "guide",
  adminLabel: "产品资料",
  kind: "document",
  adminStatus: "待发布",
  publishedRevision: null,
  draftRevision: {
    id: "11111111-1111-4111-8111-111111111114",
    kind: "document",
    name: "产品资料",
    product: "华鲲元启",
    category: "materials",
    resourceType: "产品介绍",
    description: "资料",
    sortOrder: 1,
    previewPolicy: "public",
    downloadPolicy: "contact",
    artifacts: [
      {
        slot: "document",
        objectKey: "private/guide.pdf",
        originalFilename: "guide.pdf",
        extension: ".pdf",
        mediaType: "application/pdf",
        byteSize: 12,
        sha256: "b".repeat(64),
        pageCount: 1,
        coverObjectKey: "private/guide.webp",
      },
    ],
    createdAt: "2026-08-18T00:00:00.000Z",
    publishedAt: null,
  },
};

beforeEach(() => {
  for (const action of Object.values(actions))
    action
      .mockReset()
      .mockResolvedValue({ kind: "success", resource: software });
});

describe("DownloadResourceManager", () => {
  it("keeps empty software and document records navigable by their resource kind", () => {
    const emptySoftware = {
      ...software,
      adminStatus: "空记录" as const,
      draftRevision: null,
    };
    const emptyDocument = {
      ...documentResource,
      adminStatus: "空记录" as const,
      draftRevision: null,
    };
    render(
      <DownloadResourceManager resources={[emptySoftware, emptyDocument]} />,
    );
    expect(
      screen.getByRole("button", { name: /码里奥桌面客户端/ }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /产品资料/ })).toBeVisible();
  });

  it("creates an immutable resource kind and renders a software release with independent slots", () => {
    render(<DownloadResourceManager resources={[software]} />);
    expect(screen.getByLabelText("版本号")).toHaveValue("v2.0.0");
    expect(screen.getByText("mario.exe")).toBeVisible();
    expect(screen.getByText("暂无资源")).toBeVisible();
    expect(screen.queryByLabelText("预览权限")).toBeNull();
    expect(screen.queryByLabelText("上传 PDF")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "新增资源" }));
    expect(screen.getByLabelText("资源类型")).toBeVisible();
  });

  it("uploads each software platform to its explicit slot and adopts the returned row version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ resource: { ...software, rowVersion: 3 } }),
      ),
    );
    render(<DownloadResourceManager resources={[software]} />);
    fireEvent.change(screen.getByLabelText("上传 macOS 安装包"), {
      target: { files: [new File(["pkg"], "mario.pkg")] },
    });
    await waitFor(() => expect(screen.getByText("版本 3")).toBeVisible());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/v1/admin/downloads/${software.id}/upload/macos`,
      expect.objectContaining({ headers: { "If-Match": '"2"' } }),
    );
  });

  it("keeps the document editor behavior, including PDF controls and policies", () => {
    render(<DownloadResourceManager resources={[documentResource]} />);
    expect(screen.getByLabelText("上传 PDF")).toHaveAttribute(
      "accept",
      "application/pdf,.pdf",
    );
    expect(screen.getByLabelText("预览权限")).toBeVisible();
    expect(screen.getByRole("link", { name: "预览当前草稿" })).toHaveAttribute(
      "href",
      `/admin/downloads/preview/${documentResource.id}`,
    );
  });

  it("forces contact download when document preview is contact", () => {
    render(<DownloadResourceManager resources={[documentResource]} />);
    fireEvent.change(screen.getByLabelText("预览权限"), {
      target: { value: "contact" },
    });
    expect(screen.getByLabelText("下载权限")).toHaveValue("contact");
    expect(screen.getByRole("option", { name: "可下载" })).toBeDisabled();
  });

  it("locks uploads, filters, navigation and New while dirty, then unlocks after save or reset", async () => {
    render(
      <DownloadResourceManager resources={[software, documentResource]} />,
    );
    fireEvent.change(screen.getByLabelText("版本号"), {
      target: { value: "v2.1.0" },
    });
    expect(screen.getByLabelText("上传 macOS 安装包")).toBeDisabled();
    expect(screen.getByLabelText("资源状态")).toBeDisabled();
    expect(screen.getByRole("button", { name: "新增资源" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /产品资料/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(screen.getByLabelText("上传 macOS 安装包")).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("版本号"), {
      target: { value: "v2.1.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "新增资源" }),
      ).not.toBeDisabled(),
    );
  });

  it("confirms lifecycle mutations, supports cancel and Escape, and restores trigger focus", async () => {
    render(<DownloadResourceManager resources={[software]} />);
    const trigger = screen.getByRole("button", { name: "发布资源" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    await waitFor(() => expect(actions.publish).toHaveBeenCalled());
  });

  it("renders safe create field errors with accessibility wiring", async () => {
    actions.create.mockResolvedValueOnce({
      kind: "validation_error",
      fieldErrors: { key: ["资源键已存在"] },
    });
    render(<DownloadResourceManager resources={[software]} />);
    fireEvent.click(screen.getByRole("button", { name: "新增资源" }));
    fireEvent.change(screen.getByRole("textbox", { name: /资源键/ }), {
      target: { value: "mdd2-client" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /后台名称/ }), {
      target: { value: "码里奥桌面客户端" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建资源" }));
    await waitFor(() => expect(screen.getByText("资源键已存在")).toBeVisible());
    expect(screen.getByRole("textbox", { name: /资源键/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
