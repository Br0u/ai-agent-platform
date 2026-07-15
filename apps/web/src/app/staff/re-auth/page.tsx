import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";
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
    <AuthPage
      intro="敏感操作要求十分钟内完成密码和 TOTP 验证。提交后当前会话会先被注销。"
      realmLabel="Sensitive Operation"
      title="重新验证身份"
    >
      <ReAuthForm returnTo={returnTo} />
    </AuthPage>
  );
}
