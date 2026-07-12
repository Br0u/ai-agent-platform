type VerificationStatus = "unverified" | "pending" | "verified";

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

export function EmailVerificationStatus({
  status,
}: {
  status: VerificationStatus;
}) {
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
        <>
          <button
            aria-describedby="email-verification-resend-help"
            disabled
            type="button"
          >
            重新发送验证邮件
          </button>
          <p id="email-verification-resend-help">验证邮件发送通道暂未启用。</p>
        </>
      )}
    </section>
  );
}
