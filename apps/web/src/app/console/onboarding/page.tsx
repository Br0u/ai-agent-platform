import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmailVerificationStatus } from "@/components/registration/email-verification-status";
import { AuthAccessError, requireCustomer } from "@/server/auth/access";
import { createDefaultRegistrationService } from "@/server/registration/actions";
import "@/components/registration/registration.css";
import "./onboarding.css";

export const metadata: Metadata = { title: "注册审核状态 · AI Agent Platform" };

export default async function Page() {
  let actor;
  try {
    actor = await requireCustomer({ onboardingAllowed: true });
  } catch (error) {
    if (
      error instanceof AuthAccessError &&
      [
        "AUTH_SESSION_REQUIRED",
        "AUTH_REALM_MISMATCH",
        "AUTH_ACCOUNT_DISABLED",
      ].includes(error.code)
    )
      redirect("/login?returnTo=/console/onboarding");
    throw error;
  }
  if (actor.status === "active") redirect("/console");
  const registration =
    await createDefaultRegistrationService().getRegistrationStatus({
      userId: actor.userId,
      realm: "customer",
    });
  const pending = registration.status === "pending_review";
  return (
    <main className="onboarding-page">
      <section className="onboarding-page__header">
        <p>客户账号申请</p>
        <h1>{pending ? "注册申请审核中" : "注册申请未通过"}</h1>
        <p>
          {pending
            ? "运营人员正在核验申请信息。审核完成后，账号状态会在此更新。"
            : "本次申请未通过审核。如需继续，请联系平台支持核对后续安排。"}
        </p>
      </section>
      <dl className="onboarding-page__facts">
        <div>
          <dt>申请人</dt>
          <dd>{actor.displayName}</dd>
        </div>
        <div>
          <dt>公司信息</dt>
          <dd>以提交的注册申请为准</dd>
        </div>
        <div>
          <dt>当前状态</dt>
          <dd>{pending ? "待审核" : "未通过"}</dd>
        </div>
      </dl>
      <EmailVerificationStatus status={actor.emailVerificationStatus} />
    </main>
  );
}
