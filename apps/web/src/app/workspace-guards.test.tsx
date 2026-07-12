import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCustomer: vi.fn().mockResolvedValue({ realm: "customer" }),
  requirePermission: vi.fn().mockResolvedValue({ realm: "workforce" }),
  requireWorkforce: vi.fn().mockResolvedValue({ realm: "workforce" }),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/server/auth/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/access")>()),
  requireCustomer: mocks.requireCustomer,
  requirePermission: mocks.requirePermission,
  requireWorkforce: mocks.requireWorkforce,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { AuthAccessError } from "@/server/auth/access";
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

  it("redirects an unauthenticated admin shell to the fixed staff login return path", async () => {
    mocks.requireWorkforce.mockRejectedValueOnce(
      new AuthAccessError("AUTH_SESSION_REQUIRED", 401),
    );

    await expect(AdminLayout({ children: <p>admin shell</p> })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/staff/login?returnTo=%2Fadmin",
    );
  });

  it.each([
    [
      "AUTH_PASSWORD_CHANGE_REQUIRED",
      "/staff/change-password?returnTo=%2Fadmin",
    ],
    ["AUTH_TOTP_SETUP_REQUIRED", "/staff/two-factor?returnTo=%2Fadmin"],
  ] as const)(
    "redirects incomplete workforce setup without a loop: %s",
    async (code, destination) => {
      mocks.requireWorkforce.mockRejectedValueOnce(
        new AuthAccessError(code, 403),
      );
      await expect(
        AdminLayout({ children: <p>admin shell</p> }),
      ).rejects.toThrow("NEXT_REDIRECT");
      expect(mocks.redirect).toHaveBeenCalledWith(destination);
    },
  );

  it("redirects an unauthenticated customer shell to the fixed login return path", async () => {
    mocks.requireCustomer.mockRejectedValueOnce(
      new AuthAccessError("AUTH_REALM_MISMATCH", 403),
    );

    await expect(
      ConsoleLayout({ children: <p>console shell</p> }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?returnTo=%2Fconsole");
  });

  it("redirects pending customer leaf access to onboarding", async () => {
    mocks.requireCustomer.mockRejectedValueOnce(
      new AuthAccessError("AUTH_ACCOUNT_NOT_ACTIVE", 403),
    );

    await expect(ConsolePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/console/onboarding");
  });

  it("preserves unknown infrastructure errors", async () => {
    mocks.requireWorkforce.mockRejectedValueOnce(new Error("database down"));

    await expect(AdminLayout({ children: <p>admin shell</p> })).rejects.toThrow(
      "database down",
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
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
    "admin/registrations/page.tsx": "admin:registrations",
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
    expect(source).toContain("await requireConsolePage()");
  });

  it.each(Object.entries(adminPermissions))(
    "requires the server-owned permission in %s",
    (fileName, permission) => {
      const source = readFileSync(`src/app/${fileName}`, "utf8");
      expect(source).toContain(`await requirePermission(\"${permission}\")`);
    },
  );
});
