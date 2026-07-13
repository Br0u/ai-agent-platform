import { matchRoute } from "./routes";

const ASSISTANT_ROUTES = new Set([
  "/",
  "/product",
  "/product/[slug]",
  "/blog/[slug]",
  "/pricing",
  "/docs",
  "/support",
]);

export function shouldShowAssistant(pathname: string): boolean {
  const route = matchRoute(pathname);
  return route?.group === "public" && ASSISTANT_ROUTES.has(route.path);
}
