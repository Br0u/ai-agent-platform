import type { ReactNode } from "react";
import { MegaMenu } from "./mega-menu";
import { MobileNavigation } from "./mobile-navigation";
import type {
  NavigationLinkComponent,
  PortalNavigationItem,
} from "./navigation-types";

export function PortalHeader({
  items,
  activeHref,
  assistantEntry,
  linkComponent: Link = "a",
}: {
  items: PortalNavigationItem[];
  activeHref: string;
  assistantEntry?: ReactNode;
  linkComponent?: NavigationLinkComponent;
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

        <nav
          aria-label="主导航"
          className="site-navigation site-navigation--primary"
        >
          <MegaMenu
            activeHref={activeHref}
            items={items}
            linkComponent={Link}
          />
        </nav>

        <div className="site-actions">
          {assistantEntry}
          <Link className="site-contact" href="/contact">
            联系我们
          </Link>
          <Link className="site-login" href="/trial">
            申请体验
          </Link>
          <MobileNavigation
            actionHref="/trial"
            actionLabel="申请体验"
            activeHref={activeHref}
            items={items}
            linkComponent={Link}
            secondaryActionHref="/contact"
            secondaryActionLabel="联系我们"
          />
        </div>
      </div>
    </header>
  );
}
