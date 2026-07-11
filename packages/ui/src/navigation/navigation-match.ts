import type {
  NavigationHrefItem,
  PortalNavigationItem,
} from "./navigation-types";

const LOCAL_URL_BASE = "https://local.invalid";

function normalizeUrl(href: string) {
  return new URL(href, LOCAL_URL_BASE);
}

function normalizePathname(pathname: string) {
  return pathname !== "/" && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function pathIncludes(basePath: string, candidatePath: string) {
  const base = normalizePathname(basePath);
  const candidate = normalizePathname(candidatePath);
  return candidate === base || candidate.startsWith(`${base}/`);
}

export function isNavigationHrefItem(
  item: PortalNavigationItem["children"][number]["items"][number],
): item is NavigationHrefItem {
  return typeof item.href === "string";
}

export function isNavigationChildActive(href: string, activeHref: string) {
  const configured = normalizeUrl(href);
  const active = normalizeUrl(activeHref);
  return (
    configured.pathname === active.pathname &&
    configured.search === active.search &&
    configured.hash === active.hash
  );
}

export function isNavigationParentActive(
  item: PortalNavigationItem,
  activeHref: string,
) {
  const parent = normalizeUrl(item.href);
  const active = normalizeUrl(activeHref);
  return (
    pathIncludes(parent.pathname, active.pathname) ||
    item.children.some((section) =>
      section.items.some(
        (child) =>
          isNavigationHrefItem(child) &&
          isNavigationChildActive(child.href, activeHref),
      ),
    )
  );
}
