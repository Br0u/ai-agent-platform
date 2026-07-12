type VerificationStatus = "unverified" | "pending" | "verified";

export function EmailVerificationStatus({
  status,
}: {
  status: VerificationStatus;
}) {
  if (status === "verified") {
    return (
      <section
        aria-labelledby="email-status-title"
        className="registration-status"
      >
        <h2 id="email-status-title">邮箱已验证</h2>
        <p>该账号的邮箱状态已确认。</p>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="email-status-title"
      className="registration-status"
    >
      <h2 id="email-status-title">邮箱验证暂未启用</h2>
      <p>验证入口已预留；当前服务商未启用，不影响查看注册审核状态。</p>
      <button disabled type="button">
        重新发送验证邮件
      </button>
    </section>
  );
}
