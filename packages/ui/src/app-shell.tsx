import type { ReactNode } from "react";
import "./app-shell.css";

const navigationItems = [
  { label: "平台能力", href: "/product" },
  { label: "行业方案", href: "/cases" },
  { label: "文档", href: "/docs" },
  { label: "版本与兼容", href: "/compatibility" },
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
          <a className="site-wordmark" href="/" aria-label="华鲲元启首页">
            <span className="site-brand-name">华鲲元启</span>
            <span className="site-product-name">TGDataXAI</span>
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
        <span>华鲲元启 · AI开发赋能平台</span>
        <span>企业级 AI 全栈开发与运营底座</span>
      </footer>
    </div>
  );
}
