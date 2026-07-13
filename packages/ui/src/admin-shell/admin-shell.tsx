import { useId, type ReactNode } from "react";
import "./admin-shell.css";

export type AdminBreadcrumbItem = {
  label: string;
  href?: string;
};

export type AdminShellProps = {
  children: ReactNode;
  navigation: ReactNode;
  breadcrumb: readonly AdminBreadcrumbItem[];
  environmentStatus: string;
  administratorDisplayName: string;
};

export function AdminShell({
  children,
  navigation,
  breadcrumb,
  environmentStatus,
  administratorDisplayName,
}: AdminShellProps) {
  const contextId = `${useId()}-admin-context`;

  return (
    <div className="admin-shell">
      <aside
        aria-label="后台导航区"
        className="admin-shell__navigation"
        data-surface="dark-indigo"
      >
        {navigation}
      </aside>

      <div className="admin-shell__workspace">
        <header aria-labelledby={contextId} className="admin-shell__context">
          <nav aria-label="面包屑" className="admin-shell__breadcrumb">
            <ol>
              {breadcrumb.map((item, index) => {
                const isCurrent = index === breadcrumb.length - 1;
                return (
                  <li key={`${item.href ?? "current"}-${item.label}-${index}`}>
                    {item.href && !isCurrent ? (
                      <a href={item.href}>{item.label}</a>
                    ) : (
                      <span aria-current={isCurrent ? "page" : undefined}>
                        {item.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="admin-shell__context-meta" id={contextId}>
            <span className="admin-shell__environment">
              <span aria-hidden="true" className="admin-shell__status-dot" />
              {environmentStatus}
            </span>
            <span
              aria-label="当前管理员"
              className="admin-shell__administrator"
            >
              <span aria-hidden="true" className="admin-shell__avatar">
                {administratorDisplayName.trim().slice(0, 1)}
              </span>
              <strong>{administratorDisplayName}</strong>
            </span>
          </div>
        </header>

        <div className="admin-shell__main" data-surface="bright">
          {children}
        </div>
      </div>
    </div>
  );
}
