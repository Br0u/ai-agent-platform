import { AppShell } from "@ai-agent-platform/ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@ai-agent-platform/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Agent Platform",
  description: "企业级AI智能体客户门户",
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
