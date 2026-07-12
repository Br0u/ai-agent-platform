"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { submitRegistration } from "@/server/registration/server-actions";
import type { RegistrationActionState } from "@/server/registration/actions";

import "../auth/login-form.css";
import "./registration.css";

const initial: RegistrationActionState = {
  kind: "validation_error",
  fieldErrors: {},
};
type Action = (
  state: RegistrationActionState,
  data: FormData,
) => Promise<RegistrationActionState>;

const domainMessages: Record<string, string> = {
  REGISTRATION_NOT_ACCEPTED: "无法接受该注册申请，请检查信息或联系支持。",
  REGISTRATION_RATE_LIMITED: "提交过于频繁，请稍后再试。",
  REGISTRATION_SUBMISSION_FAILED: "暂时无法提交注册申请，请稍后再试。",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="auth-form__submit" disabled={pending} type="submit">
      {pending ? "正在提交…" : "提交注册申请"}
    </button>
  );
}

export function CustomerRegistrationForm({
  action = submitRegistration,
  initialState = initial,
}: {
  action?: Action;
  initialState?: RegistrationActionState;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const password = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state !== initialState && password.current) password.current.value = "";
  }, [initialState, state]);
  const fieldErrors =
    state.kind === "validation_error" ? state.fieldErrors : {};
  const field = (name: string) => fieldErrors[name]?.[0];
  const status =
    state.kind === "domain_error"
      ? (domainMessages[state.code] ?? "无法处理注册申请，请稍后再试。")
      : state.kind === "session_issue_failed"
        ? "申请已记录，但自动登录失败。请前往登录查看审核状态。"
        : "";
  return (
    <form
      action={formAction}
      className="auth-form registration-form"
      noValidate
    >
      {(["applicantName", "email", "password", "companyName"] as const).map(
        (name) => {
          const labels = {
            applicantName: "姓名",
            email: "邮箱",
            password: "密码",
            companyName: "公司名称",
          };
          const error = field(name);
          return (
            <label className="auth-form__field" key={name}>
              <span>{labels[name]}</span>
              <input
                aria-label={labels[name]}
                aria-describedby={
                  error ? `registration-${name}-error` : undefined
                }
                autoComplete={
                  name === "email"
                    ? "email"
                    : name === "password"
                      ? "new-password"
                      : name === "applicantName"
                        ? "name"
                        : "organization"
                }
                maxLength={
                  name === "email"
                    ? 320
                    : name === "password"
                      ? 128
                      : name === "companyName"
                        ? 240
                        : 120
                }
                minLength={name === "password" ? 12 : undefined}
                name={name}
                ref={name === "password" ? password : undefined}
                required
                type={
                  name === "password"
                    ? "password"
                    : name === "email"
                      ? "email"
                      : "text"
                }
              />
              {error ? (
                <span
                  className="auth-form__field-error"
                  id={`registration-${name}-error`}
                >
                  {error}
                </span>
              ) : null}
            </label>
          );
        },
      )}
      <label className="registration-form__agreement">
        <input
          aria-describedby={
            field("acceptedTerms")
              ? "registration-acceptedTerms-error"
              : undefined
          }
          name="acceptedTerms"
          required
          type="checkbox"
        />{" "}
        <span>我同意平台服务条款与隐私规则</span>
      </label>
      {field("acceptedTerms") ? (
        <span
          className="auth-form__field-error"
          id="registration-acceptedTerms-error"
        >
          {field("acceptedTerms")}
        </span>
      ) : null}
      <p aria-live="polite" className="auth-form__error" role="status">
        {status}
      </p>
      {state.kind === "session_issue_failed" ? (
        <Link className="registration-form__login-link" href={state.retryPath}>
          前往登录
        </Link>
      ) : (
        <SubmitButton />
      )}
      <p className="auth-form__secondary">
        已有客户账号？<Link href="/login">返回登录</Link>
      </p>
    </form>
  );
}
