import { matchRoute } from "@/config/routes";

const EXCLUDED_PUBLIC_ROOTS = ["/login", "/register", "/staff"] as const;

export function shouldShowAssistant(pathname: string) {
  if (
    EXCLUDED_PUBLIC_ROOTS.some(
      (root) => pathname === root || pathname.startsWith(`${root}/`),
    )
  ) {
    return false;
  }

  return matchRoute(pathname)?.group === "public";
}
