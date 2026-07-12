import type { Metadata } from "next";

import { StaffLoginForm } from "@/components/auth/staff-login-form";

export const metadata: Metadata = {
  title: "员工登录 · AI Agent Platform",
  description: "登录 AI Agent Platform 企业运营后台。",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return (
    <main className="auth-page">
      <section aria-labelledby="staff-login-title" className="auth-page__panel">
        <p className="auth-page__eyebrow">Workforce Access</p>
        <h1 id="staff-login-title">员工安全登录</h1>
        <p className="auth-page__intro">
          仅限已由企业管理员开通的内部员工账号。
        </p>
        <StaffLoginForm returnTo={returnTo} />
      </section>
    </main>
  );
}
