import type { ReactNode } from "react";
import { requireAdminShell } from "@/server/auth/workspace-route-guards";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminShell();
  return <div data-route-group="admin">{children}</div>;
}
