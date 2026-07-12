"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  enrollStaffTwoFactorAction,
  verifyStaffTwoFactorAction,
} from "@/server/auth/server-actions";
import {
  STAFF_SECURITY_ACTION_INITIAL_STATE,
  type StaffSecurityActionState,
} from "@/server/auth/actions";

import "./login-form.css";

type Enrollment = {
  totpURI: string;
  qrDataUrl: string;
  recoveryCodes: string[];
};
type Action = (formData: FormData) => Promise<StaffSecurityActionState>;

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="auth-form__submit" disabled={pending} type="submit">
      {pending ? "正在验证…" : label}
    </button>
  );
}

export function TwoFactorForm({
  enrollment,
  mode = "challenge",
  returnTo,
  enrollAction = enrollStaffTwoFactorAction,
  verifyAction = verifyStaffTwoFactorAction,
  verificationInitialState = STAFF_SECURITY_ACTION_INITIAL_STATE,
}: {
  enrollment?: Enrollment;
  mode?: "challenge" | "enroll";
  returnTo?: string;
  enrollAction?: Action;
  verifyAction?: Action;
  verificationInitialState?: StaffSecurityActionState;
}) {
  const [state, formAction] = useActionState(
    async (_previous: StaffSecurityActionState, data: FormData) =>
      (mode === "enroll" ? enrollAction : verifyAction)(data),
    STAFF_SECURITY_ACTION_INITIAL_STATE,
  );
  const [verificationState, verificationFormAction] = useActionState(
    async (_previous: StaffSecurityActionState, data: FormData) =>
      verifyAction(data),
    verificationInitialState,
  );
  const completedEnrollment =
    enrollment ??
    (state.kind === "enrollment" && state.qrDataUrl
      ? { ...state, qrDataUrl: state.qrDataUrl }
      : undefined);
  if (completedEnrollment) {
    return (
      <section aria-label="TOTP 设置">
        {/* Locally rendered data URL; no credential material leaves the server. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="使用身份验证器扫描此 TOTP 二维码"
          height={220}
          src={completedEnrollment.qrDataUrl}
          width={220}
        />
        <p>无法扫描时，手动输入以下 TOTP URI：</p>
        <code>{completedEnrollment.totpURI}</code>
        <p>
          <strong>恢复码只显示这一次，请立即离线保存。</strong>
        </p>
        <ul>
          {completedEnrollment.recoveryCodes.map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ul>
        <form action={verificationFormAction} className="auth-form">
          {returnTo ? (
            <input name="returnTo" type="hidden" value={returnTo} />
          ) : null}
          <label className="auth-form__field">
            <span>六位验证码</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              name="code"
              pattern="[0-9]{6}"
              required
              type="text"
            />
          </label>
          <p aria-live="polite" className="auth-form__error" role="status">
            {verificationState.kind === "error" ? "验证码无效，请重试。" : ""}
          </p>
          <Submit label="验证并启用" />
        </form>
      </section>
    );
  }
  return (
    <form action={formAction} className="auth-form" noValidate>
      {returnTo ? (
        <input name="returnTo" type="hidden" value={returnTo} />
      ) : null}
      {mode === "enroll" ? (
        <label className="auth-form__field">
          <span>当前密码</span>
          <input
            autoComplete="current-password"
            maxLength={128}
            name="password"
            required
            type="password"
          />
        </label>
      ) : (
        <label className="auth-form__field">
          <span>六位验证码</span>
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="code"
            pattern="[0-9]{6}"
            required
            type="text"
          />
        </label>
      )}
      <p aria-live="polite" className="auth-form__error" role="status">
        {state.kind === "error" ? "验证失败，请重试。" : ""}
      </p>
      <Submit label={mode === "enroll" ? "开始设置" : "验证并继续"} />
    </form>
  );
}
