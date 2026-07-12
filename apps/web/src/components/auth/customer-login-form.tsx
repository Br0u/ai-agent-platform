"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  AUTH_ACTION_INITIAL_STATE,
  type AuthActionState,
} from "@/contracts/auth-action-state";
import { customerLoginAction } from "@/server/auth/server-actions";

import "./login-form.css";

type LoginAction = (
  previous: AuthActionState,
  formData: FormData,
) => Promise<AuthActionState>;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="auth-form__submit" disabled={pending} type="submit">
      {pending ? "正在登录…" : "登录客户控制台"}
    </button>
  );
}

export function CustomerLoginForm({
  action = customerLoginAction,
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
        <span>邮箱</span>
        <input
          autoComplete="email"
          inputMode="email"
          maxLength={320}
          name="email"
          required
          type="email"
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
        {state.kind === "error" ? "邮箱或密码不正确，请重试。" : ""}
      </p>
      <SubmitButton />
      <p className="auth-form__secondary">
        还没有客户账号？<Link href="/register">注册客户账号</Link>
      </p>
    </form>
  );
}
