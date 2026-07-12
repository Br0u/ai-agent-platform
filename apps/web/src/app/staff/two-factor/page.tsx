import type { Metadata } from "next";

import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { getCurrentActor } from "@/server/auth/access";

export const metadata: Metadata = { title: "双因素认证 · AI Agent Platform" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const actor = await getCurrentActor("workforce");
  return (
    <main className="auth-page">
      <section aria-labelledby="two-factor-title" className="auth-page__panel">
        <p className="auth-page__eyebrow">Two-factor Authentication</p>
        <h1 id="two-factor-title">双因素认证</h1>
        <p className="auth-page__intro">
          {actor
            ? "使用身份验证器完成管理员 TOTP 设置。"
            : "输入身份验证器生成的六位验证码。"}
        </p>
        <TwoFactorForm
          mode={actor ? "enroll" : "challenge"}
          returnTo={returnTo}
        />
      </section>
    </main>
  );
}
