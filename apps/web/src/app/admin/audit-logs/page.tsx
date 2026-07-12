import Link from "next/link";
import { createDefaultAuditLogQueryService } from "@/server/admin/audit-logs";
import { requirePermission } from "@/server/auth/access";

function value(raw: string | string[] | undefined) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}
function date(raw: string | undefined, end = false) {
  if (!raw) return undefined;
  const parsed = new Date(`${raw}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("admin:audit");
  const raw = await searchParams;
  const fromValue = value(raw.from);
  const toValue = value(raw.to);
  const query = {
    actor: value(raw.actor),
    action: value(raw.action),
    target: value(raw.target),
    from: date(fromValue),
    to: date(toValue, true),
    page: Math.max(1, Number(value(raw.page)) || 1),
    pageSize: 20,
  };
  const result = await createDefaultAuditLogQueryService().list(actor, query);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const href = (page: number) => {
    const values = new URLSearchParams({ page: String(page) });
    if (query.actor) values.set("actor", query.actor);
    if (query.action) values.set("action", query.action);
    if (query.target) values.set("target", query.target);
    if (fromValue) values.set("from", fromValue);
    if (toValue) values.set("to", toValue);
    return `?${values.toString()}`;
  };
  return (
    <main className="admin-workbench">
      <header>
        <p>Compliance</p>
        <h1>操作审计</h1>
        <p>只读、追加式安全事件记录。</p>
      </header>
      <form className="admin-filter">
        <label>
          操作人
          <input name="actor" defaultValue={query.actor} />
        </label>
        <label>
          事件
          <input name="action" defaultValue={query.action} />
        </label>
        <label>
          目标
          <input name="target" defaultValue={query.target} />
        </label>
        <label>
          开始时间
          <input type="date" name="from" defaultValue={fromValue} />
        </label>
        <label>
          结束时间
          <input type="date" name="to" defaultValue={toValue} />
        </label>
        <button>筛选</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>操作人</th>
            <th>事件</th>
            <th>目标</th>
            <th>元数据</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((item) => (
            <tr key={item.id}>
              <td>
                <time dateTime={item.createdAt}>
                  {item.createdAt.slice(0, 19).replace("T", " ")}
                </time>
              </td>
              <td>{item.actorUserId ?? "系统"}</td>
              <td>{item.action}</td>
              <td>
                {item.targetType} / {item.targetId ?? "—"}
              </td>
              <td>
                <code>{JSON.stringify(item.metadata)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav aria-label="审计分页">
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
