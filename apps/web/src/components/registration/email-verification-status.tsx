"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { EmailVerificationResult } from "@ai-agent-platform/integrations";

import { resendEmailVerification } from "@/server/registration/server-actions";

type VerificationStatus = "unverified" | "pending" | "verified";
type ResendState = EmailVerificationResult | null;
type ResendAction = (
  previous: ResendState,
  formData: FormData,
) => Promise<EmailVerificationResult>;

const content = {
  unverified: {
    label: "邮箱验证状态：未验证",
    heading: "邮箱未验证",
    description: "该账号尚未完成邮箱验证。当前验证请求通道未启用。",
  },
  pending: {
    label: "邮箱验证状态：等待验证",
    heading: "邮箱等待验证",
    description:
      "该账号正等待邮箱验证。当前验证请求通道未启用，状态不会自动推进。",
  },
  verified: {
    label: "邮箱验证状态：已验证",
    heading: "邮箱已验证",
    description: "该账号的邮箱状态已确认。",
  },
} as const;

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} type="submit">
      {pending ? "正在请求…" : "重新发送验证邮件"}
    </button>
  );
}

export function EmailVerificationStatus({
  status,
  resendAction = resendEmailVerification,
}: {
  status: VerificationStatus;
  resendAction?: ResendAction;
}) {
  const [result, formAction] = useActionState(resendAction, null);
  const state = content[status];
  return (
    <section
      aria-label={state.label}
      className="registration-status"
      data-state={status}
    >
      <h2>{state.heading}</h2>
      <p>{state.description}</p>
      {status === "verified" ? null : (
        <form action={formAction}>
          <ResendButton />
        </form>
      )}
      <p aria-live="polite" role="status">
        {result?.ok === false && result.status === 501
          ? "验证邮件暂时无法发送，请稍后再试。"
          : ""}
      </p>
    </section>
  );
}
