import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  createRepository: vi.fn(),
  createService: vi.fn(),
  list: vi.fn(),
  getById: vi.fn(),
  createDocumentAction: vi.fn(),
  saveDocumentAction: vi.fn(),
  publishDocumentAction: vi.fn(),
  archiveDocumentAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
  restoreDocumentAction: vi.fn(),
}));

vi.mock("@/server/auth/access", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/server/documents/repository", () => ({
  createDatabaseDocumentRepository: mocks.createRepository,
}));
vi.mock("@/server/documents/service", () => ({
  createDocumentService: mocks.createService,
}));
vi.mock("@/server/documents/server-actions", () => ({
  createDocumentAction: mocks.createDocumentAction,
  saveDocumentAction: mocks.saveDocumentAction,
  publishDocumentAction: mocks.publishDocumentAction,
  archiveDocumentAction: mocks.archiveDocumentAction,
  deleteDocumentAction: mocks.deleteDocumentAction,
  restoreDocumentAction: mocks.restoreDocumentAction,
}));

import AdminDocsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createRepository.mockReturnValue({});
  mocks.createService.mockReturnValue({
    list: mocks.list,
    getById: mocks.getById,
  });
});

afterEach(cleanup);

const selectedId = "019f7b47-3040-7000-8000-000000000001";
const listItem = {
  id: selectedId,
  slug: "quick-start",
  title: "快速开始",
  summary: "从安装到运行第一个 Agent。",
  status: "published" as const,
  revision: 3,
  rowVersion: 5,
  publishedRevision: 2,
  deleted: false,
  updatedAt: "2026-07-19T00:00:00.000Z",
};
const selectedDocument = {
  ...listItem,
  revisionId: "019f7b47-3040-7000-8000-000000000099",
  publishedAt: "2026-07-18T00:00:00.000Z",
  archivedAt: null,
  deletedAt: null,
  body: {
    format: "safe-markdown-v1" as const,
    source: "# 快速开始",
    checksum: "a".repeat(64),
    navigation: { label: "快速开始", code: "QUICK_START", position: 10 },
    renderModel: {
      version: 1 as const,
      root: { type: "root" as const, children: [] },
      toc: [],
    },
  },
};

describe("AdminDocsPage", () => {
  it("authorizes admin:docs before constructing or reading the document service", async () => {
    const denial = new Error("permission denied");
    mocks.requirePermission.mockRejectedValue(denial);

    await expect(
      AdminDocsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toBe(denial);

    expect(mocks.requirePermission).toHaveBeenCalledWith("admin:docs");
    expect(mocks.createRepository).not.toHaveBeenCalled();
    expect(mocks.createService).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.getById).not.toHaveBeenCalled();
  });

  it("uses strict safe query defaults when URL parameters are invalid or repeated", async () => {
    const actor = {
      userId: "staff-1",
      realm: "workforce",
      status: "active",
      permissions: ["admin:docs"],
    };
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    render(
      await AdminDocsPage({
        searchParams: Promise.resolve({
          search: ["one", "two"],
          status: "deleted",
          sort: ["title_asc", "updated_desc"],
          page: "0",
          pageSize: "200",
          selection: [
            "019f7b47-3040-7000-8000-000000000001",
            "019f7b47-3040-7000-8000-000000000002",
          ],
        }),
      }),
    );

    expect(mocks.list).toHaveBeenCalledWith(
      {
        search: "",
        status: undefined,
        sort: "updated_desc",
        page: 1,
        pageSize: 20,
      },
      actor,
    );
    expect(mocks.getById).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "文档管理" })).toBeVisible();
    expect(screen.getByText("当前筛选条件下没有文档。")).toBeVisible();
  });

  it("passes validated search, status, sort and pagination to the service", async () => {
    const actor = {
      userId: "super-admin",
      realm: "workforce",
      status: "active",
      permissions: ["admin:docs", "admin:docs:delete"],
    };
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.list.mockResolvedValue({
      items: [listItem],
      total: 21,
      page: 2,
      pageSize: 10,
    });
    mocks.getById.mockResolvedValue(selectedDocument);

    render(
      await AdminDocsPage({
        searchParams: Promise.resolve({
          search: "  Agent  ",
          status: "published",
          sort: "title_asc",
          page: "2",
          pageSize: "10",
          selection: selectedId,
          role: "superadmin-from-browser",
        }),
      }),
    );

    expect(mocks.list).toHaveBeenCalledWith(
      {
        search: "Agent",
        status: "published",
        sort: "title_asc",
        page: 2,
        pageSize: 10,
      },
      actor,
    );
    expect(mocks.getById).toHaveBeenCalledWith(selectedId, actor);
    expect(screen.getByRole("searchbox", { name: "搜索文档" })).toHaveValue(
      "Agent",
    );
    expect(screen.getByLabelText("文档状态")).toHaveValue("published");
    expect(screen.getByLabelText("排序方式")).toHaveValue("title_asc");
    expect(screen.getByLabelText("每页数量")).toHaveValue("10");
    expect(screen.getByRole("link", { name: /快速开始/ })).toHaveAttribute(
      "href",
      expect.stringContaining(`selection=${selectedId}`),
    );
    expect(screen.getByRole("heading", { name: "快速开始" })).toBeVisible();
    expect(screen.getByRole("button", { name: "删除文档" })).toBeVisible();
    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "href",
      expect.stringContaining("page=3"),
    );
  });

  it("uses only authoritative permissions for destructive UI", async () => {
    mocks.requirePermission.mockResolvedValue({
      userId: "editor",
      permissions: ["admin:docs"],
    });
    mocks.list.mockResolvedValue({
      items: [listItem],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    mocks.getById.mockResolvedValue(selectedDocument);

    render(
      await AdminDocsPage({
        searchParams: Promise.resolve({
          selection: selectedId,
          role: "superadmin",
          canDelete: "true",
        }),
      }),
    );

    expect(screen.getByRole("heading", { name: "快速开始" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "删除文档" })).toBeNull();
  });

  it("renders a stable load error without attempting a selection read", async () => {
    mocks.requirePermission.mockResolvedValue({
      userId: "editor",
      permissions: ["admin:docs"],
    });
    mocks.list.mockRejectedValue(new Error("database host leaked"));

    render(
      await AdminDocsPage({
        searchParams: Promise.resolve({ selection: selectedId }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "文档暂时无法加载，请稍后重试。",
    );
    expect(screen.queryByText("database host leaked")).toBeNull();
    expect(mocks.getById).not.toHaveBeenCalled();
  });

  it("renders a stable selection error instead of a creation form", async () => {
    mocks.requirePermission.mockResolvedValue({
      userId: "editor",
      permissions: ["admin:docs"],
    });
    mocks.list.mockResolvedValue({
      items: [listItem],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    mocks.getById.mockResolvedValue(null);

    render(
      await AdminDocsPage({
        searchParams: Promise.resolve({ selection: selectedId }),
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "所选文档不存在或暂时无法读取。",
    );
    expect(screen.queryByRole("heading", { name: "新建文档" })).toBeNull();
  });

  it("remounts the editor when selection and CAS identity change", async () => {
    const actor = {
      userId: "editor",
      permissions: ["admin:docs"],
    };
    const selectedB = {
      ...selectedDocument,
      id: "019f7b47-3040-7000-8000-000000000002",
      revisionId: "019f7b47-3040-7000-8000-000000000098",
      slug: "deployment",
      title: "部署指南",
      summary: "部署到生产环境。",
      revision: 7,
      rowVersion: 9,
      body: {
        ...selectedDocument.body,
        source: "# 部署指南",
        navigation: {
          label: "部署指南",
          code: "DEPLOYMENT",
          position: 20,
        },
      },
    };
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.list.mockResolvedValue({
      items: [listItem, { ...listItem, ...selectedB }],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    mocks.getById.mockResolvedValueOnce(selectedDocument);
    const view = render(
      await AdminDocsPage({
        searchParams: Promise.resolve({ selection: selectedDocument.id }),
      }),
    );
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "未保存的 A" },
    });
    fireEvent.change(screen.getByLabelText("文档正文（安全 Markdown）"), {
      target: { value: "# 未保存的 A" },
    });

    mocks.getById.mockResolvedValueOnce(selectedB);
    view.rerender(
      await AdminDocsPage({
        searchParams: Promise.resolve({ selection: selectedB.id }),
      }),
    );

    expect(screen.getByLabelText("标题")).toHaveValue("部署指南");
    expect(screen.getByLabelText("文档正文（安全 Markdown）")).toHaveValue(
      "# 部署指南",
    );
    const editorForm = screen.getByLabelText("标题").closest("form");
    expect(editorForm).not.toBeNull();
    expect(within(editorForm!).getByDisplayValue(selectedB.id)).toHaveAttribute(
      "name",
      "id",
    );
    expect(
      editorForm?.querySelector('input[name="expectedRevision"]'),
    ).toHaveValue("7");
    expect(
      editorForm?.querySelector('input[name="expectedRowVersion"]'),
    ).toHaveValue("9");
  });
});
