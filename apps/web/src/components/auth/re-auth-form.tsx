"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { reauthenticateStaffAction } from "@/server/auth/server-actions";
import {
  STAFF_SECURITY_ACTION_INITIAL_STATE,
  type StaffSecurityActionState,
} from "@/contracts/auth-action-state";

import "./login-form.css";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="auth-form__submit" disabled={pending} type="submit">
      {pending ? "正在重新验证…" : "重新验证"}
    </button>
  );
}

export function ReAuthForm({
  returnTo,
  action = reauthenticateStaffAction,
}: {
  returnTo?: string;
  action?: (formData: FormData) => Promise<StaffSecurityActionState>;
}) {
  const [state, formAction] = useActionState(
    async (_previous: StaffSecurityActionState, data: FormData) => action(data),
    STAFF_SECURITY_ACTION_INITIAL_STATE,
  );
  return (
    <form action={formAction} className="auth-form" noValidate>
      {returnTo ? (
        <input name="returnTo" type="hidden" value={returnTo} />
      ) : null}
      <label className="auth-form__field">
        <span>员工用户名或邮箱</span>
        <input
          autoCapitalize="none"
          autoComplete="username"
          maxLength={320}
          name="identifier"
          required
          type="text"
        />
      </label>
      <label className="auth-form__field">
        <span>密码</span>
        <input
          autoComplete="current-password"
          maxLength={128}
          name="password"
          required
          type="password"
        />
      </label>
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
        {state.kind === "error"
          ? "重新验证失败，原会话已注销，请重新提交凭据。"
          : ""}
      </p>
      <Submit />
    </form>
  );
}
