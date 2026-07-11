import type { PortalRoute } from "@/config/routes";
import type { ReactNode } from "react";
import "./feature-placeholder-page.css";

const groupNames: Record<PortalRoute["group"], string> = {
  public: "公开门户",
  console: "客户控制台",
  admin: "运营后台",
};

export function FeaturePlaceholderPage({
  route,
  children,
}: {
  route: PortalRoute;
  children?: ReactNode;
}) {
  const isDisabled = route.status === "placeholder";

  return (
    <section
      className={
        isDisabled ? "feature-shell feature-shell--disabled" : "feature-shell"
      }
      aria-labelledby="feature-shell-title"
    >
      <div className="feature-shell__inner">
        <header className="feature-shell__header">
          <p className="feature-shell__eyebrow">
            {groupNames[route.group]} / {route.path}
          </p>
          <span className="feature-shell__index" aria-hidden="true">
            00
          </span>
          <h1 id="feature-shell-title">{route.title}</h1>
        </header>
        <div className="feature-shell__dossier">
          <div>
            <span className="feature-shell__label">Current state</span>
            <p className="feature-shell__status">
              {isDisabled ? "功能尚未开放" : "页面结构已建立"}
            </p>
          </div>
          <div>
            <span className="feature-shell__label">Scope</span>
            <p className="feature-shell__description">
              {isDisabled
                ? "当前只保留页面与接口契约，尚未连接真实外部系统。"
                : "当前完成路由、布局和内容边界，后续按 PRD 逐步填充正式功能。"}
            </p>
          </div>
          {isDisabled ? (
            <code className="feature-shell__code">FEATURE_DISABLED</code>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}
