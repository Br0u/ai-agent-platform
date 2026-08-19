type PublicEntry = { href?: string };

const portalOrigin = "https://portal.invalid";

export function isPublicEntryVisible(href: string) {
  try {
    const url = new URL(href, portalOrigin);
    return url.origin !== portalOrigin || url.pathname !== "/trial";
  } catch {
    return true;
  }
}

export function filterPublicEntries<T extends PublicEntry>(
  entries: readonly T[],
): T[] {
  return entries.filter(
    (entry): entry is T =>
      entry.href === undefined || isPublicEntryVisible(entry.href),
  );
}
