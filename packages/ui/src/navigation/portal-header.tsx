import { MegaMenu } from "./mega-menu";
import { MobileNavigation } from "./mobile-navigation";
import type { PortalNavigationItem } from "./navigation-types";

export function PortalHeader({
  items,
  activeHref,
}: {
  items: PortalNavigationItem[];
  activeHref: string;
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a
          aria-label="AI Agent Platform 首页"
          className="site-wordmark"
          href="/"
        >
          <span className="site-brand-name">AI Agent Platform</span>
          <span className="site-product-name">Build Enterprise AI Faster</span>
        </a>

        <nav aria-label="主导航" className="site-navigation">
          <MegaMenu activeHref={activeHref} items={items} />
        </nav>

        <div className="site-actions">
          <a className="site-login" href="/login">
            登录 / 进入平台
          </a>
          <MobileNavigation
            actionHref="/login"
            actionLabel="登录 / 进入控制台"
            activeHref={activeHref}
            items={items}
          />
        </div>
      </div>
    </header>
  );
}
