import Link from "next/link";
import { AdminMutationForm } from "@/components/admin/admin-mutation-form";
import {
  addUserRoleAction,
  removeUserRoleAction,
  replaceRolePermissionsAction,
} from "@/server/admin/actions";
import { createDefaultRoleQueryService } from "@/server/admin/roles";
import { requirePermission } from "@/server/auth/access";
import { parsePositivePage } from "../admin-page-values";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("admin:roles");
  const raw = await searchParams;
  const query = {
    search: typeof raw.search === "string" ? raw.search : undefined,
    realm: "workforce" as const,
    page: parsePositivePage(
      typeof raw.page === "string" ? raw.page : undefined,
    ),
    pageSize: 20,
  };
  const result = await createDefaultRoleQueryService().list(actor, query);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const href = (page: number) =>
    `?${new URLSearchParams({ ...(query.search ? { search: query.search } : {}), page: String(page) }).toString()}`;
  return (
    <main className="admin-workbench">
      <header>
        <p>Authorization</p>
        <h1>角色与权限</h1>
        <p>仅管理内部员工域角色；客户角色不在此处混用。</p>
      </header>
      <form>
        <label>
          搜索角色
          <input name="search" defaultValue={query.search} />
        </label>
        <button>筛选</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>角色</th>
            <th>作用域</th>
            <th>权限</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((role) => (
            <tr key={role.id}>
              <td>
                {role.name}
                <br />
                <small>{role.description}</small>
              </td>
              <td>内部员工域</td>
              <td>{role.permissionKeys.join(", ") || "—"}</td>
              <td>
                <AdminMutationForm action={replaceRolePermissionsAction}>
                  <input type="hidden" name="roleId" value={role.id} />
                  <label>
                    权限键（逗号分隔）
                    <input
                      name="permissionKeys"
                      defaultValue={role.permissionKeys.join(",")}
                    />
                  </label>
                  {role.name === "super_admin" ? (
                    <small>系统基线：admin:roles 不可移除</small>
                  ) : null}
                  <button>更新权限</button>
                </AdminMutationForm>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section>
        <h2>管理员工角色</h2>
        <AdminMutationForm action={addUserRoleAction}>
          <label>
            用户 ID
            <input required name="userId" />
          </label>
          <label>
            角色
            <select name="role">
              {result.items.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <button>添加角色</button>
        </AdminMutationForm>
        <AdminMutationForm action={removeUserRoleAction}>
          <label>
            用户 ID
            <input required name="userId" />
          </label>
          <label>
            角色
            <select name="role">
              {result.items.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <button>移除角色</button>
        </AdminMutationForm>
      </section>
      <nav aria-label="角色分页">
        {query.page > 1 ? (
          <Link href={href(query.page - 1)}>上一页</Link>
        ) : (
          <span>上一页</span>
        )}
        <span>
          第 {query.page} / {pages} 页
        </span>
        {query.page < pages ? (
          <Link href={href(query.page + 1)}>下一页</Link>
        ) : (
          <span>下一页</span>
        )}
      </nav>
    </main>
  );
}
