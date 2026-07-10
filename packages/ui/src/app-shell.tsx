import type { ReactNode } from "react";
import "./app-shell.css";

const navigationItems = [
  { label: "产品", href: "/product" },
  { label: "文档", href: "/docs" },
  { label: "版本", href: "/releases" },
  { label: "兼容矩阵", href: "/compatibility" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "支持", href: "/support" },
] as const;

function NavigationLinks() {
  return navigationItems.map((item) => (
    <a key={item.href} href={item.href}>
      {item.label}
    </a>
  ));
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <a
            className="site-wordmark"
            href="/"
            aria-label="AI Agent Platform 首页"
          >
            <span className="site-brand-name">AI Agent Platform</span>
            <span className="site-product-name">
              Build Enterprise AI Faster
            </span>
          </a>
          <nav className="site-navigation" aria-label="主导航">
            <NavigationLinks />
          </nav>
          <div className="site-actions">
            <a className="site-login" href="/login">
              进入平台
            </a>
            <details className="site-menu">
              <summary>打开导航</summary>
              <nav aria-label="移动导航">
                <NavigationLinks />
              </nav>
            </details>
          </div>
        </div>
      </header>
      <div className="site-content">{children}</div>
      <footer className="site-footer">
        <span>AI Agent Platform</span>
        <span>Build Enterprise AI Faster</span>
      </footer>
    </div>
  );
}
