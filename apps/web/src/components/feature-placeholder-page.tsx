import type { PortalRoute } from "@/config/routes";
import "./feature-placeholder-page.css";

const groupNames: Record<PortalRoute["group"], string> = {
  public: "公开门户",
  console: "客户控制台",
  admin: "运营后台",
};

export function FeaturePlaceholderPage({ route }: { route: PortalRoute }) {
  const isDisabled = route.status === "placeholder";

  return (
    <section className="feature-shell" aria-labelledby="feature-shell-title">
      <p className="feature-shell__eyebrow">
        {groupNames[route.group]} / {route.path}
      </p>
      <h1 id="feature-shell-title">{route.title}</h1>
      <p className="feature-shell__status">
        {isDisabled ? "功能尚未开放" : "页面结构已建立"}
      </p>
      <p className="feature-shell__description">
        {isDisabled
          ? "当前只保留页面与接口契约，尚未连接真实外部系统。"
          : "当前完成路由、布局和内容边界，后续按PRD逐步填充正式功能。"}
      </p>
    </section>
  );
}
