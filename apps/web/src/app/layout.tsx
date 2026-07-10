import { AppShell } from "@ai-agent-platform/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@ai-agent-platform/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "华鲲元启｜AI开发赋能平台 TGDataXAI",
  description: "面向企业私有化场景的 AI 全栈开发与运营平台。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
