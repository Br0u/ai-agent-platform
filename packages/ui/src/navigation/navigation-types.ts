export type NavigationStatus = "live" | "scaffold" | "placeholder";

export type NavigationHrefItem = {
  label: string;
  href: string;
  description?: string;
  status?: NavigationStatus;
  permission?: string;
  action?: never;
  disabled?: never;
};

export type NavigationActionItem = {
  label: string;
  description?: string;
  status?: NavigationStatus;
  permission?: string;
  action: "logout";
  href?: never;
  disabled?: boolean;
};

export type NavigationLink = NavigationHrefItem | NavigationActionItem;

export type NavigationSection = {
  label: string;
  items: NavigationLink[];
};

export type PortalNavigationItem = NavigationHrefItem & {
  children: NavigationSection[];
};

export type SidebarNavigationConfig = {
  groups: NavigationSection[];
  utilities: NavigationLink[];
};
