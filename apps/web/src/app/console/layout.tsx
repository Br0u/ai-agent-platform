import type { ReactNode } from "react";
import { requireConsoleShell } from "@/server/auth/workspace-route-guards";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireConsoleShell();
  return <div data-route-group="console">{children}</div>;
}
