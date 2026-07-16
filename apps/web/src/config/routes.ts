export type PortalRoute = {
  path: string;
  title: string;
  group: "public" | "console" | "admin";
  status: "live" | "scaffold" | "placeholder";
};

const publicRoute = (
  path: string,
  title: string,
  status: PortalRoute["status"] = "scaffold",
): PortalRoute => ({ path, title, group: "public", status });

const consoleRoute = (
  path: string,
  title: string,
  status: PortalRoute["status"] = "placeholder",
): PortalRoute => ({ path, title, group: "console", status });

const adminRoute = (
  path: string,
  title: string,
  status: PortalRoute["status"] = "scaffold",
): PortalRoute => ({
  path,
  title,
  group: "admin",
  status,
});

export const routeRegistry: PortalRoute[] = [
  publicRoute("/", "首页", "live"),
  publicRoute("/product", "产品介绍", "live"),
  publicRoute("/product/[slug]", "产品模块详情"),
  publicRoute("/solutions", "解决方案", "live"),
  publicRoute("/solutions/[slug]", "解决方案详情", "live"),
  publicRoute("/releases", "版本列表"),
  publicRoute("/releases/[version]", "版本更新说明"),
  publicRoute("/roadmap", "产品路线图"),
  publicRoute("/downloads", "下载中心", "placeholder"),
  publicRoute("/openlab", "OpenLab", "placeholder"),
  publicRoute("/docs", "文档中心"),
  publicRoute("/docs/[category]", "文档分类详情", "live"),
  publicRoute("/compatibility", "环境兼容矩阵"),
  publicRoute("/marketplace", "Marketplace"),
  publicRoute("/marketplace/[slug]", "Marketplace资源详情"),
  publicRoute("/support", "客户支持"),
  publicRoute("/help", "帮助中心"),
  publicRoute("/blog", "资讯中心"),
  publicRoute("/blog/[slug]", "资讯详情"),
  publicRoute("/cases", "客户案例"),
  publicRoute("/pricing", "价格计算", "live"),
  publicRoute("/assistant", "AI 助理", "live"),
  publicRoute("/contact", "商务联系"),
  publicRoute("/login", "登录"),
  publicRoute("/register", "客户注册", "live"),
  publicRoute("/staff/login", "员工登录", "live"),
  publicRoute("/staff/change-password", "员工修改初始密码", "live"),
  publicRoute("/staff/two-factor", "员工双因素认证", "live"),
  publicRoute("/staff/re-auth", "员工敏感操作再认证", "live"),
  consoleRoute("/console", "客户控制台", "scaffold"),
  consoleRoute("/console/onboarding", "注册审核状态", "live"),
  consoleRoute("/console/profile", "账号资料", "scaffold"),
  consoleRoute("/console/licenses", "我的License"),
  consoleRoute("/console/downloads", "我的下载"),
  consoleRoute("/console/openlab", "OpenLab进度"),
  consoleRoute("/console/tickets", "我的工单"),
  consoleRoute("/console/resources", "我的资源", "scaffold"),
  consoleRoute("/console/api-keys", "API密钥"),
  consoleRoute("/console/team", "团队管理"),
  consoleRoute("/console/billing", "订单与账单"),
  adminRoute("/admin", "运营后台"),
  adminRoute("/admin/registrations", "客户注册审核", "live"),
  adminRoute("/admin/site", "站点配置"),
  adminRoute("/admin/navigation", "导航管理"),
  adminRoute("/admin/products", "产品内容"),
  adminRoute("/admin/releases", "版本管理"),
  adminRoute("/admin/docs", "文档管理"),
  adminRoute("/admin/blog", "资讯管理"),
  adminRoute("/admin/cases", "客户案例管理"),
  adminRoute("/admin/faq", "FAQ管理"),
  adminRoute("/admin/compatibility", "兼容矩阵管理"),
  adminRoute("/admin/marketplace", "Marketplace管理"),
  adminRoute("/admin/openlab", "OpenLab申请审核", "placeholder"),
  adminRoute("/admin/licenses", "License管理", "placeholder"),
  adminRoute("/admin/tickets", "工单管理", "placeholder"),
  adminRoute("/admin/analytics", "数据统计"),
  adminRoute("/admin/assistant", "AI 助理运营", "live"),
  adminRoute("/admin/users", "用户管理"),
  adminRoute("/admin/roles", "角色权限"),
  adminRoute("/admin/audit-logs", "操作审计"),
];

function normalizePath(pathname: string) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function matchesPattern(pattern: string, pathname: string) {
  const patternSegments = pattern.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);

  if (patternSegments.length !== pathSegments.length) return false;

  return patternSegments.every((segment, index) => {
    const isDynamic = segment.startsWith("[") && segment.endsWith("]");
    return isDynamic || segment === pathSegments[index];
  });
}

export function matchRoute(pathname: string) {
  const normalizedPath = normalizePath(pathname);
  const exactRoute = routeRegistry.find(
    (route) => route.path === normalizedPath,
  );

  if (exactRoute) return exactRoute;

  return routeRegistry.find(
    (route) =>
      route.path.includes("[") && matchesPattern(route.path, normalizedPath),
  );
}
