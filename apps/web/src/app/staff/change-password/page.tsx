import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requireWorkforce } from "@/server/auth/access";

export const metadata: Metadata = { title: "修改初始密码 · AI Agent Platform" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await requireWorkforce({ setupFlow: "change-password" });
  const { returnTo } = await searchParams;
  return (
    <AuthPage
      intro="首次登录必须更换管理员分配的临时密码。"
      realmLabel="Workforce Security"
      title="修改初始密码"
    >
      <ChangePasswordForm returnTo={returnTo} />
    </AuthPage>
  );
}
