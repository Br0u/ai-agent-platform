import type { ReactNode } from "react";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <div data-route-group="console">{children}</div>;
}
