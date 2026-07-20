import Link from "next/link";
import { QrCode, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export type LoginPageProps = {
  children: ReactNode;
  intro: string;
  title: string;
  variant: "customer" | "staff";
};

const LOGIN_PAGE_CONTENT = {
  customer: {
    alternate: {
      href: "/staff/login",
      label: "员工登录",
    },
    asideLabel: "客户登录说明",
    asideTitle: "欢迎登录",
    brand: "华鲲元启 · AI Agent Platform",
    description: "一站式管理企业授权、智能应用、团队与服务资源。",
    futureMethods: ["手机号", "扫码"],
  },
  staff: {
    alternate: {
      href: "/login",
      label: "返回客户登录",
    },
    asideLabel: "员工安全登录说明",
    asideTitle: "员工安全登录",
    brand: "华鲲元启 · 运营工作台",
    description: "仅限企业管理员开通的内部账号，登录行为将纳入安全审计。",
    futureMethods: ["动态口令", "企业 SSO"],
  },
} as const;

const CUSTOMER_PROVIDERS = ["支付宝", "微信", "钉钉"] as const;

function FutureLoginButton({ method }: { method: string }) {
  return (
    <button
      aria-label={`${method}登录，即将开放`}
      className="enterprise-login-page__method"
      disabled
      type="button"
    >
      <span>{method}</span>
      <small>即将开放</small>
    </button>
  );
}

export function LoginPage({
  children,
  intro,
  title,
  variant,
}: LoginPageProps) {
  const content = LOGIN_PAGE_CONTENT[variant];

  return (
    <div
      className={`enterprise-login-page enterprise-login-page--${variant}`}
    >
      <aside
        aria-label={content.asideLabel}
        className="enterprise-login-page__aside"
      >
        <Link className="enterprise-login-page__brand-link" href="/">
          {content.brand}
        </Link>

        <div className="enterprise-login-page__aside-copy">
          <h2>{content.asideTitle}</h2>
          <p>{content.description}</p>
        </div>

        {variant === "customer" ? (
          <>
            <div
              aria-label="扫码登录即将开放"
              className="enterprise-login-page__qr-placeholder"
            >
              <QrCode aria-hidden="true" />
              <span>扫码登录</span>
              <small>即将开放</small>
            </div>

            <div className="enterprise-login-page__providers">
              {CUSTOMER_PROVIDERS.map((provider) => (
                <FutureLoginButton key={provider} method={provider} />
              ))}
            </div>
          </>
        ) : (
          <div className="enterprise-login-page__security">
            <ShieldCheck aria-hidden="true" />
            <ul>
              <li>
                <strong>分域访问</strong>
                <span>客户与员工账号相互隔离</span>
              </li>
              <li>
                <strong>风险控制</strong>
                <span>敏感操作需要二次验证</span>
              </li>
            </ul>
          </div>
        )}
      </aside>

      <main className="enterprise-login-page__operation">
        <div className="enterprise-login-page__heading">
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>

        <div
          aria-label="登录方式"
          className="enterprise-login-page__methods"
          role="group"
        >
          <span className="enterprise-login-page__method enterprise-login-page__method--active">
            账号登录
          </span>
          {content.futureMethods.map((method) => (
            <FutureLoginButton key={method} method={method} />
          ))}
        </div>

        <div className="enterprise-login-page__form">{children}</div>

        <Link
          className="enterprise-login-page__alternate-link"
          href={content.alternate.href}
        >
          {content.alternate.label}
        </Link>
      </main>
    </div>
  );
}
