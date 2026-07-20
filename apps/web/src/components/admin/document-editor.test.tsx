import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  archive: vi.fn(),
  delete: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/server/documents/server-actions", () => ({
  createDocumentAction: actionMocks.create,
  saveDocumentAction: actionMocks.save,
  publishDocumentAction: actionMocks.publish,
  archiveDocumentAction: actionMocks.archive,
  deleteDocumentAction: actionMocks.delete,
  restoreDocumentAction: actionMocks.restore,
}));

import type { DocumentActionState } from "@/server/documents/actions";
import type { SelectedDocumentDto } from "@/server/documents/contracts";

import { DocumentEditor } from "./document-editor";

const selectedDocument: SelectedDocumentDto = {
  id: "019f7b47-3040-7000-8000-000000000001",
  revisionId: "019f7b47-3040-7000-8000-000000000099",
  slug: "quick-start",
  title: "快速开始",
  summary: "从安装到运行第一个 Agent。",
  status: "published",
  revision: 3,
  rowVersion: 5,
  publishedRevision: 2,
  deleted: false,
  updatedAt: "2026-07-19T00:00:00.000Z",
  publishedAt: "2026-07-18T00:00:00.000Z",
  archivedAt: null,
  deletedAt: null,
  body: {
    format: "safe-markdown-v1",
    source: "# 快速开始\n\n安全正文。",
    checksum: "a".repeat(64),
    navigation: { label: "快速开始", code: "QUICK_START", position: 10 },
    renderModel: { version: 1, root: { type: "root", children: [] }, toc: [] },
  },
};

beforeEach(() => {
  for (const action of Object.values(actionMocks)) {
    action.mockReset();
    action.mockResolvedValue({ kind: "success" });
  }
});

afterEach(() => {
  cleanup();
});

describe("DocumentEditor", () => {
  it("renders a plain safe-Markdown creation form without CAS fields", () => {
    render(<DocumentEditor canDelete={false} document={null} />);

    expect(screen.getByRole("heading", { name: "新建文档" })).toBeVisible();
    expect(screen.getByRole("button", { name: "创建文档" })).toBeEnabled();
    expect(screen.getByLabelText("文档正文（安全 Markdown）")).toBeInstanceOf(
      HTMLTextAreaElement,
    );
    expect(screen.getByText(/不支持 MDX、脚本或任意 HTML/)).toBeVisible();
    expect(
      globalThis.document.querySelector('input[name="expectedRevision"]'),
    ).toBeNull();
  });

  it("shows editable fields, revision state, exact preview and lifecycle controls", () => {
    render(<DocumentEditor canDelete={false} document={selectedDocument} />);

    expect(screen.getByLabelText("标题")).toHaveValue("快速开始");
    expect(screen.getByLabelText("路径标识")).toHaveValue("quick-start");
    expect(screen.getByLabelText("摘要")).toHaveValue(selectedDocument.summary);
    expect(screen.getByLabelText("文档正文（安全 Markdown）")).toHaveValue(
      selectedDocument.body.source,
    );
    expect(screen.getByLabelText("导航名称")).toHaveValue("快速开始");
    expect(screen.getByLabelText("导航代码")).toHaveValue("QUICK_START");
    expect(
      () =>
        new RegExp(
          screen.getByLabelText("导航代码").getAttribute("pattern")!,
          "v",
        ),
    ).not.toThrow();
    expect(screen.getByLabelText("导航顺序")).toHaveValue(10);
    expect(screen.getByText("当前修订 r3")).toBeVisible();
    expect(screen.getByText("已发布 r2")).toBeVisible();
    expect(screen.getByRole("link", { name: "预览当前修订" })).toHaveAttribute(
      "href",
      "/admin/docs/preview/019f7b47-3040-7000-8000-000000000099",
    );
    expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "发布当前修订" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "归档文档" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /删除|恢复/ }),
    ).not.toBeInTheDocument();
    expect(
      globalThis.document.querySelector('input[name="expectedRevision"]'),
    ).toHaveValue("3");
    expect(
      globalThis.document.querySelector('input[name="expectedRowVersion"]'),
    ).toHaveValue("5");
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("only exposes restore for a deleted document when deletion permission is authoritative", () => {
    render(
      <DocumentEditor
        canDelete
        document={{
          ...selectedDocument,
          deleted: true,
          deletedAt: "2026-07-19T01:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("已删除")).toBeVisible();
    expect(screen.getByRole("button", { name: "恢复文档" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "删除文档" })).toBeNull();
    expect(screen.queryByRole("button", { name: "保存草稿" })).toBeNull();
  });

  it("exposes delete for an undeleted document with authoritative permission", () => {
    render(<DocumentEditor canDelete document={selectedDocument} />);

    expect(screen.getByRole("button", { name: "删除文档" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "恢复文档" })).toBeNull();
  });

  it("announces validation errors and exposes the pending state", async () => {
    let resolveAction: ((state: DocumentActionState) => void) | undefined;
    actionMocks.save
      .mockResolvedValueOnce({
        kind: "validation_error",
        fieldErrors: { title: ["字段值无效"] },
      })
      .mockImplementationOnce(
        () =>
          new Promise<DocumentActionState>((resolve) => {
            resolveAction = resolve;
          }),
      );
    render(<DocumentEditor canDelete={false} document={selectedDocument} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    expect(await screen.findByText("字段值无效")).toBeVisible();
    expect(screen.getByLabelText("标题")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("请检查标出的字段。")).toHaveAttribute(
      "role",
      "status",
    );

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    const pendingButton = await screen.findByRole("button", {
      name: "正在保存…",
    });
    expect(pendingButton).toBeVisible();
    expect(actionMocks.save).toHaveBeenCalledTimes(2);

    resolveAction?.({ kind: "success" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled(),
    );
  });
});
