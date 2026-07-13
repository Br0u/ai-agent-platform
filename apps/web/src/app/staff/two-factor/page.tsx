import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPage } from "@/components/auth/auth-page";
import { TwoFactorForm } from "@/components/auth/two-factor-form";
import { getCurrentActor, requireWorkforce } from "@/server/auth/access";
import { safeReturnPath } from "@/server/auth/actions";

export const metadata: Metadata = { title: "双因素认证 · AI Agent Platform" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const actor = await getCurrentActor("workforce");
  if (actor?.realm === "workforce") {
    const destination = safeReturnPath("workforce", returnTo);
    if (actor.mustChangePassword) {
      redirect(
        `/staff/change-password?returnTo=${encodeURIComponent(destination)}`,
      );
    }
    if (actor.twoFactorEnabled) await requireWorkforce();
    else await requireWorkforce({ setupFlow: "two-factor" });
  }
  return (
    <AuthPage
      intro={
        actor?.realm === "workforce"
          ? actor.twoFactorEnabled
            ? "管理当前身份验证器。移除后必须重新完成 TOTP 设置才能进入后台。"
            : "使用身份验证器完成管理员 TOTP 设置。"
          : "输入身份验证器生成的六位验证码。"
      }
      realmLabel="Two-Factor Authentication"
      title="双因素认证"
    >
      <TwoFactorForm
        mode={
          actor?.realm === "workforce"
            ? actor.twoFactorEnabled
              ? "manage"
              : "enroll"
            : "challenge"
        }
        returnTo={returnTo}
      />
    </AuthPage>
  );
}
