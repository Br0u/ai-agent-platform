import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requireWorkforce } from "@/server/auth/access";

export const metadata: Metadata = { title: "修改初始密码 · AI Agent Platform" };

export default async function Page() {
  await requireWorkforce();
  return (
    <main className="auth-page">
      <section
        aria-labelledby="change-password-title"
        className="auth-page__panel"
      >
        <p className="auth-page__eyebrow">Workforce Security</p>
        <h1 id="change-password-title">修改初始密码</h1>
        <p className="auth-page__intro">
          首次登录必须更换管理员分配的临时密码。
        </p>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
