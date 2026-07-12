import type { Metadata } from "next";

import { CustomerLoginForm } from "@/components/auth/customer-login-form";

export const metadata: Metadata = {
  title: "客户登录 · AI Agent Platform",
  description: "登录 AI Agent Platform 客户控制台。",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return (
    <main className="auth-page">
      <section
        aria-labelledby="customer-login-title"
        className="auth-page__panel"
      >
        <p className="auth-page__eyebrow">Customer Workspace</p>
        <h1 id="customer-login-title">登录客户控制台</h1>
        <p className="auth-page__intro">管理企业授权、资源、团队与服务记录。</p>
        <CustomerLoginForm returnTo={returnTo} />
      </section>
    </main>
  );
}
