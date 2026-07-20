import type { Metadata } from "next";

import { CustomerLoginForm } from "@/components/auth/customer-login-form";
import { LoginPage } from "@/components/auth/login-page";

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
    <LoginPage
      intro="使用已注册的客户账号继续访问。"
      title="登录客户控制台"
      variant="customer"
    >
      <CustomerLoginForm returnTo={returnTo} />
    </LoginPage>
  );
}
