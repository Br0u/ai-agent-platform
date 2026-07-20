import type { Metadata } from "next";

import { LoginPage } from "@/components/auth/login-page";
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
    <LoginPage
      intro="使用企业管理员分配的内部账号。"
      title="登录运营后台"
      variant="staff"
    >
      <StaffLoginForm returnTo={returnTo} />
    </LoginPage>
  );
}
