import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPage } from "@/components/auth/auth-page";
import { ReAuthForm } from "@/components/auth/re-auth-form";
import { AuthAccessError, requireWorkforce } from "@/server/auth/access";
import { safeReturnPath } from "@/server/auth/actions";

export const metadata: Metadata = {
  title: "敏感操作重新验证 · AI Agent Platform",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  try {
    await requireWorkforce();
  } catch (error) {
    if (
      error instanceof AuthAccessError &&
      error.code === "AUTH_SESSION_REQUIRED"
    ) {
      redirect(
        `/staff/login?returnTo=${encodeURIComponent(
          safeReturnPath("workforce", returnTo),
        )}`,
      );
    }
    throw error;
  }
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
