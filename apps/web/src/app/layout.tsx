import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "@ai-agent-platform/ui/tokens.css";
import { SiteShell } from "../components/site-shell/site-shell";
import "./globals.css";

const brandScript = localFont({
  src: "../assets/fonts/kaushan-script/KaushanScript-Regular.ttf",
  variable: "--font-brand-script",
  display: "swap",
});

export const metadata: Metadata = {
  title: "华鲲元启｜AI开发赋能平台 TGDataXAI",
  description: "面向企业私有化场景的 AI 全栈开发与运营平台。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={brandScript.variable}>
      <body>
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
