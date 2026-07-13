import { matchRoute } from "./routes";

export function shouldShowAssistant(pathname: string): boolean {
  const route = matchRoute(pathname);
  return (
    route?.group === "public" &&
    route.path !== "/login" &&
    route.path !== "/register" &&
    !route.path.startsWith("/staff/")
  );
}
