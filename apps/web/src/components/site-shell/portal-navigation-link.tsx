"use client";

import type { NavigationLinkProps } from "@ai-agent-platform/ui";
import Link from "next/link";

function isApplicationPath(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

export function PortalNavigationLink({ href, ...props }: NavigationLinkProps) {
  return isApplicationPath(href) ? (
    <Link href={href} {...props} />
  ) : (
    <a href={href} {...props} />
  );
}
