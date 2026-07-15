import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/auth-page";
import { CustomerRegistrationForm } from "@/components/registration/customer-registration-form";
import { AuthAccessError, getCurrentActor } from "@/server/auth/access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "客户注册 · AI Agent Platform",
  description: "提交 AI Agent Platform 客户账号注册申请。",
};

export default async function Page() {
  let actor;
  try {
    actor = await getCurrentActor("customer");
  } catch (error) {
    if (
      !(error instanceof AuthAccessError) ||
      !["AUTH_SESSION_REQUIRED", "AUTH_REALM_MISMATCH"].includes(error.code)
    )
      throw error;
  }
  if (actor?.realm === "customer")
    redirect(actor.status === "active" ? "/console" : "/console/onboarding");
  return (
    <AuthPage
      intro="填写真实的联系人与公司信息。提交后可在客户入口查看审核状态。"
      realmLabel="Customer Registration"
      title="申请客户账号"
    >
      <CustomerRegistrationForm />
    </AuthPage>
  );
}
