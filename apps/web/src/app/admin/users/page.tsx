import Link from "next/link";
import {
  createEmployeeAction,
  disableUserAction,
  reactivateUserAction,
  replacePasswordAction,
  revokeAdminSessionAction,
  revokeAllAdminSessionsAction,
} from "@/server/admin/actions";
import {
  WORKFORCE_ROLES,
  createDefaultWorkforceUserQueryService,
} from "@/server/admin/users";
import { requirePermission } from "@/server/auth/access";

const realms = new Set(["customer", "workforce"]);
const statuses = new Set(["pending_review", "active", "disabled", "rejected"]);
function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
function queryFrom(raw: Record<string, string | string[] | undefined>) {
  const page = Math.max(1, Number(one(raw.page)) || 1);
  const pageSize = [10, 20, 50].includes(Number(one(raw.pageSize)))
    ? Number(one(raw.pageSize))
    : 20;
  const realm = one(raw.realm);
  const status = one(raw.status);
  return {
    search: one(raw.search)?.trim() || undefined,
    realm: realms.has(realm ?? "")
      ? (realm as "customer" | "workforce")
      : undefined,
    status: statuses.has(status ?? "")
      ? (status as "pending_review" | "active" | "disabled" | "rejected")
      : undefined,
    page,
    pageSize,
  };
}
function pageHref(query: ReturnType<typeof queryFrom>, page: number) {
  const values = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.search) values.set("search", query.search);
  if (query.realm) values.set("realm", query.realm);
  if (query.status) values.set("status", query.status);
  return `?${values.toString()}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("admin:users");
  const query = queryFrom(await searchParams);
  const result = await createDefaultWorkforceUserQueryService().list(
    actor,
    query,
  );
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <main className="admin-workbench">
      <header>
        <p>Identity Administration</p>
        <h1>用户管理</h1>
        <p>客户与内部员工账号、状态和会话管理。</p>
      </header>
      <form className="admin-filter">
        <label>
          搜索
          <input name="search" defaultValue={query.search} />
        </label>
        <label>
          用户类型
          <select
            aria-label="用户类型"
            name="realm"
            defaultValue={query.realm ?? ""}
          >
            <option value="">全部</option>
            <option value="customer">客户</option>
            <option value="workforce">内部员工</option>
          </select>
        </label>
        <label>
          状态
          <select
            aria-label="状态"
            name="status"
            defaultValue={query.status ?? ""}
          >
            <option value="">全部</option>
            <option value="pending_review">待审核</option>
            <option value="active">启用</option>
            <option value="disabled">停用</option>
            <option value="rejected">已拒绝</option>
          </select>
        </label>
        <button>筛选</button>
      </form>
      <details open>
        <summary>创建内部员工</summary>
        <form action={createEmployeeAction}>
          <label>
            姓名
            <input required name="name" />
          </label>
          <label>
            邮箱
            <input required type="email" name="email" />
          </label>
          <label>
            用户名
            <input required name="username" />
          </label>
          <label>
            临时密码
            <input required type="password" name="temporaryPassword" />
          </label>
          <label>
            初始角色
            <select name="initialRole">
              {WORKFORCE_ROLES.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>
          <button>创建员工</button>
        </form>
      </details>
      <table>
        <thead>
          <tr>
            <th>用户</th>
            <th>类型 / 状态</th>
            <th>角色</th>
            <th>会话</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((user) => (
            <tr key={user.id}>
              <td>
                {user.name}
                <br />
                <small>{user.email}</small>
              </td>
              <td>
                {user.realm === "customer" ? "客户" : "内部员工"} /{" "}
                {user.status}
              </td>
              <td>{user.role ?? "—"}</td>
              <td>
                {user.sessions.map((session) => (
                  <form action={revokeAdminSessionAction} key={session.id}>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="realm" value={user.realm} />
                    <input type="hidden" name="sessionId" value={session.id} />
                    <time dateTime={session.createdAt}>
                      {session.createdAt.slice(0, 10)}
                    </time>{" "}
                    <button>撤销此会话</button>
                  </form>
                ))}
              </td>
              <td>
                {user.realm === "workforce" ? (
                  <>
                    {user.status === "disabled" ? (
                      <form action={reactivateUserAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button>恢复账号</button>
                      </form>
                    ) : (
                      <form action={disableUserAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <button>停用账号</button>
                      </form>
                    )}
                    <form action={replacePasswordAction}>
                      <input type="hidden" name="userId" value={user.id} />
                      <label>
                        新临时密码
                        <input
                          required
                          type="password"
                          name="temporaryPassword"
                        />
                      </label>
                      <button>替换临时密码</button>
                    </form>
                  </>
                ) : null}
                <form action={revokeAllAdminSessionsAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="realm" value={user.realm} />
                  <button>撤销全部会话</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav aria-label="用户分页">
        {query.page > 1 ? (
          <Link href={pageHref(query, query.page - 1)}>上一页</Link>
        ) : (
          <span>上一页</span>
        )}
        <span>
          第 {query.page} / {pages} 页
        </span>
        {query.page < pages ? (
          <Link href={pageHref(query, query.page + 1)}>下一页</Link>
        ) : (
          <span>下一页</span>
        )}
      </nav>
    </main>
  );
}
