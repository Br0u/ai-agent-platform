import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentEditor } from "@/components/admin/document-editor";
import { metadataForRegisteredRoute } from "@/components/route-scaffold/registered-route-page";
import { AuthAccessError, requirePermission } from "@/server/auth/access";
import {
  DOCUMENT_SORTS,
  DOCUMENT_STATUSES,
  documentIdSchema,
  type AdminDocumentQuery,
  type SelectedDocumentDto,
} from "@/server/documents/contracts";
import { createDatabaseDocumentRepository } from "@/server/documents/repository";
import { createDocumentService } from "@/server/documents/service";
import "@/components/admin/document-manager.css";

export const metadata = metadataForRegisteredRoute("/admin/docs");

type RawSearchParams = Record<string, string | string[] | undefined>;

function unique(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" ? raw : undefined;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw || !/^\d+$/u.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function queryFrom(raw: RawSearchParams): AdminDocumentQuery {
  const rawSearch = unique(raw.search)?.trim() ?? "";
  const search = rawSearch.length <= 120 ? rawSearch : "";
  const rawStatus = unique(raw.status);
  const status = DOCUMENT_STATUSES.find((value) => value === rawStatus);
  const rawSort = unique(raw.sort);
  const sort =
    DOCUMENT_SORTS.find((value) => value === rawSort) ?? "updated_desc";
  const rawPage = positiveInteger(unique(raw.page), 1);
  const page = rawPage <= 10_000 ? rawPage : 1;
  const rawPageSize = positiveInteger(unique(raw.pageSize), 20);
  const pageSize = ([10, 20, 50] as const).includes(rawPageSize as 10 | 20 | 50)
    ? (rawPageSize as 10 | 20 | 50)
    : 20;
  return { search, status, sort, page, pageSize };
}

function selectionFrom(raw: RawSearchParams): string | undefined {
  const parsed = documentIdSchema.safeParse(unique(raw.selection));
  return parsed.success ? parsed.data : undefined;
}

function queryHref(
  query: AdminDocumentQuery,
  values: { page?: number; selection?: string },
): string {
  const params = new URLSearchParams({
    search: query.search,
    sort: query.sort,
    page: String(values.page ?? query.page),
    pageSize: String(query.pageSize),
  });
  if (query.status) params.set("status", query.status);
  if (values.selection) params.set("selection", values.selection);
  return `/admin/docs?${params.toString()}`;
}

const statusLabels = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
} as const;

export default async function AdminDocsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  let actor;
  try {
    actor = await requirePermission("admin:docs");
  } catch (error) {
    if (
      error instanceof AuthAccessError &&
      error.code === "AUTH_PERMISSION_DENIED"
    ) {
      notFound();
    }
    throw error;
  }
  const raw = await searchParams;
  const query = queryFrom(raw);
  const selection = selectionFrom(raw);
  const service = createDocumentService(createDatabaseDocumentRepository());
  let result;
  try {
    result = await service.list(query, actor);
  } catch {
    return (
      <main className="document-manager">
        <h1>文档管理</h1>
        <p role="alert">文档暂时无法加载，请稍后重试。</p>
      </main>
    );
  }
  let selectedDocument: SelectedDocumentDto | null = null;
  let selectionUnavailable = false;
  if (selection) {
    try {
      selectedDocument = await service.getById(selection, actor);
      selectionUnavailable = selectedDocument === null;
    } catch {
      selectionUnavailable = true;
    }
  }
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const canDelete = actor.permissions.includes("admin:docs:delete");

  return (
    <main className="document-manager">
      <header className="document-manager__heading">
        <div>
          <p>Content Operations</p>
          <h1>文档管理</h1>
          <span>编辑安全 Markdown 草稿，并控制预览、发布与归档。</span>
        </div>
        <Link
          className="document-manager__new"
          href={queryHref(query, { page: 1 })}
        >
          新建文档
        </Link>
      </header>

      <form className="document-manager__filters" role="search">
        <input name="page" type="hidden" value="1" />
        {selection ? (
          <input name="selection" type="hidden" value={selection} />
        ) : null}
        <label>
          搜索文档
          <input
            aria-label="搜索文档"
            defaultValue={query.search}
            maxLength={120}
            name="search"
            type="search"
          />
        </label>
        <label>
          文档状态
          <select
            aria-label="文档状态"
            defaultValue={query.status ?? ""}
            name="status"
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="published">已发布</option>
            <option value="archived">已归档</option>
          </select>
        </label>
        <label>
          排序方式
          <select aria-label="排序方式" defaultValue={query.sort} name="sort">
            <option value="updated_desc">最近更新</option>
            <option value="updated_asc">最早更新</option>
            <option value="title_asc">标题 A–Z</option>
            <option value="title_desc">标题 Z–A</option>
          </select>
        </label>
        <label>
          每页数量
          <select
            aria-label="每页数量"
            defaultValue={String(query.pageSize)}
            name="pageSize"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
        <button type="submit">应用筛选</button>
      </form>

      <div className="document-manager__workspace">
        <aside
          aria-labelledby="document-list-heading"
          className="document-manager__list"
        >
          <header>
            <div>
              <p>Library</p>
              <h2 id="document-list-heading">文档列表</h2>
            </div>
            <span>{result.total} 篇</span>
          </header>
          {result.items.length === 0 ? (
            <p className="document-manager__empty">当前筛选条件下没有文档。</p>
          ) : (
            <nav aria-label="文档列表">
              <ul>
                {result.items.map((item) => (
                  <li data-selected={item.id === selection} key={item.id}>
                    <Link
                      aria-current={item.id === selection ? "page" : undefined}
                      href={queryHref(query, {
                        page: query.page,
                        selection: item.id,
                      })}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.slug}</span>
                      <small>
                        {item.deleted ? "已删除" : statusLabels[item.status]} ·
                        r{item.revision}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <nav aria-label="文档分页" className="document-manager__pagination">
            {query.page > 1 ? (
              <Link
                href={queryHref(query, {
                  page: query.page - 1,
                  selection,
                })}
              >
                上一页
              </Link>
            ) : (
              <span>上一页</span>
            )}
            <span>
              第 {query.page} / {pageCount} 页
            </span>
            {query.page < pageCount ? (
              <Link
                href={queryHref(query, {
                  page: query.page + 1,
                  selection,
                })}
              >
                下一页
              </Link>
            ) : (
              <span>下一页</span>
            )}
          </nav>
        </aside>

        <div className="document-manager__editor-column">
          {selectionUnavailable ? (
            <p className="document-manager__selection-error" role="alert">
              所选文档不存在或暂时无法读取。
            </p>
          ) : null}
          {!selection || selectedDocument ? (
            <DocumentEditor
              canDelete={canDelete}
              document={selectedDocument}
              key={
                selectedDocument
                  ? `${selectedDocument.id}:${selectedDocument.revision}:${selectedDocument.rowVersion}`
                  : "new"
              }
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
