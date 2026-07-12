import Link from "next/link";
import { RegistrationReviewForm } from "@/components/registration/registration-review-form";
import { requirePermission } from "@/server/auth/access";
import { createDefaultRegistrationService } from "@/server/registration/actions";
import type {
  PublicRegistrationStatus,
  RegistrationQuery,
} from "@/server/registration/service";
import "@/components/registration/registration.css";
import "./registrations.css";

const statuses = new Set<PublicRegistrationStatus>([
  "pending_review",
  "active",
  "rejected",
]);
function queryFrom(
  raw: Record<string, string | string[] | undefined>,
): RegistrationQuery {
  const status =
    typeof raw.status === "string" &&
    statuses.has(raw.status as PublicRegistrationStatus)
      ? (raw.status as PublicRegistrationStatus)
      : "pending_review";
  const pageValue = typeof raw.page === "string" ? Number(raw.page) : 1;
  const sizeValue =
    typeof raw.pageSize === "string" ? Number(raw.pageSize) : 20;
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize =
    ([10, 20, 50] as const).find((size) => size === sizeValue) ?? 20;
  return { status, page, pageSize };
}
function href(query: RegistrationQuery, page: number) {
  return `/admin/registrations?status=${query.status}&page=${page}&pageSize=${query.pageSize}`;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("admin:registrations");
  const query = queryFrom(await searchParams);
  let result;
  try {
    result = await createDefaultRegistrationService().listRegistrationRequests(
      query,
      actor,
    );
  } catch {
    return (
      <main className="registrations-page">
        <h1>客户注册审核</h1>
        <p role="alert">注册申请暂时无法加载，请稍后重试。</p>
      </main>
    );
  }
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <main className="registrations-page">
      <header>
        <p>Customer Operations</p>
        <h1>客户注册审核</h1>
        <p>查看注册信息并完成组织归属决策。邮箱仅在本授权页面展示。</p>
      </header>
      <form className="registrations-filter">
        <label>
          状态
          <select defaultValue={query.status} name="status">
            <option value="pending_review">待审核</option>
            <option value="active">已批准</option>
            <option value="rejected">已拒绝</option>
          </select>
        </label>
        <label>
          每页
          <select defaultValue={query.pageSize} name="pageSize">
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
        <button type="submit">筛选</button>
      </form>
      {result.items.length === 0 ? (
        <p className="registrations-page__empty">当前筛选条件下没有注册申请</p>
      ) : (
        <div className="registrations-table-wrap">
          <table>
            <thead>
              <tr>
                <th>申请人</th>
                <th>邮箱</th>
                <th>公司</th>
                <th>提交时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.applicantName}</td>
                  <td>{item.email}</td>
                  <td>{item.companyName}</td>
                  <td>
                    <time dateTime={item.createdAt}>
                      {new Intl.DateTimeFormat("zh-CN", {
                        dateStyle: "medium",
                      }).format(new Date(item.createdAt))}
                    </time>
                  </td>
                  <td>
                    {item.status === "pending_review"
                      ? "待审核"
                      : item.status === "active"
                        ? "已批准"
                        : "已拒绝"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.status === "pending_review"
        ? result.items.map((item) => (
            <details className="registrations-review" key={`${item.id}-review`}>
              <summary>
                审核 {item.applicantName} / {item.companyName}
              </summary>
              <RegistrationReviewForm
                request={{ id: item.id, companyName: item.companyName }}
              />
            </details>
          ))
        : null}
      <nav aria-label="注册申请分页" className="registrations-pagination">
        {query.page > 1 ? (
          <Link href={href(query, query.page - 1)}>上一页</Link>
        ) : (
          <span>上一页</span>
        )}
        <span>
          第 {query.page} / {pages} 页
        </span>
        {query.page < pages ? (
          <Link href={href(query, query.page + 1)}>下一页</Link>
        ) : (
          <span>下一页</span>
        )}
      </nav>
    </main>
  );
}
