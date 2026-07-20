import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";
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
    <AuthPage
      intro="管理企业授权、资源、团队与服务记录。"
      realmLabel="Customer Access"
      title="登录客户控制台"
    >
      <CustomerLoginForm returnTo={returnTo} />
    </AuthPage>
  );
}
