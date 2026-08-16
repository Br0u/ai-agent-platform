import { describe, expect, it } from "vitest";
import { matchRoute, routeRegistry } from "./routes";

const migratedSolutionSlugs = [
  "private-yuanqi",
  "cluster-planning",
  "compute-monitoring",
  "model-evaluation",
  "model-deployment",
  "knowledge-service",
  "document-intelligence",
  "data-insight",
  "knowledge-assets",
  "unstructured-data",
  "process-automation",
  "enterprise-assistant",
  "multi-agent",
  "video-intelligence",
  "government-knowledge",
  "government-data",
  "government-document",
  "government-process",
  "finance-knowledge",
  "finance-data",
  "finance-document",
  "finance-assistant",
  "healthcare-knowledge",
  "healthcare-data",
  "healthcare-document",
  "healthcare-process",
  "enterprise-knowledge",
  "enterprise-data",
  "enterprise-document",
  "enterprise-process",
  "enterprise-multi-agent",
  "case-pending-enterprise-knowledge",
] as const;

const requiredRoutes = [
  "/",
  "/product",
  "/product/standalone",
  "/product/code-agent",
  "/product/aippt",
  "/product/aishrek",
  "/product/model",
  "/product/knowledge",
  "/product/agents",
  "/product/applications",
  "/product/skills",
  "/product/coding",
  "/product/governance",
  "/product/model-optimization",
  "/product/model-task-center",
  "/product/model-assets",
  "/product/model-training",
  "/product/model-evaluation",
  "/product/model-data",
  "/product/model-deploy",
  "/product/agent-knowledge-base",
  "/product/knowledge-metrics",
  "/product/coding-project",
  "/product/coding-session",
  "/product/coding-mobile",
  "/product/coding-standard",
  "/product/agent-knowledge",
  "/product/data-agent",
  "/product/agent-video",
  "/product/agent-orchestration",
  "/product/app-writing",
  "/product/app-bidding",
  "/product/app-contract",
  "/product/skills-programming",
  "/product/skills-application",
  "/product/skills-office",
  "/solutions",
  "/solutions/[slug]",
  "/downloads",
  "/partners",
  "/docs",
  "/docs/[category]",
  "/support",
  "/help",
  "/pricing",
  "/assistant",
  "/trial",
  "/contact",
  "/login",
  "/register",
  "/staff/login",
  "/staff/change-password",
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
  "/admin/downloads",
  "/admin/docs/preview/[revisionId]",
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

const removedPublicRoutes = [
  "/releases",
  "/releases/2.0.0",
  "/roadmap",
  "/openlab",
  "/compatibility",
  "/marketplace",
  "/marketplace/example",
  "/blog",
  "/blog/platform-release",
  "/cases",
  "/product/hci",
  "/product/knowledge-agent",
  "/product/office-agent",
  "/product/tgdataxai",
  "/product/video-agent",
  "/product/agent-studio",
] as const;

describe("routeRegistry", () => {
  it("locks the final migrated and retained route registry without duplicates", () => {
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
    expect(matchRoute("/admin/docs/preview/revision-1")).toEqual({
      path: "/admin/docs/preview/[revisionId]",
      title: "文档修订预览",
      group: "admin",
      status: "live",
    });
  });

  it("registers the download resource manager as a live admin route", () => {
    expect(matchRoute("/admin/downloads")).toEqual({
      path: "/admin/downloads",
      title: "下载资源",
      group: "admin",
      status: "live",
    });
  });

  it("registers pricing and services as a live public route", () => {
    expect(matchRoute("/pricing")).toEqual({
      path: "/pricing",
      title: "价格与服务",
      group: "public",
      status: "live",
    });
  });

  it("registers the download center as a live public route", () => {
    expect(matchRoute("/downloads")).toEqual({
      path: "/downloads",
      title: "下载中心",
      group: "public",
      status: "live",
    });
  });

  it("registers the partner center as a live public route", () => {
    expect(matchRoute("/partners")).toEqual({
      path: "/partners",
      title: "合作伙伴",
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

  it("registers homepage conversion routes as live public routes", () => {
    expect(matchRoute("/solutions/knowledge-service")).toEqual({
      path: "/solutions/[slug]",
      title: "解决方案详情",
      group: "public",
      status: "live",
    });
    expect(matchRoute("/trial")).toEqual({
      path: "/trial",
      title: "申请体验",
      group: "public",
      status: "live",
    });
  });

  it("resolves all 32 migrated solution and case details through the live route", () => {
    for (const slug of migratedSolutionSlugs) {
      expect(matchRoute(`/solutions/${slug}`)).toEqual({
        path: "/solutions/[slug]",
        title: "解决方案详情",
        group: "public",
        status: "live",
      });
    }
  });

  it("registers the standalone product pages and no product catch-all", () => {
    for (const path of [
      "/product/standalone",
      "/product/code-agent",
      "/product/aippt",
      "/product/aishrek",
    ]) {
      expect(matchRoute(path)).toMatchObject({
        path,
        group: "public",
        status: "live",
      });
    }

    expect(matchRoute("/product/agent-studio")).toBeUndefined();
  });

  it("registers the seven platform centers and no product catch-all", () => {
    for (const path of [
      "/product/model",
      "/product/knowledge",
      "/product/agents",
      "/product/applications",
      "/product/skills",
      "/product/coding",
      "/product/governance",
    ]) {
      expect(matchRoute(path)).toMatchObject({
        path,
        group: "public",
        status: "live",
      });
    }

    expect(matchRoute("/product/agent-studio")).toBeUndefined();
  });

  it("registers the seven model subpages and rejects unknown products", () => {
    for (const path of [
      "/product/model-optimization",
      "/product/model-task-center",
      "/product/model-assets",
      "/product/model-training",
      "/product/model-evaluation",
      "/product/model-data",
      "/product/model-deploy",
    ]) {
      expect(matchRoute(path)).toMatchObject({
        path,
        group: "public",
        status: "live",
      });
    }

    expect(matchRoute("/product/model-unknown")).toBeUndefined();
  });

  it("registers the capability foundation pages before remaining product scaffolds", () => {
    expect(matchRoute("/product/agent-knowledge-base")).toEqual({
      path: "/product/agent-knowledge-base",
      title: "能力底座",
      group: "public",
      status: "live",
    });
    expect(matchRoute("/product/knowledge-metrics")).toEqual({
      path: "/product/knowledge-metrics",
      title: "数据源与指标",
      group: "public",
      status: "live",
    });
    expect(matchRoute("/product/foundation-unknown")).toBeUndefined();
  });

  it("registers the four coding subpages before remaining product scaffolds", () => {
    for (const [path, title] of [
      ["/product/coding-project", "项目管理"],
      ["/product/coding-session", "会话管理"],
      ["/product/coding-mobile", "移动接入"],
      ["/product/coding-standard", "编程规范"],
    ] as const) {
      expect(matchRoute(path)).toEqual({
        path,
        title,
        group: "public",
        status: "live",
      });
    }

    expect(matchRoute("/product/coding-unknown")).toBeUndefined();
  });

  it("registers the four agent subpages before remaining product scaffolds", () => {
    for (const [path, title] of [
      ["/product/agent-knowledge", "企业知识助手"],
      ["/product/data-agent", "智能问数助手"],
      ["/product/agent-video", "视频理解助手"],
      ["/product/agent-orchestration", "复杂任务自动化引擎"],
    ] as const) {
      expect(matchRoute(path)).toEqual({
        path,
        title,
        group: "public",
        status: "live",
      });
    }

    expect(matchRoute("/product/agent-unknown")).toBeUndefined();
  });

  it("registers the three application subpages and rejects unknown products", () => {
    for (const [path, title] of [
      ["/product/app-writing", "通用文本写作"],
      ["/product/app-bidding", "投标智能助手"],
      ["/product/app-contract", "合同智能审查"],
    ] as const) {
      expect(matchRoute(path)).toEqual({
        path,
        title,
        group: "public",
        status: "live",
      });
    }

    expect(matchRoute("/product/app-unknown")).toBeUndefined();
  });

  it("registers the three skill subpages and rejects unknown products", () => {
    for (const [path, title] of [
      ["/product/skills-programming", "编程类技能"],
      ["/product/skills-application", "应用类技能"],
      ["/product/skills-office", "办公类技能"],
    ] as const) {
      expect(matchRoute(path)).toEqual({
        path,
        title,
        group: "public",
        status: "live",
      });
    }

    expect(matchRoute("/product/skills-unknown")).toBeUndefined();
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
    expect(matchRoute("/docs/operations")?.path).toBe("/docs/[category]");
    expect(matchRoute("/unknown")).toBeUndefined();
  });

  it("does not retain deleted public routes through the registry", () => {
    for (const path of removedPublicRoutes) {
      expect(matchRoute(path), path).toBeUndefined();
    }
  });
});
