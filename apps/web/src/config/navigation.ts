import type {
  NavigationSection,
  NavigationStatus,
  PortalNavigationItem,
  SidebarNavigationConfig,
} from "@ai-agent-platform/ui";

export const portalNavigation: PortalNavigationItem[] = [
  { label: "首页", href: "/", children: [] },
  {
    label: "产品",
    href: "/product",
    description:
      "一站式 AI 开发与部署平台，覆盖智能体、行业应用、模型、编程与安全，另有独立产品矩阵开箱即用。",
    children: [
      {
        label: "智能体中心",
        items: [
          { label: "知识智能体", href: "/product/agent-knowledge" },
          { label: "数据智能体", href: "/product/data-agent" },
          { label: "视频智能体", href: "/product/agent-video" },
          { label: "流程编排智能体", href: "/product/agent-orchestration" },
        ],
      },
      {
        label: "模型中心",
        items: [
          { label: "模型花园", href: "/product/model-assets" },
          { label: "模型训练", href: "/product/model-training" },
          { label: "模型评估", href: "/product/model-evaluation" },
          { label: "模型部署", href: "/product/model-deploy" },
          { label: "任务中心", href: "/product/model-task-center" },
        ],
      },
      {
        label: "行业应用中心",
        items: [
          { label: "通用文本写作", href: "/product/app-writing" },
          { label: "投标智能助手", href: "/product/app-bidding" },
          { label: "合同智能审查", href: "/product/app-contract" },
        ],
      },
      {
        label: "编程中心",
        items: [
          { label: "项目管理", href: "/product/coding-project" },
          { label: "会话管理", href: "/product/coding-session" },
          { label: "移动接入", href: "/product/coding-mobile" },
          { label: "编程规范", href: "/product/coding-standard" },
        ],
      },
      {
        label: "技能中心",
        items: [
          { label: "编程类技能", href: "/product/skills-programming" },
          { label: "应用类技能", href: "/product/skills-application" },
          { label: "办公类技能", href: "/product/skills-office" },
        ],
      },
      {
        label: "安全中心",
        items: [
          { label: "用户管理", href: "/product/governance#gov-users" },
          { label: "角色管理", href: "/product/governance#gov-roles" },
          { label: "菜单管理", href: "/product/governance#gov-menu" },
          { label: "行级权限", href: "/product/governance#gov-permission" },
        ],
      },
      {
        label: "独立产品中心",
        items: [
          {
            label: "码多多 2.0",
            href: "/product/code-agent",
            description: "企业级智能编程平台",
          },
          {
            label: "AIPPT",
            href: "/product/aippt",
            description: "智能演示文稿生成",
          },
          {
            label: "AISHREK",
            href: "/product/aishrek",
            description: "AI 机械设计",
          },
        ],
      },
    ],
  },
  {
    label: "解决方案",
    href: "/solutions",
    description: "从业务问题进入 AI 解决方案。",
    children: [
      {
        label: "通用场景方案",
        items: [
          {
            label: "基础设施与模型工程",
            href: "/solutions#solution-common-scenes",
          },
          {
            label: "知识与数据智能",
            href: "/solutions#solution-common-scenes",
          },
          {
            label: "智能体与业务应用",
            href: "/solutions#solution-common-scenes",
          },
        ],
      },
      {
        label: "行业解决方案",
        items: [
          { label: "政务", href: "/solutions#solution-industries-overview" },
          { label: "金融", href: "/solutions#solution-industries-overview" },
          { label: "医疗", href: "/solutions#solution-industries-overview" },
          {
            label: "企业智能化",
            href: "/solutions#solution-industries-overview",
          },
        ],
      },
      {
        label: "实践案例",
        items: [
          { label: "按行业查看", href: "/solutions#solution-cases-overview" },
          {
            label: "按业务场景查看",
            href: "/solutions#solution-cases-overview",
          },
        ],
      },
    ],
  },
  {
    label: "下载中心",
    href: "/downloads",
    description: "了解产品、获取资料、安装体验。",
    children: [
      {
        label: "产品资料",
        items: [
          {
            label: "快速了解产品定位与核心价值",
            href: "/downloads#dl-materials",
          },
        ],
      },
      {
        label: "软件资源下载",
        items: [
          {
            label: "获取客户端安装包与版本信息",
            href: "/downloads#dl-software",
          },
        ],
      },
      {
        label: "产品部署文档",
        items: [
          {
            label: "安装部署与使用说明",
            href: "/downloads#dl-deployment",
          },
        ],
      },
      {
        label: "白皮书与技术资料",
        items: [
          {
            label: "企业 AI 与智能体专业资料",
            href: "/downloads#dl-whitepapers",
          },
        ],
      },
    ],
  },
  { label: "价格与服务", href: "/pricing", children: [] },
];

export const consoleNavigation: SidebarNavigationConfig = {
  groups: [
    {
      label: "工作台",
      items: [
        { label: "控制台首页", href: "/console" },
        { label: "账号资料", href: "/console/profile" },
      ],
    },
    {
      label: "企业服务",
      items: [
        {
          label: "我的 License",
          href: "/console/licenses",
          status: "placeholder",
        },
        {
          label: "我的下载",
          href: "/console/downloads",
          status: "placeholder",
        },
        {
          label: "OpenLab 进度",
          href: "/console/openlab",
          status: "placeholder",
        },
        {
          label: "我的工单",
          href: "/console/tickets",
          status: "placeholder",
        },
      ],
    },
    {
      label: "开发与资源",
      items: [
        { label: "我的 Agent / 模板", href: "/console/resources" },
        {
          label: "API 密钥",
          href: "/console/api-keys",
          status: "placeholder",
        },
      ],
    },
    {
      label: "组织与财务",
      items: [
        {
          label: "团队管理",
          href: "/console/team",
          status: "placeholder",
        },
        {
          label: "订单与账单",
          href: "/console/billing",
          status: "placeholder",
        },
      ],
    },
  ],
  utilities: [
    { label: "返回公开门户", href: "/" },
    { label: "帮助与支持", href: "/support" },
    { label: "当前账号", href: "/console/profile#account-menu" },
    {
      label: "退出登录",
      action: "logout",
      disabled: false,
    },
  ],
};

export const adminNavigation: SidebarNavigationConfig = {
  groups: [
    {
      label: "运营概览",
      items: [
        {
          label: "运营后台首页",
          href: "/admin",
          permission: "admin:analytics",
        },
      ],
    },
    {
      label: "AI Operations",
      items: [
        {
          label: "AI 助理",
          href: "/admin/assistant",
          permission: "admin:assistant",
        },
      ],
    },
    {
      label: "站点内容",
      items: [
        {
          label: "首页配置",
          href: "/admin/site#homepage",
          permission: "admin:site",
        },
        {
          label: "导航管理",
          href: "/admin/navigation",
          permission: "admin:navigation",
        },
        {
          label: "产品内容",
          href: "/admin/products",
          permission: "admin:products",
        },
        {
          label: "版本与 Release Note",
          href: "/admin/releases",
          permission: "admin:releases",
        },
        { label: "文档管理", href: "/admin/docs", permission: "admin:docs" },
        {
          label: "Blog / 产品动态",
          href: "/admin/blog",
          permission: "admin:blog",
        },
        { label: "客户案例", href: "/admin/cases", permission: "admin:cases" },
        { label: "FAQ", href: "/admin/faq", permission: "admin:faq" },
        {
          label: "兼容矩阵",
          href: "/admin/compatibility",
          permission: "admin:compatibility",
        },
        {
          label: "Marketplace",
          href: "/admin/marketplace",
          permission: "admin:marketplace",
        },
      ],
    },
    {
      label: "客户运营",
      items: [
        {
          label: "客户注册审核",
          href: "/admin/registrations",
          permission: "admin:registrations",
        },
        {
          label: "OpenLab 申请审核",
          href: "/admin/openlab",
          status: "placeholder",
          permission: "admin:registrations",
        },
        {
          label: "License 管理",
          href: "/admin/licenses",
          status: "placeholder",
          permission: "admin:registrations",
        },
        {
          label: "工单管理",
          href: "/admin/tickets",
          status: "placeholder",
          permission: "admin:registrations",
        },
      ],
    },
    {
      label: "数据",
      items: [
        {
          label: "门户访问",
          href: "/admin/analytics#portal",
          permission: "admin:analytics",
        },
        {
          label: "下载与申请统计",
          href: "/admin/analytics#requests",
          permission: "admin:analytics",
        },
        {
          label: "转化数据",
          href: "/admin/analytics#conversion",
          permission: "admin:analytics",
        },
      ],
    },
    {
      label: "系统管理",
      items: [
        {
          label: "用户管理",
          href: "/admin/users",
          permission: "admin:users",
        },
        {
          label: "角色权限",
          href: "/admin/roles",
          permission: "admin:roles",
        },
        {
          label: "操作审计",
          href: "/admin/audit-logs",
          permission: "admin:audit",
        },
        {
          label: "站点设置",
          href: "/admin/site#settings",
          permission: "admin:site",
        },
      ],
    },
  ],
  utilities: [
    { label: "返回公开门户", href: "/" },
    { label: "退出登录", action: "logout", disabled: false },
  ],
};

export const footerNavigation: NavigationSection[] = [
  {
    label: "产品中心",
    items: [
      { label: "产品", href: "/product" },
      { label: "智能体中心", href: "/product/agents" },
      { label: "模型中心", href: "/product/model" },
      { label: "行业应用中心", href: "/product/applications" },
      { label: "编程中心", href: "/product/coding" },
      { label: "技能中心", href: "/product/skills" },
      { label: "安全中心", href: "/product/governance" },
      { label: "独立产品中心", href: "/product/standalone" },
    ],
  },
  {
    label: "业务服务",
    items: [
      { label: "解决方案", href: "/solutions" },
      { label: "下载中心", href: "/downloads" },
      { label: "价格与服务", href: "/pricing" },
    ],
  },
  {
    label: "联系与体验",
    items: [
      { label: "联系我们", href: "/contact" },
      { label: "申请体验", href: "/trial" },
    ],
  },
];

export type NavigationAnchor = {
  id: string;
  label: string;
  status: NavigationStatus | undefined;
};

export function navigationAnchorsForPath(pathname: string): NavigationAnchor[] {
  const navigationItems = [
    ...portalNavigation.flatMap((parent) => [
      parent,
      ...parent.children.flatMap((section) => section.items),
    ]),
    ...consoleNavigation.groups.flatMap((group) => group.items),
    ...consoleNavigation.utilities,
    ...adminNavigation.groups.flatMap((group) => group.items),
    ...adminNavigation.utilities,
    ...footerNavigation.flatMap((section) => section.items),
  ];
  const anchorsById = new Map<string, NavigationAnchor>();

  for (const item of navigationItems) {
    if (!item.href) continue;

    const url = new URL(item.href, "https://local.invalid");
    if (url.pathname !== pathname || !url.hash) continue;

    const id = decodeURIComponent(url.hash.slice(1));
    if (!id) continue;

    if (!anchorsById.has(id)) {
      anchorsById.set(id, { id, label: item.label, status: item.status });
    }
  }

  return [...anchorsById.values()];
}
