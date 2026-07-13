import type { ElementType } from "react";
import { MegaMenu } from "./mega-menu";
import { MobileNavigation } from "./mobile-navigation";
import type { PortalNavigationItem } from "./navigation-types";

export function PortalHeader({
  items,
  activeHref,
  linkComponent: Link = "a",
}: {
  items: PortalNavigationItem[];
  activeHref: string;
  linkComponent?: ElementType;
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link
          aria-label="AI Agent Platform 首页"
          className="site-wordmark"
          href="/"
        >
          <span className="site-brand-name">AI Agent Platform</span>
          <span className="site-product-name">Build Enterprise AI Faster</span>
        </Link>

        <nav aria-label="主导航" className="site-navigation">
          <MegaMenu
            activeHref={activeHref}
            items={items}
            linkComponent={Link}
          />
        </nav>

        <div className="site-actions">
          <Link className="site-login" href="/login">
            登录 / 进入平台
          </Link>
          <MobileNavigation
            actionHref="/login"
            actionLabel="登录 / 进入控制台"
            activeHref={activeHref}
            items={items}
            linkComponent={Link}
          />
        </div>
      </div>
    </header>
  );
}
