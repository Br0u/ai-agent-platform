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
  publicRoute("/product/standalone", "独立产品中心", "live"),
  publicRoute("/product/code-agent", "码多多 2.0", "live"),
  publicRoute("/product/aippt", "AIPPT", "live"),
  publicRoute("/product/aishrek", "AISHREK", "live"),
  publicRoute("/product/model", "模型中心", "live"),
  publicRoute("/product/knowledge", "企业知识库", "live"),
  publicRoute("/product/agents", "智能体中心", "live"),
  publicRoute("/product/applications", "行业应用中心", "live"),
  publicRoute("/product/skills", "技能中心", "live"),
  publicRoute("/product/coding", "编程中心", "live"),
  publicRoute("/product/governance", "安全中心", "live"),
  publicRoute("/product/model-optimization", "模型优化", "live"),
  publicRoute("/product/model-task-center", "任务中心", "live"),
  publicRoute("/product/model-assets", "模型资产管理", "live"),
  publicRoute("/product/model-training", "模型训练", "live"),
  publicRoute("/product/model-evaluation", "模型评估", "live"),
  publicRoute("/product/model-data", "数据准备", "live"),
  publicRoute("/product/model-deploy", "模型部署", "live"),
  publicRoute("/product/agent-knowledge-base", "能力底座", "live"),
  publicRoute("/product/knowledge-metrics", "数据源与指标", "live"),
  publicRoute("/product/coding-project", "项目管理", "live"),
  publicRoute("/product/coding-session", "会话管理", "live"),
  publicRoute("/product/coding-mobile", "移动接入", "live"),
  publicRoute("/product/coding-standard", "编程规范", "live"),
  publicRoute("/product/agent-knowledge", "企业知识助手", "live"),
  publicRoute("/product/data-agent", "智能问数助手", "live"),
  publicRoute("/product/agent-video", "视频理解助手", "live"),
  publicRoute("/product/agent-orchestration", "复杂任务自动化引擎", "live"),
  publicRoute("/product/app-writing", "通用文本写作", "live"),
  publicRoute("/product/app-bidding", "投标智能助手", "live"),
  publicRoute("/product/app-contract", "合同智能审查", "live"),
  publicRoute("/product/skills-programming", "编程类技能", "live"),
  publicRoute("/product/skills-application", "应用类技能", "live"),
  publicRoute("/product/skills-office", "办公类技能", "live"),
  publicRoute("/solutions", "解决方案", "live"),
  publicRoute("/solutions/[slug]", "解决方案详情", "live"),
  publicRoute("/downloads", "下载中心", "live"),
  publicRoute("/downloads/preview/[resourceKey]", "下载资源预览", "live"),
  publicRoute("/partners", "合作伙伴", "live"),
  publicRoute("/docs", "文档中心"),
  publicRoute("/docs/[category]", "文档分类详情", "live"),
  publicRoute("/support", "客户支持"),
  publicRoute("/help", "帮助中心"),
  publicRoute("/pricing", "价格与服务", "live"),
  publicRoute("/assistant", "AI 助理", "live"),
  publicRoute("/trial", "申请体验", "live"),
  publicRoute("/contact", "商务联系"),
  publicRoute("/login", "登录"),
  publicRoute("/register", "客户注册", "live"),
  publicRoute("/staff/login", "员工登录", "live"),
  publicRoute("/staff/change-password", "员工修改初始密码", "live"),
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
  adminRoute("/admin/docs", "文档管理", "live"),
  adminRoute("/admin/downloads", "下载资源", "live"),
  adminRoute(
    "/admin/downloads/preview/[resourceId]",
    "下载资源草稿预览",
    "live",
  ),
  adminRoute("/admin/docs/preview/[revisionId]", "文档修订预览", "live"),
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
