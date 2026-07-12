import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCustomer: vi.fn().mockResolvedValue({ realm: "customer" }),
  requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
  requireWorkforce: vi.fn().mockResolvedValue({ realm: "workforce" }),
}));

vi.mock("@/server/auth/access", () => mocks);

import AdminLayout from "./admin/layout";
import AdminProductsPage from "./admin/products/page";
import ConsoleLayout from "./console/layout";
import ConsolePage from "./console/page";

afterEach(() => vi.clearAllMocks());

describe("workspace guards", () => {
  it("allows onboarding at the customer shell but requires active customer access at every leaf render", async () => {
    render(await ConsoleLayout({ children: <p>console shell</p> }));
    expect(mocks.requireCustomer).toHaveBeenCalledWith({
      onboardingAllowed: true,
    });

    render(await ConsolePage());
    expect(mocks.requireCustomer).toHaveBeenLastCalledWith();
    mocks.requireCustomer.mockRejectedValueOnce(new Error("role changed"));
    await expect(ConsolePage()).rejects.toThrow("role changed");
    expect(mocks.requireCustomer).toHaveBeenCalledTimes(3);
  });

  it("requires workforce at the admin shell and rechecks the leaf permission every render", async () => {
    render(await AdminLayout({ children: <p>admin shell</p> }));
    expect(screen.getByText("admin shell")).toBeVisible();
    expect(mocks.requireWorkforce).toHaveBeenCalledOnce();

    render(await AdminProductsPage());
    expect(mocks.requirePermission).toHaveBeenLastCalledWith("admin:products");
    mocks.requirePermission.mockRejectedValueOnce(
      new Error("permission removed"),
    );
    await expect(AdminProductsPage()).rejects.toThrow("permission removed");
    expect(mocks.requirePermission).toHaveBeenCalledTimes(2);
  });
});

describe("leaf guard source contract", () => {
  const consolePages = [
    "console/page.tsx",
    "console/profile/page.tsx",
    "console/licenses/page.tsx",
    "console/downloads/page.tsx",
    "console/openlab/page.tsx",
    "console/tickets/page.tsx",
    "console/resources/page.tsx",
    "console/api-keys/page.tsx",
    "console/team/page.tsx",
    "console/billing/page.tsx",
  ];
  const adminPermissions = {
    "admin/page.tsx": "admin:analytics",
    "admin/site/page.tsx": "admin:site",
    "admin/navigation/page.tsx": "admin:navigation",
    "admin/products/page.tsx": "admin:products",
    "admin/releases/page.tsx": "admin:releases",
    "admin/docs/page.tsx": "admin:docs",
    "admin/blog/page.tsx": "admin:blog",
    "admin/cases/page.tsx": "admin:cases",
    "admin/faq/page.tsx": "admin:faq",
    "admin/compatibility/page.tsx": "admin:compatibility",
    "admin/marketplace/page.tsx": "admin:marketplace",
    "admin/openlab/page.tsx": "admin:registrations",
    "admin/licenses/page.tsx": "admin:registrations",
    "admin/tickets/page.tsx": "admin:registrations",
    "admin/analytics/page.tsx": "admin:analytics",
    "admin/users/page.tsx": "admin:users",
    "admin/roles/page.tsx": "admin:roles",
    "admin/audit-logs/page.tsx": "admin:audit",
  } as const;

  it.each(["console/layout.tsx", "admin/layout.tsx"])(
    "forces request-time rendering for protected workspace %s",
    (fileName) => {
      const source = readFileSync(`src/app/${fileName}`, "utf8");
      expect(source).toContain('export const dynamic = "force-dynamic"');
    },
  );

  it.each(consolePages)("requires an active customer in %s", (fileName) => {
    const source = readFileSync(`src/app/${fileName}`, "utf8");
    expect(source).toContain("await requireCustomer()");
  });

  it.each(Object.entries(adminPermissions))(
    "requires the server-owned permission in %s",
    (fileName, permission) => {
      const source = readFileSync(`src/app/${fileName}`, "utf8");
      expect(source).toContain(`await requirePermission(\"${permission}\")`);
    },
  );
});
