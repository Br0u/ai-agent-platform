import type { Metadata } from "next";

import { ReAuthForm } from "@/components/auth/re-auth-form";
import { requireWorkforce } from "@/server/auth/access";

export const metadata: Metadata = {
  title: "敏感操作重新验证 · AI Agent Platform",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await requireWorkforce();
  const { returnTo } = await searchParams;
  return (
    <main className="auth-page">
      <section aria-labelledby="re-auth-title" className="auth-page__panel">
        <p className="auth-page__eyebrow">Sensitive Action</p>
        <h1 id="re-auth-title">重新验证身份</h1>
        <p className="auth-page__intro">
          敏感操作要求十分钟内完成密码和 TOTP 验证。提交后当前会话会先被注销。
        </p>
        <ReAuthForm returnTo={returnTo} />
      </section>
    </main>
  );
}
