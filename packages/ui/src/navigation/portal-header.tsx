import type { ReactNode } from "react";
import { MegaMenu } from "./mega-menu";
import { MobileNavigation } from "./mobile-navigation";
import { isNavigationParentActive } from "./navigation-match";
import { NavigationStatusBadge } from "./navigation-status";
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
  const primaryItems = items.filter((item) => item.href !== "/docs");
  const documentItems = items.filter((item) => item.href === "/docs");

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
            items={primaryItems}
            linkComponent={Link}
          />
        </nav>

        <div className="site-actions">
          {assistantEntry}
          <nav
            aria-label="文档导航"
            className="site-navigation site-navigation--utility"
          >
            {documentItems.map((item) => (
              <Link
                aria-current={
                  isNavigationParentActive(item, activeHref)
                    ? "page"
                    : undefined
                }
                className="mega-menu__trigger site-navigation__direct-link"
                href={item.href}
                key={item.href}
              >
                <span>{item.label}</span>
                <NavigationStatusBadge status={item.status} />
              </Link>
            ))}
          </nav>
          <Link className="site-login" href="/login">
            登录 / 进入平台
          </Link>
          <MobileNavigation
            actionHref="/login"
            actionLabel="登录 / 进入控制台"
            activeHref={activeHref}
            directItemHrefs={documentItems.map((item) => item.href)}
            items={items}
            linkComponent={Link}
          />
        </div>
      </div>
    </header>
  );
}
