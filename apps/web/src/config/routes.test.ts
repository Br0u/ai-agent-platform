import { describe, expect, it } from "vitest";
import { matchRoute, routeRegistry } from "./routes";

const requiredRoutes = [
  "/",
  "/product",
  "/product/[slug]",
  "/solutions",
  "/releases",
  "/releases/[version]",
  "/roadmap",
  "/downloads",
  "/openlab",
  "/docs",
  "/docs/[category]",
  "/compatibility",
  "/marketplace",
  "/marketplace/[slug]",
  "/support",
  "/help",
  "/blog",
  "/blog/[slug]",
  "/cases",
  "/pricing",
  "/assistant",
  "/contact",
  "/login",
  "/register",
  "/staff/login",
  "/staff/change-password",
  "/staff/two-factor",
  "/staff/re-auth",
  "/console",
  "/console/onboarding",
  "/console/profile",
  "/console/licenses",
  "/console/downloads",
  "/console/openlab",
  "/console/tickets",
  "/console/resources",
  "/console/api-keys",
  "/console/team",
  "/console/billing",
  "/admin",
  "/admin/registrations",
  "/admin/site",
  "/admin/navigation",
  "/admin/products",
  "/admin/releases",
  "/admin/docs",
  "/admin/blog",
  "/admin/cases",
  "/admin/faq",
  "/admin/compatibility",
  "/admin/marketplace",
  "/admin/openlab",
  "/admin/licenses",
  "/admin/tickets",
  "/admin/analytics",
  "/admin/assistant",
  "/admin/users",
  "/admin/roles",
  "/admin/audit-logs",
] as const;

describe("routeRegistry", () => {
  it("covers every route committed in PRD V2.1 without duplicates", () => {
    const paths = routeRegistry.map((route) => route.path);

    expect(paths).toEqual(requiredRoutes);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps each route descriptive and assigned to a delivery state", () => {
    for (const route of routeRegistry) {
      expect(route.title.trim()).not.toBe("");
      expect(["public", "console", "admin"]).toContain(route.group);
      expect(["live", "scaffold", "placeholder"]).toContain(route.status);
    }
  });

  it("distinguishes CMS scaffolds from unavailable external capabilities", () => {
    expect(matchRoute("/admin/analytics")?.status).toBe("scaffold");

    for (const path of [
      "/admin/openlab",
      "/admin/licenses",
      "/admin/tickets",
    ]) {
      expect(matchRoute(path)?.status).toBe("placeholder");
    }
  });

  it("registers the document management workspace as live", () => {
    expect(matchRoute("/admin/docs")).toEqual({
      path: "/admin/docs",
      title: "文档管理",
      group: "admin",
      status: "live",
    });
  });

  it("registers the pricing calculator as a live public route", () => {
    expect(matchRoute("/pricing")).toEqual({
      path: "/pricing",
      title: "价格计算",
      group: "public",
      status: "live",
    });
  });

  it("registers the standalone assistant as a live public route", () => {
    expect(matchRoute("/assistant")).toEqual({
      path: "/assistant",
      title: "AI 助理",
      group: "public",
      status: "live",
    });
  });

  it("registers the protected admin assistant as a live route", () => {
    expect(matchRoute("/admin/assistant")).toEqual({
      path: "/admin/assistant",
      title: "AI 助理运营",
      group: "admin",
      status: "live",
    });
  });

  it("matches exact and dynamic routes but rejects unknown paths", () => {
    expect(matchRoute("/docs")?.path).toBe("/docs");
    expect(matchRoute("/product/agent-studio")?.path).toBe("/product/[slug]");
    expect(matchRoute("/blog/platform-release")?.path).toBe("/blog/[slug]");
    expect(matchRoute("/unknown")).toBeUndefined();
  });
});
