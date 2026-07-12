import type { ReactNode } from "react";
import { requireCustomer } from "@/server/auth/access";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireCustomer({ onboardingAllowed: true });
  return <div data-route-group="console">{children}</div>;
}
