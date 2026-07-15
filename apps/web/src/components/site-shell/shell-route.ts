export type ShellRoute = "portal" | "assistant" | "auth" | "console" | "admin";

function isRouteRoot(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function classifyShellRoute(pathname: string): ShellRoute {
  if (pathname === "/assistant") return "assistant";
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    isRouteRoot(pathname, "/staff")
  ) {
    return "auth";
  }
  if (isRouteRoot(pathname, "/console")) return "console";
  if (isRouteRoot(pathname, "/admin")) return "admin";
  return "portal";
}
