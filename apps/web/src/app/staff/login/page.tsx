import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";
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
    <AuthPage
      intro="仅限已由企业管理员开通的内部员工账号。"
      realmLabel="Workforce Access"
      title="员工安全登录"
    >
      <StaffLoginForm returnTo={returnTo} />
    </AuthPage>
  );
}
