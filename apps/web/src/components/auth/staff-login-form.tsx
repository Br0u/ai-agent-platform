"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  AUTH_ACTION_INITIAL_STATE,
  type AuthActionState,
} from "@/contracts/auth-action-state";
import { staffLoginAction } from "@/server/auth/server-actions";

import "./login-form.css";

type LoginAction = (
  previous: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="auth-form__submit" disabled={pending} type="submit">
      {pending ? "正在验证…" : "登录运营后台"}
    </button>
  );
}

export function StaffLoginForm({
  action = staffLoginAction,
  initialState = AUTH_ACTION_INITIAL_STATE,
  returnTo,
}: {
  action?: LoginAction;
  initialState?: AuthActionState;
  returnTo?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
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
          spellCheck={false}
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
      <p aria-live="polite" className="auth-form__error" role="status">
        {state.kind === "error" ? "用户名、邮箱或密码不正确，请重试。" : ""}
      </p>
      <SubmitButton />
      <p className="auth-form__notice">员工账号由企业管理员统一创建。</p>
    </form>
  );
}
