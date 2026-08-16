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

const visionPlaceholder: DownloadResourceAdminDto = {
  ...resource,
  adminStatus: "空记录",
  draftRevision: null,
};

const publishedOnly: DownloadResourceAdminDto = {
  ...resource,
  id: "019f7b47-3040-7000-8000-000000000004",
  key: "published-brief",
  adminLabel: "已发布产品彩页",
  state: "published",
  adminStatus: "已发布",
  rowVersion: 7,
  draftRevision: null,
  publishedRevision: {
    ...draft,
    id: "019f7b47-3040-7000-8000-000000000044",
    name: "已发布产品彩页",
    product: "元启平台",
    pdfObjectKey: "published/pdf",
    coverObjectKey: "published/cover",
    pageCount: 3,
    byteSize: 3072,
    sha256: "b".repeat(64),
    publishedAt: "2026-08-16T03:00:00.000Z",
  },
};

const invalidPublished: DownloadResourceAdminDto = {
  ...publishedOnly,
  id: "019f7b47-3040-7000-8000-000000000005",
  key: "invalid-brief",
  adminLabel: "失效彩页",
  adminStatus: "文件失效",
  draftRevision: {
    ...draft,
    pdfObjectKey: "private/pdf",
    coverObjectKey: "private/cover",
    pageCount: 2,
    byteSize: 1024,
    sha256: "c".repeat(64),
  },
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
    render(
      <DownloadResourceManager resources={[visionPlaceholder, placeholder]} />,
    );

    expect(
      screen.getByRole("heading", { name: "彩页与产品资料" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "软件与客户端" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "元启产品介绍" })).toBeVisible();
    expect(screen.getByText("MDD2 客户端")).toBeVisible();
    expect(screen.getByRole("button", { name: /元启产品介绍/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /MDD2 客户端/ })).toBeVisible();
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
    render(<DownloadResourceManager resources={[resource, placeholder]} />);

    fireEvent.change(screen.getByLabelText("上传 PDF"), {
      target: {
        files: [new File(["pdf"], "intro.pdf", { type: "application/pdf" })],
      },
    });
    expect(screen.getByText("正在上传…")).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "发布资源" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "新增资源" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /MDD2 客户端/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("上传 PDF"), {
      target: {
        files: [new File(["pdf"], "second.pdf", { type: "application/pdf" })],
      },
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

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
    expect(screen.queryByRole("status", { name: /上传未完成/ })).toBeNull();
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

  it("keeps a published resource without a draft on its live record until editing creates a draft", async () => {
    const editing: DownloadResourceAdminDto = {
      ...publishedOnly,
      rowVersion: 8,
      draftRevision: { ...draft, id: "019f7b47-3040-7000-8000-000000000088" },
    };
    actions.save.mockResolvedValue({ kind: "success", resource: editing });
    render(<DownloadResourceManager resources={[publishedOnly]} />);

    expect(screen.getByText(/已发布于/)).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "预览当前草稿" })).toBeNull();
    expect(screen.getByLabelText("上传 PDF")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    await waitFor(() => expect(actions.save).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByLabelText("上传 PDF")).toBeEnabled(),
    );
    expect(screen.getByText(/上次保存/)).toBeVisible();
  });

  it("uses accessible confirmation dialogs for lifecycle changes and adopts their returned row version", async () => {
    const published: DownloadResourceAdminDto = {
      ...resource,
      state: "published",
      adminStatus: "已发布",
      rowVersion: 4,
      draftRevision: null,
      publishedRevision: publishedOnly.publishedRevision,
    };
    const downlined = {
      ...published,
      state: "downline" as const,
      adminStatus: "已下线" as const,
      rowVersion: 5,
    };
    actions.downline.mockResolvedValue({
      kind: "success",
      resource: downlined,
    });
    render(<DownloadResourceManager resources={[published]} />);

    const trigger = screen.getByRole("button", { name: "下线资源" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "确认下线" })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "下线资源" })).toHaveFocus(),
    );

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "确认下线" }));

    await waitFor(() => expect(actions.downline).toHaveBeenCalledOnce());
    expect(await screen.findByText("版本 5")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /元启产品介绍/ }),
      ).toHaveFocus(),
    );
  });

  it("shows field-level save errors and keeps upload errors inline without alerting", async () => {
    actions.save.mockResolvedValue({
      kind: "validation_error",
      fieldErrors: { name: ["名称不能为空"] },
    });
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { version: "1", error: { code: "invalid_pdf" } },
          { status: 422 },
        ),
      ),
    );
    render(<DownloadResourceManager resources={[resource]} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(await screen.findByText("名称不能为空")).toBeVisible();
    expect(screen.getByRole("textbox", { name: /资源名称/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    fireEvent.change(screen.getByLabelText("上传 PDF"), {
      target: {
        files: [new File(["not pdf"], "bad.pdf", { type: "application/pdf" })],
      },
    });
    expect(
      await screen.findByText("请上传可打开的 PDF 文件后重试。"),
    ).toBeVisible();
    expect(alert).not.toHaveBeenCalled();
  });

  it("shows duplicate resource keys inline in the create dialog", async () => {
    actions.create.mockResolvedValue({
      kind: "validation_error",
      fieldErrors: { key: ["资源键已存在"] },
    });
    render(<DownloadResourceManager resources={[resource]} />);

    fireEvent.click(screen.getByRole("button", { name: "新增资源" }));
    fireEvent.change(screen.getByLabelText("资源键"), {
      target: { value: "vision-intro" },
    });
    fireEvent.change(screen.getByLabelText("后台名称"), {
      target: { value: "重复的资源" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建资源" }));

    expect(await screen.findByText("资源键已存在")).toBeVisible();
    expect(screen.getByLabelText(/资源键/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("filters by status, category, product and revision text without losing the selected resource", () => {
    const deployment = {
      ...resource,
      id: "019f7b47-3040-7000-8000-000000000006",
      key: "deployment-guide",
      adminLabel: "部署指南",
      adminStatus: "待发布" as const,
      draftRevision: {
        ...draft,
        name: "部署说明",
        product: "码里奥",
        category: "deployment" as const,
      },
    };
    render(
      <DownloadResourceManager
        resources={[resource, deployment, placeholder]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /部署指南/ }));
    fireEvent.change(screen.getByLabelText("资源状态"), {
      target: { value: "待发布" },
    });
    expect(screen.getByRole("button", { name: /部署指南/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.change(screen.getByLabelText("筛选资源分类"), {
      target: { value: "deployment" },
    });
    fireEvent.change(screen.getByLabelText("筛选产品"), {
      target: { value: "码里奥" },
    });
    fireEvent.change(screen.getByLabelText("搜索资源"), {
      target: { value: "说明" },
    });
    expect(screen.getByText("可见资源 1 条")).toBeVisible();
    expect(screen.getByRole("button", { name: /部署指南/ })).toBeVisible();
  });

  it("does not expose preview or publish controls for an invalid resource", () => {
    render(<DownloadResourceManager resources={[invalidPublished]} />);

    expect(screen.getByRole("button", { name: "发布资源" })).toBeDisabled();
    expect(screen.queryByRole("img", { name: "失效彩页 封面" })).toBeNull();
    expect(screen.queryByRole("link", { name: "预览当前草稿" })).toBeNull();
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
