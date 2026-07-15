import { matchRoute } from "./routes";

export function shouldShowAssistant(pathname: string): boolean {
  if (pathname === "/assistant") return true;
  const route = matchRoute(pathname);
  return (
    route?.group === "public" &&
    route.path !== "/login" &&
    route.path !== "/register" &&
    !route.path.startsWith("/staff/")
  );
}
