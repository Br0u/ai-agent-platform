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

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="site-wordmark"
          href="/"
          aria-label="AI Agent Platform 首页"
        >
          AI Agent Platform
        </a>
        <nav className="site-navigation" aria-label="主导航">
          {navigationItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <a className="site-login" href="/login">
          登录
        </a>
      </header>
      <div className="site-content">{children}</div>
      <footer className="site-footer">
        <span>AI Agent Platform</span>
        <span>企业级客户门户</span>
      </footer>
    </div>
  );
}
