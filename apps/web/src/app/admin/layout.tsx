import type { ReactNode } from "react";
import { requireWorkforce } from "@/server/auth/access";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireWorkforce();
  return <div data-route-group="admin">{children}</div>;
}
