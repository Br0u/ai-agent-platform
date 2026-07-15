import { AuthShell } from "@ai-agent-platform/ui";
import type { ReactNode } from "react";

import "./auth-page.css";

export type AuthPageProps = {
  children: ReactNode;
  realmLabel: string;
  title: string;
  intro: string;
};

export function AuthPage({
  children,
  realmLabel,
  title,
  intro,
}: AuthPageProps) {
  return (
    <AuthShell
      intro={intro}
      realmLabel={realmLabel}
      storyDescription="统一身份边界、分域访问与安全验证，让客户和员工只进入被授权的工作空间。"
      storyTitle="让每次访问都遵循企业安全边界"
      title={title}
    >
      <div className="enterprise-auth-page__form">{children}</div>
    </AuthShell>
  );
}
