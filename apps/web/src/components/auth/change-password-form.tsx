"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { changeStaffPasswordAction } from "@/server/auth/server-actions";
import {
  STAFF_SECURITY_ACTION_INITIAL_STATE,
  type StaffSecurityActionState,
} from "@/server/auth/actions";

import "./login-form.css";

type Action = (formData: FormData) => Promise<StaffSecurityActionState>;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="auth-form__submit" disabled={pending} type="submit">
      {pending ? "正在更新…" : "更新密码"}
    </button>
  );
}

export function ChangePasswordForm({
  action = changeStaffPasswordAction,
}: {
  action?: Action;
}) {
  const [state, formAction] = useActionState(
    async (_previous: StaffSecurityActionState, data: FormData) => action(data),
    STAFF_SECURITY_ACTION_INITIAL_STATE,
  );
  return (
    <form action={formAction} className="auth-form" noValidate>
      <label className="auth-form__field">
        <span>当前密码</span>
        <input
          autoComplete="current-password"
          maxLength={128}
          name="currentPassword"
          required
          type="password"
        />
      </label>
      <label className="auth-form__field">
        <span>新密码</span>
        <input
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          name="newPassword"
          required
          type="password"
        />
      </label>
      <p aria-live="polite" className="auth-form__error" role="status">
        {state.kind === "error"
          ? "密码更新失败，请检查当前密码和新密码要求。"
          : ""}
      </p>
      <Submit />
    </form>
  );
}
