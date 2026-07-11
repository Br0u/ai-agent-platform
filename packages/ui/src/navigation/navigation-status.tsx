import type { NavigationStatus as NavigationStatusValue } from "./navigation-types";

export function NavigationStatusBadge({
  status,
}: {
  status?: NavigationStatusValue;
}) {
  if (status !== "placeholder") {
    return null;
  }

  return <span className="navigation-status">尚未开放</span>;
}
