import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  downline: vi.fn(),
  discard: vi.fn(),
  removeFile: vi.fn(),
}));

vi.mock("@/server/downloads/server-actions", () => ({
  createDownloadResourceAction: actions.create,
  saveDownloadDraftAction: actions.save,
  publishDownloadResourceAction: actions.publish,
  downlineDownloadResourceAction: actions.downline,
  discardDownloadDraftAction: actions.discard,
  removeDownloadDraftFileAction: actions.removeFile,
}));

import type { DownloadResourceAdminDto } from "@/server/downloads/contracts";

import { DownloadResourceManager } from "./download-resource-manager";

const draft: NonNullable<DownloadResourceAdminDto["draftRevision"]> = {
  id: "019f7b47-3040-7000-8000-000000000011",
  name: "元启产品介绍",
  product: "华鲲元启",
  category: "materials",
  resourceType: "产品介绍",
  description: "面向客户的产品资料。",
  sortOrder: 10,
  previewPolicy: "public",
  downloadPolicy: "contact",
  pdfObjectKey: null,
  coverObjectKey: null,
  pageCount: null,
  byteSize: null,
  sha256: null,
  createdAt: "2026-08-16T01:00:00.000Z",
  publishedAt: null,
};

const resource: DownloadResourceAdminDto = {
  id: "019f7b47-3040-7000-8000-000000000001",
  key: "vision-intro",
  adminLabel: "元启产品介绍",
  state: "unpublished",
  adminStatus: "待上传",
  rowVersion: 2,
  publishedRevision: null,
  draftRevision: draft,
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T01:00:00.000Z",
};

const placeholder: DownloadResourceAdminDto = {
  ...resource,
  id: "019f7b47-3040-7000-8000-000000000002",
  key: "mdd2-client",
  adminLabel: "MDD2 客户端",
  adminStatus: "空记录",
  draftRevision: null,
};

beforeEach(() => {
  for (const action of Object.values(actions)) {
    action.mockReset();
    action.mockResolvedValue({ kind: "success", resource });
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DownloadResourceManager", () => {
  it("groups resources by the four fixed download categories and keeps empty records visible", () => {
    render(<DownloadResourceManager resources={[resource, placeholder]} />);

    expect(
      screen.getByRole("heading", { name: "彩页与产品资料" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "软件与客户端" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "元启产品介绍" })).toBeVisible();
    expect(screen.getByText("MDD2 客户端")).toBeVisible();
    expect(screen.getAllByText("待上传").at(-1)).toBeVisible();
    expect(screen.getByText("空记录")).toBeVisible();
  });

  it("creates a resource, closes the dialog and selects the returned row", async () => {
    const created: DownloadResourceAdminDto = {
      ...resource,
      id: "019f7b47-3040-7000-8000-000000000003",
      key: "new-resource",
      adminLabel: "新资源",
      rowVersion: 1,
      adminStatus: "空记录",
      draftRevision: null,
    };
    actions.create.mockResolvedValue({ kind: "success", resource: created });
    render(<DownloadResourceManager resources={[resource]} />);

    fireEvent.click(screen.getByRole("button", { name: "新增资源" }));
    fireEvent.change(screen.getByLabelText("资源键"), {
      target: { value: "new-resource" },
    });
    fireEvent.change(screen.getByLabelText("后台名称"), {
      target: { value: "新资源" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建资源" }));

    await waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "新资源" })).toBeVisible();
    expect(screen.getByText("版本 1")).toBeInTheDocument();
  });

  it("closes the creation dialog with Escape and restores the new-resource trigger", async () => {
    render(<DownloadResourceManager resources={[resource]} />);
    const trigger = screen.getByRole("button", { name: "新增资源" });
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByLabelText("资源键")).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("applies category defaults only until an access policy is explicitly changed", () => {
    render(<DownloadResourceManager resources={[resource]} />);

    fireEvent.change(screen.getByRole("combobox", { name: "资源分类" }), {
      target: { value: "deployment" },
    });
    expect(screen.getByLabelText("预览权限")).toHaveValue("contact");
    fireEvent.change(screen.getByLabelText("预览权限"), {
      target: { value: "public" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "资源分类" }), {
      target: { value: "whitepapers" },
    });
    expect(screen.getByLabelText("预览权限")).toHaveValue("public");
    fireEvent.change(screen.getByLabelText("预览权限"), {
      target: { value: "contact" },
    });
    expect(screen.getByLabelText("下载权限")).toHaveValue("contact");
    expect(screen.getByRole("option", { name: "可下载" })).toBeDisabled();
  });

  it("uploads with If-Match, disables conflicting actions, then adopts returned rowVersion", async () => {
    let resolveUpload: ((value: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveUpload = resolve;
          }),
      ),
    );
    render(<DownloadResourceManager resources={[resource]} />);

    fireEvent.change(screen.getByLabelText("上传 PDF"), {
      target: {
        files: [new File(["pdf"], "intro.pdf", { type: "application/pdf" })],
      },
    });
    expect(screen.getByText("正在上传…")).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "发布资源" })).toBeDisabled();

    resolveUpload?.(
      Response.json({
        version: "1",
        requestId: "upload-1",
        resource: { ...resource, rowVersion: 3 },
      }),
    );
    await waitFor(() => expect(screen.getByText("版本 3")).toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/v1/admin/downloads/${resource.id}/upload`,
      expect.objectContaining({
        headers: expect.objectContaining({ "If-Match": '"2"' }),
      }),
    );
  });

  it("aborts an in-flight upload and restores editing controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      ),
    );
    render(<DownloadResourceManager resources={[resource]} />);

    fireEvent.change(screen.getByLabelText("上传 PDF"), {
      target: {
        files: [new File(["pdf"], "intro.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "取消上传" }));

    await waitFor(() =>
      expect(screen.queryByText("正在上传…")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
  });

  it("uses authenticated draft endpoints for the cover and preview", () => {
    const complete: DownloadResourceAdminDto = {
      ...resource,
      draftRevision: {
        ...draft,
        pdfObjectKey: "private/pdf",
        coverObjectKey: "private/cover",
        pageCount: 4,
        byteSize: 1024,
        sha256: "a".repeat(64),
      },
    };
    render(<DownloadResourceManager resources={[complete]} />);

    expect(
      screen.getByRole("img", { name: "元启产品介绍 封面" }),
    ).toHaveAttribute(
      "src",
      `/api/v1/admin/downloads/${resource.id}/draft/cover`,
    );
    expect(screen.getByRole("link", { name: "预览当前草稿" })).toHaveAttribute(
      "href",
      `/api/v1/admin/downloads/${resource.id}/draft/pdf`,
    );
  });

  it("blocks downline while a pending draft exists and confirms visibility-changing actions", () => {
    const publishedWithDraft: DownloadResourceAdminDto = {
      ...resource,
      state: "published",
      adminStatus: "有待发布更改",
      publishedRevision: {
        ...draft,
        id: "019f7b47-3040-7000-8000-000000000022",
        pdfObjectKey: "pdf",
        coverObjectKey: "cover",
        pageCount: 1,
        byteSize: 1,
        sha256: "a".repeat(64),
        publishedAt: "2026-08-16T01:00:00.000Z",
      },
    };
    render(<DownloadResourceManager resources={[publishedWithDraft]} />);

    expect(screen.getByRole("button", { name: "下线资源" })).toBeDisabled();
    expect(screen.getByText("请先发布或丢弃当前草稿后再下线。")).toBeVisible();
  });
});
